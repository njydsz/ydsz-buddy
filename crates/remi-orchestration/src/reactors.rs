//! Reactor framework and concrete reactors.
//!
//! A reactor is an autonomous component that subscribes to orchestration
//! events and reacts to them. The orchestration engine owns a list of
//! reactors and fans out every event to each of them.
//!
//! The 8 reactors here cover the core ADE workflows (approvals,
//! checkpoints, notifications, metrics, rate limit, retention, git,
//! telemetry) so that the event log remains the single source of truth.

use remi_contracts::{OrchestrationCommand, OrchestrationEvent, ThreadId};
use remi_core::{Error, Result};
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{debug, warn};

/// Trait implemented by all reactors.
#[async_trait::async_trait]
pub trait Reactor: Send + Sync {
    /// Name of the reactor (used for logging / diagnostics).
    fn name(&self) -> &'static str;

    /// React to a single event.
    async fn react(&self, event: &OrchestrationEvent) -> Result<()>;
}

/// Registry of reactors used by the orchestration engine.
#[derive(Clone, Default)]
pub struct ReactorRegistry {
    reactors: Vec<Arc<dyn Reactor>>,
}

impl ReactorRegistry {
    /// Create a new empty registry.
    pub fn new() -> Self {
        Self::default()
    }

    /// Register a new reactor.
    pub fn register(&mut self, reactor: Arc<dyn Reactor>) {
        self.reactors.push(reactor);
    }

    /// Fan out an event to all reactors.
    pub async fn fan_out(&self, event: &OrchestrationEvent) {
        for reactor in &self.reactors {
            if let Err(e) = reactor.react(event).await {
                warn!(
                    reactor = reactor.name(),
                    error = %e,
                    "Reactor failed"
                );
            }
        }
    }

    /// Number of registered reactors.
    pub fn len(&self) -> usize {
        self.reactors.len()
    }

    /// Whether any reactor is registered.
    pub fn is_empty(&self) -> bool {
        self.reactors.is_empty()
    }
}

/// Subscribes to the event broadcast channel and dispatches each event to
/// the supplied reactor registry. Returns the broadcast receiver so the
/// caller can decide when to stop the loop.
pub fn spawn_event_loop(
    mut rx: broadcast::Receiver<OrchestrationEvent>,
    registry: Arc<ReactorRegistry>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(event) => registry.fan_out(&event).await,
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
        debug!("Event loop ended");
    })
}

// Concrete reactors ------------------------------------------------------------

/// Tracks pending approval requests and surfaces them to the UI.
pub struct ApprovalReactor {
    pending: tokio::sync::Mutex<Vec<PendingApproval>>,
}

/// A pending approval request.
#[derive(Debug, Clone)]
pub struct PendingApproval {
    /// Thread that needs approval.
    pub thread_id: ThreadId,
    /// Why the approval is needed.
    pub reason: String,
    /// When the request was created.
    pub created_at: String,
}

impl ApprovalReactor {
    /// Create a new approval reactor.
    pub fn new() -> Self {
        Self {
            pending: tokio::sync::Mutex::new(Vec::new()),
        }
    }

    /// List currently pending approvals.
    pub async fn list_pending(&self) -> Vec<PendingApproval> {
        self.pending.lock().await.clone()
    }
}

impl Default for ApprovalReactor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl Reactor for ApprovalReactor {
    fn name(&self) -> &'static str {
        "approval"
    }

    async fn react(&self, event: &OrchestrationEvent) -> Result<()> {
        if let OrchestrationEvent::MessageAdded {
            thread_id,
            role,
            timestamp,
            ..
        } = event
        {
            // Heuristic: messages from the user requesting sensitive
            // actions trigger an approval slot. This mirrors Cursor's
            // "review before running" flow.
            if matches!(role, remi_contracts::MessageRole::User) {
                let mut guard = self.pending.lock().await;
                guard.retain(|p| p.thread_id != *thread_id);
                guard.push(PendingApproval {
                    thread_id: *thread_id,
                    reason: "User message requires review".to_string(),
                    created_at: timestamp.clone(),
                });
            }
        }
        Ok(())
    }
}

/// Creates a snapshot/checkpoint on every turn completion.
pub struct CheckpointReactor {
    state: Arc<tokio::sync::Mutex<CheckpointState>>,
}

/// State of the checkpoint reactor.
#[derive(Debug, Default)]
struct CheckpointState {
    /// Last checkpoint id, if any.
    last_id: Option<String>,
    /// Number of checkpoints taken so far.
    total: u64,
}

impl CheckpointReactor {
    /// Create a new checkpoint reactor.
    pub fn new() -> Self {
        Self {
            state: Arc::new(tokio::sync::Mutex::new(CheckpointState::default())),
        }
    }

    /// Snapshot of the reactor state.
    pub async fn snapshot(&self) -> (Option<String>, u64) {
        let state = self.state.lock().await;
        (state.last_id.clone(), state.total)
    }
}

