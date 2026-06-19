//! # 编排事件定义
//!
//! 本模块定义了 Remi 系统中所有编排事件（Orchestration Event）。
//! 采用事件溯源（Event Sourcing）模式，所有状态变更均通过事件驱动。
//!
//! ## 设计原则
//!
//! - 所有事件均包含 `sequence`（序列号）、`occurred_at`（发生时间）和可选的 `command_id`（触发命令 ID）
//! - 事件是不可变的（immutable），一旦产生不可修改
//! - 事件通过带标签的枚举（tagged enum）进行序列化，标签格式为 `kebab-case`
//!
//! ## 事件分类
//!
//! - **项目事件**: 项目的创建、更新、删除
//! - **线程事件**: 线程的创建、删除、归档、模式切换等
//! - **消息事件**: 消息发送
//! - **Turn 事件**: 交互轮次的排队、启动、中断
//! - **审批事件**: 审批请求和用户输入请求
//! - **检查点事件**: 检查点回滚、差异完成
//! - **回滚事件**: 对话回滚
//! - **其他事件**: 消息编辑重发、会话停止、计划更新、活动追加等

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::{
    Activity, Checkpoint, InteractionMode, Message, MessageId, ProjectId, ProposedPlan,
    RuntimeMode, Sequence, ThreadId,
};

/// # 编排事件
///
/// 系统所有编排事件的聚合枚举。每个变体对应一个具体的事件结构体。
/// 事件通过 `serde` 的标签联合（tagged union）机制序列化，
/// 使用 `_tag` 字段区分变体，标签值采用 `kebab-case` 格式。
///
/// ## 事件命名规范
///
/// 事件标签格式为 `{聚合根}.{动作}`，例如：
/// - `project.created` - 项目创建
/// - `thread.message-sent` - 线程消息发送
/// - `thread.turn-start-requested` - 线程 Turn 启动请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "_tag", rename_all = "kebab-case")]
pub enum OrchestrationEvent {
    // ==================== 项目事件 ====================

    /// 项目已创建
    #[serde(rename = "project.created")]
    ProjectCreated(ProjectCreatedEvent),
    /// 项目元数据已更新（如标题变更）
    #[serde(rename = "project.meta-updated")]
    ProjectMetaUpdated(ProjectMetaUpdatedEvent),
    /// 项目已删除
    #[serde(rename = "project.deleted")]
    ProjectDeleted(ProjectDeletedEvent),

    // ==================== 线程事件 ====================

    /// 线程已创建
    #[serde(rename = "thread.created")]
    ThreadCreated(ThreadCreatedEvent),
    /// 线程已删除
    #[serde(rename = "thread.deleted")]
    ThreadDeleted(ThreadDeletedEvent),
    /// 线程已归档
    #[serde(rename = "thread.archived")]
    ThreadArchived(ThreadArchivedEvent),
    /// 线程已取消归档
    #[serde(rename = "thread.unarchived")]
    ThreadUnarchived(ThreadUnarchivedEvent),
    /// 线程元数据已更新（如标题变更）
    #[serde(rename = "thread.meta-updated")]
    ThreadMetaUpdated(ThreadMetaUpdatedEvent),
    /// 线程运行时模式已设置
    #[serde(rename = "thread.runtime-mode-set")]
    ThreadRuntimeModeSet(ThreadRuntimeModeSetEvent),
    /// 线程交互模式已设置
    #[serde(rename = "thread.interaction-mode-set")]
    ThreadInteractionModeSet(ThreadInteractionModeSetEvent),

    // ==================== 消息事件 ====================

    /// 线程中发送了新消息
    #[serde(rename = "thread.message-sent")]
    ThreadMessageSent(ThreadMessageSentEvent),

    // ==================== Turn 事件 ====================

    /// Turn 已排队等待执行
    #[serde(rename = "thread.turn-queued")]
    ThreadTurnQueued(ThreadTurnQueuedEvent),
    /// 请求启动 Turn
    #[serde(rename = "thread.turn-start-requested")]
    ThreadTurnStartRequested(ThreadTurnStartRequestedEvent),
    /// 请求中断 Turn
    #[serde(rename = "thread.turn-interrupt-requested")]
    ThreadTurnInterruptRequested(ThreadTurnInterruptRequestedEvent),

