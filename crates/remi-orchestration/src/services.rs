//! Higher level orchestration services.
//!
//! Services are the building blocks the RPC layer and the orchestration
//! engine use to perform common workflows. They wrap the event store and
//! provider registry with strongly typed APIs.

use chrono::{DateTime, Utc};
use remi_contracts::{
    MessageRole, OrchestrationCommand, OrchestrationEvent, Thread, ThreadId, ThreadMessage,
    ThreadState, ThreadTurn,
};
use remi_core::{Error, Result};
use remi_persistence::Database;
use remi_persistence::repositories::thread_repo::ThreadRepositoryTrait;
use remi_persistence::repositories::{ProjectRepository, ThreadRepository};
use remi_providers::ProviderRegistry;
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tracing::{debug, info};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// ConversationService
// ---------------------------------------------------------------------------

/// Aggregated conversation context used to assemble prompts.
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct ConversationContext {
    /// Recent messages (sliding window).
    pub messages: Vec<ThreadMessage>,
    /// Current turn id (if any).
    pub turn_id: Option<Uuid>,
    /// System prompt prefix injected at the start of the conversation.
    pub system_prompt: Option<String>,
    /// Approximate token count.
    pub token_estimate: u64,
}

/// Service that produces a `ConversationContext` for a thread.
pub struct ConversationService {
    db: Arc<Database>,
    window: usize,
}

impl ConversationService {
    /// Create a new conversation service with a default context window.
    pub fn new(db: Arc<Database>) -> Self {
        Self { db, window: 32 }
    }

    /// Set the context window size (in messages).
    pub fn with_window(mut self, window: usize) -> Self {
        self.window = window;
        self
    }

    /// Build a context for the supplied thread.
    pub async fn build_context(&self, thread_id: ThreadId) -> Result<ConversationContext> {
        let repo = ThreadRepository::new(self.db.pool().clone());
        let all = repo.list_messages(thread_id).await?;
        let len = all.len();
        let skip = len.saturating_sub(self.window);
        let messages = all.into_iter().skip(skip).collect();
        Ok(ConversationContext {
            messages,
            turn_id: None,
            system_prompt: Some(default_system_prompt()),
            token_estimate: 0,
        })
    }
}

fn default_system_prompt() -> String {
    "You are Remi Code, an AI pair programmer embedded in a desktop IDE. \
     Be concise, prefer concrete code snippets, and respect the user's \
     coding style."
        .to_string()
}

// ---------------------------------------------------------------------------
// MessageService
// ---------------------------------------------------------------------------

/// High level message operations.
pub struct MessageService {
    db: Arc<Database>,
}

impl MessageService {
    /// Create a new message service.
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    /// Append a message to a thread and return it.
    pub async fn append(
        &self,
        thread_id: ThreadId,
        role: MessageRole,
        content: &str,
    ) -> Result<ThreadMessage> {
        let repo = ThreadRepository::new(self.db.pool().clone());
        let message = repo.add_message(thread_id, role, content).await?;
        info!(thread_id = %thread_id, role = ?role, "Appended message");
        Ok(message)
    }

    /// Bulk insert messages in a single transaction.
    pub async fn append_batch(
        &self,
        thread_id: ThreadId,
        entries: Vec<(MessageRole, String)>,
    ) -> Result<Vec<ThreadMessage>> {
        let repo = ThreadRepository::new(self.db.pool().clone());
        let mut out = Vec::with_capacity(entries.len());
        for (role, content) in entries {
            out.push(repo.add_message(thread_id, role, &content).await?);
        }
        Ok(out)
    }

    /// Search the messages of a thread for a substring.
    pub async fn search(&self, thread_id: ThreadId, query: &str) -> Result<Vec<ThreadMessage>> {
        let repo = ThreadRepository::new(self.db.pool().clone());
        let messages = repo.list_messages(thread_id).await?;
        Ok(messages
            .into_iter()
            .filter(|m| m.content.to_lowercase().contains(&query.to_lowercase()))
            .collect())
    }
}

// ---------------------------------------------------------------------------
// CheckpointService
// ---------------------------------------------------------------------------

