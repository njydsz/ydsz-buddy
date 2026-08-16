//! # 领域模型定义
//!
//! 本模块定义了 ydsz 工作区中所有核心业务实体与值对象，
//! 包括项目（Project）、线程（Thread）、消息（Message）、会话（Session）等。
//!
//! 所有模型均派生 [`Serialize`](serde::Serialize) 和 [`Deserialize`](serde::Deserialize)，
//! 使用 `camelCase` 命名风格进行 JSON 序列化，以适配前端 TypeScript 约定。

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::provider::ModelSelection;

/// 项目唯一标识符类型（UUID v4）
pub type ProjectId = Uuid;

/// 线程（对话线程）唯一标识符类型（UUID v4）
pub type ThreadId = Uuid;

/// 消息唯一标识符类型（UUID v4）
pub type MessageId = Uuid;

/// # 项目实体
///
/// 表示一个 ydsz 项目，是线程和消息的顶层容器。
/// 每个项目对应一个工作区根目录，可以包含多个对话线程。
///
/// ## 字段说明
///
/// - `id`: 项目全局唯一标识
/// - `kind`: 项目类型（本地 / 远程）
/// - `title`: 项目显示名称
/// - `workspace_root`: 工作区根目录的绝对路径
/// - `default_model_selection`: 默认使用的 AI 模型配置（可选）
/// - `scripts`: 项目级别的自定义脚本列表
/// - `created_at` / `updated_at`: 创建与最后更新时间戳
/// - `deleted_at`: 软删除时间戳，`Some` 表示已删除
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    /// 项目唯一标识
    pub id: ProjectId,
    /// 项目类型（本地或远程）
    pub kind: ProjectKind,
    /// 项目显示名称
    pub title: String,
    /// 工作区根目录的绝对路径
    pub workspace_root: String,
    /// 默认 AI 模型配置，未设置时使用系统默认值
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_model_selection: Option<ModelSelection>,
    /// 项目级别的自定义脚本列表（如构建、测试脚本等）
    pub scripts: Vec<ProjectScript>,
    /// 项目创建时间（UTC）
    pub created_at: DateTime<Utc>,
    /// 项目最后更新时间（UTC）
    pub updated_at: DateTime<Utc>,
    /// 软删除时间戳，`Some` 表示项目已被逻辑删除
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<DateTime<Utc>>,
}

/// # 项目类型
///
/// 区分项目的运行模式：
/// - [`Local`](ProjectKind::Local) - 本地项目，代码在本地文件系统
/// - [`Remote`](ProjectKind::Remote) - 远程项目，代码在远程环境（如云端开发环境）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProjectKind {
    /// 本地项目
    Local,
    /// 远程项目
    Remote,
}

/// # 项目脚本
///
/// 定义项目级别的自定义脚本，可在对话线程中被调用执行。
/// 典型用途包括构建、测试、部署等自动化操作。
///
/// ## 字段说明
///
/// - `name`: 脚本名称，用于在命令中引用
/// - `command`: 实际执行的 shell 命令
/// - `description`: 脚本的可选描述信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectScript {
    /// 脚本名称，用于唯一标识和引用
    pub name: String,
    /// 实际执行的 shell 命令
    pub command: String,
    /// 脚本的可选描述信息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// # 线程实体
