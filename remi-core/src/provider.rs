//! # Provider 相关类型定义
//!
//! 本模块定义了与 AI Provider（如 Codex、Claude Agent、Cursor 等）相关的所有类型，
//! 包括 Provider 类型、模型选择、运行时事件、会话状态等。
//!
//! ## 核心概念
//!
//! - **Provider**: AI 服务提供商，如 OpenAI Codex、Anthropic Claude 等
//! - **ModelSelection**: 模型选择配置，指定使用哪个 Provider 和模型
//! - **ProviderSession**: 与 Provider 的运行时会话连接
//! - **ProviderRuntimeEvent**: Provider 运行时产生的事件（会话启动、Turn 开始、流式输出等）

use serde::{Deserialize, Serialize};

/// # Provider 类型枚举
///
/// 定义系统支持的所有 AI Provider 类型：
/// - [`Codex`](ProviderKind::Codex) - OpenAI Codex
/// - [`ClaudeAgent`](ProviderKind::ClaudeAgent) - Anthropic Claude Agent
/// - [`Cursor`](ProviderKind::Cursor) - Cursor AI
/// - [`Gemini`](ProviderKind::Gemini) - Google Gemini
/// - [`Grok`](ProviderKind::Grok) - xAI Grok
/// - [`Kilo`](ProviderKind::Kilo) - Kilo AI
/// - [`OpenCode`](ProviderKind::OpenCode) - OpenCode
/// - [`Pi`](ProviderKind::Pi) - Inflection Pi
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum ProviderKind {
    /// OpenAI Codex
    Codex,
    /// Anthropic Claude Agent
    ClaudeAgent,
    /// Cursor AI
    Cursor,
    /// Google Gemini
    Gemini,
    /// xAI Grok
    Grok,
    /// Kilo AI
    Kilo,
    /// OpenCode
    OpenCode,
    /// Inflection Pi
    Pi,
}

impl std::fmt::Display for ProviderKind {
    /// 将 Provider 类型格式化为字符串（用于日志和显示）
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProviderKind::Codex => write!(f, "codex"),
            ProviderKind::ClaudeAgent => write!(f, "claudeAgent"),
            ProviderKind::Cursor => write!(f, "cursor"),
            ProviderKind::Gemini => write!(f, "gemini"),
            ProviderKind::Grok => write!(f, "grok"),
            ProviderKind::Kilo => write!(f, "kilo"),
            ProviderKind::OpenCode => write!(f, "opencode"),
            ProviderKind::Pi => write!(f, "pi"),
        }
    }
}

/// # 模型选择配置
///
/// 指定使用哪个 AI Provider 和具体模型，以及可选的模型参数。
///
/// ## 字段说明
///
/// - `provider`: Provider 类型
/// - `model`: 模型名称（如 "gpt-4"、"claude-3-opus" 等）
/// - `options`: 可选的模型参数（温度、最大 token 数等）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelSelection {
    /// Provider 类型
    pub provider: ProviderKind,
    /// 模型名称（如 "gpt-4"、"claude-3-opus" 等）
    pub model: String,
    /// 可选的模型参数配置
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<ProviderOptions>,
}

/// # Provider 选项
///
/// 可选的模型参数配置，用于控制模型的行为：
/// - `temperature`: 生成温度（0.0-2.0），越高越随机
/// - `max_tokens`: 最大生成 token 数
/// - `top_p`: 核采样参数（0.0-1.0）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderOptions {
    /// 生成温度（0.0-2.0），越高越随机
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    /// 最大生成 token 数
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u64>,
    /// 核采样参数（0.0-1.0）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f64>,
}

