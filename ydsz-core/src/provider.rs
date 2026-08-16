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
/// - [`Glm`](ProviderKind::Glm) - 智谱 BigModel（GLM-4/GLM-Z1）
/// - [`DeepSeek`](ProviderKind::DeepSeek) - 深度求索（DeepSeek-V3/R1）
/// - [`Moonshot`](ProviderKind::Moonshot) - 月之暗面 Kimi
/// - [`Qwen`](ProviderKind::Qwen) - 阿里通义千问 DashScope
/// - [`Mimo`](ProviderKind::Mimo) - 小米 MiMo
/// - [`MiniMax`](ProviderKind::MiniMax) - MiniMax（abab/M-系列）
/// - [`Doubao`](ProviderKind::Doubao) - 字节跳动豆包（火山方舟 Ark）
/// - [`Ernie`](ProviderKind::Ernie) - 百度文心一言（千帆 v2）
/// - [`Hunyuan`](ProviderKind::Hunyuan) - 腾讯混元
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
    /// 智谱 BigModel
    Glm,
    /// 深度求索 DeepSeek
    DeepSeek,
    /// 月之暗面 Kimi (Moonshot)
    Moonshot,
    /// 阿里通义千问 DashScope
    Qwen,
    /// 小米 MiMo
    Mimo,
    /// MiniMax
    MiniMax,
    /// 字节跳动豆包（火山方舟 Ark）
    Doubao,
    /// 百度文心一言（千帆 v2）
    Ernie,
    /// 腾讯混元
    Hunyuan,
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
            ProviderKind::Glm => write!(f, "glm"),
            ProviderKind::DeepSeek => write!(f, "deepseek"),
            ProviderKind::Moonshot => write!(f, "moonshot"),
            ProviderKind::Qwen => write!(f, "qwen"),
            ProviderKind::Mimo => write!(f, "mimo"),
            ProviderKind::MiniMax => write!(f, "MiniMax"),
            ProviderKind::Doubao => write!(f, "doubao"),
            ProviderKind::Ernie => write!(f, "ernie"),
            ProviderKind::Hunyuan => write!(f, "hunyuan"),
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
/// - `model`: 模型名称（如 'gpt-4'、'claude-3-opus' 等）
/// - `options`: 可选的模型参数（温度、最大 token 数等）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelSelection {
    /// Provider 类型
    pub provider: ProviderKind,
    /// 模型名称（如 'gpt-4'、'claude-3-opus' 等）
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
///
/// 表示 Provider 的可用性状态：
/// - [`Ready`](ServerProviderStatusState::Ready) - 可用且正常
/// - [`Warning`](ServerProviderStatusState::Warning) - 可用但存在问题
/// - [`Error`](ServerProviderStatusState::Error) - 不可用或发生错误
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ServerProviderStatusState {
    /// 可用且正常
    Ready,
    /// 可用但存在问题
    Warning,
    /// 不可用或发生错误
    Error,
}

/// Provider 认证状态
///
/// 表示用户的认证状态：
/// - [`Authenticated`](ServerProviderAuthStatus::Authenticated) - 已认证
/// - [`Unauthenticated`](ServerProviderAuthStatus::Unauthenticated) - 未认证
/// - [`Unknown`](ServerProviderAuthStatus::Unknown) - 未知状态
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ServerProviderAuthStatus {
    /// 已认证
    Authenticated,
    /// 未认证
    Unauthenticated,
    /// 未知状态
    Unknown,
}

/// Provider 版本建议
///
/// 描述 Provider 的版本信息和更新建议。
///
/// ## 字段说明
///
/// - `status`: 版本状态（如 'up-to-date'、'outdated' 等）
/// - `current_version`: 当前版本号（可选）
/// - `latest_version`: 最新版本号（可选）
/// - `update_command`: 更新命令（可选）
/// - `can_update`: 是否可以更新
/// - `checked_at`: 检查时间（可选）
/// - `message`: 附加消息（可选）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerProviderVersionAdvisory {
    /// 版本状态
    pub status: String,
    /// 当前版本号
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_version: Option<String>,
    /// 最新版本号
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_version: Option<String>,
    /// 更新命令
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update_command: Option<String>,
    /// 是否可以更新
    pub can_update: bool,
    /// 检查时间
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checked_at: Option<String>,
    /// 附加消息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// Provider 更新状态
