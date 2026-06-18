//! xAI Grok provider adapter.
//!
//! Targets the xAI REST API (`v1/chat/completions`). Reads `XAI_API_KEY`
//! from the environment.

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

/// xAI chat message.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct GrokMessage {
    role: String,
    content: String,
}

/// xAI chat completions request.
#[derive(Debug, Serialize)]
struct GrokRequest {
    model: String,
    messages: Vec<GrokMessage>,
    max_tokens: u32,
    stream: bool,
}

/// xAI streaming delta.
#[derive(Debug, Deserialize)]
struct GrokStreamDelta {
    content: Option<String>,
}

/// xAI streaming choice.
#[derive(Debug, Deserialize)]
struct GrokStreamChoice {
    delta: GrokStreamDelta,
}

/// xAI streaming SSE event.
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct GrokStreamEvent {
    choices: Vec<GrokStreamChoice>,
}

/// xAI non-streaming choice.
#[derive(Debug, Deserialize)]
struct GrokChoice {
    message: GrokMessage,
}

/// xAI non-streaming response.
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct GrokResponse {
    choices: Vec<GrokChoice>,
    usage: Option<GrokUsage>,
}

/// xAI token usage.
#[derive(Debug, Deserialize)]
struct GrokUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
}

/// Grok session state.
#[derive(Clone)]
#[allow(dead_code)]
struct GrokSession {
    id: String,
    model: String,
    messages: Vec<GrokMessage>,
}

/// xAI Grok provider adapter.
pub struct GrokAdapter {
    config: HttpProviderConfig,
    sessions: Arc<DashMap<String, GrokSession>>,
    client: reqwest::Client,
}

impl GrokAdapter {
    /// Create a new Grok adapter reading `XAI_API_KEY` from the environment.
    pub fn new() -> Self {
        let api_key = std::env::var("XAI_API_KEY").ok();
        let config = HttpProviderConfig::new("https://api.x.ai").with_api_key(
            api_key.unwrap_or_default(),
        );
        Self::with_config(config)
    }

    /// Create a Grok adapter with explicit configuration.
    pub fn with_config(config: HttpProviderConfig) -> Self {
        let client = build_http_client(config.timeout).unwrap_or_else(|e| {
            error!(error = %e, "Failed to build HTTP client; falling back to default");
            reqwest::Client::new()
        });
        Self {
            config,
            sessions: Arc::new(DashMap::new()),
            client,
        }
    }

    fn is_configured(&self) -> bool {
        self.config
            .api_key
            .as_ref()
            .is_some_and(|k| !k.is_empty())
    }

    fn api_key(&self) -> Result<&str, ProviderAdapterError> {
        self.config
            .api_key
            .as_deref()
            .filter(|k| !k.is_empty())
            .ok_or(ProviderAdapterError::NotConfigured(ProviderName::Grok))
    }

    fn push_message(&self, session_id: &str, role: &str, content: &str) -> Result<()> {
        let mut session = self
            .sessions
            .get_mut(session_id)
            .ok_or_else(|| ProviderAdapterError::SessionNotFound(session_id.to_string()))?;
        session.messages.push(GrokMessage {
            role: role.to_string(),
            content: content.to_string(),
        });
        Ok(())
    }
}

impl Default for GrokAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl ProviderAdapter for GrokAdapter {
    fn info(&self) -> ProviderInfo {
        ProviderInfo {
            name: ProviderName::Grok,
            display_name: "Grok".to_string(),
            models: vec![
                ModelId::new("grok-2-latest"),
                ModelId::new("grok-2-vision-latest"),
            ],
            available: self.is_configured(),
        }
    }

    async fn health(&self) -> Result<ProviderHealth> {
        if !self.is_configured() {
            return Ok(ProviderHealth {
                provider: ProviderName::Grok,
                status: ProviderHealthStatus::Unhealthy,
                last_checked: chrono::Utc::now().to_rfc3339(),
                error: Some("XAI_API_KEY not configured".to_string()),
            });
        }

        Ok(ProviderHealth {
            provider: ProviderName::Grok,
            status: ProviderHealthStatus::Healthy,
            last_checked: chrono::Utc::now().to_rfc3339(),
            error: None,
        })
    }

    async fn start_session(&self, model: &ModelId) -> Result<String> {
        let session_id = Uuid::new_v4().to_string();
        let session = GrokSession {
            id: session_id.clone(),
            model: model.0.clone(),
            messages: Vec::new(),
        };

        self.sessions.insert(session_id.clone(), session);
        info!(session_id = %session_id, model = %model, "Started Grok session");

        Ok(session_id)
    }

    async fn send_message(&self, session_id: &str, message: &str) -> Result<Value> {
        let api_key = self.api_key()?;
        self.push_message(session_id, "user", message)?;

        let session = self
            .sessions
            .get(session_id)
            .ok_or_else(|| ProviderAdapterError::SessionNotFound(session_id.to_string()))?;

        let request = GrokRequest {
            model: session.model.clone(),
            messages: session.messages.clone(),
            max_tokens: self.config.max_tokens,
            stream: false,
        };

        let response = self
            .client
            .post(format!("{}/v1/chat/completions", self.config.base_url))
            .bearer_auth(api_key)
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| ProviderAdapterError::Transport(e.to_string()))?;

        let grok_response: GrokResponse = parse_json_response(response).await?;

        let assistant_text = grok_response
            .choices
            .first()
            .map(|c| c.message.content.clone())
            .unwrap_or_default();

        self.push_message(session_id, "assistant", &assistant_text)?;

        let usage = grok_response.usage.unwrap_or(GrokUsage {
            prompt_tokens: 0,
            completion_tokens: 0,
        });

        Ok(serde_json::json!({
            "response": assistant_text,
            "usage": {
                "prompt_tokens": usage.prompt_tokens,
                "completion_tokens": usage.completion_tokens,
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

        let request = GrokRequest {
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
            .post(format!("{}/v1/chat/completions", base_url))
            .bearer_auth(api_key)
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
                .unwrap_or_else(|_| "Unknown error".to_string());
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
                                if let Ok(event) = serde_json::from_str::<GrokStreamEvent>(json_str)
                                {
                                    for choice in &event.choices {
                                        if let Some(content) = &choice.delta.content {
                                            collected.push_str(content);
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
                                        session.messages.push(GrokMessage {
                                            role: "assistant".to_string(),
                                            content: collected.clone(),
                                        });
                                    }
                                } else {
                                    session.messages.push(GrokMessage {
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
        info!(session_id = %session_id, "Closed Grok session");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_grok_session_lifecycle() {
        let adapter = GrokAdapter::with_config(
            HttpProviderConfig::new("https://api.x.ai").with_api_key("test-key"),
        );
        let model = ModelId::new("grok-2-latest");

        let session_id = adapter.start_session(&model).await.unwrap();
        assert!(!session_id.is_empty());

        adapter.close_session(&session_id).await.unwrap();
        assert!(adapter.sessions.get(&session_id).is_none());
    }

    #[tokio::test]
    async fn test_grok_info_availability() {
        let adapter = GrokAdapter::with_config(HttpProviderConfig::new("https://api.x.ai"));
        let info = adapter.info();
        assert_eq!(info.name, ProviderName::Grok);
        assert!(!info.available);

        let adapter_with_key = GrokAdapter::with_config(
            HttpProviderConfig::new("https://api.x.ai").with_api_key("test-key"),
        );
        assert!(adapter_with_key.info().available);
    }
}
