//! 编排事件定义

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::{
    Activity, Checkpoint, InteractionMode, Message, MessageId, ProjectId, ProposedPlan,
    RuntimeMode, Sequence, ThreadId,
};

/// 编排事件
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "_tag", rename_all = "kebab-case")]
pub enum OrchestrationEvent {
    // 项目事件
    #[serde(rename = "project.created")]
    ProjectCreated(ProjectCreatedEvent),
    #[serde(rename = "project.meta-updated")]
    ProjectMetaUpdated(ProjectMetaUpdatedEvent),
    #[serde(rename = "project.deleted")]
    ProjectDeleted(ProjectDeletedEvent),

    // 线程事件
    #[serde(rename = "thread.created")]
    ThreadCreated(ThreadCreatedEvent),
    #[serde(rename = "thread.deleted")]
    ThreadDeleted(ThreadDeletedEvent),
    #[serde(rename = "thread.archived")]
    ThreadArchived(ThreadArchivedEvent),
    #[serde(rename = "thread.unarchived")]
    ThreadUnarchived(ThreadUnarchivedEvent),
    #[serde(rename = "thread.meta-updated")]
    ThreadMetaUpdated(ThreadMetaUpdatedEvent),
    #[serde(rename = "thread.runtime-mode-set")]
    ThreadRuntimeModeSet(ThreadRuntimeModeSetEvent),
    #[serde(rename = "thread.interaction-mode-set")]
    ThreadInteractionModeSet(ThreadInteractionModeSetEvent),

    // 消息事件
    #[serde(rename = "thread.message-sent")]
    ThreadMessageSent(ThreadMessageSentEvent),

    // Turn 事件
    #[serde(rename = "thread.turn-queued")]
    ThreadTurnQueued(ThreadTurnQueuedEvent),
    #[serde(rename = "thread.turn-start-requested")]
    ThreadTurnStartRequested(ThreadTurnStartRequestedEvent),
    #[serde(rename = "thread.turn-interrupt-requested")]
    ThreadTurnInterruptRequested(ThreadTurnInterruptRequestedEvent),

    // 审批事件
    #[serde(rename = "thread.approval-response-requested")]
    ThreadApprovalResponseRequested(ThreadApprovalResponseRequestedEvent),
    #[serde(rename = "thread.user-input-response-requested")]
    ThreadUserInputResponseRequested(ThreadUserInputResponseRequestedEvent),

    // 检查点事件
    #[serde(rename = "thread.checkpoint-revert-requested")]
    ThreadCheckpointRevertRequested(ThreadCheckpointRevertRequestedEvent),
    #[serde(rename = "thread.reverted")]
    ThreadReverted(ThreadRevertedEvent),
    #[serde(rename = "thread.turn-diff-completed")]
    ThreadTurnDiffCompleted(ThreadTurnDiffCompletedEvent),

    // 回滚事件
    #[serde(rename = "thread.conversation-rollback-requested")]
    ThreadConversationRollbackRequested(ThreadConversationRollbackRequestedEvent),
    #[serde(rename = "thread.conversation-rolled-back")]
    ThreadConversationRolledBack(ThreadConversationRolledBackEvent),

    // 其他事件
    #[serde(rename = "thread.message-edit-resend-requested")]
    ThreadMessageEditResendRequested(ThreadMessageEditResendRequestedEvent),
    #[serde(rename = "thread.session-stop-requested")]
    ThreadSessionStopRequested(ThreadSessionStopRequestedEvent),
    #[serde(rename = "thread.session-set")]
    ThreadSessionSet(ThreadSessionSetEvent),
    #[serde(rename = "thread.proposed-plan-upserted")]
    ThreadProposedPlanUpserted(ThreadProposedPlanUpsertedEvent),
    #[serde(rename = "thread.activity-appended")]
    ThreadActivityAppended(ThreadActivityAppendedEvent),
}

