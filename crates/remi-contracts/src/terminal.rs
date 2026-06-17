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