///
/// 表示一个对话线程，是消息和活动的主要载体。
/// 每个线程隶属于一个项目，维护自己的对话历史、会话状态和检查点。
///
/// ## 核心概念
///
/// - **Turn**: 一次完整的用户输入 → AI 响应的交互轮次
/// - **Session**: 与 AI Provider 的运行时连接
/// - **Checkpoint**: 可回滚的 Git 检查点
/// - **ProposedPlan**: AI 提议的执行计划，需用户确认
///
/// ## 关键字段
///
/// - `model_selection`: 当前线程使用的 AI 模型配置
/// - `runtime_mode`: 运行时模式（Agent / Ask / Plan）
/// - `interaction_mode`: 交互模式（Chat / Review）
/// - `env_mode`: 环境模式（Local / Worktree）
/// - `messages`: 线程中的所有消息
/// - `session`: 当前活跃的 Provider 会话
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Thread {
    /// 线程唯一标识
    pub id: ThreadId,
    /// 所属项目的 ID
    pub project_id: ProjectId,
    /// 线程显示标题
    pub title: String,
    /// 当前使用的 AI 模型配置
    pub model_selection: ModelSelection,
    /// 运行时模式：Agent（自主执行）、Ask（仅问答）、Plan（规划模式）
    pub runtime_mode: RuntimeMode,
    /// 交互模式：Chat（普通对话）或 Review（代码审查）
    pub interaction_mode: InteractionMode,
    /// 环境模式：Local（本地目录）或 Worktree（Git Worktree 隔离环境）
    pub env_mode: EnvMode,
    /// 当前关联的 Git 分支名称
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    /// Git Worktree 路径，仅在 `env_mode` 为 `Worktree` 时有效
    #[serde(skip_serializing_if = "Option::is_none")]
    pub worktree_path: Option<String>,
    /// 关联的 Worktree 详细信息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub associated_worktree: Option<AssociatedWorktree>,
    /// 关联 Worktree 当前检出的分支名（冗余列便于索引查询）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub associated_worktree_branch: Option<String>,
    /// 关联 Worktree 对应的 Git 完整 ref（如 `refs/heads/feature-xxx`）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub associated_worktree_ref: Option<String>,
    /// 轻量终端标题摘要（用于 Sidebar 列表快速展示）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shell_summary: Option<String>,
    /// 是否已完成'创建分支并打开线程'流程
    /// 用于隐藏首次创建引导横幅
    pub create_branch_flow_completed: bool,
    /// 是否置顶该线程
    pub is_pinned: bool,
    /// 父线程 ID，用于支持线程层级关系（如子代理线程）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_thread_id: Option<ThreadId>,
    /// 子代理信息，当线程由子代理驱动时设置
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subagent: Option<SubagentInfo>,
    /// 分叉来源线程 ID，表示本线程从哪个线程分叉而来
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fork_source_thread_id: Option<ThreadId>,
    /// Sidechat 来源线程 ID，用于关联旁路对话
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sidechat_source_thread_id: Option<ThreadId>,
    /// 最后已知的 Pull Request 信息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_known_pr: Option<PullRequestInfo>,
    /// 最新的交互轮次信息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_turn: Option<LatestTurn>,
    /// 最后一条用户消息的时间戳，用于排序和展示
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_user_message_at: Option<DateTime<Utc>>,
    /// 是否有等待用户审批的操作
    pub has_pending_approvals: bool,
    /// 是否有等待用户输入的操作
    pub has_pending_user_input: bool,
    /// 是否有待处理的提议计划
    pub has_actionable_proposed_plan: bool,
    /// 线程中的所有消息列表
    pub messages: Vec<Message>,
    /// 线程中的所有提议计划
    pub proposed_plans: Vec<ProposedPlan>,
    /// 线程中的活动记录（工具调用、文件变更等）
    pub activities: Vec<Activity>,
    /// 线程中的 Git 检查点列表，用于回滚操作
    pub checkpoints: Vec<Checkpoint>,
    /// 当前活跃的 Provider 会话
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session: Option<Session>,
    /// 线程创建时间（UTC）
    pub created_at: DateTime<Utc>,
    /// 线程最后更新时间（UTC）
    pub updated_at: DateTime<Utc>,
    /// 归档时间戳，`Some` 表示线程已被归档
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archived_at: Option<DateTime<Utc>>,
    /// 软删除时间戳，`Some` 表示线程已被逻辑删除
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<DateTime<Utc>>,
    /// 交接信息，用于线程间的上下文传递
    #[serde(skip_serializing_if = "Option::is_none")]
    pub handoff: Option<HandoffInfo>,
}

/// # 关联的 Worktree
///
/// 描述线程关联的 Git Worktree 信息。
/// Worktree 允许在同一个 Git 仓库中创建多个独立的工作目录，
/// 每个线程可以在自己的 Worktree 中独立工作，避免文件冲突。
///
/// ## 字段说明
///
/// - `path`: Worktree 在文件系统中的绝对路径
/// - `branch`: Worktree 当前检出的分支名称
/// - `ref`: Worktree 对应的 Git 引用（如 `refs/heads/feature-xxx`）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssociatedWorktree {
    /// Worktree 在文件系统中的绝对路径
    pub path: String,
    /// Worktree 当前检出的分支名称
    pub branch: String,
    /// Worktree 对应的 Git 引用（完整 ref 路径）
    pub r#ref: String,
}

/// # 子代理信息
///
/// 当线程由子代理（Subagent）驱动时，记录子代理的身份和角色信息。
/// 子代理是一种专门化的 AI 代理，负责处理特定类型的任务。
///
/// ## 字段说明
///
/// - `agent_id`: 子代理的唯一标识符
/// - `nickname`: 子代理的显示昵称
/// - `role`: 子代理的角色描述（如 '代码审查员'、'测试工程师' 等）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubagentInfo {
    /// 子代理的唯一标识符
    pub agent_id: String,
    /// 子代理的显示昵称
    pub nickname: String,
    /// 子代理的角色描述
    pub role: String,
}

/// # Pull Request 信息
///
/// 记录线程关联的 Pull Request 基本信息，
/// 用于在线程界面中展示关联的 PR 状态和链接。
///
/// ## 字段说明
///
/// - `number`: PR 编号（在仓库内唯一）
/// - `url`: PR 的完整 URL 地址
/// - `title`: PR 标题
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestInfo {
    /// PR 编号（在仓库内唯一）
    pub number: u64,
    /// PR 的完整 URL 地址
    pub url: String,
    /// PR 标题
    pub title: String,
}

/// # 最新交互轮次
///
/// 记录线程中最近一次 Turn（交互轮次）的摘要信息，
/// 用于快速展示当前轮次的状态而无需遍历完整消息列表。
///
/// ## 字段说明
///
/// - `id`: Turn 的唯一标识符
/// - `status`: Turn 的当前状态
/// - `started_at`: Turn 开始时间
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatestTurn {
    /// Turn 的唯一标识符
    pub id: String,
    /// Turn 的当前状态
    pub status: TurnStatus,
    /// Turn 开始时间（UTC）
    pub requested_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assistant_message_id: Option<String>,
}

/// # Turn 状态枚举
///
/// 表示一次交互轮次（Turn）的生命周期状态：
///
/// ```text
/// Queued → Running → Completed
///                  → Interrupted
///                  → Failed
/// ```
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TurnStatus {
    /// 已排队，等待执行
    Queued,
    /// 正在执行中
    Running,
    /// 已成功完成
    Completed,
    /// 被用户中断
    Interrupted,
    /// 执行失败
    Failed,
}

