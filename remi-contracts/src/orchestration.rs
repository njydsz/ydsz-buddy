//! 编排模块的 RPC 模式定义
//!
//! 定义"线程（thread）/轮次（turn）/消息（message）"完整生命周期的 DTO，
//! 以及 CQRS 风格的事件流（[`OrchestrationEvent`]）与命令集（[`OrchestrationCommand`]）。
//!
//! # 设计原则
//! - **事件溯源**：`OrchestrationEvent` 是前端订阅和后端持久化的核心，所有状态变更都应产生事件。
//! - **CQRS**：写操作（命令）与读操作（事件/查询）分离，前端通过事件流实时同步 UI。
//! - **可序列化**：所有结构体均可通过 `serde` 跨进程边界，前端 TS 端可直接消费。

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{ModelId, ProviderName, ThreadId};

/// 线程状态
///
/// 描述一个线程在编排器中所处的阶段，前端通过 `ThreadStateChanged` 事件订阅转换。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ThreadState {
    /// 线程空闲中
    Idle,
    /// 线程处理中（AI 正在生成响应）
    Processing,
    /// 线程等待用户输入（如工具调用确认）
    WaitingForInput,
    /// 线程发生错误
    Errored,
    /// 线程已完成（终态）
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

impl ThreadState {
    /// 判断是否允许接收新消息
    ///
    /// 仅 `Idle` / `Completed` / `Errored` 状态允许用户输入；
    /// `Processing` / `WaitingForInput` 期间应拒绝新消息，避免消息交错。
    pub fn can_accept_message(&self) -> bool {
        matches!(self, Self::Idle | Self::Completed | Self::Errored)
    }

    /// 判断是否为终态
    pub fn is_terminal(&self) -> bool {
        matches!(self, Self::Completed)
    }
}

/// 线程（会话）信息
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Thread {
    /// 线程 ID
    pub id: ThreadId,
    /// 项目 ID
    pub project_id: Uuid,
    /// 线程标题（首次发送消息后由 AI 自动生成）
    pub title: Option<String>,
    /// 线程状态
    pub state: ThreadState,
    /// 创建时间戳（ISO 8601 字符串）
    pub created_at: String,
    /// 更新时间戳（ISO 8601 字符串）
    pub updated_at: String,
}

/// 线程中的单条消息
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ThreadMessage {
    /// 消息 ID
    pub id: Uuid,
    /// 所属线程 ID
    pub thread_id: ThreadId,
    /// 消息角色
    pub role: MessageRole,
    /// 消息内容
    pub content: String,
    /// 创建时间戳（ISO 8601 字符串）
    pub created_at: String,
}

/// 消息角色
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    /// 用户消息
    User,
    /// 助手消息
    Assistant,
    /// 系统消息
    System,
}

/// 线程中的单个轮次
///
/// 轮次是"用户消息 + AI 完整回复（含工具调用）"的最小单元。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ThreadTurn {
    /// 轮次 ID
    pub id: Uuid,
    /// 所属线程 ID
    pub thread_id: ThreadId,
    /// 轮次编号（从 1 开始）
    pub turn_number: u32,
    /// 创建时间戳（ISO 8601 字符串）
    pub created_at: String,
}

