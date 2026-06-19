//! 领域模型定义

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::provider::ModelSelection;

/// 项目 ID
pub type ProjectId = Uuid;

/// 线程 ID
pub type ThreadId = Uuid;

/// 消息 ID
pub type MessageId = Uuid;

/// 项目实体
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: ProjectId,
    pub kind: ProjectKind,
    pub title: String,
    pub workspace_root: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_model_selection: Option<ModelSelection>,
    pub scripts: Vec<ProjectScript>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<DateTime<Utc>>,
}

/// 项目类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProjectKind {
    Local,
    Remote,
}

/// 项目脚本
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectScript {
    pub name: String,
    pub command: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// 线程实体
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Thread {
    pub id: ThreadId,
    pub project_id: ProjectId,
    pub title: String,
    pub model_selection: ModelSelection,
    pub runtime_mode: RuntimeMode,
    pub interaction_mode: InteractionMode,
    pub env_mode: EnvMode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub worktree_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub associated_worktree: Option<AssociatedWorktree>,
    pub is_pinned: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_thread_id: Option<ThreadId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subagent: Option<SubagentInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fork_source_thread_id: Option<ThreadId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sidechat_source_thread_id: Option<ThreadId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_known_pr: Option<PullRequestInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_turn: Option<LatestTurn>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_user_message_at: Option<DateTime<Utc>>,
    pub has_pending_approvals: bool,
    pub has_pending_user_input: bool,
    pub has_actionable_proposed_plan: bool,
    pub messages: Vec<Message>,
    pub proposed_plans: Vec<ProposedPlan>,
    pub activities: Vec<Activity>,
    pub checkpoints: Vec<Checkpoint>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session: Option<Session>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archived_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub handoff: Option<HandoffInfo>,
}

/// 关联的 Worktree
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssociatedWorktree {
    pub path: String,
    pub branch: String,
    pub r#ref: String,
}

/// 子代理信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubagentInfo {
    pub agent_id: String,
    pub nickname: String,
    pub role: String,
}

/// Pull Request 信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestInfo {
    pub number: u64,
    pub url: String,
    pub title: String,
}

/// 最新 Turn
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatestTurn {
    pub id: String,
    pub status: TurnStatus,
    pub started_at: DateTime<Utc>,
}

/// Turn 状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TurnStatus {
    Queued,
    Running,
    Completed,
    Interrupted,
    Failed,
}

/// 消息实体
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: MessageId,
    pub role: MessageRole,
    pub text: String,
    #[serde(default)]
    pub attachments: Vec<Attachment>,
    #[serde(default)]
    pub skills: Vec<String>,
    #[serde(default)]
    pub mentions: Vec<Mention>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dispatch_mode: Option<DispatchMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    pub streaming: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<MessageSource>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// 消息角色
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    User,
    Assistant,
    System,
}

/// 附件
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub id: String,
    pub kind: AttachmentKind,
    pub name: String,
    pub content: String,
}

/// 附件类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AttachmentKind {
    File,
    Image,
    Url,
    Terminal,
}

/// 提及
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mention {
    pub kind: MentionKind,
    pub value: String,
}

/// 提及类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MentionKind {
    File,
    Directory,
    Thread,
    Skill,
}

/// 分发模式
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DispatchMode {
    Normal,
    Review,
    Plan,
}

/// 消息来源
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageSource {
    pub provider: String,
    pub model: String,
}

/// 提议的计划
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposedPlan {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: ProposedPlanStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// 提议计划状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProposedPlanStatus {
    Pending,
    Accepted,
    Rejected,
}

/// 活动
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    pub id: String,
    pub kind: ActivityKind,
    pub description: String,
    pub created_at: DateTime<Utc>,
}

/// 活动类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ActivityKind {
    ToolCall,
    FileChange,
    TerminalCommand,
    GitOperation,
}

/// 检查点
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Checkpoint {
    pub id: String,
    pub turn_id: String,
    pub git_ref: String,
    pub description: String,
    pub created_at: DateTime<Utc>,
}

/// 会话
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub thread_id: ThreadId,
    pub status: SessionStatus,
    pub provider_name: String,
    pub runtime_mode: RuntimeMode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_turn_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
    pub updated_at: DateTime<Utc>,
}

/// 会话状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    Idle,
    Starting,
    Running,
    Ready,
    Interrupted,
    Stopped,
    Error,
}

/// 运行时模式
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RuntimeMode {
    Agent,
    Ask,
    Plan,
}

/// 交互模式
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum InteractionMode {
    Chat,
    Review,
}

/// 环境模式
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EnvMode {
    Local,
    Worktree,
}

/// 交接信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandoffInfo {
    pub source_thread_id: ThreadId,
    pub target_branch: String,
    pub created_at: DateTime<Utc>,
}

/// 序列号类型
pub type Sequence = u64;