/// # Provider 会话
///
/// 表示与 AI Provider 的运行时会话连接。
/// 每个会话关联一个线程，维护会话状态和生命周期。
///
/// ## 字段说明
///
/// - `session_id`: 会话唯一标识
/// - `thread_id`: 关联的线程 ID
/// - `provider`: Provider 类型
/// - `model`: 使用的模型名称
/// - `status`: 会话当前状态
/// - `created_at`: 会话创建时间
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSession {
    /// 会话唯一标识
    pub session_id: String,
    /// 关联的线程 ID
    pub thread_id: String,
    /// Provider 类型
    pub provider: ProviderKind,
    /// 使用的模型名称
    pub model: String,
    /// 会话当前状态
    pub status: ProviderSessionStatus,
    /// 会话创建时间（UTC）
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// # Provider 会话状态枚举
///
/// 表示 Provider 会话的生命周期状态：
/// - [`Starting`](ProviderSessionStatus::Starting) - 正在启动
/// - [`Running`](ProviderSessionStatus::Running) - 正在运行
/// - [`Idle`](ProviderSessionStatus::Idle) - 空闲状态
/// - [`Stopped`](ProviderSessionStatus::Stopped) - 已停止
/// - [`Error`](ProviderSessionStatus::Error) - 发生错误
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProviderSessionStatus {
    /// 正在启动中
    Starting,
    /// 正在运行中
    Running,
    /// 空闲状态
    Idle,
    /// 已停止
    Stopped,
    /// 发生错误
    Error,
}

/// # Provider 能力
///
/// 描述 Provider 支持的功能特性：
/// - `supports_review`: 是否支持代码审查模式
/// - `supports_fork`: 是否支持线程分叉
/// - `supports_compact`: 是否支持上下文压缩
/// - `supports_steering`: 是否支持引导式对话
/// - `supports_user_input`: 是否支持用户输入请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCapabilities {
    /// 是否支持代码审查模式
    pub supports_review: bool,
    /// 是否支持线程分叉
    pub supports_fork: bool,
    /// 是否支持上下文压缩
    pub supports_compact: bool,
    /// 是否支持引导式对话
    pub supports_steering: bool,
    /// 是否支持用户输入请求
    pub supports_user_input: bool,
}

/// Provider 在线状态
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ServerProviderStatusState {
    Ready,
    Warning,
    Error,
}

/// Provider 认证状态
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ServerProviderAuthStatus {
    Authenticated,
    Unauthenticated,
    Unknown,
}

/// Provider 版本建议
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerProviderVersionAdvisory {
    pub status: String,
    pub current_version: Option<String>,
    pub latest_version: Option<String>,
    pub update_command: Option<String>,
    pub can_update: bool,
    pub checked_at: Option<String>,
    pub message: Option<String>,
}

/// Provider 更新状态
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerProviderUpdateState {
    pub status: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub message: Option<String>,
    pub output: Option<String>,
}

/// 单个 Provider 的运行时状态
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerProviderStatus {
    pub provider: ProviderKind,
    pub status: ServerProviderStatusState,
    pub available: bool,
    pub auth_status: ServerProviderAuthStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub voice_transcription_available: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    pub checked_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version_advisory: Option<ServerProviderVersionAdvisory>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update_state: Option<ServerProviderUpdateState>,
}

