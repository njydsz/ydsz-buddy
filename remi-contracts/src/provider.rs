//! 提供者模式定义。

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::ModelId;

/// 提供者名称。
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ProviderName {
    /// Anthropic Claude。
    Claude,
    /// OpenAI Codex。
    Codex,
    /// Cursor。
    Cursor,
    /// Google Gemini。
    Gemini,
    /// Grok。
    Grok,
    /// OpenCode。
    OpenCode,
    /// Pi。
    Pi,
    /// Kilo。
    Kilo,
}

impl std::fmt::Display for ProviderName {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Claude => write!(f, "claude"),
            Self::Codex => write!(f, "codex"),
            Self::Cursor => write!(f, "cursor"),
            Self::Gemini => write!(f, "gemini"),
            Self::Grok => write!(f, "grok"),
            Self::OpenCode => write!(f, "opencode"),
            Self::Pi => write!(f, "pi"),
            Self::Kilo => write!(f, "kilo"),
        }
    }
}

/// 提供者信息。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ProviderInfo {
    /// 提供者名称。
    pub name: ProviderName,
    /// 显示名称。
    pub display_name: String,
    /// 可用模型列表。
    pub models: Vec<ModelId>,
    /// 提供者是否可用。
    pub available: bool,
}

/// 提供者健康状态。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ProviderHealth {
    /// 提供者名称。
    pub provider: ProviderName,
    /// 健康状态。
    pub status: ProviderHealthStatus,
    /// 最近检查时间戳（ISO 8601 格式）。
    pub last_checked: String,
    /// 错误信息（状态不健康时存在）。
    pub error: Option<String>,
}

/// 提供者健康状态枚举。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ProviderHealthStatus {
    /// 提供者运行正常。
    Healthy,
    /// 提供者性能下降。
    Degraded,
    /// 提供者不可用。
    Unhealthy,
    /// 提供者状态未知。
    Unknown,
}

/// 提供者会话信息。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ProviderSession {
    /// 会话 ID。
    pub id: String,
    /// 提供者名称。
    pub provider: ProviderName,
    /// 模型 ID。
    pub model: ModelId,
    /// 创建时间戳（ISO 8601 格式）。
    pub created_at: String,
    /// 最近活动时间戳（ISO 8601 格式）。
    pub last_activity: String,
}

/// 提供者错误类型。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, thiserror::Error)]
#[serde(tag = "_tag")]
pub enum ProviderError {
    /// 提供者未找到。
    #[error("提供者未找到: {provider}")]
    ProviderNotFound { provider: ProviderName },
    /// 模型未找到。
    #[error("模型未找到: {model}")]
    ModelNotFound { model: ModelId },
    /// API 错误。
    #[error("API 错误: {message}")]
    ApiError { message: String },
    /// 超出速率限制。
    #[error("超出速率限制")]
    RateLimitExceeded,
    /// 内部错误。
    #[error("内部错误: {message}")]
    Internal { message: String },
}

/// 列出提供者命令的输入参数。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ProviderListCommandsInput {
    /// 提供者名称。
    pub provider: ProviderName,
    /// 当前工作目录。
    pub cwd: String,
    /// 线程 ID（可选）。
    pub thread_id: Option<String>,
    /// 代理目录（可选）。
    pub agent_dir: Option<String>,
    /// 是否强制重新加载（可选）。
    pub force_reload: Option<bool>,
}

/// 提供者原生命令描述符。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ProviderNativeCommandDescriptor {
    /// 命令名称。
    pub name: String,
    /// 命令描述。
    pub description: Option<String>,
}

/// 列出提供者命令的输出。
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ProviderListCommandsOutput {
    /// 命令列表。
    pub commands: Vec<ProviderNativeCommandDescriptor>,
    /// 命令来源。
    pub source: Option<String>,
    /// 命令是否来自缓存。
    pub cached: Option<bool>,
}