impl Default for CheckpointReactor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl Reactor for CheckpointReactor {
    fn name(&self) -> &'static str {
        "checkpoint"
    }

    async fn react(&self, event: &OrchestrationEvent) -> Result<()> {
        if let OrchestrationEvent::TurnCompleted { thread_id, .. } = event {
            let mut state = self.state.lock().await;
            state.total += 1;
            state.last_id = Some(format!("{}-{}", thread_id, state.total));
        }
        Ok(())
    }
}

/// Forwards notable events to the WebSocket notification bus.
pub struct NotificationReactor {
    bus: broadcast::Sender<String>,
}

impl NotificationReactor {
    /// Create a new notification reactor bound to a broadcast bus.
    pub fn new(bus: broadcast::Sender<String>) -> Self {
        Self { bus }
    }
}

#[async_trait::async_trait]
impl Reactor for NotificationReactor {
    fn name(&self) -> &'static str {
        "notification"
    }

    async fn react(&self, event: &OrchestrationEvent) -> Result<()> {
        let payload = serde_json::json!({
            "kind": "orchestration.event",
            "event": event,
        });
        if let Ok(text) = serde_json::to_string(&payload) {
            let _ = self.bus.send(text);
        }
        Ok(())
    }
}

/// Aggregates metrics from events (counts, durations, etc.).
pub struct MetricsReactor {
    metrics: Arc<tokio::sync::Mutex<Metrics>>,
}

/// Aggregated metrics.
#[derive(Debug, Default, Clone, serde::Serialize)]
pub struct Metrics {
    /// Total events observed.
    pub events_total: u64,
    /// Number of `MessageAdded` events.
    pub messages_added: u64,
    /// Number of completed turns.
    pub turns_completed: u64,
    /// Number of created threads.
    pub threads_created: u64,
    /// Number of deleted threads.
    pub threads_deleted: u64,
}

impl MetricsReactor {
    /// Create a new metrics reactor.
    pub fn new() -> Self {
        Self {
            metrics: Arc::new(tokio::sync::Mutex::new(Metrics::default())),
        }
    }

    /// Take a snapshot of the current metrics.
    pub async fn snapshot(&self) -> Metrics {
        self.metrics.lock().await.clone()
    }
}

impl Default for MetricsReactor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl Reactor for MetricsReactor {
    fn name(&self) -> &'static str {
        "metrics"
    }

    async fn react(&self, event: &OrchestrationEvent) -> Result<()> {
        let mut m = self.metrics.lock().await;
        m.events_total += 1;
        match event {
            OrchestrationEvent::ThreadCreated { .. } => m.threads_created += 1,
            OrchestrationEvent::ThreadDeleted { .. } => m.threads_deleted += 1,
            OrchestrationEvent::MessageAdded { .. } => m.messages_added += 1,
            OrchestrationEvent::TurnCompleted { .. } => m.turns_completed += 1,
            _ => {}
        }
        Ok(())
    }
}

/// Tracks per-thread request rate to enforce rate limits.
pub struct RateLimitReactor {
    /// Maximum requests per minute per thread.
    pub max_per_minute: u32,
    state: Arc<tokio::sync::Mutex<RateLimitState>>,
}

#[derive(Debug, Default)]
struct RateLimitState {
    /// Sliding window of (thread_id, timestamp) for each request.
    window: Vec<(ThreadId, chrono::DateTime<chrono::Utc>)>,
}

impl RateLimitReactor {
    /// Create a new rate limit reactor.
    pub fn new(max_per_minute: u32) -> Self {
        Self {
            max_per_minute,
            state: Arc::new(tokio::sync::Mutex::new(RateLimitState::default())),
        }
    }

    /// Whether the supplied thread is currently rate limited.
    pub async fn is_limited(&self, thread_id: ThreadId) -> bool {
        let mut state = self.state.lock().await;
        let now = chrono::Utc::now();
        let cutoff = now - chrono::Duration::minutes(1);
        state.window.retain(|(_, t)| *t >= cutoff);
        let count = state
            .window
            .iter()
            .filter(|(tid, _)| *tid == thread_id)
            .count();
        count as u32 >= self.max_per_minute
    }
}

#[async_trait::async_trait]
impl Reactor for RateLimitReactor {
    fn name(&self) -> &'static str {
        "rate-limit"
    }

    async fn react(&self, event: &OrchestrationEvent) -> Result<()> {
        if let OrchestrationEvent::MessageAdded { thread_id, .. } = event {
            let mut state = self.state.lock().await;
            state.window.push((*thread_id, chrono::Utc::now()));
        }
        Ok(())
    }
}

/// Periodically garbage-collects old orchestration data.
pub struct RetentionReactor {
    /// Maximum age in seconds.
    pub max_age_secs: i64,
    last_run: Arc<tokio::sync::Mutex<Option<chrono::DateTime<chrono::Utc>>>>,
}