/// # 消息实体
///
/// 表示线程中的一条消息，可以是用户消息、AI 助手回复或系统消息。
/// 消息是对话的基本单元，支持附件、提及、技能等多种富文本特性。
///
/// ## 字段说明
///
/// - `id`: 消息唯一标识
/// - `role`: 消息角色（用户 / 助手 / 系统）
/// - `text`: 消息文本内容（Markdown 格式）
/// - `attachments`: 消息附件列表（文件、图片、URL 等）
/// - `skills`: 消息中使用的技能名称列表
/// - `mentions`: 消息中的提及引用列表
/// - `dispatch_mode`: 消息的分发模式（普通 / 审查 / 计划）
/// - `turn_id`: 所属 Turn 的 ID
/// - `streaming`: 是否正在流式传输中
/// - `source`: 消息来源（Provider 和模型信息）
/// - `created_at` / `updated_at`: 创建与最后更新时间戳
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    /// 消息唯一标识
    pub id: MessageId,
    /// 消息角色（用户 / 助手 / 系统）
    pub role: MessageRole,
    /// 消息文本内容（Markdown 格式）
    pub text: String,
    /// 消息附件列表（文件、图片、URL、终端输出等）
    #[serde(default)]
    pub attachments: Vec<Attachment>,
    /// 消息中使用的技能名称列表
    #[serde(default)]
    pub skills: Vec<String>,
    /// 消息中的提及引用列表（文件、目录、线程、技能等）
    #[serde(default)]
    pub mentions: Vec<Mention>,
    /// 消息的分发模式，决定消息如何被处理
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dispatch_mode: Option<DispatchMode>,
    /// 所属 Turn 的 ID，将消息关联到特定的交互轮次
    #[serde(skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    /// 是否正在流式传输中（用于 AI 助手的实时输出）
    pub streaming: bool,
    /// 消息来源信息（Provider 名称和模型名称）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<MessageSource>,
    /// 消息创建时间（UTC）
    pub created_at: DateTime<Utc>,
    /// 消息最后更新时间（UTC）
    pub updated_at: DateTime<Utc>,
}

/// # 消息角色枚举
///
/// 标识消息的发送者角色：
/// - [`User`](MessageRole::User) - 用户发送的消息
/// - [`Assistant`](MessageRole::Assistant) - AI 助手的回复
/// - [`System`](MessageRole::System) - 系统消息（如提示、通知等）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    /// 用户发送的消息
    User,
    /// AI 助手的回复
    Assistant,
    /// 系统消息（如提示、通知等）
    System,
}

/// # 附件
///
/// 表示消息中携带的附件内容，支持文件、图片、URL 和终端输出等多种类型。
///
/// ## 字段说明
///
/// - `id`: 附件唯一标识
/// - `kind`: 附件类型
/// - `name`: 附件显示名称
/// - `content`: 附件内容（文件内容为文本形式，图片为 Base64 编码等）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    /// 附件唯一标识
    pub id: String,
    /// 附件类型（文件 / 图片 / URL / 终端输出）
    pub kind: AttachmentKind,
    /// 附件显示名称
    pub name: String,
    /// 附件内容（文本形式表示）
    pub content: String,
}

/// # 附件类型枚举
///
/// 标识附件的内容类型：
/// - [`File`](AttachmentKind::File) - 普通文件
/// - [`Image`](AttachmentKind::Image) - 图片文件
/// - [`Url`](AttachmentKind::Url) - URL 链接
/// - [`Terminal`](AttachmentKind::Terminal) - 终端输出内容
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AttachmentKind {
    /// 普通文件附件
    File,
    /// 图片文件附件
    Image,
    /// URL 链接附件
    Url,
    /// 终端输出内容附件
    Terminal,
}

/// # 提及引用
///
/// 表示消息中对其他实体（文件、目录、线程、技能）的引用。
/// 提及引用在 UI 中通常以特殊样式展示，并支持点击跳转。
///
/// ## 字段说明
///
/// - `kind`: 提及的类型（文件 / 目录 / 线程 / 技能）
/// - `value`: 提及的目标值（如文件路径、线程 ID 等）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mention {
    /// 提及的类型
    pub kind: MentionKind,
    /// 提及的目标值（如文件路径、线程 ID、技能名称等）
    pub value: String,
}

/// # 提及类型枚举
///
/// 标识提及引用的目标实体类型：
/// - [`File`](MentionKind::File) - 文件引用
/// - [`Directory`](MentionKind::Directory) - 目录引用
/// - [`Thread`](MentionKind::Thread) - 线程引用
/// - [`Skill`](MentionKind::Skill) - 技能引用
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MentionKind {
    /// 文件引用
    File,
    /// 目录引用
    Directory,
    /// 线程引用
    Thread,
    /// 技能引用
    Skill,
}

/// # 分发模式枚举
///
/// 决定消息如何被处理和分发到 AI Provider：
/// - [`Normal`](DispatchMode::Normal) - 普通对话模式
/// - [`Review`](DispatchMode::Review) - 代码审查模式
/// - [`Plan`](DispatchMode::Plan) - 规划模式（AI 生成执行计划）
/// - [`Steer`](DispatchMode::Steer) - 引导模式（中断当前 Turn 并优先处理）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DispatchMode {
    /// 普通对话模式，直接发送给 AI 处理
    Normal,
    /// 代码审查模式，触发代码审查流程
    Review,
    /// 规划模式，AI 生成执行计划而非直接执行
    Plan,
    /// 引导模式，中断当前 Turn 并优先处理新消息
    Steer,
}

