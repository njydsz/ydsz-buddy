//! Provider 适配器配置。

use std::time::Duration;

/// HTTP Provider 适配器共享配置。
#[derive(Debug, Clone)]
pub struct HttpProviderConfig {
    /// Provider 的 API 密钥。
    pub api_key: Option<String>,
    /// Provider API 的基础 URL。
    pub base_url: String,
    /// 请求超时时间。
    pub timeout: Duration,
    /// 请求的最大 token 数。
    pub max_tokens: u32,
}

impl HttpProviderConfig {
    /// 使用指定的基础 URL 创建新配置。
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            api_key: None,
            base_url: base_url.into(),
            timeout: Duration::from_secs(120),
            max_tokens: 4096,
        }
    }

    /// 设置 API 密钥。
    pub fn with_api_key(mut self, api_key: impl Into<String>) -> Self {
        self.api_key = Some(api_key.into());
        self
    }

    /// 设置请求超时时间。
    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    /// 设置最大 token 数。
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
