//! Terminal schemas.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Terminal session information.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TerminalSession {
    /// Session ID.
    pub id: Uuid,
    /// Thread ID (if associated with a thread).
    pub thread_id: Option<Uuid>,
    /// Working directory.
    pub cwd: String,
    /// Shell command.
    pub shell: String,
    /// Created timestamp (ISO 8601).
    pub created_at: String,
}

/// Input for creating a terminal session.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateTerminalInput {
    /// Working directory.
    pub cwd: String,
    /// Shell command (optional, uses default if not specified).
    pub shell: Option<String>,
    /// Thread ID (optional).
    pub thread_id: Option<Uuid>,
    /// Terminal columns.
    pub cols: Option<u16>,
    /// Terminal rows.
    pub rows: Option<u16>,
}

/// Output for creating a terminal session.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CreateTerminalOutput {
    /// Session ID.
    pub id: Uuid,
}

/// Input for writing to a terminal.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct WriteTerminalInput {
    /// Session ID.
    pub session_id: Uuid,
    /// Data to write.
    pub data: String,
}

/// Input for resizing a terminal.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ResizeTerminalInput {
    /// Session ID.
    pub session_id: Uuid,
    /// New columns.
    pub cols: u16,
    /// New rows.
    pub rows: u16,
}

/// Input for closing a terminal session.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct CloseTerminalInput {
    /// Session ID.
    pub session_id: Uuid,
}

/// Input for clearing terminal history.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ClearTerminalInput {
    /// Session ID.
    pub session_id: Uuid,
}

/// Input for restarting a terminal session.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct RestartTerminalInput {
    /// Session ID.
    pub session_id: Uuid,
}

/// Input for subscribing to terminal output.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SubscribeTerminalOutputInput {
    /// Session ID.
    pub session_id: Uuid,
}

/// Terminal output event.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TerminalOutputEvent {
    /// Session ID.
    pub session_id: Uuid,
    /// Output data.
    pub data: String,
}

/// Terminal exit event.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TerminalExitEvent {
    /// Session ID.
    pub session_id: Uuid,
    /// Exit code.
    pub exit_code: i32,
}

/// Terminal title change event.
///
/// Emitted whenever the running program sends an OSC 0/1/2 sequence to set
/// the terminal title (e.g. tmux/zellij panes, vim, etc.).
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TerminalTitleEvent {
    /// Session ID.
    pub session_id: Uuid,
    /// New title.
    pub title: String,
}

/// Terminal status snapshot for `terminal.status` queries.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TerminalStatus {
    /// Session ID.
    pub session_id: Uuid,
    /// Whether the underlying process is still running.
    pub running: bool,
    /// Last observed exit code (if any).
    pub exit_code: Option<i32>,
    /// Last reported title.
    pub title: String,
    /// Number of bytes received from the process.
    pub bytes_received: u64,
    /// Number of bytes sent to the process.
    pub bytes_sent: u64,
    /// Session creation timestamp (ISO 8601).
    pub created_at: String,
    /// Last activity timestamp (ISO 8601).
    pub last_activity_at: String,
}

/// Aggregated stream of events that subscribers can listen for.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TerminalEvent {
    /// Plain PTY output.
    Output(TerminalOutputEvent),
    /// Title update.
    Title(TerminalTitleEvent),
    /// Process exited.
    Exit(TerminalExitEvent),
}