/// # 消息来源
///
/// 记录消息的来源信息，标识是由哪个 AI Provider 和模型生成的。
/// 仅对 AI 助手消息有效，用户消息此字段为 `None`。
///
/// ## 字段说明
///
/// - `provider`: Provider 名称（如 'codex'、'claudeAgent' 等）
/// - `model`: 使用的具体模型名称
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageSource {
    /// Provider 名称（如 'codex'、'claudeAgent' 等）
    pub provider: String,
    /// 使用的具体模型名称
    pub model: String,
}

/// # 提议的计划
///
/// 表示 AI 在规划模式下生成的执行计划。
/// 计划需要用户确认（接受或拒绝）后才能执行。
///
/// ## 字段说明
///
/// - `id`: 计划唯一标识
/// - `title`: 计划标题
/// - `description`: 计划详细描述（Markdown 格式）
/// - `status`: 计划当前状态（待确认 / 已接受 / 已拒绝）
/// - `created_at` / `updated_at`: 创建与最后更新时间戳
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposedPlan {
    /// 计划唯一标识
    pub id: String,
    /// 计划标题
    pub title: String,
    /// 计划详细描述（Markdown 格式）
    pub description: String,
    /// 计划当前状态
    pub status: ProposedPlanStatus,
    /// 计划创建时间（UTC）
    pub created_at: DateTime<Utc>,
    /// 计划最后更新时间（UTC）
    pub updated_at: DateTime<Utc>,
}

/// # 提议计划状态枚举
///
/// 表示计划的审批状态：
/// - [`Pending`](ProposedPlanStatus::Pending) - 等待用户确认
/// - [`Accepted`](ProposedPlanStatus::Accepted) - 用户已接受
/// - [`Rejected`](ProposedPlanStatus::Rejected) - 用户已拒绝
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProposedPlanStatus {
    /// 等待用户确认
    Pending,
    /// 用户已接受，可以执行
    Accepted,
    /// 用户已拒绝
    Rejected,
}

/// # 活动记录
///
/// 记录线程中发生的操作活动，用于审计和展示。
/// 活动类型包括工具调用、文件变更、终端命令、Git 操作等。
///
/// ## 字段说明
///
/// - `id`: 活动唯一标识
/// - `kind`: 活动类型
/// - `description`: 活动描述（人类可读的文本）
/// - `payload`: 活动负载（类型化的判别联合）
/// - `turn_id`: 关联的 Turn ID
/// - `created_at`: 活动发生时间
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    /// 活动唯一标识
    pub id: String,
    /// 活动类型（工具调用 / 文件变更 / 终端命令 / Git 操作）
    pub kind: ActivityKind,
    /// 活动描述（人类可读的文本）
    pub description: String,
    /// 活动负载（类型化的判别联合）
    pub payload: ActivityPayload,
    /// 关联的 Turn ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    /// 活动发生时间（UTC）
    pub created_at: DateTime<Utc>,
}

/// # 活动类型枚举
///
/// 标识活动的具体类型：
/// - [`ToolCall`](ActivityKind::ToolCall) - AI 工具调用
/// - [`FileChange`](ActivityKind::FileChange) - 文件变更
/// - [`TerminalCommand`](ActivityKind::TerminalCommand) - 终端命令执行
/// - [`GitOperation`](ActivityKind::GitOperation) - Git 操作（如 commit、push 等）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ActivityKind {
    /// AI 工具调用
    ToolCall,
    /// 文件变更
    FileChange,
    /// 终端命令执行
    TerminalCommand,
/// Git 操作
GitOperation,
/// 上下文压缩
ContextCompacted,
}

/// # 活动负载枚举
///
/// 类型化的活动负载，每种变体包含对应活动类型的具体数据。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ActivityPayload {
    /// 工具调用负载
    ToolCall {
        /// 工具名称
        tool_name: String,
        /// 工具输入参数（JSON）
        input: Option<serde_json::Value>,
        /// 工具输出结果（JSON）
        output: Option<serde_json::Value>,
        /// 是否成功
        success: bool,
    },
    /// 文件变更负载
    FileChange {
        /// 变更的文件路径列表
        files: Vec<FileChangeEntry>,
    },
    /// 终端命令负载
    TerminalCommand {
        /// 执行的命令
        command: String,
        /// 命令输出
        output: Option<String>,
        /// 退出码
        exit_code: Option<i32>,
    },
    /// Git 操作负载
    GitOperation {
        /// Git 操作类型（commit/push/pull/checkout 等）
        operation: String,
        /// 相关的分支或引用
        ref_name: Option<String>,
        /// 操作结果摘要
        summary: Option<String>,
    },
    /// 消息活动负载
    Message {
        /// 消息 ID
        message_id: String,
        /// 消息角色
        role: String,
    },
    /// 检查点活动负载
    Checkpoint {
        /// 检查点 ID
        checkpoint_id: String,
        /// 检查点操作（create/revert/delete）
        operation: String,
    },
    /// 通用负载（用于未分类的活动）
    Generic {
        /// 额外数据（JSON）
        data: Option<serde_json::Value>,
    },
    /// 上下文压缩负载
    ContextCompacted {
        /// 压缩摘要文本
        summary: String,
        /// 压缩的消息数量
        compressed_count: usize,
        /// 压缩前估算的 token 数
        estimated_tokens_before: u64,
        /// 压缩后估算的 token 数
        estimated_tokens_after: u64,
    },
}

