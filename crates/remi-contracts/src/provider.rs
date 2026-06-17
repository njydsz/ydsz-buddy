//! Provider schemas.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::ModelId;

/// Provider name.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ProviderName {
    /// Anthropic Claude.
    Claude,
    /// OpenAI Codex.
    Codex,
    /// Cursor.
    Cursor,
    /// Google Gemini.
    Gemini,
    /// Grok.
    Grok,
    /// OpenCode.
    OpenCode,
    /// Pi.
    Pi,
    /// Kilo.
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

/// Provider information.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ProviderInfo {
    /// Provider name.
    pub name: ProviderName,
    /// Display name.
    pub display_name: String,
    /// Available models.
    pub models: Vec<ModelId>,
    /// Whether the provider is available.
    pub available: bool,
}

/// Provider health status.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ProviderHealth {
    /// Provider name.
    pub provider: ProviderName,
    /// Health status.
    pub status: ProviderHealthStatus,
    /// Last checked timestamp (ISO 8601).
    pub last_checked: String,
    /// Error message (if unhealthy).
    pub error: Option<String>,
}

/// Provider health status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ProviderHealthStatus {
    /// Provider is healthy.
    Healthy,
    /// Provider is degraded.
    Degraded,
    /// Provider is unhealthy.
    Unhealthy,
    /// Provider status is unknown.
    Unknown,
}

/// Provider session information.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ProviderSession {
    /// Session ID.
    pub id: String,
    /// Provider name.
    pub provider: ProviderName,
    /// Model ID.
    pub model: ModelId,
    /// Created timestamp (ISO 8601).
    pub created_at: String,
    /// Last activity timestamp (ISO 8601).
    pub last_activity: String,
}

/// Provider error.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, thiserror::Error)]
#[serde(tag = "_tag")]
pub enum ProviderError {
    /// Provider not found.
    #[error("provider not found: {provider}")]
    ProviderNotFound { provider: ProviderName },
    /// Model not found.
    #[error("model not found: {model}")]
    ModelNotFound { model: ModelId },
    /// API error.
    #[error("API error: {message}")]
    ApiError { message: String },
    /// Rate limit exceeded.
    #[error("rate limit exceeded")]
    RateLimitExceeded,
    /// Internal error.
    #[error("internal error: {message}")]
    Internal { message: String },
}