    // ==================== 审批事件 ====================

    /// 请求审批响应（AI 请求用户批准某操作）
    #[serde(rename = "thread.approval-response-requested")]
    ThreadApprovalResponseRequested(ThreadApprovalResponseRequestedEvent),
    /// 请求用户输入响应（AI 请求用户提供额外信息）
    #[serde(rename = "thread.user-input-response-requested")]
    ThreadUserInputResponseRequested(ThreadUserInputResponseRequestedEvent),

    // ==================== 检查点事件 ====================

    /// 请求回退到指定检查点
    #[serde(rename = "thread.checkpoint-revert-requested")]
    ThreadCheckpointRevertRequested(ThreadCheckpointRevertRequestedEvent),
    /// 已回退到指定检查点
    #[serde(rename = "thread.reverted")]
    ThreadReverted(ThreadRevertedEvent),
    /// Turn 差异比较已完成
    #[serde(rename = "thread.turn-diff-completed")]
    ThreadTurnDiffCompleted(ThreadTurnDiffCompletedEvent),

    // ==================== 回滚事件 ====================

    /// 请求回滚对话到指定消息
    #[serde(rename = "thread.conversation-rollback-requested")]
    ThreadConversationRollbackRequested(ThreadConversationRollbackRequestedEvent),
    /// 对话已回滚到指定消息
    #[serde(rename = "thread.conversation-rolled-back")]
    ThreadConversationRolledBack(ThreadConversationRolledBackEvent),

    // ==================== 其他事件 ====================

    /// 请求编辑并重新发送消息
    #[serde(rename = "thread.message-edit-resend-requested")]
    ThreadMessageEditResendRequested(ThreadMessageEditResendRequestedEvent),
    /// 请求停止会话
    #[serde(rename = "thread.session-stop-requested")]
    ThreadSessionStopRequested(ThreadSessionStopRequestedEvent),
    /// 设置线程会话
    #[serde(rename = "thread.session-set")]
    ThreadSessionSet(ThreadSessionSetEvent),
    /// 提议计划已创建或更新
    #[serde(rename = "thread.proposed-plan-upserted")]
    ThreadProposedPlanUpserted(ThreadProposedPlanUpsertedEvent),
    /// 活动已追加到线程
    #[serde(rename = "thread.activity-appended")]
    ThreadActivityAppended(ThreadActivityAppendedEvent),
}

impl OrchestrationEvent {
    /// 获取事件的序列号
    ///
    /// 序列号用于事件排序，保证事件处理的顺序一致性。
    /// 序列号是单调递增的 `u64` 值。
    ///
    /// # 返回值
    ///
    /// 返回事件的序列号（`Sequence` 类型，即 `u64`）
    pub fn sequence(&self) -> Sequence {
        // 通过模式匹配从每个事件变体中提取 sequence 字段
        match self {
            OrchestrationEvent::ProjectCreated(e) => e.sequence,
            OrchestrationEvent::ProjectMetaUpdated(e) => e.sequence,
            OrchestrationEvent::ProjectDeleted(e) => e.sequence,
            OrchestrationEvent::ThreadCreated(e) => e.sequence,
            OrchestrationEvent::ThreadDeleted(e) => e.sequence,
            OrchestrationEvent::ThreadArchived(e) => e.sequence,
            OrchestrationEvent::ThreadUnarchived(e) => e.sequence,
            OrchestrationEvent::ThreadMetaUpdated(e) => e.sequence,
            OrchestrationEvent::ThreadRuntimeModeSet(e) => e.sequence,
            OrchestrationEvent::ThreadInteractionModeSet(e) => e.sequence,
            OrchestrationEvent::ThreadMessageSent(e) => e.sequence,
            OrchestrationEvent::ThreadTurnQueued(e) => e.sequence,
            OrchestrationEvent::ThreadTurnStartRequested(e) => e.sequence,
            OrchestrationEvent::ThreadTurnInterruptRequested(e) => e.sequence,
            OrchestrationEvent::ThreadApprovalResponseRequested(e) => e.sequence,
            OrchestrationEvent::ThreadUserInputResponseRequested(e) => e.sequence,
            OrchestrationEvent::ThreadCheckpointRevertRequested(e) => e.sequence,
            OrchestrationEvent::ThreadReverted(e) => e.sequence,
            OrchestrationEvent::ThreadTurnDiffCompleted(e) => e.sequence,
            OrchestrationEvent::ThreadConversationRollbackRequested(e) => e.sequence,
            OrchestrationEvent::ThreadConversationRolledBack(e) => e.sequence,
            OrchestrationEvent::ThreadMessageEditResendRequested(e) => e.sequence,
            OrchestrationEvent::ThreadSessionStopRequested(e) => e.sequence,
            OrchestrationEvent::ThreadSessionSet(e) => e.sequence,
            OrchestrationEvent::ThreadProposedPlanUpserted(e) => e.sequence,
            OrchestrationEvent::ThreadActivityAppended(e) => e.sequence,
        }
    }