///
/// 描述 Provider 更新操作的进度和结果。
///
/// ## 字段说明
///
/// - `status`: 更新状态（如 'pending'、'running'、'completed'、'failed'）
/// - `started_at`: 更新开始时间（可选）
/// - `finished_at`: 更新完成时间（可选）
/// - `message`: 状态消息（可选）
/// - `output`: 更新输出日志（可选）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerProviderUpdateState {
    /// 更新状态
    pub status: String,
    /// 更新开始时间
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    /// 更新完成时间
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<String>,
    /// 状态消息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// 更新输出日志
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
}

/// 单个 Provider 的运行时状态
///
/// 描述 Provider 的完整运行时信息，包括可用性、认证状态、版本信息等。
///
/// ## 字段说明
///
/// - `provider`: Provider 类型
/// - `status`: 在线状态
/// - `available`: 是否可用
/// - `auth_status`: 认证状态
/// - `auth_type`: 认证类型（可选）
/// - `auth_label`: 认证标签（可选）
/// - `voice_transcription_available`: 是否支持语音转录（可选）
/// - `version`: Provider 版本号（可选）
/// - `checked_at`: 状态检查时间
/// - `message`: 状态消息（可选）
/// - `version_advisory`: 版本建议（可选）
/// - `update_state`: 更新状态（可选）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerProviderStatus {
    /// Provider 类型
    pub provider: ProviderKind,
    /// 在线状态
    pub status: ServerProviderStatusState,
    /// 是否可用
    pub available: bool,
    /// 认证状态
    pub auth_status: ServerProviderAuthStatus,
    /// 认证类型
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_type: Option<String>,
    /// 认证标签
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_label: Option<String>,
    /// 是否支持语音转录
    #[serde(skip_serializing_if = "Option::is_none")]
    pub voice_transcription_available: Option<bool>,
    /// Provider 版本号
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// 状态检查时间
    pub checked_at: String,
    /// 状态消息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// 版本建议
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version_advisory: Option<ServerProviderVersionAdvisory>,
    /// 更新状态
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
    /// 工具调用
    ///
    /// 当 AI 代理发起工具调用（如执行命令、读写文件、搜索代码）时触发。
    /// 前端可据此展示工具调用进度和参数；通过 `call_id` 与后续的
    /// [`ToolResult`](ProviderRuntimeEvent::ToolResult) 关联。
    ToolCall {
        /// 会话 ID
        session_id: String,
        /// Turn ID
        turn_id: String,
        /// 工具调用 ID（用于关联 ToolResult）
        call_id: String,
        /// 工具名称（如 "bash" / "edit" / "read" / "grep"）
        name: String,
        /// 工具调用参数（JSON 格式，结构由工具定义）
        arguments: serde_json::Value,
    },
    /// 工具调用结果
    ///
    /// 当工具调用执行完成后触发，携带工具的返回值。
    /// 通过 `call_id` 与对应的 [`ToolCall`](ProviderRuntimeEvent::ToolCall) 关联。
    ToolResult {
        /// 会话 ID
        session_id: String,
        /// Turn ID
        turn_id: String,
        /// 关联的工具调用 ID
        call_id: String,
        /// 工具返回结果（JSON 格式，结构由工具定义）
        result: serde_json::Value,
        /// 是否执行出错（true 时 result 字段为错误描述）
        is_error: bool,
    },
    /// 文件变更
    ///
    /// 当 AI 代理通过工具修改文件系统时触发（如 edit / write / delete 工具）。
    /// 前端可据此刷新文件树、展示 diff、更新 LSP 缓存。
    FileChange {
        /// 会话 ID
        session_id: String,
        /// Turn ID
        turn_id: String,
        /// 变更类型（"create" / "edit" / "delete" / "rename"）
        change_kind: String,
        /// 受影响的文件绝对路径
        path: String,
        /// 变更前的内容（仅 edit / delete 有）
        #[serde(skip_serializing_if = "Option::is_none")]
        before: Option<String>,
        /// 变更后的内容（仅 create / edit 有）
        #[serde(skip_serializing_if = "Option::is_none")]
        after: Option<String>,
    },
    /// 会话空闲
    ///
    /// 当 Provider 会话完成所有 Turn 后进入空闲状态时触发。
    /// 前端可据此隐藏 loading 指示、启用输入框、刷新会话状态。
    /// 与 [`SessionStopped`](ProviderRuntimeEvent::SessionStopped) 的区别：
    /// SessionIdle 表示会话仍然活跃、可继续接收新 Turn；
    /// SessionStopped 表示会话已关闭、需要重启。
    SessionIdle {
        /// 会话 ID
        session_id: String,
        /// 最后一个 Turn ID（可选，用于关联上一个完成的 Turn）
        #[serde(skip_serializing_if = "Option::is_none")]
        last_turn_id: Option<String>,
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

/// # Provider 沙箱模式
///
/// 与 Codex CLI `--sandbox` 参数对齐,控制 Provider 子进程的文件系统/网络权限。
///
/// - `ReadOnly`: 仅允许读取工作区,禁止任何写操作和网络访问
/// - `WorkspaceWrite`: 允许读写工作区目录,禁止访问工作区外的文件和系统资源
/// - `DangerFullAccess`: 完全访问(不推荐,仅在受信任的隔离环境中使用)
///
/// 与前端 `orchestration.ts::ProviderSandboxMode` kebab-case 字符串对齐。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ProviderSandboxMode {
    /// 只读模式:禁止写操作和网络访问
    ReadOnly,
    /// 工作区读写:允许工作区内读写,禁止越界访问
    WorkspaceWrite,
    /// 完全访问(危险):无任何限制
    DangerFullAccess,
}

