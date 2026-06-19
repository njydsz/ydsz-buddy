//! # 编排命令定义
//!
//! 本模块定义了 Remi 系统中所有编排命令（Orchestration Command）。
//! 采用命令查询职责分离（CQRS）模式，命令用于驱动状态变更。
//!
//! ## 设计原则
//!
//! - 所有命令均包含可选的 `command_id`，用于追踪命令-事件的因果关系
//! - 命令是不可变的（immutable），一旦创建不可修改
//! - 命令通过带标签的枚举（tagged enum）进行序列化，标签格式为 `kebab-case`
//!
//! ## 命令分类
//!
//! - **项目命令**: 项目的创建、更新、删除
//! - **线程命令**: 线程的创建、删除、归档、模式切换等
//! - **Turn 命令**: 交互轮次的启动、中断、分发
//! - **审批命令**: 审批响应和用户输入响应
//! - **检查点命令**: 检查点回退、对话回滚
//! - **消息命令**: 消息编辑重发、会话停止
//! - **活动命令**: 活动追加
//! - **内部命令**: 会话设置、消息导入、助手消息增量/完成、计划更新、差异完成、回退完成、回滚完成

use serde::{Deserialize, Serialize};

use crate::models::{
    Activity, DispatchMode, EnvMode, HandoffInfo, InteractionMode, MessageId, ProjectId,
    ProposedPlan, PullRequestInfo, RuntimeMode, ThreadId,
};
use crate::provider::ModelSelection;

/// # 编排命令
///
/// 系统所有编排命令的聚合枚举。每个变体对应一个具体的命令结构体。
/// 命令通过 `serde` 的标签联合（tagged union）机制序列化，
/// 使用 `_tag` 字段区分变体，标签值采用 `kebab-case` 格式。
///
/// ## 命令命名规范
///
/// 命令标签格式为 `{聚合根}.{动作}`，例如：
/// - `project.create` - 创建项目
/// - `thread.message.edit-and-resend` - 编辑并重新发送消息
/// - `thread.turn.start` - 启动 Turn
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "_tag", rename_all = "kebab-case")]
pub enum OrchestrationCommand {
    // ==================== 项目命令 ====================

    /// 创建项目
    #[serde(rename = "project.create")]
    ProjectCreate(ProjectCreateCommand),
    /// 更新项目元数据
    #[serde(rename = "project.meta.update")]
    ProjectMetaUpdate(ProjectMetaUpdateCommand),
    /// 删除项目
    #[serde(rename = "project.delete")]
    ProjectDelete(ProjectDeleteCommand),

    // ==================== 线程命令 ====================

    /// 创建线程
    #[serde(rename = "thread.create")]
    ThreadCreate(ThreadCreateCommand),
    /// 删除线程
    #[serde(rename = "thread.delete")]
    ThreadDelete(ThreadDeleteCommand),
    /// 归档线程
    #[serde(rename = "thread.archive")]
    ThreadArchive(ThreadArchiveCommand),
    /// 取消归档线程
    #[serde(rename = "thread.unarchive")]
    ThreadUnarchive(ThreadUnarchiveCommand),
    /// 更新线程元数据
    #[serde(rename = "thread.meta.update")]
    ThreadMetaUpdate(ThreadMetaUpdateCommand),
    /// 设置线程运行时模式
    #[serde(rename = "thread.runtime-mode.set")]
    ThreadRuntimeModeSet(ThreadRuntimeModeSetCommand),
    /// 设置线程交互模式
    #[serde(rename = "thread.interaction-mode.set")]
    ThreadInteractionModeSet(ThreadInteractionModeSetCommand),

    // ==================== Turn 命令 ====================

    /// 启动 Turn
    #[serde(rename = "thread.turn.start")]
    ThreadTurnStart(ThreadTurnStartCommand),
    /// 中断 Turn
    #[serde(rename = "thread.turn.interrupt")]
    ThreadTurnInterrupt(ThreadTurnInterruptCommand),
    /// 分发排队的 Turn
    #[serde(rename = "thread.turn.dispatch-queued")]
    ThreadTurnDispatchQueued(ThreadTurnDispatchQueuedCommand),