/// # Provider 运行时事件
///
/// Provider 在运行时产生的事件，用于驱动状态更新和 UI 刷新。
/// 事件采用带标签的枚举（tagged enum），便于序列化时区分变体。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "_tag", rename_all = "camelCase")]
pub enum ProviderRuntimeEvent {
    /// 会话已启动
    ///
    /// 当 Provider 成功建立会话连接后触发，标识会话进入可用状态。
    /// 后续可以在此会话上启动 Turn 进行交互。
    SessionStarted {
        /// 会话 ID
        session_id: String,
        /// 关联的线程 ID
        thread_id: String,
    },
    /// 会话状态更新
    ///
    /// 当 Provider 会话的内部状态发生变化时触发（如配置变更、上下文更新等）。
    /// 更新数据以 JSON 格式传递，具体结构取决于 Provider 实现。
    SessionUpdate {
        /// 会话 ID
        session_id: String,
        /// 更新数据
        data: serde_json::Value,
    },
    /// 会话已停止
    ///
    /// 当 Provider 会话正常关闭或异常终止时触发。
    /// 会话停止后，关联的线程将无法继续交互，需要重新启动会话。
    SessionStopped {
        /// 会话 ID
        session_id: String,
    },
    /// Turn 已开始
    ///
    /// 当 Provider 开始处理一个交互轮次时触发，标识 AI 正在生成响应。
    TurnStarted {
        /// 会话 ID
        session_id: String,
        /// Turn ID
        turn_id: String,
    },
    /// Turn 已完成
    ///
    /// 当 Provider 成功完成一个交互轮次时触发，标识 AI 响应已完整生成。
    TurnCompleted {
        /// 会话 ID
        session_id: String,
        /// Turn ID
        turn_id: String,
    },
    /// Turn 完成（携带结果数据）
    ///
    /// 与 [`TurnCompleted`](ProviderRuntimeEvent::TurnCompleted) 类似，但额外携带结果数据。
    /// 用于需要返回结构化结果的场景（如工具调用的返回值）。
    TurnComplete {
        /// Turn ID
        turn_id: String,
        /// 结果数据
        result: serde_json::Value,
    },
    /// Turn 流式输出增量
    ///
    /// 当 Provider 在流式传输模式下输出增量文本时触发。
    /// 每次触发携带一小段文本片段，前端应拼接显示以实现打字机效果。
    TurnDelta {
        /// 会话 ID
        session_id: String,
        /// Turn ID
        turn_id: String,
        /// 增量文本内容
        delta: String,
    },
    /// Turn 被中断
    ///
    /// 当用户主动中断正在执行的 Turn 时触发，AI 将停止当前操作。
    /// 中断后已生成的部分内容仍然保留。
    TurnInterrupted {
        /// 会话 ID
        session_id: String,
        /// Turn ID
        turn_id: String,
    },
    /// 请求用户审批
    ///
    /// 当 AI 代理需要执行敏感操作（如修改文件、执行命令）时，
    /// 向用户请求审批。用户可以批准或拒绝该请求。
    ApprovalRequested {
        /// 会话 ID
        session_id: String,
        /// Turn ID
        turn_id: String,
        /// 审批请求 ID
        request_id: String,
        /// 审批描述
        description: String,
    },
    /// 请求用户输入
    ///
    /// 当 AI 代理需要用户提供额外信息（如选择项、确认文本等）时触发。
    /// 用户需要根据提示提供输入，AI 才能继续执行。
    UserInputRequested {
        /// 会话 ID
        session_id: String,
        /// Turn ID
        turn_id: String,
        /// 输入请求 ID
        request_id: String,
        /// 输入提示文本
        prompt: String,
    },
    /// 发生错误
    ///
    /// 当 Provider 运行过程中发生不可恢复的错误时触发。
    /// 错误信息可用于展示给用户或记录日志，会话可能需要重启。
    Error {
        /// 会话 ID
        session_id: String,
        /// 错误信息
        error: String,
    },
}

/// # Provider 状态
///
/// 描述 Provider 的当前可用状态和版本信息。
///
/// ## 字段说明
///
/// - `provider`: Provider 类型
/// - `available`: 是否可用
/// - `version`: Provider 版本号（可选）
/// - `error`: 错误信息（仅在不可用时有效）
/// - `checked_at`: 状态检查时间
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
    /// Provider 类型
    pub provider: ProviderKind,
    /// 是否可用
    pub available: bool,
    /// Provider 版本号
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// 错误信息（仅在不可用时有效）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// 状态检查时间（UTC）
    pub checked_at: chrono::DateTime<chrono::Utc>,
}

/// # Provider 使用快照
///
/// 记录 Provider 的使用统计信息，用于监控和限流。
///
/// ## 字段说明
///
/// - `provider`: Provider 类型
/// - `model`: 使用的模型名称
/// - `requests_today`: 今日请求数
/// - `tokens_used`: 已使用的 token 总数
/// - `rate_limit_remaining`: 剩余配额（可选）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderUsageSnapshot {
    /// Provider 类型
    pub provider: ProviderKind,
    /// 使用的模型名称
    pub model: String,
    /// 今日请求数
    pub requests_today: u64,
    /// 已使用的 token 总数
    pub tokens_used: u64,
    /// 剩余配额
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rate_limit_remaining: Option<u64>,
}

/// # Provider 会话启动输入
///
/// 启动 Provider 会话时需要的输入参数。
///
/// ## 字段说明
///
/// - `thread_id`: 关联的线程 ID
/// - `provider`: Provider 类型
/// - `model`: 使用的模型名称
#[derive(Debug, Clone)]
pub struct ProviderSessionStartInput {
    /// 关联的线程 ID
    pub thread_id: String,
    /// Provider 类型
    pub provider: ProviderKind,
    /// 使用的模型名称
    pub model: String,
}