/// # 文件变更条目
///
/// 记录单个文件的变更信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChangeEntry {
    /// 文件路径
    pub path: String,
    /// 变更类型（added/modified/deleted）
    pub change_type: String,
    /// 新增行数
    pub additions: Option<usize>,
    /// 删除行数
    pub deletions: Option<usize>,
}

/// # 检查点
///
/// 表示一个可回滚的 Git 检查点。
/// 在每个 Turn 的关键节点自动创建，允许用户将代码状态回滚到特定时间点。
///
/// ## 字段说明
///
/// - `id`: 检查点唯一标识
/// - `turn_id`: 所属 Turn 的 ID
/// - `git_ref`: 对应的 Git 引用（commit hash 或 tag）
/// - `description`: 检查点描述
/// - `created_at`: 检查点创建时间
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Checkpoint {
    /// 检查点唯一标识
    pub id: String,
    /// 所属线程的 ID
    pub thread_id: ThreadId,
    /// 所属 Turn 的 ID
    pub turn_id: String,
    /// 对应的 Git 引用（commit hash 或 tag）
    pub git_ref: String,
    /// 检查点描述
    pub description: String,
    /// 检查点状态
    pub status: CheckpointStatus,
    /// 检查点对应的 Turn 数量
    pub checkpoint_turn_count: usize,
    /// 文件变更列表
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub files: Vec<CheckpointFile>,
    /// 关联的助手消息 ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assistant_message_id: Option<String>,
    /// 检查点创建时间（UTC）
    pub created_at: DateTime<Utc>,
    /// 检查点完成时间（UTC）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<DateTime<Utc>>,
}

/// # 检查点状态枚举
///
/// 表示检查点在 Git 引用层面的可用性状态：
///
/// - [`Ready`](CheckpointStatus::Ready) - Git ref 存在，检查点可用
/// - [`Missing`](CheckpointStatus::Missing) - Git ref 已失效（分支删除等）
/// - [`Error`](CheckpointStatus::Error) - 读取检查点时发生错误
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CheckpointStatus {
    /// 已就绪
    Ready,
    /// 缺失
    Missing,
    /// 错误
    Error,
}

/// # 检查点文件变更
///
/// 记录检查点创建时的文件变更详情，用于展示和回滚对比。
///
/// ## 字段说明
///
/// - `path`: 文件的相对路径
/// - `status`: 变更状态（added/modified/deleted）
/// - `additions`: 新增行数
/// - `deletions`: 删除行数
/// - `author`: 文件级 author (`"ai"` / `"user"` / `"mixed"`),缺省按 `"ai"` 兜底
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointFile {
    /// 文件路径
    pub path: String,
    /// 变更状态
    pub status: String,
    /// 新增行数
    pub additions: usize,
    /// 删除行数
    pub deletions: usize,
    /// 文件级 author(`"ai"` / `"user"` / `"mixed"`);缺省按 `"ai"` 兜底
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub author: Option<String>,
}

/// `CheckpointFile::author` 允许的字符串字面量
pub const CHECKPOINT_FILE_AUTHOR_AI: &str = "ai";
pub const CHECKPOINT_FILE_AUTHOR_USER: &str = "user";
pub const CHECKPOINT_FILE_AUTHOR_MIXED: &str = "mixed";

/// 把任意字符串规整为合法的 author;空 / 未知值按 `"ai"` 兜底
pub fn normalize_checkpoint_file_author(value: Option<&str>) -> &'static str {
    match value {
        Some(CHECKPOINT_FILE_AUTHOR_AI) => CHECKPOINT_FILE_AUTHOR_AI,
        Some(CHECKPOINT_FILE_AUTHOR_USER) => CHECKPOINT_FILE_AUTHOR_USER,
        Some(CHECKPOINT_FILE_AUTHOR_MIXED) => CHECKPOINT_FILE_AUTHOR_MIXED,
        _ => CHECKPOINT_FILE_AUTHOR_AI,
    }
}

/// # 会话
///
/// 表示与 AI Provider 的运行时连接会话。
/// 会话管理 Turn 的生命周期，跟踪当前活跃 Turn 和错误状态。
///
/// ## 字段说明
///
/// - `thread_id`: 会话所属的线程 ID
/// - `status`: 会话当前状态
/// - `provider_name`: Provider 名称
/// - `runtime_mode`: 会话的运行时模式
/// - `active_turn_id`: 当前活跃的 Turn ID
/// - `last_error`: 最后一次错误信息
/// - `updated_at`: 最后更新时间
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    /// 会话所属的线程 ID
    pub thread_id: ThreadId,
    /// 会话当前状态
    pub status: SessionStatus,
    /// Provider 名称
    pub provider_name: String,
    /// 会话的运行时模式
    pub runtime_mode: RuntimeMode,
    /// 当前活跃的 Turn ID，空闲时为 `None`
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_turn_id: Option<String>,
    /// 最后一次错误信息，仅在状态为 `Error` 时有值
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
    /// 会话最后更新时间（UTC）
    pub updated_at: DateTime<Utc>,
}