/// 编排事件（推送给前端 + 持久化到事件存储）
///
/// 使用 `#[serde(tag = "_tag")]` 外部判别式序列化，便于前端按 `_tag` 字段做穷尽匹配。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "_tag")]
pub enum OrchestrationEvent {
    /// 线程已创建
    ThreadCreated {
        /// 新线程 ID
        thread_id: ThreadId,
        /// 所属项目 ID
        project_id: Uuid,
        /// 事件时间戳
        timestamp: String,
    },
    /// 线程已更新
    ThreadUpdated {
        thread_id: ThreadId,
        timestamp: String,
    },
    /// 线程已删除
    ThreadDeleted {
        thread_id: ThreadId,
        timestamp: String,
    },
    /// 线程已重命名
    ThreadRenamed {
        thread_id: ThreadId,
        /// 新标题
        title: String,
        timestamp: String,
    },
    /// 线程状态已变更
    ThreadStateChanged {
        thread_id: ThreadId,
        /// 变更前状态
        from: ThreadState,
        /// 变更后状态
        to: ThreadState,
        timestamp: String,
    },
    /// 消息已添加
    MessageAdded {
        /// 新消息 ID
        message_id: Uuid,
        thread_id: ThreadId,
        role: MessageRole,
        timestamp: String,
    },
    /// 消息内容已更新（用于流式追加）
    MessageUpdated {
        message_id: Uuid,
        thread_id: ThreadId,
        /// 增量或全量内容（取决于实现）
        content: String,
        timestamp: String,
    },
    /// 轮次已开始
    TurnStarted {
        turn_id: Uuid,
        thread_id: ThreadId,
        timestamp: String,
    },
    /// 轮次已完成
    TurnCompleted {
        turn_id: Uuid,
        thread_id: ThreadId,
        timestamp: String,
    },
    /// 轮次失败
    TurnFailed {
        turn_id: Uuid,
        thread_id: ThreadId,
        /// 错误描述
        error: String,
        timestamp: String,
    },
    /// 检查点已创建
    CheckpointCreated {
        /// 检查点 ID（字符串便于跨进程）
        checkpoint_id: String,
        thread_id: ThreadId,
        turn_id: Uuid,
        timestamp: String,
    },
    /// 检查点已恢复
    CheckpointRestored {
        checkpoint_id: String,
        thread_id: ThreadId,
        timestamp: String,
    },
    /// Provider 已切换
    ProviderSelected {
        thread_id: ThreadId,
        provider: ProviderName,
        model: ModelId,
        timestamp: String,
    },
    /// 审批已请求
    ApprovalRequested {
        /// 审批请求 ID
        request_id: Uuid,
        thread_id: ThreadId,
        /// 审批原因（如工具调用描述）
        reason: String,
        timestamp: String,
    },
    /// 审批结果已决定
    ApprovalDecided {
        request_id: Uuid,
        thread_id: ThreadId,
        /// 是否通过
        approved: bool,
        timestamp: String,
    },
    /// 线程已导入（从外部源）
    ThreadImported {
        thread_id: ThreadId,
        project_id: Uuid,
        /// 导入来源（如 `"claude-code"`）
        source: String,
        timestamp: String,
    },
}

/// 向线程发送消息的入参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSendMessageInput {
    /// 目标线程 ID
    pub thread_id: ThreadId,
    /// 消息内容
    pub content: String,
}

/// 向线程发送消息的出参
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSendMessageOutput {
    /// 用户消息
    pub user_message: ThreadMessage,
    /// 助手消息（如提供方有响应，可用于同步等待）
    pub assistant_message: Option<ThreadMessage>,
}

/// 编排命令（写操作）
///
/// 命令通过 `Decider` 校验后产生 [`OrchestrationEvent`]，符合 CQRS 风格。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "_tag")]
pub enum OrchestrationCommand {
    /// 创建线程
    CreateThread {
        project_id: Uuid,
        /// 可选的初始标题
        title: Option<String>,
    },
    /// 发送消息
    SendMessage {
        thread_id: ThreadId,
        content: String,
    },
    /// 重命名线程
    RenameThread {
        thread_id: ThreadId,
        title: String,
    },
    /// 取消正在进行的轮次
    CancelTurn {
        thread_id: ThreadId,
        turn_id: Uuid,
    },
    /// 创建检查点
    CreateCheckpoint {
        thread_id: ThreadId,
        turn_id: Uuid,
    },
    /// 恢复到指定检查点
    RestoreCheckpoint {
        thread_id: ThreadId,
        checkpoint_id: String,
    },
    /// 切换 Provider
    SelectProvider {
        thread_id: ThreadId,
        provider: ProviderName,
        model: ModelId,
    },
    /// 决定审批请求
    DecideApproval {
        request_id: Uuid,
        thread_id: ThreadId,
        approved: bool,
    },
    /// 删除线程
    DeleteThread {
        /// 待删除线程 ID
        thread_id: ThreadId,
    },
}

/// 编排相关错误类型
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, thiserror::Error)]
#[serde(tag = "_tag")]
pub enum OrchestrationError {
    /// 线程未找到
    #[error("线程未找到: {thread_id}")]
    ThreadNotFound {
        /// 未找到的线程 ID
        thread_id: ThreadId,
    },
    /// 无效的状态转换
    #[error("无效的状态转换: {from} -> {to}")]
    InvalidStateTransition {
        from: ThreadState,
        to: ThreadState,
    },
    /// 内部错误
    #[error("内部错误: {message}")]
    Internal {
        /// 错误描述
        message: String,
    },
}
