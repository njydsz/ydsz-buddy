//! Orchestration schemas.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::ThreadId;

/// Thread state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ThreadState {
    /// Thread is idle.
    Idle,
    /// Thread is processing.
    Processing,
    /// Thread is waiting for user input.
    WaitingForInput,
    /// Thread has errored.
    Errored,
    /// Thread is completed.
    Completed,
}

impl std::fmt::Display for ThreadState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Idle => write!(f, "idle"),
            Self::Processing => write!(f, "processing"),
            Self::WaitingForInput => write!(f, "waiting_for_input"),
            Self::Errored => write!(f, "errored"),
            Self::Completed => write!(f, "completed"),
        }
    }
}

/// Thread information.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Thread {
    /// Thread ID.
    pub id: ThreadId,
    /// Project ID.
    pub project_id: Uuid,
    /// Thread title.
    pub title: Option<String>,
    /// Thread state.
    pub state: ThreadState,
    /// Created timestamp (ISO 8601).
    pub created_at: String,
    /// Updated timestamp (ISO 8601).
    pub updated_at: String,
}

/// Message in a thread.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ThreadMessage {
    /// Message ID.
    pub id: Uuid,
    /// Thread ID.
    pub thread_id: ThreadId,
    /// Message role.
    pub role: MessageRole,
    /// Message content.
    pub content: String,
    /// Created timestamp (ISO 8601).
    pub created_at: String,
}

/// Message role.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    /// User message.
    User,
    /// Assistant message.
    Assistant,
    /// System message.
    System,
}

/// Turn in a thread.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ThreadTurn {
    /// Turn ID.
    pub id: Uuid,
    /// Thread ID.
    pub thread_id: ThreadId,
    /// Turn number.
    pub turn_number: u32,
    /// Created timestamp (ISO 8601).
    pub created_at: String,
}

/// Orchestration event.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "_tag")]
pub enum OrchestrationEvent {
    /// Thread created.
    ThreadCreated {
        thread_id: ThreadId,
        project_id: Uuid,
        timestamp: String,
    },
    /// Thread updated.
    ThreadUpdated {
        thread_id: ThreadId,
        timestamp: String,
    },
    /// Thread deleted.
    ThreadDeleted {
        thread_id: ThreadId,
        timestamp: String,
    },
    /// Message added.
    MessageAdded {
        message_id: Uuid,
        thread_id: ThreadId,
        role: MessageRole,
        timestamp: String,
    },
    /// Turn started.
    TurnStarted {
        turn_id: Uuid,
        thread_id: ThreadId,
        timestamp: String,
    },
    /// Turn completed.
    TurnCompleted {
        turn_id: Uuid,
        thread_id: ThreadId,
        timestamp: String,
    },
}

/// Orchestration command.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "_tag")]
pub enum OrchestrationCommand {
    /// Create a thread.
    CreateThread {
        project_id: Uuid,
        title: Option<String>,
    },
    /// Send a message.
    SendMessage {
        thread_id: ThreadId,
        content: String,
    },
    /// Delete a thread.
    DeleteThread {
        thread_id: ThreadId,
    },
}

/// Orchestration error.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, thiserror::Error)]
#[serde(tag = "_tag")]
pub enum OrchestrationError {
    /// Thread not found.
    #[error("thread not found: {thread_id}")]
    ThreadNotFound { thread_id: ThreadId },
    /// Invalid state transition.
    #[error("invalid state transition: {from} -> {to}")]
    InvalidStateTransition { from: ThreadState, to: ThreadState },
    /// Internal error.
    #[error("internal error: {message}")]
    Internal { message: String },
}
