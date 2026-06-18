//! Provider adapter error types.

use remi_contracts::{ModelId, ProviderName};
use remi_core::Error as CoreError;

/// Provider-specific errors.
#[derive(Debug, thiserror::Error, Clone)]
pub enum ProviderAdapterError {
    /// Provider is not configured (missing API key or executable).
    #[error("provider {0} is not configured")]
    NotConfigured(ProviderName),

    /// Requested model is not supported by the provider.
    #[error("model {model} is not supported by provider {provider}")]
    ModelNotSupported {
        /// Provider name.
        provider: ProviderName,
        /// Model ID.
        model: ModelId,
    },

    /// Session was not found.
    #[error("session not found: {0}")]
    SessionNotFound(String),

    /// API returned an error response.
    #[error("API error ({status}): {message}")]
    ApiError {
        /// HTTP status code.
        status: u16,
        /// Error message.
        message: String,
    },

    /// Network or transport error.
    #[error("transport error: {0}")]
    Transport(String),

    /// Failed to parse provider response.
    #[error("parse error: {0}")]
    Parse(String),

    /// Rate limit was exceeded.
    #[error("rate limit exceeded")]
    RateLimitExceeded,

    /// Streaming error.
    #[error("stream error: {0}")]
    Stream(String),

    /// Internal provider error.
    #[error("internal error: {0}")]
    Internal(String),
}

impl From<ProviderAdapterError> for CoreError {
    fn from(err: ProviderAdapterError) -> Self {
        CoreError::Provider(err.to_string())
    }
}
