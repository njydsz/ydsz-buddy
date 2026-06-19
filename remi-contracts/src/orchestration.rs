//! 编排模式定义。

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::ThreadId;

/// 线程状态。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ThreadState {
    /// 线程空闲中。
    Idle,
    /// 线程处理中。
    Processing,
    /// 线程等待用户输入。
    WaitingForInput,
    /// 线程发生错误。
    Errored,
    /// 线程已完成。
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

/// 线程信息。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Thread {
    /// 线程 ID。
    pub id: ThreadId,
    /// 项目 ID。
    pub project_id: Uuid,
    /// 线程标题。
    pub title: Option<String>,
    /// 线程状态。
    pub state: ThreadState,
    /// 创建时间戳（ISO 8601 格式）。
    pub created_at: String,
    /// 更新时间戳（ISO 8601 格式）。
    pub updated_at: String,
}

/// 线程中的消息。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ThreadMessage {
    /// 消息 ID。
    pub id: Uuid,
    /// 线程 ID。
    pub thread_id: ThreadId,
    /// 消息角色。
    pub role: MessageRole,
    /// 消息内容。
    pub content: String,
    /// 创建时间戳（ISO 8601 格式）。
    pub created_at: String,
}

/// 消息角色。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    /// 用户消息。
    User,
    /// 助手消息。
    Assistant,
    /// 系统消息。
    System,
}

/// 线程中的轮次。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ThreadTurn {
    /// 轮次 ID。
    pub id: Uuid,
    /// 线程 ID。
    pub thread_id: ThreadId,
    /// 轮次编号。
    pub turn_number: u32,
    /// 创建时间戳（ISO 8601 格式）。
    pub created_at: String,
}

/// 编排事件。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "_tag")]
pub enum OrchestrationEvent {
    /// 线程已创建。
    ThreadCreated {
        thread_id: ThreadId,
        project_id: Uuid,
        timestamp: String,
    },
    /// 线程已更新。
    ThreadUpdated {
        thread_id: ThreadId,
        timestamp: String,
    },
    /// 线程已删除。
    ThreadDeleted {
        thread_id: ThreadId,
        timestamp: String,
    },
    /// 消息已添加。
    MessageAdded {
        message_id: Uuid,
        thread_id: ThreadId,
        role: MessageRole,
        timestamp: String,
    },
    /// 轮次已开始。
    TurnStarted {
        turn_id: Uuid,
        thread_id: ThreadId,
        timestamp: String,
    },
    /// 轮次已完成。
    TurnCompleted {
        turn_id: Uuid,
        thread_id: ThreadId,
        timestamp: String,
    },
}

/// 向线程发送消息的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ThreadSendMessageInput {
    /// 线程 ID。
    pub thread_id: ThreadId,
    /// 消息内容。
    pub content: String,
}

/// 向线程发送消息的输出。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ThreadSendMessageOutput {
    /// 用户消息。
    pub user_message: ThreadMessage,
    /// 助手消息（如提供者有响应）。
    pub assistant_message: Option<ThreadMessage>,
}

/// 编排命令。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "_tag")]
pub enum OrchestrationCommand {
    /// 创建线程。
    CreateThread {
        project_id: Uuid,
        title: Option<String>,
    },
    /// 发送消息。
    SendMessage {
        thread_id: ThreadId,
        content: String,
    },
    /// 删除线程。
    DeleteThread { thread_id: ThreadId },
}

/// 编排错误类型。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, thiserror::Error)]
#[serde(tag = "_tag")]
pub enum OrchestrationError {
    /// 线程未找到。
    #[error("线程未找到: {thread_id}")]
    ThreadNotFound { thread_id: ThreadId },
    /// 无效的状态转换。
    #[error("无效的状态转换: {from} -> {to}")]
    InvalidStateTransition { from: ThreadState, to: ThreadState },
    /// 内部错误。
    #[error("内部错误: {message}")]
    Internal { message: String },
}