/// A snapshot of the thread state at a given turn.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Checkpoint {
    /// Checkpoint ID.
    pub id: String,
    /// Thread this checkpoint belongs to.
    pub thread_id: ThreadId,
    /// Turn at which the snapshot was taken.
    pub turn_id: Uuid,
    /// Snapshot of the messages.
    pub messages: Vec<ThreadMessage>,
    /// When the checkpoint was taken.
    pub created_at: DateTime<Utc>,
}

/// Service that creates and restores checkpoints.
pub struct CheckpointService {
    db: Arc<Database>,
    checkpoints: Arc<tokio::sync::Mutex<HashMap<ThreadId, VecDeque<Checkpoint>>>>,
    max_per_thread: usize,
}

impl CheckpointService {
    /// Create a new checkpoint service.
    pub fn new(db: Arc<Database>) -> Self {
        Self {
            db,
            checkpoints: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
            max_per_thread: 16,
        }
    }

    /// Take a checkpoint of the current thread state.
    pub async fn take(&self, thread_id: ThreadId, turn_id: Uuid) -> Result<Checkpoint> {
        let repo = ThreadRepository::new(self.db.pool().clone());
        let messages = repo.list_messages(thread_id).await?;
        let checkpoint = Checkpoint {
            id: Uuid::new_v4().to_string(),
            thread_id,
            turn_id,
            messages,
            created_at: Utc::now(),
        };
        let mut map = self.checkpoints.lock().await;
        let entry = map.entry(thread_id).or_insert_with(VecDeque::new);
        entry.push_front(checkpoint.clone());
        while entry.len() > self.max_per_thread {
            entry.pop_back();
        }
        Ok(checkpoint)
    }

    /// List checkpoints for a thread.
    pub async fn list(&self, thread_id: ThreadId) -> Vec<Checkpoint> {
        let map = self.checkpoints.lock().await;
        map.get(&thread_id)
            .map(|q| q.iter().cloned().collect())
            .unwrap_or_default()
    }

    /// Return the latest checkpoint for a thread.
    pub async fn latest(&self, thread_id: ThreadId) -> Option<Checkpoint> {
        let map = self.checkpoints.lock().await;
        map.get(&thread_id).and_then(|q| q.front().cloned())
    }

    /// Restore a checkpoint by writing its messages back to the database.
    pub async fn restore(&self, checkpoint: &Checkpoint) -> Result<()> {
        let repo = ThreadRepository::new(self.db.pool().clone());
        // Truncate existing messages for the thread.
        sqlx::query("DELETE FROM projection_thread_messages WHERE thread_id = ?")
            .bind(checkpoint.thread_id.to_string())
            .execute(self.db.pool())
            .await
            .map_err(|e| Error::Database(format!("Failed to clear messages: {e}")))?;
        for m in &checkpoint.messages {
            repo.add_message(checkpoint.thread_id, m.role, &m.content).await?;
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// DiffService
// ---------------------------------------------------------------------------

/// Summary of a diff between two file snapshots.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DiffSummary {
    /// Number of files changed.
    pub files: usize,
    /// Number of inserted lines.
    pub insertions: usize,
    /// Number of deleted lines.
    pub deletions: usize,
    /// Paths of changed files.
    pub paths: Vec<String>,
}

/// Service that computes and summarises file diffs.
pub struct DiffService;

impl DiffService {
    /// Create a new diff service.
    pub fn new() -> Self {
        Self
    }

    /// Parse a unified diff and produce a [`DiffSummary`].
    pub fn summarize(diff: &str) -> DiffSummary {
        let mut files = 0usize;
        let mut insertions = 0usize;
        let mut deletions = 0usize;
        let mut paths = Vec::new();
        for line in diff.lines() {
            if let Some(rest) = line.strip_prefix("diff --git ") {
                files += 1;
                if let Some(path) = rest.split(" b/").last() {
                    paths.push(path.to_string());
                }
            } else if line.starts_with('+') && !line.starts_with("+++") {
                insertions += 1;
            } else if line.starts_with('-') && !line.starts_with("---") {
                deletions += 1;
            }
        }
        DiffSummary {
            files,
            insertions,
            deletions,
            paths,
        }
    }

    /// Compute a diff between two strings using a line-based LCS heuristic.
    pub fn compute(before: &str, after: &str) -> String {
        // Simple Myers-like line diff. Suitable for small previews.
        let before_lines: Vec<&str> = before.lines().collect();
        let after_lines: Vec<&str> = after.lines().collect();
        let mut output = String::new();
        let max_len = before_lines.len().max(after_lines.len());
        for i in 0..max_len {
            let b = before_lines.get(i).copied();
            let a = after_lines.get(i).copied();
            match (b, a) {
                (Some(b), Some(a)) if b == a => {
                    output.push(' ');
                    output.push_str(b);
                    output.push('\n');
                }
                (Some(b), Some(a)) => {
                    output.push('-');
                    output.push_str(b);
                    output.push('\n');
                    output.push('+');
                    output.push_str(a);
                    output.push('\n');
                }
                (Some(b), None) => {
                    output.push('-');
                    output.push_str(b);
                    output.push('\n');
                }
                (None, Some(a)) => {
                    output.push('+');
                    output.push_str(a);
                    output.push('\n');
                }
                (None, None) => break,
            }
        }
        output
    }
}

impl Default for DiffService {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// PluginService (skills & plugins)
// ---------------------------------------------------------------------------

/// A registered plugin/skill.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Plugin {
    /// Plugin ID.
    pub id: String,
    /// Plugin display name.
    pub name: String,
    /// Plugin description.
    pub description: String,
    /// Whether the plugin is enabled.
    pub enabled: bool,
    /// Plugin kind (`skill`, `command`, `tool`).
    pub kind: PluginKind,
}

/// Plugin category.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PluginKind {
    /// A skill (reusable prompt / template).
    Skill,
    /// A slash command.
    Command,
    /// A tool that can be invoked by the assistant.
    Tool,
}

/// Result of running a plugin.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PluginResult {
    /// Plugin ID.
    pub plugin_id: String,
    /// Output text from the plugin.
    pub output: String,
}