impl ProviderSandboxMode {
    /// 返回与 CLI 参数兼容的 kebab-case 字符串
    pub fn as_str(&self) -> &'static str {
        match self {
            ProviderSandboxMode::ReadOnly => "read-only",
            ProviderSandboxMode::WorkspaceWrite => "workspace-write",
            ProviderSandboxMode::DangerFullAccess => "danger-full-access",
        }
    }
}

/// # Provider 审批策略
///
/// 与 Codex CLI `--approval-policy` 参数对齐,控制 Provider 在执行命令前是否需要用户审批。
///
/// - `Untrusted`: 所有命令都需审批(默认最安全)
/// - `OnFailure`: 仅在命令失败时需审批
/// - `OnRequest`: 仅在 Provider 主动请求时需审批
/// - `Never`: 永不审批(危险,仅在完全信任的环境中使用)
///
/// 与前端 `orchestration.ts::ProviderApprovalPolicy` kebab-case 字符串对齐。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ProviderApprovalPolicy {
    /// 不信任:所有命令都需审批
    Untrusted,
    /// 失败时审批
    OnFailure,
    /// 按需审批
    OnRequest,
    /// 永不审批
    Never,
}

impl ProviderApprovalPolicy {
    /// 返回与 CLI 参数兼容的 kebab-case 字符串
    pub fn as_str(&self) -> &'static str {
        match self {
            ProviderApprovalPolicy::Untrusted => "untrusted",
            ProviderApprovalPolicy::OnFailure => "on-failure",
            ProviderApprovalPolicy::OnRequest => "on-request",
            ProviderApprovalPolicy::Never => "never",
        }
    }
}

