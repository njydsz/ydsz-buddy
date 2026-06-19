//! Anthropic Claude Provider 适配器。

use crate::common::{build_http_client, parse_json_response};
use crate::config::HttpProviderConfig;
use crate::errors::ProviderAdapterError;
use crate::traits::ProviderAdapter;
use dashmap::DashMap;
use futures::{Stream, StreamExt};
use remi_contracts::{
    ModelId, ProviderHealth, ProviderHealthStatus, ProviderInfo, ProviderName,
};
use remi_core::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::pin::Pin;
use std::sync::Arc;
use tracing::{error, info};
use uuid::Uuid;

/// Anthropic API 消息。
#[derive(Debug, Clone, Serialize)]
struct ClaudeMessage {
    role: String,
    content: String,
}

/// Anthropic API 请求。
#[derive(Debug, Serialize)]
struct ClaudeRequest {
    model: String,
    messages: Vec<ClaudeMessage>,
    max_tokens: u32,
    stream: bool,
}

/// Anthropic API 内容块。
#[derive(Debug, Deserialize)]
struct ClaudeContent {
    r#type: String,
    text: Option<String>,
}

/// Anthropic API 用量。
#[derive(Debug, Deserialize)]
struct ClaudeUsage {
    input_tokens: u32,
    output_tokens: u32,
}

/// Anthropic API 非流式响应。
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct ClaudeResponse {
    id: String,
    content: Vec<ClaudeContent>,
    usage: ClaudeUsage,
}