/// # 会话状态枚举
///
/// 表示 Provider 会话的生命周期状态：
///
/// ```text
/// Idle → Starting → Running → Ready → Stopped
///                   ↓                  ↓
///               Interrupted         Error
/// ```
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    /// 空闲状态，会话未启动或已完成
    Idle,
    /// 正在启动中
    Starting,
    /// 正在运行中（处理 Turn）
    Running,
    /// 就绪状态，可以接受新的 Turn
    Ready,
    /// 被中断
    Interrupted,
    /// 已停止
    Stopped,
    /// 发生错误
    Error,
}

/// # 运行时模式枚举（ydsz-buddy 0.2.0）
///
/// 控制线程所属的产品主模式，调度不同的工具集与 Provider 链：
///
/// - [`Work`](RuntimeMode::Work) - 工作模式，调度 Office / 批量 / 调度 / 浏览器自动化
/// - [`Code`](RuntimeMode::Code) - 代码模式，调度 Provider Adapter / 终端 / Git（默认）
///
/// ## 迁移说明
///
/// 0.1.x 的 `Agent/Ask/Plan` 三态在 0.2.0 重构为 Work/Code 双维度；旧的 `Agent/Ask/Plan`
/// 在事件流中以小写字符串 `agent/ask/plan` 形式存在，反序列化时通过
/// [`RuntimeMode::from_legacy`] 映射到新的 Work/Code 维度。
#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum RuntimeMode {
    /// 工作模式：Office / 批量 / 调度 / 浏览器自动化
    Work,
    /// 代码模式：Provider / 终端 / Git（默认）
    #[default]
    Code,
}

/// 自定义反序列化：兼容旧版 `agent/ask/plan` 字符串
impl<'de> Deserialize<'de> for RuntimeMode {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let raw = String::deserialize(deserializer)?;
        Ok(Self::from_legacy(&raw))
    }
}


impl RuntimeMode {
    /// 从旧版 `agent/ask/plan` 字符串映射到新版 `work/code` 维度。
    /// 未知值默认映射为 `Code`。
    ///
    /// # Arguments
    ///
    /// * `value` - 旧版运行时模式字符串
    ///
    /// # Returns
    ///
    /// 返回对应的 `RuntimeMode` 枚举值
    pub fn from_legacy(value: &str) -> Self {
        match value.to_ascii_lowercase().as_str() {
            "work" => Self::Work,
            "code" => Self::Code,
            "agent" | "ask" | "plan" => Self::Code,
            _ => Self::Code,
        }
    }

    /// 判断是否为工作模式
    ///
    /// # Returns
    ///
    /// 如果是 `Work` 模式返回 `true`，否则返回 `false`
    pub fn is_work(&self) -> bool {
        matches!(self, Self::Work)
    }

    /// 判断是否为代码模式
    ///
    /// # Returns
    ///
    /// 如果是 `Code` 模式返回 `true`，否则返回 `false`
    pub fn is_code(&self) -> bool {
        matches!(self, Self::Code)
    }
}

/// # 交互模式枚举（ydsz-buddy 0.3.0）
///
/// 控制 AI 在当前线程中的行为粒度。Work/Code 两种运行时模式共享同一套交互模式，
/// 但具体可用值由运行时模式决定：
///
/// - [`Chat`](InteractionMode::Chat) - 普通对话，AI 只回答问题不执行副作用
/// - [`Plan`](InteractionMode::Plan) - 规划模式，AI 先生成可审批的执行计划
/// - [`Agent`](InteractionMode::Agent) - 自主模式，AI 可调用工具 / 修改文件（默认）
/// - [`Review`](InteractionMode::Review) - 代码审查模式，AI 对 diff 进行评审
/// - [`Task`](InteractionMode::Task) - 一次性任务模式，类似 Work 域的 Skill 执行
#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum InteractionMode {
    /// 普通对话模式
    Chat,
    /// 规划模式
    Plan,
    /// 自主执行模式（默认）
    #[default]
    Agent,
    /// 代码审查模式
    Review,
    /// 任务模式（Work 域）
    Task,
}

/// 自定义反序列化：兼容旧版 `chat/review` 字符串
impl<'de> Deserialize<'de> for InteractionMode {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let raw = String::deserialize(deserializer)?;
        Ok(Self::from_legacy(&raw))
    }
}


impl InteractionMode {
    /// 从旧版 `chat/review` 字符串映射到新版 5 态。
    /// 未知值默认映射为 `Agent`。
    ///
    /// # Arguments
    ///
    /// * `value` - 旧版交互模式字符串
    ///
    /// # Returns
    ///
    /// 返回对应的 `InteractionMode` 枚举值
    pub fn from_legacy(value: &str) -> Self {
        match value.to_ascii_lowercase().as_str() {
            "chat" => Self::Chat,
            "plan" => Self::Plan,
            "agent" => Self::Agent,
            "review" => Self::Review,
            "task" => Self::Task,
            _ => Self::Agent,
        }
    }

    /// 是否需要进入'会签'流程（Plan/Review 需要用户确认）
    ///
    /// # Returns
    ///
    /// 如果是 `Plan` 或 `Review` 模式返回 `true`，否则返回 `false`
    pub fn requires_approval(&self) -> bool {
        matches!(self, Self::Plan | Self::Review)
    }
}