    /// 获取事件发生的时间
    ///
    /// 返回事件产生的 UTC 时间戳，用于事件溯源回放和时间线展示。
    ///
    /// # 返回值
    ///
    /// 返回事件发生时间（`DateTime<Utc>`）
    pub fn occurred_at(&self) -> DateTime<Utc> {
        // 通过模式匹配从每个事件变体中提取 occurred_at 字段
        match self {
            OrchestrationEvent::ProjectCreated(e) => e.occurred_at,
            OrchestrationEvent::ProjectMetaUpdated(e) => e.occurred_at,
            OrchestrationEvent::ProjectDeleted(e) => e.occurred_at,
            OrchestrationEvent::ThreadCreated(e) => e.occurred_at,
            OrchestrationEvent::ThreadDeleted(e) => e.occurred_at,
            OrchestrationEvent::ThreadArchived(e) => e.occurred_at,
            OrchestrationEvent::ThreadUnarchived(e) => e.occurred_at,
            OrchestrationEvent::ThreadMetaUpdated(e) => e.occurred_at,
            OrchestrationEvent::ThreadRuntimeModeSet(e) => e.occurred_at,
            OrchestrationEvent::ThreadInteractionModeSet(e) => e.occurred_at,
            OrchestrationEvent::ThreadMessageSent(e) => e.occurred_at,
            OrchestrationEvent::ThreadTurnQueued(e) => e.occurred_at,
            OrchestrationEvent::ThreadTurnStartRequested(e) => e.occurred_at,
            OrchestrationEvent::ThreadTurnInterruptRequested(e) => e.occurred_at,
            OrchestrationEvent::ThreadApprovalResponseRequested(e) => e.occurred_at,
            OrchestrationEvent::ThreadUserInputResponseRequested(e) => e.occurred_at,
            OrchestrationEvent::ThreadCheckpointRevertRequested(e) => e.occurred_at,
            OrchestrationEvent::ThreadReverted(e) => e.occurred_at,
            OrchestrationEvent::ThreadTurnDiffCompleted(e) => e.occurred_at,
            OrchestrationEvent::ThreadConversationRollbackRequested(e) => e.occurred_at,
            OrchestrationEvent::ThreadConversationRolledBack(e) => e.occurred_at,
            OrchestrationEvent::ThreadMessageEditResendRequested(e) => e.occurred_at,
            OrchestrationEvent::ThreadSessionStopRequested(e) => e.occurred_at,
            OrchestrationEvent::ThreadSessionSet(e) => e.occurred_at,
            OrchestrationEvent::ThreadProposedPlanUpserted(e) => e.occurred_at,
            OrchestrationEvent::ThreadActivityAppended(e) => e.occurred_at,
        }
    }