    // ==================== 审批命令 ====================

    /// 响应审批请求
    #[serde(rename = "thread.approval.respond")]
    ThreadApprovalRespond(ThreadApprovalRespondCommand),
    /// 响应用户输入请求
    #[serde(rename = "thread.user-input.respond")]
    ThreadUserInputRespond(ThreadUserInputRespondCommand),

    // ==================== 检查点命令 ====================

    /// 回退到检查点
    #[serde(rename = "thread.checkpoint.revert")]
    ThreadCheckpointRevert(ThreadCheckpointRevertCommand),
    /// 回滚对话
    #[serde(rename = "thread.conversation.rollback")]
    ThreadConversationRollback(ThreadConversationRollbackCommand),

    // ==================== 消息命令 ====================

    /// 编辑并重新发送消息
    #[serde(rename = "thread.message.edit-and-resend")]
    ThreadMessageEditAndResend(ThreadMessageEditAndResendCommand),
    /// 停止会话
    #[serde(rename = "thread.session.stop")]
    ThreadSessionStop(ThreadSessionStopCommand),

    // ==================== 活动命令 ====================

    /// 追加活动
    #[serde(rename = "thread.activity.append")]
    ThreadActivityAppend(ThreadActivityAppendCommand),

    // ==================== 内部命令 ====================

    /// 设置线程会话
    #[serde(rename = "thread.session.set")]
    ThreadSessionSet(ThreadSessionSetCommand),
    /// 导入消息
    #[serde(rename = "thread.messages.import")]
    ThreadMessagesImport(ThreadMessagesImportCommand),
    /// 助手消息增量更新
    #[serde(rename = "thread.message.assistant.delta")]
    ThreadMessageAssistantDelta(ThreadMessageAssistantDeltaCommand),
    /// 助手消息完成
    #[serde(rename = "thread.message.assistant.complete")]
    ThreadMessageAssistantComplete(ThreadMessageAssistantCompleteCommand),
    /// 创建或更新提议计划
    #[serde(rename = "thread.proposed-plan.upsert")]
    ThreadProposedPlanUpsert(ThreadProposedPlanUpsertCommand),
    /// Turn 差异比较完成
    #[serde(rename = "thread.turn.diff.complete")]
    ThreadTurnDiffComplete(ThreadTurnDiffCompleteCommand),
    /// 回退完成
    #[serde(rename = "thread.revert.complete")]
    ThreadRevertComplete(ThreadRevertCompleteCommand),
    /// 对话回滚完成
    #[serde(rename = "thread.conversation.rollback.complete")]
    ThreadConversationRollbackComplete(ThreadConversationRollbackCompleteCommand),
}