/// 启动 Provider 会话时需要的输入参数。
///
/// ## 字段说明
///
/// - `thread_id`: 关联的线程 ID
/// - `provider`: Provider 类型
/// - `model`: 使用的模型名称
/// - `runtime_mode`: 运行时模式（Work / Code），决定 system prompt 和可用工具集
/// - `sandbox_mode`: 沙箱模式(可选,未指定时由 adapter 决定默认值)
/// - `approval_policy`: 审批策略(可选,未指定时由 adapter 决定默认值)
#[derive(Debug, Clone)]
pub struct ProviderSessionStartInput {
    /// 关联的线程 ID
    pub thread_id: String,
    /// Provider 类型
    pub provider: ProviderKind,
    /// 使用的模型名称
    pub model: String,
    /// 运行时模式（Work / Code），决定 system prompt 和可用工具集
    pub runtime_mode: crate::models::RuntimeMode,
    /// 沙箱模式:控制 Provider 子进程的文件系统/网络权限
    ///
    /// None 时 Codex adapter 默认使用 `WorkspaceWrite`;
    /// 其他 adapter 暂不消费此字段。
    pub sandbox_mode: Option<ProviderSandboxMode>,
    /// 审批策略:控制命令执行前是否需要用户审批
    ///
    /// None 时 Codex adapter 默认使用 `OnRequest`;
    /// 其他 adapter 暂不消费此字段。
    pub approval_policy: Option<ProviderApprovalPolicy>,
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
/// - `message`: 用户消息内容
/// - `parent_turn_id`: 父 Turn ID(子代理派发时设置,标识本 Turn 由哪个父 Turn 触发)
/// - `skills`: 本 Turn 关联的技能名称列表(供 Provider adapter 原生消费)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TurnInput {
    /// 关联的线程 ID
    pub thread_id: String,
    /// Turn ID
    pub turn_id: String,
    /// Provider 类型
    pub provider: ProviderKind,
    /// 用户消息内容
    pub message: String,
    /// 父 Turn ID(子代理派发时设置,标识本 Turn 由哪个父 Turn 触发;
    /// 顶层 Turn 为 None)
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub parent_turn_id: Option<String>,
    /// 本 Turn 关联的技能名称列表(供 Provider adapter 原生消费;
    /// 为空表示未指定技能)
    #[serde(default)]
    pub skills: Vec<String>,
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
/// 每种决策都有'记住'变体，选择后系统会将该决策持久化，
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

/// # Provider 响应审批请求输入
///
/// 用户对 Provider 审批请求做出决策时需要的输入参数。
#[derive(Debug, Clone)]
pub struct ProviderRespondToRequestInput {
    /// 关联的线程 ID
    pub thread_id: String,
    /// 审批请求 ID
    pub request_id: String,
    /// 用户决策
    pub decision: ProviderApprovalDecision,
}

/// # Provider 响应用户输入请求输入
///
/// 用户对 Provider 结构化输入请求做出回答时需要的输入参数。
#[derive(Debug, Clone)]
pub struct ProviderRespondToUserInputInput {
    /// 关联的线程 ID
    pub thread_id: String,
    /// 输入请求 ID
    pub request_id: String,
    /// 用户答案
    pub answers: ProviderUserInputAnswers,
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
///
/// 字段顺序与序列化（camelCase）严格对齐前端 `ProviderListSkillsInput` 契约
/// （`ydsz-desktop/src/contracts/providerDiscovery.ts`）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderListSkillsInput {
    /// Provider 类型
    pub provider: ProviderKind,
    /// 工作目录
    pub cwd: String,
    /// 线程 ID（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    /// Agent 目录（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_dir: Option<String>,
    /// 是否强制重新加载
    #[serde(skip_serializing_if = "Option::is_none")]
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
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderListCommandsInput {
    /// Provider 类型
    pub provider: ProviderKind,
    /// 工作目录
    pub cwd: String,
    /// 线程 ID（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    /// Agent 目录（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_dir: Option<String>,
    /// 是否强制重新加载
    #[serde(skip_serializing_if = "Option::is_none")]
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
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderListPluginsInput {
    /// Provider 类型
    pub provider: ProviderKind,
    /// 工作目录（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    /// 线程 ID（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    /// 是否强制远程同步
    #[serde(skip_serializing_if = "Option::is_none")]
    pub force_remote_sync: Option<bool>,
    /// 是否强制重新加载
    #[serde(skip_serializing_if = "Option::is_none")]
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

/// # 模型支持的输入/输出模态
///
/// 借鉴 OpenCode / models.dev 的 modality 概念：模型能处理的输入类型（图像、音频）
/// 与能生成的输出类型（文本、图像）。前端可据此决定文件上传控件是否启用、
/// 是否展示"语音转写"按钮等。
///
/// ## 约定
///
/// - `Text` 永远包含在 `input` 与 `output` 中（即使 `Vec` 中没出现）
/// - `Image` 输入表示视觉理解（看图），输出表示图像生成（画图）
/// - `Audio` 通常意味着 STT/TTS 能力
/// - `Video` 极少使用，预留
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Modality {
    /// 文本（始终隐含支持）
    Text,
    /// 图像（输入 = 看图 / 视觉理解；输出 = 图像生成）
    Image,
    /// 音频（输入 = STT；输出 = TTS）
    Audio,
    /// 视频（极少数模型支持）
    Video,
    /// PDF / Office 等文件附件（Claude/Gemini/GLM 等支持）
    File,
}

impl std::fmt::Display for Modality {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Modality::Text => write!(f, "text"),
            Modality::Image => write!(f, "image"),
            Modality::Audio => write!(f, "audio"),
            Modality::Video => write!(f, "video"),
            Modality::File => write!(f, "file"),
        }
    }
}

/// # 模型能力矩阵
///
/// 借鉴 OpenCode / models.dev 模型的细粒度 flags。前端可基于此做：
/// - 模型选择器过滤（只显示支持视觉的模型给图像需求）
/// - 智能 prompt 提示（不支持 function call 的模型不展示工具建议）
/// - 限流面板按 capability 维度计费
/// - Mobile 端把 capability 同步到端侧
///
/// ## 字段语义
///
/// - `supports_image_input`: 视觉理解（看图）能力
/// - `supports_tool_use`: function calling / 工具调用
/// - `supports_reasoning`: extended thinking / chain-of-thought（区别于 supportedReasoningEfforts 的 effort 选择）
/// - `supports_streaming`: SSE 流式响应
/// - `supports_attachment`: 文件附件（PDF/Office 等）
///
/// ## 向后兼容
///
/// 所有字段都是 `Option<bool>`，序列化时 `skip_serializing_if = "Option::is_none"`。
/// 旧的 Provider（不填这些字段）反序列化时使用 `#[serde(default)]` 兜底为 `None`，
/// 调用方用 `.unwrap_or(false)` 即可安全降级。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelCapabilities {
    /// 视觉理解（看图）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supports_image_input: Option<bool>,
    /// function calling / 工具调用
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supports_tool_use: Option<bool>,
    /// 扩展推理（extended thinking / CoT）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supports_reasoning: Option<bool>,
    /// SSE 流式响应
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supports_streaming: Option<bool>,
    /// 文件附件（PDF/Office/zip 等）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supports_attachment: Option<bool>,
}

impl ModelCapabilities {
    /// 创建全部 `true` 的能力（用于模型自报"全功能"）
    pub fn all_true() -> Self {
        Self {
            supports_image_input: Some(true),
            supports_tool_use: Some(true),
            supports_reasoning: Some(true),
            supports_streaming: Some(true),
            supports_attachment: Some(true),
        }
    }