    /// 获取触发该事件的命令 ID
    ///
    /// 在 CQRS 模式中，事件通常由命令触发。此方法返回触发当前事件的命令 ID，
    /// 用于建立命令-事件的因果关系。
    ///
    /// # 返回值
    ///
    /// - `Some(command_id)` - 事件由命令触发，返回命令 ID
    /// - `None` - 事件非命令触发（如系统自动产生的事件）
    pub fn command_id(&self) -> Option<String> {
        // 通过模式匹配从每个事件变体中提取 command_id 字段
        match self {
            OrchestrationEvent::ProjectCreated(e) => e.command_id.clone(),
            OrchestrationEvent::ProjectMetaUpdated(e) => e.command_id.clone(),
            OrchestrationEvent::ProjectDeleted(e) => e.command_id.clone(),
            OrchestrationEvent::ThreadCreated(e) => e.command_id.clone(),
            OrchestrationEvent::ThreadDeleted(e) => e.command_id.clone(),
            OrchestrationEvent::ThreadArchived(e) => e.command_id.clone(),
            OrchestrationEvent::ThreadUnarchived(e) => e.command_id.clone(),
            OrchestrationEvent::ThreadMetaUpdated(e) => e.command_id.clone(),
            OrchestrationEvent::ThreadRuntimeModeSet(e) => e.command_id.clone(),
            OrchestrationEvent::ThreadInteractionModeSet(e) => e.command_id.clone(),
            OrchestrationEvent::ThreadMessageSent(e) => e.command_id.clone(),
            OrchestrationEvent::ThreadTurnQueued(e) => e.command_id.clone(),
            OrchestrationEvent::ThreadTurnStartRequested(e) => e.command_id.clone(),
            OrchestrationEvent::ThreadTurnInterruptRequested(e) => e.command_id.clone(),
            OrchestrationEvent::ThreadApprovalResponseRequested(e) => e.command_id.clone(),
            OrchestrationEvent::ThreadUserInputResponseRequested(e) => e.command_id.clone(),
            OrchestrationEvent::ThreadCheckpointRevertRequested(e) => e.command_id.clone(),
            OrchestrationEvent::ThreadReverted(e) => e.command_id.clone(),
            OrchestrationEvent::ThreadTurnDiffCompleted(e) => e.command_id.clone(),
            OrchestrationEvent::ThreadConversationRollbackRequested(e) => e.command_id.clone(),
            OrchestrationEvent::ThreadConversationRolledBack(e) => e.command_id.clone(),
            OrchestrationEvent::ThreadMessageEditResendRequested(e) => e.command_id.clone(),
            OrchestrationEvent::ThreadSessionStopRequested(e) => e.command_id.clone(),
            OrchestrationEvent::ThreadSessionSet(e) => e.command_id.clone(),
            OrchestrationEvent::ThreadProposedPlanUpserted(e) => e.command_id.clone(),
            OrchestrationEvent::ThreadActivityAppended(e) => e.command_id.clone(),
        }
    }
}

// ==================== 项目事件 ====================

/// # 项目创建事件
///
/// 当新项目被创建时产生。包含项目的基本信息。
///
/// ## 字段说明
///
/// - `sequence`: 事件序列号
/// - `occurred_at`: 事件发生时间
/// - `command_id`: 触发命令 ID
/// - `project_id`: 新项目 ID
/// - `title`: 项目标题
/// - `workspace_root`: 工作区根目录路径
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCreatedEvent {
    /// 事件序列号
    pub sequence: Sequence,
    /// 事件发生时间（UTC）
    pub occurred_at: DateTime<Utc>,
    /// 触发命令 ID
    pub command_id: Option<String>,
    /// 新项目 ID
    pub project_id: ProjectId,
    /// 项目标题
    pub title: String,
    /// 工作区根目录路径
    pub workspace_root: String,
}

/// # 项目元数据更新事件
///
/// 当项目的元数据（如标题）被更新时产生。
/// 使用 `Option` 字段表示仅更新有值的属性。
///
/// ## 字段说明
///
/// - `sequence`: 事件序列号
/// - `occurred_at`: 事件发生时间
/// - `command_id`: 触发命令 ID
/// - `project_id`: 项目 ID
/// - `title`: 新的项目标题（`None` 表示未变更）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMetaUpdatedEvent {
    /// 事件序列号
    pub sequence: Sequence,
    /// 事件发生时间（UTC）
    pub occurred_at: DateTime<Utc>,
    /// 触发命令 ID
    pub command_id: Option<String>,
    /// 项目 ID
    pub project_id: ProjectId,
    /// 新的项目标题（`None` 表示未变更）
    pub title: Option<String>,
}

