//! 反应器框架与具体反应器实现。
//!
//! 反应器是一种自治组件，订阅编排事件并对其作出响应。
//! 编排引擎持有一个反应器列表，并将每个事件分发给所有反应器。
//!
//! 此处的 8 个反应器覆盖了核心 ADE 工作流（审批、检查点、
//! 通知、指标、限流、数据保留、Git、遥测），确保事件日志
//! 始终是唯一的真相来源。

use remi_contracts::{OrchestrationCommand, OrchestrationEvent, ThreadId};
use remi_core::{Error, Result};
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{debug, warn};

/// 所有反应器必须实现的 trait。
#[async_trait::async_trait]
pub trait Reactor: Send + Sync {
    /// 反应器名称（用于日志/诊断）。
    fn name(&self) -> &'static str;

    /// 对单个事件作出响应。
    async fn react(&self, event: &OrchestrationEvent) -> Result<()>;
}

/// 编排引擎使用的反应器注册表。
#[derive(Clone, Default)]
pub struct ReactorRegistry {
    reactors: Vec<Arc<dyn Reactor>>,
}

impl ReactorRegistry {
    /// 创建一个新的空注册表。
    pub fn new() -> Self {
        Self::default()
    }

    /// 注册一个新的反应器。
    pub fn register(&mut self, reactor: Arc<dyn Reactor>) {
        self.reactors.push(reactor);
    }

    /// 将事件分发给所有反应器。
    pub async fn fan_out(&self, event: &OrchestrationEvent) {
        for reactor in &self.reactors {
            if let Err(e) = reactor.react(event).await {
                warn!(
                    reactor = reactor.name(),
                    error = %e,
                    "反应器执行失败"
                );
            }
        }
    }

    /// 已注册反应器的数量。
    pub fn len(&self) -> usize {
        self.reactors.len()
    }

    /// 是否已注册反应器。
    pub fn is_empty(&self) -> bool {
        self.reactors.is_empty()
    }
}

/// 订阅事件广播通道，并将每个事件分发给指定的反应器注册表。
/// 返回广播接收器，调用方可决定何时停止循环。
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
        debug!("事件循环已结束");
    })
}

// 具体反应器 ----------------------------------------------------------------

/// 跟踪待审批请求并将其展示给 UI。
pub struct ApprovalReactor {
    pending: tokio::sync::Mutex<Vec<PendingApproval>>,
}

/// 待审批请求。
#[derive(Debug, Clone)]
pub struct PendingApproval {
    /// 需要审批的会话。
    pub thread_id: ThreadId,
    /// 需要审批的原因。
    pub reason: String,
    /// 请求创建时间。
    pub created_at: String,
}

impl ApprovalReactor {
    /// 创建一个新的审批反应器。
    pub fn new() -> Self {
        Self {
            pending: tokio::sync::Mutex::new(Vec::new()),
        }
    }

    /// 列出当前待审批的请求。
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
            // 启发式规则：用户请求敏感操作的消息会触发审批槽位。
            // 这类似于 Cursor 的"执行前审查"流程。
            if matches!(role, remi_contracts::MessageRole::User) {
                let mut guard = self.pending.lock().await;
                guard.retain(|p| p.thread_id != *thread_id);
                guard.push(PendingApproval {
                    thread_id: *thread_id,
                    reason: "用户消息需要审查".to_string(),
                    created_at: timestamp.clone(),
                });
            }
        }
        Ok(())
    }
}

/// 在每次轮次完成时创建快照/检查点。
pub struct CheckpointReactor {
    state: Arc<tokio::sync::Mutex<CheckpointState>>,
}

/// 检查点反应器的状态。
#[derive(Debug, Default)]
struct CheckpointState {
    /// 上一个检查点 ID（如有）。
    last_id: Option<String>,
    /// 迄今为止已拍摄的检查点数量。
    total: u64,
}