    /// 创建全部 `false` 的能力（用于"能力未知"兜底）
    pub fn all_false() -> Self {
        Self {
            supports_image_input: Some(false),
            supports_tool_use: Some(false),
            supports_reasoning: Some(false),
            supports_streaming: Some(false),
            supports_attachment: Some(false),
        }
    }

    /// 获取 flag 值的兜底访问（None → 保守默认）
    pub fn image_input(&self) -> bool {
        self.supports_image_input.unwrap_or(false)
    }
    pub fn tool_use(&self) -> bool {
        self.supports_tool_use.unwrap_or(false)
    }
    pub fn reasoning(&self) -> bool {
        self.supports_reasoning.unwrap_or(false)
    }
    pub fn streaming(&self) -> bool {
        // 流式是绝大多数现代 LLM 的默认能力，未知时假定为 true
        self.supports_streaming.unwrap_or(true)
    }
    pub fn attachment(&self) -> bool {
        self.supports_attachment.unwrap_or(false)
    }
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
    /// 模型能力矩阵（细粒度 flags）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub capabilities: Option<ModelCapabilities>,
    /// 输入模态列表（text 隐含；如 [image, file] 表示支持图像 + 文件）
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub input_modalities: Vec<Modality>,
    /// 输出模态列表（text 隐含；如 [image] 表示支持图像生成）
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub output_modalities: Vec<Modality>,
    /// 输入价格（每百万 token，美元）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cost_per_mtok_input: Option<f64>,
    /// 输出价格（每百万 token，美元）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cost_per_mtok_output: Option<f64>,
}

impl Default for ProviderModelDescriptor {
    /// 构造一个空的 `ProviderModelDescriptor`，slug/name 为空字符串
    ///
    /// 主要用途：在 struct literal 中使用 `..Default::default()` 语法填充可选字段。
    /// **不要**直接构造这种实例传给上层业务 — 上层应至少设置 slug/name。
    fn default() -> Self {
        Self {
            slug: String::new(),
            name: String::new(),
            upstream_provider_id: None,
            upstream_provider_name: None,
            default_context_window: None,
            capabilities: None,
            input_modalities: Vec::new(),
            output_modalities: Vec::new(),
            cost_per_mtok_input: None,
            cost_per_mtok_output: None,
        }
    }
}

/// # Provider 列出模型输入
///
/// 列出可用模型时需要的输入参数。
#[derive(Debug, Clone)]
pub struct ProviderListModelsInput {
    /// Provider 类型
    pub provider: ProviderKind,
    /// API Key（可选，未指定时由 auth 模块从环境变量解析）
    pub api_key: Option<String>,
    /// API Base URL（可选，未指定时使用 Provider 默认 endpoint）
    pub base_url: Option<String>,
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // ---- Modality ----