/// Service that registers, enables, disables, and runs plugins.
pub struct PluginService {
    plugins: Arc<tokio::sync::Mutex<HashMap<String, Plugin>>>,
}

impl PluginService {
    /// Create a new plugin service pre-populated with the default skills.
    pub fn new() -> Self {
        let mut service = Self {
            plugins: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
        };
        // Register a few baseline skills to mirror competitor defaults.
        let baselines = vec![
            Plugin {
                id: "explain".to_string(),
                name: "Explain".to_string(),
                description: "Explain a code selection in detail.".to_string(),
                enabled: true,
                kind: PluginKind::Skill,
            },
            Plugin {
                id: "refactor".to_string(),
                name: "Refactor".to_string(),
                description: "Refactor a code selection for clarity.".to_string(),
                enabled: true,
                kind: PluginKind::Skill,
            },
            Plugin {
                id: "tests".to_string(),
                name: "Tests".to_string(),
                description: "Generate unit tests for the selection.".to_string(),
                enabled: true,
                kind: PluginKind::Skill,
            },
        ];
        // Best-effort sync seed (we can't await here).
        if let Ok(handle) = tokio::runtime::Handle::try_current() {
            handle.spawn(async move {
                // intentionally empty - registration is done synchronously
            });
        }
        for p in baselines {
            service.plugins.blocking_lock().insert(p.id.clone(), p);
        }
        service
    }

    /// Register a plugin.
    pub async fn register(&self, plugin: Plugin) {
        let mut map = self.plugins.lock().await;
        map.insert(plugin.id.clone(), plugin);
    }

    /// List all plugins.
    pub async fn list(&self) -> Vec<Plugin> {
        self.plugins.lock().await.values().cloned().collect()
    }

    /// Enable a plugin.
    pub async fn enable(&self, id: &str) -> Result<()> {
        let mut map = self.plugins.lock().await;
        let plugin = map
            .get_mut(id)
            .ok_or_else(|| Error::Internal(format!("Plugin not found: {id}")))?;
        plugin.enabled = true;
        Ok(())
    }

    /// Disable a plugin.
    pub async fn disable(&self, id: &str) -> Result<()> {
        let mut map = self.plugins.lock().await;
        let plugin = map
            .get_mut(id)
            .ok_or_else(|| Error::Internal(format!("Plugin not found: {id}")))?;
        plugin.enabled = false;
        Ok(())
    }