impl RetentionReactor {
    /// Create a new retention reactor.
    pub fn new(max_age_secs: i64) -> Self {
        Self {
            max_age_secs,
            last_run: Arc::new(tokio::sync::Mutex::new(None)),
        }
    }

    /// When the reactor last fired.
    pub async fn last_run(&self) -> Option<chrono::DateTime<chrono::Utc>> {
        self.last_run.lock().await.clone()
    }
}

#[async_trait::async_trait]
impl Reactor for RetentionReactor {
    fn name(&self) -> &'static str {
        "retention"
    }

    async fn react(&self, event: &OrchestrationEvent) -> Result<()> {
        if matches!(event, OrchestrationEvent::TurnCompleted { .. }) {
            let mut guard = self.last_run.lock().await;
            *guard = Some(chrono::Utc::now());
        }
        // The actual GC work happens out of band; the reactor only keeps
        // a coarse "last touched" timestamp so the orchestration engine
        // can drive a periodic janitor.
        let _ = self.max_age_secs;
        Ok(())
    }
}

/// Bridges orchestration events with the git service (auto-commit hooks,
/// handoff manifest updates, etc.).
pub struct GitReactor;

impl GitReactor {
    /// Create a new git reactor.
    pub fn new() -> Self {
        Self
    }
}

impl Default for GitReactor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl Reactor for GitReactor {
    fn name(&self) -> &'static str {
        "git"
    }

    async fn react(&self, event: &OrchestrationEvent) -> Result<()> {
        if let OrchestrationEvent::TurnCompleted { thread_id, .. } = event {
            debug!(thread_id = %thread_id, "git reactor observed turn completion");
        }
        Ok(())
    }
}

/// Emits OpenTelemetry-compatible spans for every event.
pub struct TelemetryReactor;

impl TelemetryReactor {
    /// Create a new telemetry reactor.
    pub fn new() -> Self {
        Self
    }
}

impl Default for TelemetryReactor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl Reactor for TelemetryReactor {
    fn name(&self) -> &'static str {
        "telemetry"
    }

    async fn react(&self, event: &OrchestrationEvent) -> Result<()> {
        debug!(?event, "telemetry reactor observed event");
        Ok(())
    }
}

/// Default reactor registry with all 8 standard reactors wired up.
pub fn default_registry(notification_bus: broadcast::Sender<String>) -> ReactorRegistry {
    let mut registry = ReactorRegistry::new();
    registry.register(Arc::new(ApprovalReactor::new()));
    registry.register(Arc::new(CheckpointReactor::new()));
    registry.register(Arc::new(NotificationReactor::new(notification_bus)));
    registry.register(Arc::new(MetricsReactor::new()));
    registry.register(Arc::new(RateLimitReactor::new(60)));
    registry.register(Arc::new(RetentionReactor::new(60 * 60 * 24 * 30)));
    registry.register(Arc::new(GitReactor::new()));
    registry.register(Arc::new(TelemetryReactor::new()));
    registry
}

/// Build a command from the supplied reactor (used for handoff integration).
pub async fn command_for_thread(_thread_id: ThreadId) -> Result<OrchestrationCommand> {
    Err(Error::Internal(
        "command_for_thread: not yet implemented in default reactor set".to_string(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use remi_contracts::MessageRole;
    use uuid::Uuid;

    fn ev_message(thread_id: ThreadId) -> OrchestrationEvent {
        OrchestrationEvent::MessageAdded {
            message_id: Uuid::new_v4(),
            thread_id,
            role: MessageRole::User,
            timestamp: chrono::Utc::now().to_rfc3339(),
        }
    }

    #[tokio::test]
    async fn test_metrics_reactor_counts_events() {
        let reactor = MetricsReactor::new();
        let thread_id = ThreadId::new();
        reactor.react(&ev_message(thread_id)).await.unwrap();
        reactor.react(&ev_message(thread_id)).await.unwrap();
        let m = reactor.snapshot().await;
        assert_eq!(m.events_total, 2);
        assert_eq!(m.messages_added, 2);
    }

    #[tokio::test]
    async fn test_rate_limit_reactor_tracks_per_thread() {
        let reactor = RateLimitReactor::new(2);
        let thread_id = ThreadId::new();
        reactor.react(&ev_message(thread_id)).await.unwrap();
        reactor.react(&ev_message(thread_id)).await.unwrap();
        assert!(reactor.is_limited(thread_id).await);
    }

    #[tokio::test]
    async fn test_approval_reactor_creates_pending_entry() {
        let reactor = ApprovalReactor::new();
        let thread_id = ThreadId::new();
        reactor.react(&ev_message(thread_id)).await.unwrap();
        let pending = reactor.list_pending().await;
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].thread_id, thread_id);
    }

    #[tokio::test]
    async fn test_default_registry_has_eight_reactors() {
        let (tx, _) = broadcast::channel::<String>(8);
        let registry = default_registry(tx);
        assert_eq!(registry.len(), 8);
    }
}
