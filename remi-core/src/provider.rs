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

/// # Provider 运行时事件
///
/// Provider 在运行时产生的事件，用于驱动状态更新和 UI 刷新。
/// 事件采用带标签的枚举（tagged enum），便于序列化时区分变体。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "_tag", rename_all = "camelCase")]
pub enum ProviderRuntimeEvent {
    /// 会话已启动
    SessionStarted {
        /// 会话 ID
        session_id: String,
        /// 关联的线程 ID
        thread_id: String,
    },
    /// 会话状态更新
    SessionUpdate {
        /// 会话 ID
        session_id: String,
        /// 更新数据
        data: serde_json::Value,
    },
    /// 会话已停止
    SessionStopped {
        /// 会话 ID
        session_id: String,
    },
    /// Turn 已开始
    TurnStarted {
        /// 会话 ID
        session_id: String,
        /// Turn ID
        turn_id: String,
    },
    /// Turn 已完成
    TurnCompleted {
        /// 会话 ID
        session_id: String,
        /// Turn ID
        turn_id: String,
    },
    /// Turn 完成（携带结果数据）
    TurnComplete {
        /// Turn ID
        turn_id: String,
        /// 结果数据
        result: serde_json::Value,
    },
    /// Turn 流式输出增量
    TurnDelta {
        /// 会话 ID
        session_id: String,
        /// Turn ID
        turn_id: String,
        /// 增量文本内容
        delta: String,
    },
    /// Turn 被中断
    TurnInterrupted {
        /// 会话 ID
        session_id: String,
        /// Turn ID
        turn_id: String,
    },
    /// 请求用户审批
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