/// # Turn 启动输入
///
/// 启动 Turn 时需要的输入参数。
///
/// ## 字段说明
///
/// - `thread_id`: 关联的线程 ID
/// - `turn_id`: Turn ID
/// - `provider`: Provider 类型
#[derive(Debug, Clone)]
pub struct TurnInput {
    /// 关联的线程 ID
    pub thread_id: String,
    /// Turn ID
    pub turn_id: String,
    /// Provider 类型
    pub provider: ProviderKind,
    /// 用户消息内容
    pub message: String,
}

/// # Turn 启动结果
///
/// Turn 启动后的返回结果。
///
/// ## 字段说明
///
/// - `turn_id`: Turn ID
/// - `thread_id`: 关联的线程 ID
#[derive(Debug, Clone)]
pub struct ProviderTurnStartResult {
    /// Turn ID
    pub turn_id: String,
    /// 关联的线程 ID
    pub thread_id: String,
}

/// # Provider 审查目标
///
/// 代码审查的目标类型，支持审查分支、提交或差异。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum ProviderReviewTarget {
    /// 审查指定分支
    ///
    /// 对指定分支的最新提交进行代码审查，通常用于审查功能分支的完整变更。
    Branch {
        /// 分支名称
        branch: String,
    },
    /// 审查指定提交
    ///
    /// 对指定的单个 Git 提交进行代码审查，适用于审查特定的代码变更。
    Commit {
        /// 提交 SHA
        commit_sha: String,
    },
    /// 审查差异范围
    ///
    /// 对两个 Git 引用之间的差异进行代码审查，适用于审查 PR 或比较分支间的变更。
    /// `base_ref` 为基准引用（通常是主分支），`head_ref` 为目标引用（通常是功能分支）。
    Diff {
        /// 基础引用（如分支名、提交 SHA）
        base_ref: String,
        /// 头部引用（如分支名、提交 SHA）
        head_ref: String,
    },
}

/// # Provider 启动审查输入
///
/// 启动代码审查流程时需要的输入参数。
#[derive(Debug, Clone)]
pub struct ProviderStartReviewInput {
    /// 关联的线程 ID
    pub thread_id: String,
    /// 审查目标
    pub target: ProviderReviewTarget,
}

/// # Provider 审批决策
///
/// 用户对 Provider 审批请求的决策。
///
/// 每种决策都有"记住"变体，选择后系统会将该决策持久化，
/// 后续遇到相同类型的审批请求时自动应用，无需用户重复确认。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProviderApprovalDecision {
    /// 批准请求，允许 AI 执行该操作
    Approve,
    /// 拒绝请求，阻止 AI 执行该操作
    Deny,
    /// 批准并记住此决策（后续类似请求自动批准）
    ///
    /// 适用于用户信任 AI 对某类操作的判断，希望减少审批弹窗的场景。
    /// 例如：批准所有文件读取操作。
    ApproveAndRemember,
    /// 拒绝并记住此决策（后续类似请求自动拒绝）
    ///
    /// 适用于用户不希望 AI 执行某类操作的场景。
    /// 例如：拒绝所有涉及生产环境文件修改的操作。
    DenyAndRemember,
}

/// # Provider 用户输入答案
///
/// 用户对 Provider 结构化输入请求的回答。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderUserInputAnswers {
    /// 答案键值对，键为问题 ID，答案为用户输入的文本
    pub answers: std::collections::HashMap<String, String>,
}

/// # Provider 线程快照
///
/// Provider 线程的当前状态快照，包含所有 Turn 的信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderThreadSnapshot {
    /// 线程 ID
    pub thread_id: String,
    /// Turn 列表
    pub turns: Vec<ProviderTurnSnapshot>,
    /// 恢复游标，用于会话恢复
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resume_cursor: Option<serde_json::Value>,
}