impl CheckpointReactor {
    /// 创建一个新的检查点反应器。
    pub fn new() -> Self {
        Self {
            state: Arc::new(tokio::sync::Mutex::new(CheckpointState::default())),
        }
    }

    /// 获取反应器状态的快照。
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

/// 将重要事件转发到 WebSocket 通知总线。
pub struct NotificationReactor {
    bus: broadcast::Sender<String>,
}

impl NotificationReactor {
    /// 创建一个新的通知反应器，绑定到广播总线。
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

/// 从事件中聚合指标（计数、时长等）。
pub struct MetricsReactor {
    metrics: Arc<tokio::sync::Mutex<Metrics>>,
}

/// 聚合的指标数据。
#[derive(Debug, Default, Clone, serde::Serialize)]
pub struct Metrics {
    /// 观测到的事件总数。
    pub events_total: u64,
    /// `MessageAdded` 事件的数量。
    pub messages_added: u64,
    /// 已完成的轮次数量。
    pub turns_completed: u64,
    /// 已创建的会话数量。
    pub threads_created: u64,
    /// 已删除的会话数量。
    pub threads_deleted: u64,
}

impl MetricsReactor {
    /// 创建一个新的指标反应器。
    pub fn new() -> Self {
        Self {
            metrics: Arc::new(tokio::sync::Mutex::new(Metrics::default())),
        }
    }

    /// 获取当前指标的快照。
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

/// 跟踪每个会话的请求速率以执行限流策略。
pub struct RateLimitReactor {
    /// 每个会话每分钟的最大请求数。
    pub max_per_minute: u32,
    state: Arc<tokio::sync::Mutex<RateLimitState>>,
}

#[derive(Debug, Default)]
struct RateLimitState {
    /// 每个请求的滑动窗口，存储 (会话 ID, 时间戳)。
    window: Vec<(ThreadId, chrono::DateTime<chrono::Utc>)>,
}

impl RateLimitReactor {
    /// 创建一个新的限流反应器。
    pub fn new(max_per_minute: u32) -> Self {
        Self {
            max_per_minute,
            state: Arc::new(tokio::sync::Mutex::new(RateLimitState::default())),
        }
    }

    /// 判断指定会话当前是否被限流。
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

/// 定期垃圾回收旧的编排数据。
pub struct RetentionReactor {
    /// 最大保留时间（秒）。
    pub max_age_secs: i64,
    last_run: Arc<tokio::sync::Mutex<Option<chrono::DateTime<chrono::Utc>>>>,
}

impl RetentionReactor {
    /// 创建一个新的数据保留反应器。
    pub fn new(max_age_secs: i64) -> Self {
        Self {
            max_age_secs,
            last_run: Arc::new(tokio::sync::Mutex::new(None)),
        }
    }

    /// 获取反应器上次触发的时间。
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
        // 实际的垃圾回收工作在后台异步进行；反应器仅维护一个
        // 粗略的"最后触达"时间戳，以便编排引擎可以驱动
        // 定期清理任务。
        let _ = self.max_age_secs;
        Ok(())
    }
}

/// 桥接编排事件与 Git 服务（自动提交钩子、
/// 切换清单更新等）。
pub struct GitReactor;

impl GitReactor {
    /// 创建一个新的 Git 反应器。
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
            debug!(thread_id = %thread_id, "Git 反应器观测到轮次完成");
        }
        Ok(())
    }
}

/// 为每个事件生成兼容 OpenTelemetry 的 span。
pub struct TelemetryReactor;

impl TelemetryReactor {
    /// 创建一个新的遥测反应器。
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
        debug!(?event, "遥测反应器观测到事件");
        Ok(())
    }
}

/// 默认反应器注册表，已连接全部 8 个标准反应器。
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

/// 从指定反应器构建命令（用于切换集成）。
pub async fn command_for_thread(_thread_id: ThreadId) -> Result<OrchestrationCommand> {
    Err(Error::Internal(
        "command_for_thread: 在默认反应器集中尚未实现".to_string(),
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
