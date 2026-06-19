//! 编排命令定义

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::{
    Activity, DispatchMode, InteractionMode, MessageId, ProjectId, ProposedPlan, RuntimeMode,
    ThreadId,
};
use crate::provider::ModelSelection;

/// 编排命令
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "_tag", rename_all = "kebab-case")]
pub enum OrchestrationCommand {
    // 项目命令
    #[serde(rename = "project.create")]
    ProjectCreate(ProjectCreateCommand),
    #[serde(rename = "project.meta.update")]
    ProjectMetaUpdate(ProjectMetaUpdateCommand),
    #[serde(rename = "project.delete")]
    ProjectDelete(ProjectDeleteCommand),

    // 线程命令
    #[serde(rename = "thread.create")]
    ThreadCreate(ThreadCreateCommand),
    #[serde(rename = "thread.delete")]
    ThreadDelete(ThreadDeleteCommand),
    #[serde(rename = "thread.archive")]
    ThreadArchive(ThreadArchiveCommand),
    #[serde(rename = "thread.unarchive")]
    ThreadUnarchive(ThreadUnarchiveCommand),
    #[serde(rename = "thread.meta.update")]
    ThreadMetaUpdate(ThreadMetaUpdateCommand),
    #[serde(rename = "thread.runtime-mode.set")]
    ThreadRuntimeModeSet(ThreadRuntimeModeSetCommand),
    #[serde(rename = "thread.interaction-mode.set")]
    ThreadInteractionModeSet(ThreadInteractionModeSetCommand),

    // Turn 命令
    #[serde(rename = "thread.turn.start")]
    ThreadTurnStart(ThreadTurnStartCommand),
    #[serde(rename = "thread.turn.interrupt")]
    ThreadTurnInterrupt(ThreadTurnInterruptCommand),
    #[serde(rename = "thread.turn.dispatch-queued")]
    ThreadTurnDispatchQueued(ThreadTurnDispatchQueuedCommand),

    // 审批命令
    #[serde(rename = "thread.approval.respond")]
    ThreadApprovalRespond(ThreadApprovalRespondCommand),
    #[serde(rename = "thread.user-input.respond")]
    ThreadUserInputRespond(ThreadUserInputRespondCommand),

    // 检查点命令
    #[serde(rename = "thread.checkpoint.revert")]
    ThreadCheckpointRevert(ThreadCheckpointRevertCommand),
    #[serde(rename = "thread.conversation.rollback")]
    ThreadConversationRollback(ThreadConversationRollbackCommand),

    // 消息命令
    #[serde(rename = "thread.message.edit-and-resend")]
    ThreadMessageEditAndResend(ThreadMessageEditAndResendCommand),
    #[serde(rename = "thread.session.stop")]
    ThreadSessionStop(ThreadSessionStopCommand),

    // 活动命令
    #[serde(rename = "thread.activity.append")]
    ThreadActivityAppend(ThreadActivityAppendCommand),

    // 内部命令
    #[serde(rename = "thread.session.set")]
    ThreadSessionSet(ThreadSessionSetCommand),
    #[serde(rename = "thread.messages.import")]
    ThreadMessagesImport(ThreadMessagesImportCommand),
    #[serde(rename = "thread.message.assistant.delta")]
    ThreadMessageAssistantDelta(ThreadMessageAssistantDeltaCommand),
    #[serde(rename = "thread.message.assistant.complete")]
    ThreadMessageAssistantComplete(ThreadMessageAssistantCompleteCommand),
    #[serde(rename = "thread.proposed-plan.upsert")]
    ThreadProposedPlanUpsert(ThreadProposedPlanUpsertCommand),
    #[serde(rename = "thread.turn.diff.complete")]
    ThreadTurnDiffComplete(ThreadTurnDiffCompleteCommand),
    #[serde(rename = "thread.revert.complete")]
    ThreadRevertComplete(ThreadRevertCompleteCommand),
    #[serde(rename = "thread.conversation.rollback.complete")]
    ThreadConversationRollbackComplete(ThreadConversationRollbackCompleteCommand),
}

impl OrchestrationCommand {
    /// 获取命令 ID
    pub fn command_id(&self) -> Option<&str> {
        match self {
            OrchestrationCommand::ProjectCreate(c) => c.command_id.as_deref(),
            OrchestrationCommand::ProjectMetaUpdate(c) => c.command_id.as_deref(),
            OrchestrationCommand::ProjectDelete(c) => c.command_id.as_deref(),
            OrchestrationCommand::ThreadCreate(c) => c.command_id.as_deref(),
            OrchestrationCommand::ThreadDelete(c) => c.command_id.as_deref(),
            OrchestrationCommand::ThreadArchive(c) => c.command_id.as_deref(),
            OrchestrationCommand::ThreadUnarchive(c) => c.command_id.as_deref(),
            OrchestrationCommand::ThreadMetaUpdate(c) => c.command_id.as_deref(),
            OrchestrationCommand::ThreadRuntimeModeSet(c) => c.command_id.as_deref(),
            OrchestrationCommand::ThreadInteractionModeSet(c) => c.command_id.as_deref(),
            OrchestrationCommand::ThreadTurnStart(c) => c.command_id.as_deref(),
            OrchestrationCommand::ThreadTurnInterrupt(c) => c.command_id.as_deref(),
            OrchestrationCommand::ThreadTurnDispatchQueued(c) => c.command_id.as_deref(),
            OrchestrationCommand::ThreadApprovalRespond(c) => c.command_id.as_deref(),
            OrchestrationCommand::ThreadUserInputRespond(c) => c.command_id.as_deref(),
            OrchestrationCommand::ThreadCheckpointRevert(c) => c.command_id.as_deref(),
            OrchestrationCommand::ThreadConversationRollback(c) => c.command_id.as_deref(),
            OrchestrationCommand::ThreadMessageEditAndResend(c) => c.command_id.as_deref(),
            OrchestrationCommand::ThreadSessionStop(c) => c.command_id.as_deref(),
            OrchestrationCommand::ThreadActivityAppend(c) => c.command_id.as_deref(),
            OrchestrationCommand::ThreadSessionSet(c) => c.command_id.as_deref(),
            OrchestrationCommand::ThreadMessagesImport(c) => c.command_id.as_deref(),
            OrchestrationCommand::ThreadMessageAssistantDelta(c) => c.command_id.as_deref(),
            OrchestrationCommand::ThreadMessageAssistantComplete(c) => c.command_id.as_deref(),
            OrchestrationCommand::ThreadProposedPlanUpsert(c) => c.command_id.as_deref(),
            OrchestrationCommand::ThreadTurnDiffComplete(c) => c.command_id.as_deref(),
            OrchestrationCommand::ThreadRevertComplete(c) => c.command_id.as_deref(),
            OrchestrationCommand::ThreadConversationRollbackComplete(c) => c.command_id.as_deref(),
        }
    }
}