/// # Provider Turn 快照
///
/// 单个 Turn 的状态快照。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderTurnSnapshot {
    /// Turn ID
    pub turn_id: String,
    /// Turn 状态
    pub status: String,
    /// 用户消息内容
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_message: Option<String>,
    /// 助手响应内容
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assistant_message: Option<String>,
    /// 创建时间
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// # Provider 分叉线程输入
///
/// 从现有线程创建新线程时需要的输入参数。
#[derive(Debug, Clone)]
pub struct ProviderForkThreadInput {
    /// 源线程 ID
    pub source_thread_id: String,
    /// 新线程 ID
    pub thread_id: String,
    /// 源线程的恢复游标
    pub source_resume_cursor: Option<serde_json::Value>,
    /// 新线程的工作目录
    pub cwd: Option<String>,
    /// 新线程的模型选择
    pub model: Option<String>,
}

/// # Provider 分叉线程结果
///
/// 分叉线程操作的返回结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderForkThreadResult {
    /// 新创建的线程 ID
    pub thread_id: String,
    /// 新线程的恢复游标
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resume_cursor: Option<serde_json::Value>,
}

/// # Provider Composer 能力
///
/// 描述 Provider 在编辑器中支持的功能特性。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderComposerCapabilities {
    /// Provider 类型
    pub provider: ProviderKind,
    /// 是否支持技能提及
    pub supports_skill_mentions: bool,
    /// 是否支持技能发现
    pub supports_skill_discovery: bool,
    /// 是否支持原生命令发现
    pub supports_native_slash_command_discovery: bool,
    /// 是否支持插件提及
    pub supports_plugin_mentions: bool,
    /// 是否支持插件发现
    pub supports_plugin_discovery: bool,
    /// 是否支持运行时模型列表
    pub supports_runtime_model_list: bool,
    /// 是否支持线程压缩
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_thread_compaction: Option<bool>,
    /// 是否支持线程导入
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_thread_import: Option<bool>,
}

/// # Provider 技能描述符
///
/// 描述一个可用的技能。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSkillDescriptor {
    /// 技能名称
    pub name: String,
    /// 技能描述
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// 技能路径
    pub path: String,
    /// 是否启用
    pub enabled: bool,
    /// 作用域
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
}

/// # Provider 列出技能输入
///
/// 列出可用技能时需要的输入参数。
#[derive(Debug, Clone)]
pub struct ProviderListSkillsInput {
    /// Provider 类型
    pub provider: ProviderKind,
    /// 工作目录
    pub cwd: String,
    /// 线程 ID（可选）
    pub thread_id: Option<String>,
    /// 是否强制重新加载
    pub force_reload: Option<bool>,
}

/// # Provider 列出技能结果
///
/// 技能列表的返回结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderListSkillsResult {
    /// 技能列表
    pub skills: Vec<ProviderSkillDescriptor>,
    /// 数据来源
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    /// 是否来自缓存
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached: Option<bool>,
}

/// # Provider 原生命令描述符
///
/// 描述 Provider 原生的斜杠命令。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderNativeCommandDescriptor {
    /// 命令名称
    pub name: String,
    /// 命令描述
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// # Provider 列出命令输入
///
/// 列出可用命令时需要的输入参数。
#[derive(Debug, Clone)]
pub struct ProviderListCommandsInput {
    /// Provider 类型
    pub provider: ProviderKind,
    /// 工作目录
    pub cwd: String,
    /// 线程 ID（可选）
    pub thread_id: Option<String>,
    /// 是否强制重新加载
    pub force_reload: Option<bool>,
}

/// # Provider 列出命令结果
///
/// 命令列表的返回结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderListCommandsResult {
    /// 命令列表
    pub commands: Vec<ProviderNativeCommandDescriptor>,
    /// 数据来源
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    /// 是否来自缓存
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached: Option<bool>,
}

/// # Provider 插件描述符
///
/// 描述一个可用的插件。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderPluginDescriptor {
    /// 插件 ID
    pub id: String,
    /// 插件名称
    pub name: String,
    /// 是否已安装
    pub installed: bool,
    /// 是否已启用
    pub enabled: bool,
}

/// # Provider 插件市场描述符
///
/// 描述一个插件市场。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderPluginMarketplaceDescriptor {
    /// 市场名称
    pub name: String,
    /// 市场路径
    pub path: String,
    /// 插件列表
    pub plugins: Vec<ProviderPluginDescriptor>,
}