impl OrchestrationCommand {
    /// 获取命令 ID
    ///
    /// 命令 ID 用于追踪命令-事件的因果关系。
    ///
    /// # 返回值
    ///
    /// - `Some(command_id)` - 返回命令 ID 的字符串切片
    /// - `None` - 命令未设置 ID
    pub fn command_id(&self) -> Option<&str> {
        // 通过模式匹配从每个命令变体中提取 command_id 字段
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

// ==================== 项目命令 ====================

/// # 创建项目命令
///
/// 用于创建新项目。
///
/// ## 字段说明
///
/// - `command_id`: 命令 ID（可选）
/// - `project_id`: 新项目 ID
/// - `title`: 项目标题
/// - `workspace_root`: 工作区根目录路径
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCreateCommand {
    /// 命令 ID（可选）
    pub command_id: Option<String>,
    /// 新项目 ID
    pub project_id: ProjectId,
    /// 项目标题
    pub title: String,
    /// 工作区根目录路径
    pub workspace_root: String,
}

/// # 更新项目元数据命令
///
/// 用于更新项目的元数据（如标题）。
///
/// ## 字段说明
///
/// - `command_id`: 命令 ID（可选）
/// - `project_id`: 项目 ID
/// - `title`: 新的项目标题（`None` 表示不更新）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMetaUpdateCommand {
    /// 命令 ID（可选）
    pub command_id: Option<String>,
    /// 项目 ID
    pub project_id: ProjectId,
    /// 新的项目标题（`None` 表示不更新）
    pub title: Option<String>,
}

/// # 删除项目命令
///
/// 用于删除项目（软删除）。
///
/// ## 字段说明
///
/// - `command_id`: 命令 ID（可选）
/// - `project_id`: 要删除的项目 ID
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDeleteCommand {
    /// 命令 ID（可选）
    pub command_id: Option<String>,
    /// 要删除的项目 ID
    pub project_id: ProjectId,
}

// ==================== 线程命令 ====================

/// # 创建线程命令
///
/// 用于创建新线程。
///
/// ## 字段说明
///
/// - `command_id`: 命令 ID（可选）
/// - `thread_id`: 新线程 ID
/// - `project_id`: 所属项目 ID
/// - `title`: 线程标题
/// - `model_selection`: AI 模型选择配置
/// - `runtime_mode`: 运行时模式（Agent/Ask/Plan）
/// - `interaction_mode`: 交互模式（Chat/Review）
/// - `env_mode`: 环境模式（Local/Worktree）
/// - `branch`: Git 分支名称（可选）
/// - `worktree_path`: Worktree 路径（可选）
/// - `associated_worktree_path`: 关联 Worktree 路径（可选）
/// - `associated_worktree_branch`: 关联 Worktree 分支（可选）
/// - `associated_worktree_ref`: 关联 Worktree Git 引用（可选）
/// - `create_branch_flow_completed`: 分支创建流程是否完成（可选）
/// - `is_pinned`: 是否置顶（可选，默认为 false）
/// - `parent_thread_id`: 父线程 ID（可选，用于子线程）
/// - `subagent_agent_id`: 子代理 ID（可选）
/// - `subagent_nickname`: 子代理昵称（可选）
/// - `subagent_role`: 子代理角色（可选）
/// - `fork_source_thread_id`: 分叉源线程 ID（可选）
/// - `sidechat_source_thread_id`: 侧聊源线程 ID（可选）
/// - `last_known_pr`: 关联的 PR 信息（可选）
/// - `handoff`: 交接信息（可选）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadCreateCommand {
    /// 命令 ID（可选）
    pub command_id: Option<String>,
    /// 新线程 ID
    pub thread_id: ThreadId,
    /// 所属项目 ID
    pub project_id: ProjectId,
    /// 线程标题
    pub title: String,
    /// AI 模型选择配置
    pub model_selection: ModelSelection,
    /// 运行时模式，默认为 Agent
    #[serde(default = "default_runtime_mode")]
    pub runtime_mode: RuntimeMode,
    /// 交互模式，默认为 Chat
    #[serde(default = "default_interaction_mode")]
    pub interaction_mode: InteractionMode,
    /// 环境模式，默认为 Local
    #[serde(default = "default_env_mode")]
    pub env_mode: EnvMode,
    /// Git 分支名称（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    /// Worktree 路径（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub worktree_path: Option<String>,
    /// 关联 Worktree 路径（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub associated_worktree_path: Option<String>,
    /// 关联 Worktree 分支（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub associated_worktree_branch: Option<String>,
    /// 关联 Worktree Git 引用（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub associated_worktree_ref: Option<String>,
    /// 分支创建流程是否完成（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub create_branch_flow_completed: Option<bool>,
    /// 是否置顶（可选，默认为 false）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_pinned: Option<bool>,
    /// 父线程 ID（可选，用于子线程）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_thread_id: Option<ThreadId>,
    /// 子代理 ID（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subagent_agent_id: Option<String>,
    /// 子代理昵称（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subagent_nickname: Option<String>,
    /// 子代理角色（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subagent_role: Option<String>,
    /// 分叉源线程 ID（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fork_source_thread_id: Option<ThreadId>,
    /// 侧聊源线程 ID（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sidechat_source_thread_id: Option<ThreadId>,
    /// 关联的 PR 信息（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_known_pr: Option<PullRequestInfo>,
    /// 交接信息（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub handoff: Option<HandoffInfo>,
}