/// # 项目删除事件
///
/// 当项目被删除时产生（软删除）。
///
/// ## 字段说明
///
/// - `sequence`: 事件序列号
/// - `occurred_at`: 事件发生时间
/// - `command_id`: 触发命令 ID
/// - `project_id`: 被删除的项目 ID
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDeletedEvent {
    /// 事件序列号
    pub sequence: Sequence,
    /// 事件发生时间（UTC）
    pub occurred_at: DateTime<Utc>,
    /// 触发命令 ID
    pub command_id: Option<String>,
    /// 被删除的项目 ID
    pub project_id: ProjectId,
}

// ==================== 线程事件 ====================

/// # 线程创建事件
///
/// 当新线程被创建时产生。
///
/// ## 字段说明
///
/// - `sequence`: 事件序列号
/// - `occurred_at`: 事件发生时间
/// - `command_id`: 触发命令 ID
/// - `thread_id`: 新线程 ID
/// - `project_id`: 所属项目 ID
/// - `title`: 线程标题
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadCreatedEvent {
    /// 事件序列号
    pub sequence: Sequence,
    /// 事件发生时间（UTC）
    pub occurred_at: DateTime<Utc>,
    /// 触发命令 ID
    pub command_id: Option<String>,
    /// 新线程 ID
    pub thread_id: ThreadId,
    /// 所属项目 ID
    pub project_id: ProjectId,
    /// 线程标题
    pub title: String,
}

/// # 线程删除事件
///
/// 当线程被删除时产生（软删除）。
///
/// ## 字段说明
///
/// - `sequence`: 事件序列号
/// - `occurred_at`: 事件发生时间
/// - `command_id`: 触发命令 ID
/// - `thread_id`: 被删除的线程 ID
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadDeletedEvent {
    /// 事件序列号
    pub sequence: Sequence,
    /// 事件发生时间（UTC）
    pub occurred_at: DateTime<Utc>,
    /// 触发命令 ID
    pub command_id: Option<String>,
    /// 被删除的线程 ID
    pub thread_id: ThreadId,
}

/// # 线程归档事件
///
/// 当线程被归档时产生。归档后的线程在 UI 中默认隐藏。
///
/// ## 字段说明
///
/// - `sequence`: 事件序列号
/// - `occurred_at`: 事件发生时间
/// - `command_id`: 触发命令 ID
/// - `thread_id`: 被归档的线程 ID
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadArchivedEvent {
    /// 事件序列号
    pub sequence: Sequence,
    /// 事件发生时间（UTC）
    pub occurred_at: DateTime<Utc>,
    /// 触发命令 ID
    pub command_id: Option<String>,
    /// 被归档的线程 ID
    pub thread_id: ThreadId,
}

/// # 线程取消归档事件
///
/// 当归档的线程被恢复时产生。
///
/// ## 字段说明
///
/// - `sequence`: 事件序列号
/// - `occurred_at`: 事件发生时间
/// - `command_id`: 触发命令 ID
/// - `thread_id`: 取消归档的线程 ID
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadUnarchivedEvent {
    /// 事件序列号
    pub sequence: Sequence,
    /// 事件发生时间（UTC）
    pub occurred_at: DateTime<Utc>,
    /// 触发命令 ID
    pub command_id: Option<String>,
    /// 取消归档的线程 ID
    pub thread_id: ThreadId,
}

/// # 线程元数据更新事件
///
/// 当线程的元数据（如标题）被更新时产生。
///
/// ## 字段说明
///
/// - `sequence`: 事件序列号
/// - `occurred_at`: 事件发生时间
/// - `command_id`: 触发命令 ID
/// - `thread_id`: 线程 ID
/// - `title`: 新的线程标题（`None` 表示未变更）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadMetaUpdatedEvent {
    /// 事件序列号
    pub sequence: Sequence,
    /// 事件发生时间（UTC）
    pub occurred_at: DateTime<Utc>,
    /// 触发命令 ID
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 新的线程标题（`None` 表示未变更）
    pub title: Option<String>,
}

/// # 线程运行时模式设置事件
///
/// 当线程的运行时模式被切换时产生（Agent / Ask / Plan）。
///
/// ## 字段说明
///
/// - `sequence`: 事件序列号
/// - `occurred_at`: 事件发生时间
/// - `command_id`: 触发命令 ID
/// - `thread_id`: 线程 ID
/// - `runtime_mode`: 新的运行时模式
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadRuntimeModeSetEvent {
    /// 事件序列号
    pub sequence: Sequence,
    /// 事件发生时间（UTC）
    pub occurred_at: DateTime<Utc>,
    /// 触发命令 ID
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 新的运行时模式
    pub runtime_mode: RuntimeMode,
}