    #[test]
    fn modality_serializes_as_lowercase_string() {
        let v = serde_json::to_value(Modality::Image).expect("序列化应成功");
        assert_eq!(v, "image");

        let v = serde_json::to_value(Modality::File).expect("序列化应成功");
        assert_eq!(v, "file");
    }

    #[test]
    fn modality_deserializes_from_lowercase_string() {
        let m: Modality = serde_json::from_value(json!("audio")).expect("反序列化应成功");
        assert_eq!(m, Modality::Audio);

        // 未知字符串反序列化失败（保证前/后端契约一致）
        let r: Result<Modality, _> = serde_json::from_value(json!("unknown"));
        assert!(r.is_err(), "未知 modality 应反序列化失败");
    }

    #[test]
    fn modality_display_matches_serde() {
        // Display 与 serde 一致，方便日志与显示
        for m in [
            Modality::Text,
            Modality::Image,
            Modality::Audio,
            Modality::Video,
            Modality::File,
        ] {
            assert_eq!(m.to_string(), serde_json::to_value(m).unwrap().as_str().unwrap());
        }
    }

    // ---- ModelCapabilities ----

    #[test]
    fn capabilities_default_is_all_none() {
        let c = ModelCapabilities::default();
        assert_eq!(c.supports_image_input, None);
        assert_eq!(c.supports_tool_use, None);
        assert_eq!(c.supports_reasoning, None);
        assert_eq!(c.supports_streaming, None);
        assert_eq!(c.supports_attachment, None);
    }

    #[test]
    fn capabilities_all_true_sets_every_flag() {
        let c = ModelCapabilities::all_true();
        assert!(c.image_input());
        assert!(c.tool_use());
        assert!(c.reasoning());
        assert!(c.streaming());
        assert!(c.attachment());
    }

    #[test]
    fn capabilities_all_false_sets_every_flag() {
        let c = ModelCapabilities::all_false();
        assert!(!c.image_input());
        assert!(!c.tool_use());
        assert!(!c.reasoning());
        assert!(!c.streaming());
        assert!(!c.attachment());
    }

    #[test]
    fn capabilities_streaming_defaults_to_true_when_unknown() {
        // 关键不变量：流式是默认能力，未知时假定为 true
        let c = ModelCapabilities::default();
        assert!(c.streaming(), "流式默认应为 true");
    }

    #[test]
    fn capabilities_other_flags_default_to_false_when_unknown() {
        let c = ModelCapabilities::default();
        assert!(!c.image_input());
        assert!(!c.tool_use());
        assert!(!c.reasoning());
        assert!(!c.attachment());
    }

    #[test]
    fn capabilities_serialization_omits_none_fields() {
        // skip_serializing_if = Option::is_none 必须生效，避免给前端发送冗余 null
        let c = ModelCapabilities {
            supports_image_input: Some(true),
            ..Default::default()
        };
        let v = serde_json::to_value(&c).expect("序列化应成功");
        assert_eq!(v["supportsImageInput"], true);
        // 其余字段不存在
        assert!(v.get("supportsToolUse").is_none());
        assert!(v.get("supportsReasoning").is_none());
        assert!(v.get("supportsStreaming").is_none());
        assert!(v.get("supportsAttachment").is_none());
    }

    #[test]
    fn capabilities_camel_case_serialization() {
        let c = ModelCapabilities {
            supports_image_input: Some(true),
            supports_tool_use: Some(false),
            supports_reasoning: Some(true),
            supports_streaming: Some(true),
            supports_attachment: Some(false),
        };
        let v = serde_json::to_value(&c).expect("序列化应成功");
        assert_eq!(v["supportsImageInput"], true);
        assert_eq!(v["supportsToolUse"], false);
        assert_eq!(v["supportsReasoning"], true);
        assert_eq!(v["supportsStreaming"], true);
        assert_eq!(v["supportsAttachment"], false);
    }

