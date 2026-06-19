//! Provider 适配器错误类型。

use remi_contracts::{ModelId, ProviderName};
use remi_core::Error as CoreError;

/// Provider 特定错误。
#[derive(Debug, thiserror::Error, Clone)]
pub enum ProviderAdapterError {
    /// Provider 未配置（缺少 API 密钥或可执行文件）。
    #[error("provider {0} 未配置")]
    NotConfigured(ProviderName),

    /// 请求的模型不被 Provider 支持。
    #[error("provider {provider} 不支持模型 {model}")]
    ModelNotSupported {
        /// Provider 名称。
        provider: ProviderName,
        /// 模型 ID。
        model: ModelId,
    },

    /// 会话未找到。
    #[error("会话未找到：{0}")]
    SessionNotFound(String),

    /// API 返回错误响应。
    #[error("API 错误（{status}）：{message}")]
    ApiError {
        /// HTTP 状态码。
        status: u16,
        /// 错误消息。
        message: String,
    },

    /// 网络或传输错误。
    #[error("传输错误：{0}")]
    Transport(String),

    /// 解析 Provider 响应失败。
    #[error("解析错误：{0}")]
    Parse(String),

    /// 超出速率限制。
    #[error("超出速率限制")]
    RateLimitExceeded,

    /// 流式传输错误。
    #[error("流错误：{0}")]
    Stream(String),

    /// 内部 Provider 错误。
    #[error("内部错误：{0}")]
    Internal(String),
}

impl From<ProviderAdapterError> for CoreError {
    fn from(err: ProviderAdapterError) -> Self {
        CoreError::Provider(err.to_string())
    }
}