/// # Provider 列出插件输入
///
/// 列出可用插件时需要的输入参数。
#[derive(Debug, Clone)]
pub struct ProviderListPluginsInput {
    /// Provider 类型
    pub provider: ProviderKind,
    /// 工作目录（可选）
    pub cwd: Option<String>,
    /// 是否强制远程同步
    pub force_remote_sync: Option<bool>,
    /// 是否强制重新加载
    pub force_reload: Option<bool>,
}

/// # Provider 列出插件结果
///
/// 插件列表的返回结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderListPluginsResult {
    /// 市场列表
    pub marketplaces: Vec<ProviderPluginMarketplaceDescriptor>,
    /// 推荐插件 ID 列表
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub featured_plugin_ids: Vec<String>,
    /// 数据来源
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    /// 是否来自缓存
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached: Option<bool>,
}

/// # Provider 读取插件输入
///
/// 读取插件详情时需要的输入参数。
#[derive(Debug, Clone)]
pub struct ProviderReadPluginInput {
    /// Provider 类型
    pub provider: ProviderKind,
    /// 市场路径
    pub marketplace_path: String,
    /// 插件名称
    pub plugin_name: String,
}

/// # Provider 插件详情
///
/// 插件的详细信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderPluginDetail {
    /// 市场名称
    pub marketplace_name: String,
    /// 市场路径
    pub marketplace_path: String,
    /// 插件摘要
    pub summary: ProviderPluginDescriptor,
    /// 技能列表
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub skills: Vec<ProviderSkillDescriptor>,
}

/// # Provider 读取插件结果
///
/// 插件详情的返回结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderReadPluginResult {
    /// 插件详情
    pub plugin: ProviderPluginDetail,
    /// 数据来源
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    /// 是否来自缓存
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached: Option<bool>,
}

/// # Provider 模型描述符
///
/// 描述一个可用的 AI 模型。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderModelDescriptor {
    /// 模型标识
    pub slug: String,
    /// 模型名称
    pub name: String,
    /// 上游提供者 ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upstream_provider_id: Option<String>,
    /// 上游提供者名称
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upstream_provider_name: Option<String>,
    /// 默认上下文窗口
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_context_window: Option<String>,
}

/// # Provider 列出模型输入
///
/// 列出可用模型时需要的输入参数。
#[derive(Debug, Clone)]
pub struct ProviderListModelsInput {
    /// Provider 类型
    pub provider: ProviderKind,
    /// 二进制文件路径（可选）
    pub binary_path: Option<String>,
    /// API 端点（可选）
    pub api_endpoint: Option<String>,
}

/// # Provider 列出模型结果
///
/// 模型列表的返回结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderListModelsResult {
    /// 模型列表
    pub models: Vec<ProviderModelDescriptor>,
    /// 数据来源
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    /// 是否来自缓存
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached: Option<bool>,
}

/// # Provider 代理描述符
///
/// 描述一个可用的代理。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderAgentDescriptor {
    /// 代理名称
    pub name: String,
    /// 显示名称
    pub display_name: String,
    /// 代理描述
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// 使用的模型
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

/// # Provider 列出代理结果
///
/// 代理列表的返回结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderListAgentsResult {
    /// 代理列表
    pub agents: Vec<ProviderAgentDescriptor>,
    /// 数据来源
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    /// 是否来自缓存
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached: Option<bool>,
}

/// # 语音转录输入
///
/// 语音转录请求的输入参数。
#[derive(Debug, Clone)]
pub struct ServerVoiceTranscriptionInput {
    /// Provider 类型
    pub provider: ProviderKind,
    /// 工作目录
    pub cwd: String,
    /// 线程 ID（可选）
    pub thread_id: Option<String>,
    /// 音频 MIME 类型
    pub mime_type: String,
    /// 采样率（Hz）
    pub sample_rate_hz: u32,
    /// 音频时长（ms）
    pub duration_ms: u64,
    /// 音频数据（Base64 编码）
    pub audio_base64: String,
}

/// # 语音转录结果
///
/// 语音转录的返回结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerVoiceTranscriptionResult {
    /// 转录后的文本
    pub text: String,
}