/// 默认运行时模式
fn default_runtime_mode() -> RuntimeMode {
    RuntimeMode::Agent
}

/// 默认交互模式
fn default_interaction_mode() -> InteractionMode {
    InteractionMode::Chat
}

/// 默认环境模式
fn default_env_mode() -> EnvMode {
    EnvMode::Local
}

/// # 删除线程命令
///
/// 用于删除线程（软删除）。
///
/// ## 字段说明
///
/// - `command_id`: 命令 ID（可选）
/// - `thread_id`: 要删除的线程 ID
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadDeleteCommand {
    /// 命令 ID（可选）
    pub command_id: Option<String>,
    /// 要删除的线程 ID
    pub thread_id: ThreadId,
}

/// # 归档线程命令
///
/// 用于归档线程。归档后的线程在 UI 中默认隐藏。
///
/// ## 字段说明
///
/// - `command_id`: 命令 ID（可选）
/// - `thread_id`: 要归档的线程 ID
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadArchiveCommand {
    /// 命令 ID（可选）
    pub command_id: Option<String>,
    /// 要归档的线程 ID
    pub thread_id: ThreadId,
}

/// # 取消归档线程命令
///
/// 用于取消归档已归档的线程。
///
/// ## 字段说明
///
/// - `command_id`: 命令 ID（可选）
/// - `thread_id`: 要取消归档的线程 ID
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadUnarchiveCommand {
    /// 命令 ID（可选）
    pub command_id: Option<String>,
    /// 要取消归档的线程 ID
    pub thread_id: ThreadId,
}

/// # 更新线程元数据命令
///
/// 用于更新线程的元数据（如标题）。
///
/// ## 字段说明
///
/// - `command_id`: 命令 ID（可选）
/// - `thread_id`: 线程 ID
/// - `title`: 新的线程标题（`None` 表示不更新）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadMetaUpdateCommand {
    /// 命令 ID（可选）
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 新的线程标题（`None` 表示不更新）
    pub title: Option<String>,
}

/// # 设置线程运行时模式命令
///
/// 用于设置线程的运行时模式（Agent / Ask / Plan）。
///
/// ## 字段说明
///
/// - `command_id`: 命令 ID（可选）
/// - `thread_id`: 线程 ID
/// - `runtime_mode`: 新的运行时模式
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadRuntimeModeSetCommand {
    /// 命令 ID（可选）
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 新的运行时模式
    pub runtime_mode: RuntimeMode,
}

/// # 设置线程交互模式命令
///
/// 用于设置线程的交互模式（Chat / Review）。
///
/// ## 字段说明
///
/// - `command_id`: 命令 ID（可选）
/// - `thread_id`: 线程 ID
/// - `interaction_mode`: 新的交互模式
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadInteractionModeSetCommand {
    /// 命令 ID（可选）
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 新的交互模式
    pub interaction_mode: InteractionMode,
}

// ==================== Turn 命令 ====================

/// # 启动 Turn 命令
///
/// 用于启动一个新的交互轮次（Turn）。
///
/// ## 字段说明
///
/// - `command_id`: 命令 ID（可选）
/// - `thread_id`: 线程 ID
/// - `turn_id`: Turn ID
/// - `message_id`: 触发 Turn 的消息 ID
/// - `dispatch_mode`: 分发模式（Normal / Review / Plan）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadTurnStartCommand {
    /// 命令 ID（可选）
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// Turn ID
    pub turn_id: String,
    /// 触发 Turn 的消息 ID
    pub message_id: MessageId,
    /// 分发模式（Normal / Review / Plan）
    pub dispatch_mode: DispatchMode,
}