/// # 线程交互模式设置事件
///
/// 当线程的交互模式被切换时产生（Chat / Review）。
///
/// ## 字段说明
///
/// - `sequence`: 事件序列号
/// - `occurred_at`: 事件发生时间
/// - `command_id`: 触发命令 ID
/// - `thread_id`: 线程 ID
/// - `interaction_mode`: 新的交互模式
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadInteractionModeSetEvent {
    /// 事件序列号
    pub sequence: Sequence,
    /// 事件发生时间（UTC）
    pub occurred_at: DateTime<Utc>,
    /// 触发命令 ID
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 新的交互模式
    pub interaction_mode: InteractionMode,
}

// ==================== 消息事件 ====================

/// # 线程消息发送事件
///
/// 当线程中发送新消息时产生。消息可以是用户消息、AI 助手回复或系统消息。
///
/// ## 字段说明
///
/// - `sequence`: 事件序列号
/// - `occurred_at`: 事件发生时间
/// - `command_id`: 触发命令 ID
/// - `thread_id`: 线程 ID
/// - `message`: 发送的消息实体
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadMessageSentEvent {
    /// 事件序列号
    pub sequence: Sequence,
    /// 事件发生时间（UTC）
    pub occurred_at: DateTime<Utc>,
    /// 触发命令 ID
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 发送的消息实体
    pub message: Message,
}

// ==================== Turn 事件 ====================

/// # Turn 排队事件
///
/// 当 Turn 被加入执行队列时产生。
///
/// ## 字段说明
///
/// - `sequence`: 事件序列号
/// - `occurred_at`: 事件发生时间
/// - `command_id`: 触发命令 ID
/// - `thread_id`: 线程 ID
/// - `turn_id`: Turn ID
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadTurnQueuedEvent {
    /// 事件序列号
    pub sequence: Sequence,
    /// 事件发生时间（UTC）
    pub occurred_at: DateTime<Utc>,
    /// 触发命令 ID
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// Turn ID
    pub turn_id: String,
}

/// # Turn 启动请求事件
///
/// 当请求启动一个 Turn 时产生。此事件触发 Provider 开始处理 Turn。
///
/// ## 字段说明
///
/// - `sequence`: 事件序列号
/// - `occurred_at`: 事件发生时间
/// - `command_id`: 触发命令 ID
/// - `thread_id`: 线程 ID
/// - `turn_id`: Turn ID
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadTurnStartRequestedEvent {
    /// 事件序列号
    pub sequence: Sequence,
    /// 事件发生时间（UTC）
    pub occurred_at: DateTime<Utc>,
    /// 触发命令 ID
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// Turn ID
    pub turn_id: String,
}

/// # Turn 中断请求事件
///
/// 当请求中断一个正在执行的 Turn 时产生。
///
/// ## 字段说明
///
/// - `sequence`: 事件序列号
/// - `occurred_at`: 事件发生时间
/// - `command_id`: 触发命令 ID
/// - `thread_id`: 线程 ID
/// - `turn_id`: 被中断的 Turn ID
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadTurnInterruptRequestedEvent {
    /// 事件序列号
    pub sequence: Sequence,
    /// 事件发生时间（UTC）
    pub occurred_at: DateTime<Utc>,
    /// 触发命令 ID
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 被中断的 Turn ID
    pub turn_id: String,
}

// ==================== 审批事件 ====================

/// # 审批响应请求事件
///
/// 当 AI 代理请求用户审批某个操作时产生。
/// 用户需要对该请求做出批准或拒绝的响应。
///
/// ## 字段说明
///
/// - `sequence`: 事件序列号
/// - `occurred_at`: 事件发生时间
/// - `command_id`: 触发命令 ID
/// - `thread_id`: 线程 ID
/// - `turn_id`: 所属 Turn ID
/// - `request_id`: 审批请求唯一标识
/// - `approved`: 用户是否批准
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadApprovalResponseRequestedEvent {
    /// 事件序列号
    pub sequence: Sequence,
    /// 事件发生时间（UTC）
    pub occurred_at: DateTime<Utc>,
    /// 触发命令 ID
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 所属 Turn ID
    pub turn_id: String,
    /// 审批请求唯一标识
    pub request_id: String,
    /// 用户是否批准
    pub approved: bool,
}

