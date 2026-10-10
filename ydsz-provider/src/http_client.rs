//! # 共享 HTTP 客户端
//!
//! 提供统一的 reqwest::Client 工厂，配置连接超时、读取超时和重试策略。
//! 所有 HTTP-based Provider 适配器共享同一连接池配置。

use std::time::Duration;

use reqwest::Client;

/// 默认连接超时（TCP 三次握手最大等待时间）
const DEFAULT_CONNECT_TIMEOUT: Duration = Duration::from_secs(15);

/// 默认整体请求超时（包括流式传输的一次 chunk 间隔）
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(120);

/// 创建共享 HTTP 客户端
///
/// 配置要点：
/// - `timeout`: 单次 chunk 的最大等待时间（流式传输中每个 SSE chunk 间隔不应超过此值）
/// - `connect_timeout`: TCP 连接建立超时
/// - `http2_prior_knowledge`: 强制使用 HTTP/2 多路复用，所有 Provider 均支持
pub fn create_http_client() -> Result<Client, reqwest::Error> {
    Client::builder()
        .connect_timeout(DEFAULT_CONNECT_TIMEOUT)
        .timeout(DEFAULT_TIMEOUT)
        .http2_prior_knowledge()
        .user_agent("ydsz-buddy/0.3.0")
        .build()
}

/// Provider 端点配置
#[derive(Debug, Clone)]
pub struct EndpointConfig {
    pub base_url: String,
    pub api_key: String,
}

impl EndpointConfig {
    /// 创建新的端点配置
    pub fn new(base_url: impl Into<String>, api_key: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            api_key: api_key.into(),
        }
    }

    /// 拼接完整 URL
    pub fn join(&self, path: &str) -> String {
        format!("{}{}", self.base_url, path)
    }
}

/// 标准错误类型
#[derive(Debug, thiserror::Error)]
pub enum HttpError {
    #[error("HTTP request failed: {0}")]
    Request(#[from] reqwest::Error),

    #[error("API returned error (status {status}): {body}")]
    ApiError {
        status: u16,
        body: String,
    },

    #[error("SSE stream parse error: {0}")]
    SseParse(String),
}

/// 从 Response 提取错误信息
pub async fn extract_api_error(resp: reqwest::Response) -> HttpError {
    let status = resp.status().as_u16();
    let body = resp.text().await.unwrap_or_default();
    HttpError::ApiError { status, body }
}