/// Anthropic 流式 SSE 事件。
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct ClaudeStreamEvent {
    r#type: String,
    delta: Option<ClaudeStreamDelta>,
    content_block: Option<ClaudeContent>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct ClaudeStreamDelta {
    r#type: String,
    text: Option<String>,
}

/// Claude 会话状态。
#[derive(Clone)]
#[allow(dead_code)]
struct ClaudeSession {
    id: String,
    model: String,
    messages: Vec<ClaudeMessage>,
}

/// Anthropic Claude HTTP Provider 适配器。
pub struct ClaudeAdapter {
    config: HttpProviderConfig,
    sessions: Arc<DashMap<String, ClaudeSession>>,
    client: reqwest::Client,
}

impl ClaudeAdapter {
    /// 创建新的 Claude 适配器，从环境变量 `ANTHROPIC_API_KEY` 读取。
    pub fn new() -> Self {
        let api_key = std::env::var("ANTHROPIC_API_KEY").ok();
        let config = HttpProviderConfig::new("https://api.anthropic.com").with_api_key(
            api_key.unwrap_or_default(),
        );
        Self::with_config(config)
    }

    /// 使用显式配置创建 Claude 适配器。
    pub fn with_config(config: HttpProviderConfig) -> Self {
        let client = build_http_client(config.timeout).unwrap_or_else(|e| {
            error!(error = %e, "构建 HTTP 客户端失败；回退到默认实现");
            reqwest::Client::new()
        });
        Self {
            config,
            sessions: Arc::new(DashMap::new()),
            client,
        }
    }

    /// 若适配器已配置 API 密钥则返回 true。
    fn is_configured(&self) -> bool {
        self.config
            .api_key
            .as_ref()
            .is_some_and(|k| !k.is_empty())
    }

    /// 获取已配置的 API 密钥。
    fn api_key(&self) -> Result<&str, ProviderAdapterError> {
        self.config
            .api_key
            .as_deref()
            .filter(|k| !k.is_empty())
            .ok_or(ProviderAdapterError::NotConfigured(ProviderName::Claude))
    }

    /// 将消息追加到会话的对话历史。
    fn push_message(&self, session_id: &str, role: &str, content: &str) -> Result<()> {
        let mut session = self
            .sessions
            .get_mut(session_id)
            .ok_or_else(|| ProviderAdapterError::SessionNotFound(session_id.to_string()))?;
        session.messages.push(ClaudeMessage {
            role: role.to_string(),
            content: content.to_string(),
        });
        Ok(())
    }
}

impl Default for ClaudeAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl ProviderAdapter for ClaudeAdapter {
    fn info(&self) -> ProviderInfo {
        ProviderInfo {
            name: ProviderName::Claude,
            display_name: "Claude".to_string(),
            models: vec![
                ModelId::new("claude-3-5-sonnet-20241022"),
                ModelId::new("claude-3-opus-20240229"),
                ModelId::new("claude-3-sonnet-20240229"),
                ModelId::new("claude-3-haiku-20240307"),
            ],
            available: self.is_configured(),
        }
    }

    async fn health(&self) -> Result<ProviderHealth> {
        if !self.is_configured() {
            return Ok(ProviderHealth {
                provider: ProviderName::Claude,
                status: ProviderHealthStatus::Unhealthy,
                last_checked: chrono::Utc::now().to_rfc3339(),
                error: Some("ANTHROPIC_API_KEY 未配置".to_string()),
            });
        }

        Ok(ProviderHealth {
            provider: ProviderName::Claude,
            status: ProviderHealthStatus::Healthy,
            last_checked: chrono::Utc::now().to_rfc3339(),
            error: None,
        })
    }

    async fn start_session(&self, model: &ModelId) -> Result<String> {
        let session_id = Uuid::new_v4().to_string();
        let session = ClaudeSession {
            id: session_id.clone(),
            model: model.0.clone(),
            messages: Vec::new(),
        };

        self.sessions.insert(session_id.clone(), session);
        info!(session_id = %session_id, model = %model, "已启动 Claude 会话");

        Ok(session_id)
    }

    async fn send_message(&self, session_id: &str, message: &str) -> Result<Value> {
        let api_key = self.api_key()?;
        self.push_message(session_id, "user", message)?;

        let session = self
            .sessions
            .get(session_id)
            .ok_or_else(|| ProviderAdapterError::SessionNotFound(session_id.to_string()))?;

        let request = ClaudeRequest {
            model: session.model.clone(),
            messages: session.messages.clone(),
            max_tokens: self.config.max_tokens,
            stream: false,
        };

        let response = self
            .client
            .post(format!("{}/v1/messages", self.config.base_url))
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| ProviderAdapterError::Transport(e.to_string()))?;

        let claude_response: ClaudeResponse = parse_json_response(response).await?;

        let assistant_text = claude_response
            .content
            .iter()
            .filter(|c| c.r#type == "text")
            .filter_map(|c| c.text.as_ref())
            .cloned()
            .collect::<Vec<_>>()
            .join("\n");

        self.push_message(session_id, "assistant", &assistant_text)?;

        Ok(serde_json::json!({
            "response": assistant_text,
            "usage": {
                "input_tokens": claude_response.usage.input_tokens,
                "output_tokens": claude_response.usage.output_tokens,
            }
        }))
    }

    async fn stream_response(
        &self,
        session_id: &str,
        message: &str,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String>> + Send>>> {
        let api_key = self.api_key()?.to_string();
        self.push_message(session_id, "user", message)?;

        let session = self
            .sessions
            .get(session_id)
            .ok_or_else(|| ProviderAdapterError::SessionNotFound(session_id.to_string()))?;

        let request = ClaudeRequest {
            model: session.model.clone(),
            messages: session.messages.clone(),
            max_tokens: self.config.max_tokens,
            stream: true,
        };

        let base_url = self.config.base_url.clone();
        let client = self.client.clone();
        let sessions = self.sessions.clone();
        let owned_session_id = session_id.to_string();

        let response = client
            .post(format!("{}/v1/messages", base_url))
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| ProviderAdapterError::Transport(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
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

        let stream = response.bytes_stream().filter_map(move |chunk_result| {
            let sessions = sessions.clone();
            let session_id = owned_session_id.clone();

            async move {
                match chunk_result {
                    Ok(chunk) => {
                        let text = String::from_utf8_lossy(&chunk);
                        let mut collected = String::new();
                        for line in text.lines() {
                            if let Some(json_str) = line.strip_prefix("data: ") {
                                if json_str.trim() == "[DONE]" {
                                    continue;
                                }
                                if let Ok(event) = serde_json::from_str::<ClaudeStreamEvent>(json_str) {
                                    if let Some(delta) = &event.delta {
                                        if delta.r#type == "text_delta" {
                                            if let Some(text) = &delta.text {
                                                collected.push_str(text);
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        if !collected.is_empty() {
                            if let Some(mut session) = sessions.get_mut(&session_id) {
                                if let Some(last) = session.messages.last_mut() {
                                    if last.role == "assistant" {
                                        last.content.push_str(&collected);
                                    } else {
                                        session.messages.push(ClaudeMessage {
                                            role: "assistant".to_string(),
                                            content: collected.clone(),
                                        });
                                    }
                                } else {
                                    session.messages.push(ClaudeMessage {
                                        role: "assistant".to_string(),
                                        content: collected.clone(),
                                    });
                                }
                            }
                            Some(Ok(collected))
                        } else {
                            None
                        }
                    }
                    Err(e) => Some(Err(ProviderAdapterError::Stream(e.to_string()).into())),
                }
            }
        });

        Ok(Box::pin(stream))
    }

    async fn close_session(&self, session_id: &str) -> Result<()> {
        self.sessions.remove(session_id);
        info!(session_id = %session_id, "已关闭 Claude 会话");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_claude_session_lifecycle() {
        let adapter = ClaudeAdapter::with_config(
            HttpProviderConfig::new("https://api.anthropic.com").with_api_key("test-key"),
        );
        let model = ModelId::new("claude-3-5-sonnet-20241022");

        let session_id = adapter.start_session(&model).await.unwrap();
        assert!(!session_id.is_empty());

        adapter.close_session(&session_id).await.unwrap();
        assert!(adapter.sessions.get(&session_id).is_none());
    }

    #[tokio::test]
    async fn test_claude_info_without_key() {
        let adapter = ClaudeAdapter::with_config(HttpProviderConfig::new(
            "https://api.anthropic.com",
        ));
        let info = adapter.info();
        assert_eq!(info.name, ProviderName::Claude);
        assert!(!info.available);
    }

    #[tokio::test]
    async fn test_claude_info_with_key() {
        let adapter = ClaudeAdapter::with_config(
            HttpProviderConfig::new("https://api.anthropic.com").with_api_key("test-key"),
        );
        let info = adapter.info();
        assert!(info.available);
    }
}