/// # 用户输入响应请求事件
///
/// 当 AI 代理请求用户提供额外输入时产生。
/// 用户需要提供文本响应以继续执行。
///
/// ## 字段说明
///
/// - `sequence`: 事件序列号
/// - `occurred_at`: 事件发生时间
/// - `command_id`: 触发命令 ID
/// - `thread_id`: 线程 ID
/// - `turn_id`: 所属 Turn ID
/// - `request_id`: 输入请求唯一标识
/// - `response`: 用户提供的响应文本
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadUserInputResponseRequestedEvent {
    /// 事件序列号
    pub sequence: Sequence,
    /// 事件发生时间（UTC）
    pub occurred_at: DateTime<Utc>,
    /// 触发命令 ID
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 所属 Turn ID
    pub turn_id: String,
    /// 输入请求唯一标识
    pub request_id: String,
    /// 用户提供的响应文本
    pub response: String,
}

// ==================== 检查点事件 ====================

/// # 检查点回退请求事件
///
/// 当请求将线程状态回退到指定检查点时产生。
/// 回退操作会恢复 Git 工作区到检查点对应的 commit。
///
/// ## 字段说明
///
/// - `sequence`: 事件序列号
/// - `occurred_at`: 事件发生时间
/// - `command_id`: 触发命令 ID
/// - `thread_id`: 线程 ID
/// - `checkpoint_id`: 目标检查点 ID
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadCheckpointRevertRequestedEvent {
    /// 事件序列号
    pub sequence: Sequence,
    /// 事件发生时间（UTC）
    pub occurred_at: DateTime<Utc>,
    /// 触发命令 ID
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 目标检查点 ID
    pub checkpoint_id: String,
}

/// # 线程已回退事件
///
/// 当线程成功回退到指定检查点后产生。
///
/// ## 字段说明
///
/// - `sequence`: 事件序列号
/// - `occurred_at`: 事件发生时间
/// - `command_id`: 触发命令 ID
/// - `thread_id`: 线程 ID
/// - `checkpoint_id`: 回退到的检查点 ID
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadRevertedEvent {
    /// 事件序列号
    pub sequence: Sequence,
    /// 事件发生时间（UTC）
    pub occurred_at: DateTime<Utc>,
    /// 触发命令 ID
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 回退到的检查点 ID
    pub checkpoint_id: String,
}

/// # Turn 差异比较完成事件
///
/// 当 Turn 的代码差异比较完成后产生。
/// 差异信息用于展示 Turn 期间所做的代码变更。
///
/// ## 字段说明
///
/// - `sequence`: 事件序列号
/// - `occurred_at`: 事件发生时间
/// - `command_id`: 触发命令 ID
/// - `thread_id`: 线程 ID
/// - `turn_id`: Turn ID
/// - `diff`: 差异内容（unified diff 格式）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadTurnDiffCompletedEvent {
    /// 事件序列号
    pub sequence: Sequence,
    /// 事件发生时间（UTC）
    pub occurred_at: DateTime<Utc>,
    /// 触发命令 ID
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// Turn ID
    pub turn_id: String,
    /// 差异内容（unified diff 格式）
    pub diff: String,
}

// ==================== 回滚事件 ====================

/// # 对话回滚请求事件
///
/// 当请求将对话回滚到指定消息时产生。
/// 回滚操作会移除指定消息之后的所有消息。
///
/// ## 字段说明
///
/// - `sequence`: 事件序列号
/// - `occurred_at`: 事件发生时间
/// - `command_id`: 触发命令 ID
/// - `thread_id`: 线程 ID
/// - `message_id`: 回滚目标消息 ID（该消息及其之前的消息保留）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadConversationRollbackRequestedEvent {
    /// 事件序列号
    pub sequence: Sequence,
    /// 事件发生时间（UTC）
    pub occurred_at: DateTime<Utc>,
    /// 触发命令 ID
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 回滚目标消息 ID
    pub message_id: MessageId,
}