/// # 中断 Turn 命令
///
/// 用于中断正在执行的 Turn。
///
/// ## 字段说明
///
/// - `command_id`: 命令 ID（可选）
/// - `thread_id`: 线程 ID
/// - `turn_id`: 要中断的 Turn ID
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadTurnInterruptCommand {
    /// 命令 ID（可选）
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 要中断的 Turn ID
    pub turn_id: String,
}

/// # 分发排队 Turn 命令
///
/// 用于分发排队的 Turn，触发其执行。
///
/// ## 字段说明
///
/// - `command_id`: 命令 ID（可选）
/// - `thread_id`: 线程 ID
/// - `turn_id`: 要分发的 Turn ID
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadTurnDispatchQueuedCommand {
    /// 命令 ID（可选）
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 要分发的 Turn ID
    pub turn_id: String,
}

// ==================== 审批命令 ====================

/// # 响应审批请求命令
///
/// 用于响应用户对审批请求的决定（批准或拒绝）。
///
/// ## 字段说明
///
/// - `command_id`: 命令 ID（可选）
/// - `thread_id`: 线程 ID
/// - `turn_id`: 所属 Turn ID
/// - `request_id`: 审批请求 ID
/// - `approved`: 是否批准
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadApprovalRespondCommand {
    /// 命令 ID（可选）
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 所属 Turn ID
    pub turn_id: String,
    /// 审批请求 ID
    pub request_id: String,
    /// 是否批准
    pub approved: bool,
}

/// # 响应用户输入请求命令
///
/// 用于响应用户提供的输入信息。
///
/// ## 字段说明
///
/// - `command_id`: 命令 ID（可选）
/// - `thread_id`: 线程 ID
/// - `turn_id`: 所属 Turn ID
/// - `request_id`: 输入请求 ID
/// - `response`: 用户提供的响应文本
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadUserInputRespondCommand {
    /// 命令 ID（可选）
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 所属 Turn ID
    pub turn_id: String,
    /// 输入请求 ID
    pub request_id: String,
    /// 用户提供的响应文本
    pub response: String,
}

// ==================== 检查点命令 ====================

/// # 回退到检查点命令
///
/// 用于将线程状态回退到指定的检查点。
///
/// ## 字段说明
///
/// - `command_id`: 命令 ID（可选）
/// - `thread_id`: 线程 ID
/// - `checkpoint_id`: 目标检查点 ID
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadCheckpointRevertCommand {
    /// 命令 ID（可选）
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 目标检查点 ID
    pub checkpoint_id: String,
}

/// # 回滚对话命令
///
/// 用于将对话回滚到指定的消息。
///
/// ## 字段说明
///
/// - `command_id`: 命令 ID（可选）
/// - `thread_id`: 线程 ID
/// - `message_id`: 回滚目标消息 ID（该消息及其之前的消息保留）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadConversationRollbackCommand {
    /// 命令 ID（可选）
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 回滚目标消息 ID
    pub message_id: MessageId,
}

// ==================== 消息命令 ====================

/// # 编辑并重新发送消息命令
///
/// 用于编辑消息并重新发送，触发新的 Turn。
///
/// ## 字段说明
///
/// - `command_id`: 命令 ID（可选）
/// - `thread_id`: 线程 ID
/// - `message_id`: 要编辑的消息 ID
/// - `new_text`: 新的消息文本
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadMessageEditAndResendCommand {
    /// 命令 ID（可选）
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 要编辑的消息 ID
    pub message_id: MessageId,
    /// 新的消息文本
    pub new_text: String,
}

/// # 停止会话命令
///
/// 用于停止线程的 Provider 会话。
///
/// ## 字段说明
///
/// - `command_id`: 命令 ID（可选）
/// - `thread_id`: 线程 ID
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSessionStopCommand {
    /// 命令 ID（可选）
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
}

// ==================== 活动命令 ====================

/// # 追加活动命令
///
/// 用于向线程追加活动记录（工具调用、文件变更等）。
///
/// ## 字段说明
///
/// - `command_id`: 命令 ID（可选）
/// - `thread_id`: 线程 ID
/// - `activity`: 要追加的活动记录
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadActivityAppendCommand {
    /// 命令 ID（可选）
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 要追加的活动记录
    pub activity: Activity,
}

