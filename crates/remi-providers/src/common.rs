//! Shared provider adapter utilities.

use crate::errors::ProviderAdapterError;
use remi_core::Result;
use reqwest::Response;
use serde::de::DeserializeOwned;

/// Parse a successful JSON response, mapping HTTP and parse errors.
pub async fn parse_json_response<T: DeserializeOwned>(response: Response) -> Result<T> {
    let status = response.status();
    if !status.is_success() {
        let message = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
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

/// Build a `reqwest` client with sane defaults for provider adapters.
pub fn build_http_client(
    timeout: std::time::Duration,
) -> Result<reqwest::Client, ProviderAdapterError> {
    reqwest::Client::builder()
        .timeout(timeout)
        .connect_timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| ProviderAdapterError::Transport(e.to_string()))
}