impl OrchestrationEvent {
    /// 获取事件序列号
    pub fn sequence(&self) -> Sequence {
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

    /// 获取事件发生时间
    pub fn occurred_at(&self) -> DateTime<Utc> {
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
}

/// 事件基础字段宏
macro_rules! event_base_fields {
    () => {
        pub sequence: Sequence,
        pub occurred_at: DateTime<Utc>,
        pub command_id: Option<String>,
    };
}

// 项目事件
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCreatedEvent {
    event_base_fields!();
    pub project_id: ProjectId,
    pub title: String,
    pub workspace_root: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMetaUpdatedEvent {
    event_base_fields!();
    pub project_id: ProjectId,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDeletedEvent {
    event_base_fields!();
    pub project_id: ProjectId,
}

// 线程事件
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadCreatedEvent {
    event_base_fields!();
    pub thread_id: ThreadId,
    pub project_id: ProjectId,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadDeletedEvent {
    event_base_fields!();
    pub thread_id: ThreadId,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadArchivedEvent {
    event_base_fields!();
    pub thread_id: ThreadId,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadUnarchivedEvent {
    event_base_fields!();
    pub thread_id: ThreadId,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadMetaUpdatedEvent {
    event_base_fields!();
    pub thread_id: ThreadId,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadRuntimeModeSetEvent {
    event_base_fields!();
    pub thread_id: ThreadId,
    pub runtime_mode: RuntimeMode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadInteractionModeSetEvent {
    event_base_fields!();
    pub thread_id: ThreadId,
    pub interaction_mode: InteractionMode,
}

// 消息事件
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadMessageSentEvent {
    event_base_fields!();
    pub thread_id: ThreadId,
    pub message: Message,
}

// Turn 事件
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadTurnQueuedEvent {
    event_base_fields!();
    pub thread_id: ThreadId,
    pub turn_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadTurnStartRequestedEvent {
    event_base_fields!();
    pub thread_id: ThreadId,
    pub turn_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadTurnInterruptRequestedEvent {
    event_base_fields!();
    pub thread_id: ThreadId,
    pub turn_id: String,
}

// 审批事件
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadApprovalResponseRequestedEvent {
    event_base_fields!();
    pub thread_id: ThreadId,
    pub turn_id: String,
    pub request_id: String,
    pub approved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadUserInputResponseRequestedEvent {
    event_base_fields!();
    pub thread_id: ThreadId,
    pub turn_id: String,
    pub request_id: String,
    pub response: String,
}

// 检查点事件
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadCheckpointRevertRequestedEvent {
    event_base_fields!();
    pub thread_id: ThreadId,
    pub checkpoint_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadRevertedEvent {
    event_base_fields!();
    pub thread_id: ThreadId,
    pub checkpoint_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadTurnDiffCompletedEvent {
    event_base_fields!();
    pub thread_id: ThreadId,
    pub turn_id: String,
    pub diff: String,
}

// 回滚事件
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadConversationRollbackRequestedEvent {
    event_base_fields!();
    pub thread_id: ThreadId,
    pub message_id: MessageId,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadConversationRolledBackEvent {
    event_base_fields!();
    pub thread_id: ThreadId,
    pub message_id: MessageId,
}

// 其他事件
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadMessageEditResendRequestedEvent {
    event_base_fields!();
    pub thread_id: ThreadId,
    pub message_id: MessageId,
    pub new_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSessionStopRequestedEvent {
    event_base_fields!();
    pub thread_id: ThreadId,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSessionSetEvent {
    event_base_fields!();
    pub thread_id: ThreadId,
    pub session: Option<crate::models::Session>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadProposedPlanUpsertedEvent {
    event_base_fields!();
    pub thread_id: ThreadId,
    pub plan: ProposedPlan,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadActivityAppendedEvent {
    event_base_fields!();
    pub thread_id: ThreadId,
    pub activity: Activity,
}