// ==================== 内部命令 ====================

/// # 设置线程会话命令
///
/// 用于设置或更新线程的 Provider 会话。
///
/// ## 字段说明
///
/// - `command_id`: 命令 ID（可选）
/// - `thread_id`: 线程 ID
/// - `session`: 新的会话信息（`None` 表示清除会话）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSessionSetCommand {
    /// 命令 ID（可选）
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 新的会话信息（`None` 表示清除会话）
    pub session: Option<crate::models::Session>,
}

/// # 导入消息命令
///
/// 用于批量导入消息到线程。
///
/// ## 字段说明
///
/// - `command_id`: 命令 ID（可选）
/// - `thread_id`: 线程 ID
/// - `messages`: 要导入的消息列表
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadMessagesImportCommand {
    /// 命令 ID（可选）
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 要导入的消息列表
    pub messages: Vec<crate::models::Message>,
}

/// # 助手消息增量更新命令
///
/// 用于流式传输 AI 助手消息的增量内容。
///
/// ## 字段说明
///
/// - `command_id`: 命令 ID（可选）
/// - `thread_id`: 线程 ID
/// - `turn_id`: 所属 Turn ID
/// - `delta`: 增量文本内容
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadMessageAssistantDeltaCommand {
    /// 命令 ID（可选）
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 所属 Turn ID
    pub turn_id: String,
    /// 增量文本内容
    pub delta: String,
}

/// # 助手消息完成命令
///
/// 用于标记 AI 助手消息流式传输完成。
///
/// ## 字段说明
///
/// - `command_id`: 命令 ID（可选）
/// - `thread_id`: 线程 ID
/// - `turn_id`: 所属 Turn ID
/// - `message_id`: 完成的消息 ID
/// - `text`: 完整的消息文本
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadMessageAssistantCompleteCommand {
    /// 命令 ID（可选）
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 所属 Turn ID
    pub turn_id: String,
    /// 完成的消息 ID
    pub message_id: MessageId,
    /// 完整的消息文本
    pub text: String,
}

/// # 创建或更新提议计划命令
///
/// 用于创建或更新 AI 提议的执行计划。
///
/// ## 字段说明
///
/// - `command_id`: 命令 ID（可选）
/// - `thread_id`: 线程 ID
/// - `plan`: 提议的计划实体
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadProposedPlanUpsertCommand {
    /// 命令 ID（可选）
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 提议的计划实体
    pub plan: ProposedPlan,
}

/// # Turn 差异比较完成命令
///
/// 用于标记 Turn 的代码差异比较完成。
///
/// ## 字段说明
///
/// - `command_id`: 命令 ID（可选）
/// - `thread_id`: 线程 ID
/// - `turn_id`: Turn ID
/// - `diff`: 差异内容（unified diff 格式）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadTurnDiffCompleteCommand {
    /// 命令 ID（可选）
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// Turn ID
    pub turn_id: String,
    /// 差异内容（unified diff 格式）
    pub diff: String,
}

/// # 回退完成命令
///
/// 用于标记检查点回退操作完成。
///
/// ## 字段说明
///
/// - `command_id`: 命令 ID（可选）
/// - `thread_id`: 线程 ID
/// - `checkpoint_id`: 回退到的检查点 ID
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadRevertCompleteCommand {
    /// 命令 ID（可选）
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 回退到的检查点 ID
    pub checkpoint_id: String,
}

/// # 对话回滚完成命令
///
/// 用于标记对话回滚操作完成。
///
/// ## 字段说明
///
/// - `command_id`: 命令 ID（可选）
/// - `thread_id`: 线程 ID
/// - `message_id`: 回滚到的消息 ID
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadConversationRollbackCompleteCommand {
    /// 命令 ID（可选）
    pub command_id: Option<String>,
    /// 线程 ID
    pub thread_id: ThreadId,
    /// 回滚到的消息 ID
    pub message_id: MessageId,
}
