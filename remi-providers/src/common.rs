//! 共享的 Provider 适配器工具函数。

use crate::errors::ProviderAdapterError;
use remi_core::Result;
use reqwest::Response;
use serde::de::DeserializeOwned;

/// 解析成功的 JSON 响应，映射 HTTP 和解析错误。
pub async fn parse_json_response<T: DeserializeOwned>(response: Response) -> Result<T> {
    let status = response.status();
    if !status.is_success() {
        let message = response
            .text()
            .await
            .unwrap_or_else(|_| "未知错误".to_string());
        return Err(ProviderAdapterError::ApiError {
            status: status.as_u16(),
            message,
        }
        .into());
    }

    response
        .json::<T>()
        .await
        .map_err(|e| ProviderAdapterError::Parse(e.to_string()).into())
}

/// 使用合理的默认配置构建 `reqwest` 客户端，供 Provider 适配器使用。
pub fn build_http_client(
    timeout: std::time::Duration,
) -> Result<reqwest::Client, ProviderAdapterError> {
    reqwest::Client::builder()
        .timeout(timeout)
        .connect_timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| ProviderAdapterError::Transport(e.to_string()))
}