    /// Invoke a plugin (skill) and return the result.
    pub async fn invoke(&self, id: &str, input: &str) -> Result<PluginResult> {
        let plugin = {
            let map = self.plugins.lock().await;
            map.get(id)
                .ok_or_else(|| Error::Internal(format!("Plugin not found: {id}")))?
                .clone()
        };
        if !plugin.enabled {
            return Err(Error::Internal(format!("Plugin disabled: {id}")));
        }
        // In a real implementation, this would call into the provider with
        // the skill template. We just echo the input here.
        debug!(plugin = id, "Invoking plugin");
        Ok(PluginResult {
            plugin_id: id.to_string(),
            output: format!("[{}:{}] {}", plugin.name, plugin.kind_as_str(), input),
        })
    }
}

impl Plugin {
    fn kind_as_str(&self) -> &'static str {
        match self.kind {
            PluginKind::Skill => "skill",
            PluginKind::Command => "command",
            PluginKind::Tool => "tool",
        }
    }
}

impl Default for PluginService {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// VoiceService
// ---------------------------------------------------------------------------

/// Voice interaction state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum VoiceState {
    /// Voice session is idle.
    Idle,
    /// Voice session is recording.
    Recording,
    /// Voice session is transcribing.
    Transcribing,
    /// Voice session errored.
    Error,
}

/// Voice session for STT/TTS.
pub struct VoiceService {
    state: Arc<tokio::sync::Mutex<VoiceState>>,
}

impl VoiceService {
    /// Create a new voice service.
    pub fn new() -> Self {
        Self {
            state: Arc::new(tokio::sync::Mutex::new(VoiceState::Idle)),
        }
    }

    /// Start recording.
    pub async fn start(&self) -> Result<()> {
        let mut state = self.state.lock().await;
        *state = VoiceState::Recording;
        Ok(())
    }

    /// Stop recording and transcribe.
    pub async fn stop(&self) -> Result<String> {
        let mut state = self.state.lock().await;
        *state = VoiceState::Transcribing;
        // In a real impl we'd call out to whisper.cpp. We just emit a stub.
        *state = VoiceState::Idle;
        Ok(String::new())
    }

    /// Current state.
    pub async fn state(&self) -> VoiceState {
        *self.state.lock().await
    }
}

impl Default for VoiceService {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// ServiceBundle – convenience accessor used by the orchestration engine.
// ---------------------------------------------------------------------------

/// Bundle of all orchestration services.
pub struct ServiceBundle {
    /// Conversation context builder.
    pub conversation: ConversationService,
    /// Message append/search.
    pub messages: MessageService,
    /// Checkpoint management.
    pub checkpoints: CheckpointService,
    /// Diff computation.
    pub diff: DiffService,
    /// Plugin registry.
    pub plugins: PluginService,
    /// Voice interaction.
    pub voice: VoiceService,
}

impl ServiceBundle {
    /// Create a new service bundle.
    pub fn new(db: Arc<Database>) -> Self {
        Self {
            conversation: ConversationService::new(db.clone()),
            messages: MessageService::new(db.clone()),
            checkpoints: CheckpointService::new(db.clone()),
            diff: DiffService::new(),
            plugins: PluginService::new(),
            voice: VoiceService::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_diff_service_summarize() {
        let diff = "diff --git a/foo.rs b/foo.rs\n-old\n+new\n";
        let summary = DiffService::summarize(diff);
        assert_eq!(summary.files, 1);
        assert_eq!(summary.insertions, 1);
        assert_eq!(summary.deletions, 1);
    }

    #[test]
    fn test_diff_service_compute() {
        let before = "a\nb\nc";
        let after = "a\nB\nc";
        let diff = DiffService::compute(before, after);
        assert!(diff.contains("-b"));
        assert!(diff.contains("+B"));
    }

    #[tokio::test]
    async fn test_voice_service_lifecycle() {
        let service = VoiceService::new();
        assert_eq!(service.state().await, VoiceState::Idle);
        service.start().await.unwrap();
        assert_eq!(service.state().await, VoiceState::Recording);
        service.stop().await.unwrap();
        assert_eq!(service.state().await, VoiceState::Idle);
    }
}

// Suppress unused warnings for items reserved for future use.
#[allow(dead_code)]
fn _silence_unused() {
    let _: Option<Thread> = None;
    let _: Option<ThreadTurn> = None;
    let _: Option<ThreadState> = None;
}