/// # 对话已回滚事件
///
/// 当对话成功回滚到指定消息后产生。
///
/// ## 字段说明
///
/// - `sequence`: 事件序列号
/// - `occurred_at`: 事件发生时间
/// - `command_id`: 触发命令 ID
/// - `thread_id`: 线程 ID
/// - `message_id`: 回滚到的消息 ID
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadConversationRolledBackEvent {
    /// 事件序列号
    pub sequence: Sequence,
    /// 事件发生时间（UTC）
    pub occurred_at: DateTime<Utc>,
    /// 触发命令 ID
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 回滚到的消息 ID
    pub message_id: MessageId,
}

// ==================== 其他事件 ====================

/// # 消息编辑重发请求事件
///
/// 当请求编辑并重新发送一条消息时产生。
/// 编辑后的消息会替换原消息，并触发新的 Turn。
///
/// ## 字段说明
///
/// - `sequence`: 事件序列号
/// - `occurred_at`: 事件发生时间
/// - `command_id`: 触发命令 ID
/// - `thread_id`: 线程 ID
/// - `message_id`: 被编辑的消息 ID
/// - `new_text`: 新的消息文本内容
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadMessageEditResendRequestedEvent {
    /// 事件序列号
    pub sequence: Sequence,
    /// 事件发生时间（UTC）
    pub occurred_at: DateTime<Utc>,
    /// 触发命令 ID
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 被编辑的消息 ID
    pub message_id: MessageId,
    /// 新的消息文本内容
    pub new_text: String,
}

/// # 会话停止请求事件
///
/// 当请求停止线程的 Provider 会话时产生。
///
/// ## 字段说明
///
/// - `sequence`: 事件序列号
/// - `occurred_at`: 事件发生时间
/// - `command_id`: 触发命令 ID
/// - `thread_id`: 线程 ID
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSessionStopRequestedEvent {
    /// 事件序列号
    pub sequence: Sequence,
    /// 事件发生时间（UTC）
    pub occurred_at: DateTime<Utc>,
    /// 触发命令 ID
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
}

/// # 线程会话设置事件
///
/// 当线程的 Provider 会话被设置或更新时产生。
/// 用于同步会话状态（如会话启动、状态变更等）。
///
/// ## 字段说明
///
/// - `sequence`: 事件序列号
/// - `occurred_at`: 事件发生时间
/// - `command_id`: 触发命令 ID
/// - `thread_id`: 线程 ID
/// - `session`: 新的会话信息（`None` 表示清除会话）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSessionSetEvent {
    /// 事件序列号
    pub sequence: Sequence,
    /// 事件发生时间（UTC）
    pub occurred_at: DateTime<Utc>,
    /// 触发命令 ID
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 新的会话信息（`None` 表示清除会话）
    pub session: Option<crate::models::Session>,
}

/// # 提议计划创建/更新事件
///
/// 当 AI 提议的执行计划被创建或更新时产生。
///
/// ## 字段说明
///
/// - `sequence`: 事件序列号
/// - `occurred_at`: 事件发生时间
/// - `command_id`: 触发命令 ID
/// - `thread_id`: 线程 ID
/// - `plan`: 提议的计划实体
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadProposedPlanUpsertedEvent {
    /// 事件序列号
    pub sequence: Sequence,
    /// 事件发生时间（UTC）
    pub occurred_at: DateTime<Utc>,
    /// 触发命令 ID
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 提议的计划实体
    pub plan: ProposedPlan,
}

/// # 活动追加事件
///
/// 当新的活动记录被追加到线程时产生。
/// 活动包括工具调用、文件变更、终端命令、Git 操作等。
///
/// ## 字段说明
///
/// - `sequence`: 事件序列号
/// - `occurred_at`: 事件发生时间
/// - `command_id`: 触发命令 ID
/// - `thread_id`: 线程 ID
/// - `activity`: 追加的活动记录
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadActivityAppendedEvent {
    /// 事件序列号
    pub sequence: Sequence,
    /// 事件发生时间（UTC）
    pub occurred_at: DateTime<Utc>,
    /// 触发命令 ID
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 追加的活动记录
    pub activity: Activity,
}