// 项目命令
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCreateCommand {
    pub command_id: Option<String>,
    pub project_id: ProjectId,
    pub title: String,
    pub workspace_root: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMetaUpdateCommand {
    pub command_id: Option<String>,
    pub project_id: ProjectId,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDeleteCommand {
    pub command_id: Option<String>,
    pub project_id: ProjectId,
}

// 线程命令
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadCreateCommand {
    pub command_id: Option<String>,
    pub thread_id: ThreadId,
    pub project_id: ProjectId,
    pub title: String,
    pub model_selection: ModelSelection,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadDeleteCommand {
    pub command_id: Option<String>,
    pub thread_id: ThreadId,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadArchiveCommand {
    pub command_id: Option<String>,
    pub thread_id: ThreadId,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadUnarchiveCommand {
    pub command_id: Option<String>,
    pub thread_id: ThreadId,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadMetaUpdateCommand {
    pub command_id: Option<String>,
    pub thread_id: ThreadId,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadRuntimeModeSetCommand {
    pub command_id: Option<String>,
    pub thread_id: ThreadId,
    pub runtime_mode: RuntimeMode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadInteractionModeSetCommand {
    pub command_id: Option<String>,
    pub thread_id: ThreadId,
    pub interaction_mode: InteractionMode,
}

// Turn 命令
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadTurnStartCommand {
    pub command_id: Option<String>,
    pub thread_id: ThreadId,
    pub turn_id: String,
    pub message_id: MessageId,
    pub dispatch_mode: DispatchMode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadTurnInterruptCommand {
    pub command_id: Option<String>,
    pub thread_id: ThreadId,
    pub turn_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadTurnDispatchQueuedCommand {
    pub command_id: Option<String>,
    pub thread_id: ThreadId,
    pub turn_id: String,
}

// 审批命令
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadApprovalRespondCommand {
    pub command_id: Option<String>,
    pub thread_id: ThreadId,
    pub turn_id: String,
    pub request_id: String,
    pub approved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadUserInputRespondCommand {
    pub command_id: Option<String>,
    pub thread_id: ThreadId,
    pub turn_id: String,
    pub request_id: String,
    pub response: String,
}

// 检查点命令
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadCheckpointRevertCommand {
    pub command_id: Option<String>,
    pub thread_id: ThreadId,
    pub checkpoint_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadConversationRollbackCommand {
    pub command_id: Option<String>,
    pub thread_id: ThreadId,
    pub message_id: MessageId,
}

// 消息命令
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadMessageEditAndResendCommand {
    pub command_id: Option<String>,
    pub thread_id: ThreadId,
    pub message_id: MessageId,
    pub new_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSessionStopCommand {
    pub command_id: Option<String>,
    pub thread_id: ThreadId,
}

// 活动命令
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadActivityAppendCommand {
    pub command_id: Option<String>,
    pub thread_id: ThreadId,
    pub activity: Activity,
}

// 内部命令
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSessionSetCommand {
    pub command_id: Option<String>,
    pub thread_id: ThreadId,
    pub session: Option<crate::models::Session>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadMessagesImportCommand {
    pub command_id: Option<String>,
    pub thread_id: ThreadId,
    pub messages: Vec<crate::models::Message>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadMessageAssistantDeltaCommand {
    pub command_id: Option<String>,
    pub thread_id: ThreadId,
    pub turn_id: String,
    pub delta: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadMessageAssistantCompleteCommand {
    pub command_id: Option<String>,
    pub thread_id: ThreadId,
    pub turn_id: String,
    pub message_id: MessageId,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadProposedPlanUpsertCommand {
    pub command_id: Option<String>,
    pub thread_id: ThreadId,
    pub plan: ProposedPlan,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadTurnDiffCompleteCommand {
    pub command_id: Option<String>,
    pub thread_id: ThreadId,
    pub turn_id: String,
    pub diff: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadRevertCompleteCommand {
    pub command_id: Option<String>,
    pub thread_id: ThreadId,
    pub checkpoint_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadConversationRollbackCompleteCommand {
    pub command_id: Option<String>,
    pub thread_id: ThreadId,
    pub message_id: MessageId,
}