/// # 环境模式枚举
///
/// 控制线程的工作目录环境：
/// - [`Local`](EnvMode::Local) - 使用项目本地目录
/// - [`Worktree`](EnvMode::Worktree) - 使用独立的 Git Worktree 目录
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EnvMode {
    /// 使用项目本地目录
    Local,
    /// 使用独立的 Git Worktree 目录
    Worktree,
}

/// # 交接信息
///
/// 记录线程间上下文交接的信息。
/// 当任务从一个线程转移到另一个线程时，携带必要的上下文数据。
///
/// ## 字段说明
///
/// - `source_thread_id`: 来源线程 ID
/// - `target_branch`: 目标分支名称
/// - `created_at`: 交接创建时间
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandoffInfo {
    /// 来源线程 ID
    pub source_thread_id: ThreadId,
    /// 目标分支名称
    pub target_branch: String,
    /// 交接创建时间（UTC）
    pub created_at: DateTime<Utc>,
}

/// 序列号类型，用于事件排序（单调递增的 u64 值）
pub type Sequence = u64;

/// 检查点唯一标识类型
///
/// 每个检查点对应一个 Git commit，用于将代码状态回滚到特定时间点。
/// 标识符通常由系统自动生成（如 UUID），在回退操作中作为目标引用。
pub type CheckpointId = String;

/// Turn 唯一标识类型
///
/// 每个交互轮次（Turn）拥有唯一标识，用于关联消息、活动和检查点。
/// 标识符通常由系统在创建 Turn 时自动生成。
pub type TurnId = String;

/// 环境唯一标识符类型（UUID v4）
pub type EnvironmentId = Uuid;

/// # 执行环境描述符
///
/// 描述服务器实例的运行环境信息，包含平台、版本和工作区根目录。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionEnvironmentDescriptor {
    /// 操作系统和架构信息（如 'windows-x86_64'）
    pub platform: String,
    /// 服务器版本号
    pub server_version: String,
    /// 工作区根目录路径
    pub workspace_root: String,
}

/// # 配对链接
///
/// 表示一个配对链接的完整信息，用于客户端与服务端之间的安全配对流程。
/// 配对链接在颁发后存储到数据库，支持查询、列出和撤销操作。
///
/// ## 字段说明
///
/// - `id`: 配对链接的唯一标识符
/// - `credential`: 配对凭证（配对码），用于客户端与服务端之间的安全绑定
/// - `method`: 引导方法（desktop-bootstrap 或 one-time-token）
/// - `role`: 配对链接关联的角色（owner/client）
/// - `subject`: 主体标识，描述配对链接的用途或来源
/// - `label`: 可选标签，用于人类可读的描述
/// - `created_at`: 配对链接的创建时间
/// - `expires_at`: 配对链接的过期时间
/// - `consumed_at`: 配对链接的消费时间，`Some` 表示已被使用
/// - `revoked_at`: 配对链接的撤销时间，`Some` 表示已撤销
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingLink {
    /// 配对链接的唯一标识符
    pub id: String,
    /// 配对凭证（配对码），用于客户端与服务端之间的安全绑定
    pub credential: String,
    /// 引导方法：desktop-bootstrap 或 one-time-token
    pub method: String,
    /// 配对链接关联的角色：owner 或 client
    pub role: String,
    /// 主体标识，描述配对链接的用途或来源
    pub subject: String,
    /// 可选标签，用于人类可读的描述
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// 配对链接的创建时间
    pub created_at: DateTime<Utc>,
    /// 配对链接的过期时间
    pub expires_at: DateTime<Utc>,
    /// 配对链接的消费时间，`Some` 表示已被使用
    #[serde(skip_serializing_if = "Option::is_none")]
    pub consumed_at: Option<DateTime<Utc>>,
    /// 配对链接的撤销时间，`Some` 表示已撤销
    #[serde(skip_serializing_if = "Option::is_none")]
    pub revoked_at: Option<DateTime<Utc>>,
}

// ==================== Quest Mode 模型 ====================

/// # Quest 状态枚举
///
/// 标识 Quest 的生命周期状态：
///
/// ```text
/// Created → Planning → Running ⇄ Paused → Completed
///                ↓          ↓
///            Aborted     Aborted
/// ```
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum QuestStatus {
    /// 已创建，尚未开始规划
    Created,
    /// 正在规划步骤（AI 分解任务）
    Planning,
    /// 正在运行中
    Running,
    /// 已暂停
    Paused,
    /// 已完成
    Completed,
    /// 已中止
    Aborted,
    /// 已失败
    Failed,
}

impl QuestStatus {
    /// 是否可暂停
    pub fn can_pause(&self) -> bool {
        matches!(self, Self::Running)
    }

    /// 是否可恢复
    pub fn can_resume(&self) -> bool {
        matches!(self, Self::Paused)
    }

    /// 是否可中止
    pub fn can_abort(&self) -> bool {
        matches!(self, Self::Created | Self::Planning | Self::Running | Self::Paused)
    }

    /// 是否已终结
    pub fn is_terminal(&self) -> bool {
        matches!(self, Self::Completed | Self::Aborted | Self::Failed)
    }
}

/// # Quest 步骤状态
///
/// 标识单个步骤的执行状态。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum QuestStepStatus {
    /// 待执行
    Pending,
    /// 正在执行
    Running,
    /// 已完成
    Completed,
    /// 已跳过
    Skipped,
    /// 已失败
    Failed,
}