    #[test]
    fn capabilities_deserializes_missing_fields_as_none() {
        // 旧版 Provider 不填这些字段，反序列化时不应报错
        let v = json!({});
        let c: ModelCapabilities = serde_json::from_value(v).expect("空对象应能反序列化");
        assert!(!c.image_input());
        assert!(c.streaming()); // 流式默认 true
    }

    // ---- ProviderModelDescriptor 兼容性 ----

    #[test]
    fn model_descriptor_legacy_payload_still_deserializes() {
        // 旧版 Rust 端序列化（没有 capabilities / modalities / cost 字段）
        // 应能反序列化到新结构（向后兼容）
        let legacy = json!({
            "slug": "gpt-4",
            "name": "GPT-4",
            "defaultContextWindow": "8000"
        });
        let m: ProviderModelDescriptor = serde_json::from_value(legacy)
            .expect("旧版 payload 应能反序列化");
        assert_eq!(m.slug, "gpt-4");
        assert_eq!(m.capabilities, None);
        assert!(m.input_modalities.is_empty());
        assert!(m.output_modalities.is_empty());
        assert_eq!(m.cost_per_mtok_input, None);
        assert_eq!(m.cost_per_mtok_output, None);
    }

    #[test]
    fn model_descriptor_full_payload_roundtrip() {
        let original = ProviderModelDescriptor {
            slug: "claude-sonnet-4-5".to_string(),
            name: "Claude Sonnet 4.5".to_string(),
            upstream_provider_id: Some("anthropic".to_string()),
            upstream_provider_name: Some("Anthropic".to_string()),
            default_context_window: Some("200000".to_string()),
            capabilities: Some(ModelCapabilities::all_true()),
            input_modalities: vec![Modality::Text, Modality::Image, Modality::File],
            output_modalities: vec![Modality::Text],
            cost_per_mtok_input: Some(3.0),
            cost_per_mtok_output: Some(15.0),
        };
        let v = serde_json::to_value(&original).expect("序列化应成功");
        let restored: ProviderModelDescriptor = serde_json::from_value(v)
            .expect("往返应成功");
        assert_eq!(restored.slug, original.slug);
        assert_eq!(restored.capabilities, original.capabilities);
        assert_eq!(restored.input_modalities, original.input_modalities);
        assert_eq!(restored.cost_per_mtok_input, original.cost_per_mtok_input);
    }

    #[test]
    fn model_descriptor_empty_modalities_are_omitted() {
        let m = ProviderModelDescriptor {
            slug: "x".to_string(),
            name: "X".to_string(),
            upstream_provider_id: None,
            upstream_provider_name: None,
            default_context_window: None,
            capabilities: None,
            input_modalities: vec![],
            output_modalities: vec![],
            cost_per_mtok_input: None,
            cost_per_mtok_output: None,
        };
        let v = serde_json::to_value(&m).expect("序列化应成功");
        // 空 Vec 应被 skip_serializing_if 跳过
        assert!(v.get("inputModalities").is_none());
        assert!(v.get("outputModalities").is_none());
        assert!(v.get("capabilities").is_none());
        assert!(v.get("costPerMtokInput").is_none());
        assert!(v.get("costPerMtokOutput").is_none());
        // 必填字段保留
        assert_eq!(v["slug"], "x");
        assert_eq!(v["name"], "X");
    }

    // ---- ProviderKind 派生检查 ----

    #[test]
    fn provider_kind_derives_hash() {
        // ProviderKind 必须实现 Hash（用于 Circuit Breaker / Health cache 的 HashSet key）
        use std::collections::HashSet;
        let mut set = HashSet::new();
        set.insert(ProviderKind::Codex);
        set.insert(ProviderKind::ClaudeAgent);
        set.insert(ProviderKind::Glm);
        set.insert(ProviderKind::DeepSeek);
        set.insert(ProviderKind::Moonshot);
        set.insert(ProviderKind::Qwen);
        set.insert(ProviderKind::Mimo);
        set.insert(ProviderKind::MiniMax);
        assert_eq!(set.len(), 8);
        // 重复插入不影响
        set.insert(ProviderKind::Codex);
        assert_eq!(set.len(), 8);
    }
}

