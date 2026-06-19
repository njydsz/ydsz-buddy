//! Provider 相关类型定义

use serde::{Deserialize, Serialize};

/// Provider 类型
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum ProviderKind {
    Codex,
    ClaudeAgent,
    Cursor,
    Gemini,
    Grok,
    Kilo,
    OpenCode,
    Pi,
}

impl std::fmt::Display for ProviderKind {
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

/// 模型选择
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelSelection {
    pub provider: ProviderKind,
    pub model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<ProviderOptions>,
}

/// Provider 选项
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f64>,
}

/// Provider 会话
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSession {
    pub session_id: String,
    pub thread_id: String,
    pub provider: ProviderKind,
    pub model: String,
    pub status: ProviderSessionStatus,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// Provider 会话状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProviderSessionStatus {
    Starting,
    Running,
    Idle,
    Stopped,
    Error,
}

/// Provider 能力
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCapabilities {
    pub supports_review: bool,
    pub supports_fork: bool,
    pub supports_compact: bool,
    pub supports_steering: bool,
    pub supports_user_input: bool,
}

/// Provider 运行时事件
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "_tag", rename_all = "camelCase")]
pub enum ProviderRuntimeEvent {
    SessionStarted {
        session_id: String,
        thread_id: String,
    },
    SessionStopped {
        session_id: String,
    },
    TurnStarted {
        session_id: String,
        turn_id: String,
    },
    TurnCompleted {
        session_id: String,
        turn_id: String,
    },
    TurnDelta {
        session_id: String,
        turn_id: String,
        delta: String,
    },
    TurnInterrupted {
        session_id: String,
        turn_id: String,
    },
    ApprovalRequested {
        session_id: String,
        turn_id: String,
        request_id: String,
        description: String,
    },
    UserInputRequested {
        session_id: String,
        turn_id: String,
        request_id: String,
        prompt: String,
    },
    Error {
        session_id: String,
        message: String,
    },
}

/// Provider 状态
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
    pub provider: ProviderKind,
    pub available: bool,
    pub version: Option<String>,
    pub error: Option<String>,
    pub checked_at: chrono::DateTime<chrono::Utc>,
}

/// Provider 使用快照
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderUsageSnapshot {
    pub provider: ProviderKind,
    pub model: String,
    pub requests_today: u64,
    pub tokens_used: u64,
    pub rate_limit_remaining: Option<u64>,
}

/// Provider 会话启动输入
#[derive(Debug, Clone)]
pub struct ProviderSessionStartInput {
    pub thread_id: String,
    pub provider: ProviderKind,
    pub model: String,
}

/// Turn 启动输入
#[derive(Debug, Clone)]
pub struct TurnInput {
    pub thread_id: String,
    pub turn_id: String,
    pub provider: ProviderKind,
}

/// Turn 启动结果
#[derive(Debug, Clone)]
pub struct ProviderTurnStartResult {
    pub turn_id: String,
    pub thread_id: String,
}
