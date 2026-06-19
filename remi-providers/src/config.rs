//! Provider adapter configuration.

use std::time::Duration;

/// Configuration shared by HTTP-based provider adapters.
#[derive(Debug, Clone)]
pub struct HttpProviderConfig {
    /// API key for the provider.
    pub api_key: Option<String>,
    /// Base URL for the provider API.
    pub base_url: String,
    /// Request timeout.
    pub timeout: Duration,
    /// Maximum tokens to request.
    pub max_tokens: u32,
}

impl HttpProviderConfig {
    /// Create a new config with the given base URL.
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            api_key: None,
            base_url: base_url.into(),
            timeout: Duration::from_secs(120),
            max_tokens: 4096,
        }
    }

    /// Set the API key.
    pub fn with_api_key(mut self, api_key: impl Into<String>) -> Self {
        self.api_key = Some(api_key.into());
        self
    }

    /// Set the request timeout.
    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    /// Set the max tokens.
    pub fn with_max_tokens(mut self, max_tokens: u32) -> Self {
        self.max_tokens = max_tokens;
        self
    }
}

impl Default for HttpProviderConfig {
    fn default() -> Self {
        Self::new("https://api.anthropic.com")
    }
}