impl QuestStepStatus {
    /// 是否已终结
    pub fn is_terminal(&self) -> bool {
        matches!(self, Self::Completed | Self::Skipped | Self::Failed)
    }
}

/// # Quest 步骤
///
/// 表示 Quest 中的一个执行步骤。
/// 每个步骤有独立的标题、描述、状态和执行记录。
///
/// ## 字段说明
///
/// - `id`: 步骤唯一标识
/// - `index`: 步骤序号（0-based）
/// - `title`: 步骤标题
/// - `description`: 步骤详细描述
/// - `status`: 步骤当前状态
/// - `turn_id`: 关联的 Turn ID（执行时填充）
/// - `started_at`: 开始执行时间
/// - `completed_at`: 完成时间
/// - `error_message`: 失败时的错误信息
/// - `artifacts`: 步骤产出物（文件路径列表）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestStep {
    /// 步骤唯一标识
    pub id: String,
    /// 步骤序号（0-based）
    pub index: u32,
    /// 步骤标题
    pub title: String,
    /// 步骤详细描述
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// 步骤当前状态
    pub status: QuestStepStatus,
    /// 关联的 Turn ID（执行时填充）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    /// 开始执行时间
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<DateTime<Utc>>,
    /// 完成时间
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<DateTime<Utc>>,
    /// 失败时的错误信息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
    /// 步骤产出物（文件路径列表）
    #[serde(default)]
    pub artifacts: Vec<String>,
}

impl QuestStep {
    /// 创建新的待执行步骤
    pub fn new(id: impl Into<String>, index: u32, title: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            index,
            title: title.into(),
            description: None,
            status: QuestStepStatus::Pending,
            turn_id: None,
            started_at: None,
            completed_at: None,
            error_message: None,
            artifacts: Vec::new(),
        }
    }

    /// 进度百分比（0-100），基于状态
    pub fn progress(&self) -> u8 {
        match self.status {
            QuestStepStatus::Pending => 0,
            QuestStepStatus::Running => 50,
            QuestStepStatus::Completed => 100,
            QuestStepStatus::Skipped => 100,
            QuestStepStatus::Failed => 0,
        }
    }
}

/// # Quest 实体
///
/// 表示一个多步骤的自主执行任务（Quest）。
/// Quest 是 Goal 的产品化升级，支持：
/// - 显式步骤分解与状态跟踪
/// - 暂停/恢复
/// - 步骤跳过/重试
/// - 产出物追踪
///
/// ## 字段说明
///
/// - `id`: Quest 唯一标识
/// - `thread_id`: 关联的线程 ID
/// - `title`: Quest 标题
/// - `description`: Quest 描述（用户原始需求）
/// - `status`: Quest 当前状态
/// - `steps`: 步骤列表
/// - `current_step_index`: 当前执行到的步骤索引
/// - `created_at` / `updated_at`: 创建与更新时间
/// - `started_at`: 开始执行时间
/// - `completed_at`: 完成时间
/// - `abort_reason`: 中止原因
/// - `metadata`: 扩展元数据
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Quest {
    /// Quest 唯一标识
    pub id: String,
    /// 关联的线程 ID
    pub thread_id: ThreadId,
    /// Quest 标题
    pub title: String,
    /// Quest 描述（用户原始需求）
    pub description: String,
    /// Quest 当前状态
    pub status: QuestStatus,
    /// 步骤列表
    pub steps: Vec<QuestStep>,
    /// 当前执行到的步骤索引
    #[serde(default)]
    pub current_step_index: u32,
    /// 创建时间
    pub created_at: DateTime<Utc>,
    /// 最后更新时间
    pub updated_at: DateTime<Utc>,
    /// 开始执行时间
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<DateTime<Utc>>,
    /// 完成时间
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<DateTime<Utc>>,
    /// 中止原因
    #[serde(skip_serializing_if = "Option::is_none")]
    pub abort_reason: Option<String>,
    /// 扩展元数据
    #[serde(default)]
    pub metadata: serde_json::Value,
}

impl Quest {
    /// 创建新的 Quest
    pub fn new(id: impl Into<String>, thread_id: ThreadId, title: impl Into<String>, description: impl Into<String>) -> Self {
        let now = Utc::now();
        Self {
            id: id.into(),
            thread_id,
            title: title.into(),
            description: description.into(),
            status: QuestStatus::Created,
            steps: Vec::new(),
            current_step_index: 0,
            created_at: now,
            updated_at: now,
            started_at: None,
            completed_at: None,
            abort_reason: None,
            metadata: serde_json::json!({}),
        }
    }

    /// 整体进度百分比（0-100）
    pub fn progress(&self) -> u8 {
        if self.steps.is_empty() {
            return 0;
        }
        let total: u32 = self.steps.iter().map(|s| s.progress() as u32).sum();
        (total / self.steps.len() as u32) as u8
    }

    /// 当前正在执行的步骤
    pub fn current_step(&self) -> Option<&QuestStep> {
        self.steps.get(self.current_step_index as usize)
    }

    /// 已完成的步骤数
    pub fn completed_steps_count(&self) -> usize {
        self.steps
            .iter()
            .filter(|s| matches!(s.status, QuestStepStatus::Completed | QuestStepStatus::Skipped))
            .count()
    }

    /// 是否所有步骤都已完成
    pub fn all_steps_done(&self) -> bool {
        !self.steps.is_empty()
            && self.steps.iter().all(|s| s.status.is_terminal())
    }
}
