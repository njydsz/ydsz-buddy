//! OpenAI Codex provider adapter.
//!
//! Codex exposes an OpenAI-compatible chat completions API. This adapter
//! targets the official `/v1/chat/completions` endpoint and therefore also
//! works with any OpenAI-compatible base URL (useful for local gateways).

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

/// OpenAI chat message.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct CodexMessage {
    role: String,
    content: String,
}

/// OpenAI chat completions request.
#[derive(Debug, Serialize)]
struct CodexRequest {
    model: String,
    messages: Vec<CodexMessage>,
    max_tokens: u32,
    stream: bool,
}

/// OpenAI streaming delta.
#[derive(Debug, Deserialize)]
struct CodexStreamDelta {
    content: Option<String>,
}

/// OpenAI streaming choice.
#[derive(Debug, Deserialize)]
struct CodexStreamChoice {
    delta: CodexStreamDelta,
}

/// OpenAI streaming SSE event.
#[derive(Debug, Deserialize)]
struct CodexStreamEvent {
    choices: Vec<CodexStreamChoice>,
}

/// OpenAI non-streaming choice.
#[derive(Debug, Deserialize)]
struct CodexChoice {
    message: CodexMessage,
}

/// OpenAI non-streaming response.
#[derive(Debug, Deserialize)]
struct CodexResponse {
    choices: Vec<CodexChoice>,
    usage: Option<CodexUsage>,
}

/// OpenAI token usage.
#[derive(Debug, Deserialize)]
struct CodexUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
}

/// Codex session state.
#[derive(Clone)]
#[allow(dead_code)]
struct CodexSession {
    id: String,
    model: String,
    messages: Vec<CodexMessage>,
}

/// OpenAI Codex provider adapter.
pub struct CodexAdapter {
    config: HttpProviderConfig,
    sessions: Arc<DashMap<String, CodexSession>>,
    client: reqwest::Client,
}

impl CodexAdapter {
    /// Create a new Codex adapter reading `OPENAI_API_KEY` from the environment.
    pub fn new() -> Self {
        let api_key = std::env::var("OPENAI_API_KEY").ok();
        let config = HttpProviderConfig::new("https://api.openai.com").with_api_key(
            api_key.unwrap_or_default(),
        );
        Self::with_config(config)
    }

    /// Create a Codex adapter with explicit configuration.
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
            .ok_or(ProviderAdapterError::NotConfigured(ProviderName::Codex))
    }

    fn push_message(&self, session_id: &str, role: &str, content: &str) -> Result<()> {
        let mut session = self
            .sessions
            .get_mut(session_id)
            .ok_or_else(|| ProviderAdapterError::SessionNotFound(session_id.to_string()))?;
        session.messages.push(CodexMessage {
            role: role.to_string(),
            content: content.to_string(),
        });
        Ok(())
    }
}

impl Default for CodexAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl ProviderAdapter for CodexAdapter {
    fn info(&self) -> ProviderInfo {
        ProviderInfo {
            name: ProviderName::Codex,
            display_name: "Codex".to_string(),
            models: vec![
                ModelId::new("codex-mini-latest"),
                ModelId::new("codex-latest"),
                ModelId::new("gpt-4o"),
                ModelId::new("gpt-4o-mini"),
            ],
            available: self.is_configured(),
        }
    }

    async fn health(&self) -> Result<ProviderHealth> {
        if !self.is_configured() {
            return Ok(ProviderHealth {
                provider: ProviderName::Codex,
                status: ProviderHealthStatus::Unhealthy,
                last_checked: chrono::Utc::now().to_rfc3339(),
                error: Some("OPENAI_API_KEY not configured".to_string()),
            });
        }

        Ok(ProviderHealth {
            provider: ProviderName::Codex,
            status: ProviderHealthStatus::Healthy,
            last_checked: chrono::Utc::now().to_rfc3339(),
            error: None,
        })
    }

    async fn start_session(&self, model: &ModelId) -> Result<String> {
        let session_id = Uuid::new_v4().to_string();
        let session = CodexSession {
            id: session_id.clone(),
            model: model.0.clone(),
            messages: Vec::new(),
        };

        self.sessions.insert(session_id.clone(), session);
        info!(session_id = %session_id, model = %model, "Started Codex session");

        Ok(session_id)
    }

    async fn send_message(&self, session_id: &str, message: &str) -> Result<Value> {
        let api_key = self.api_key()?;
        self.push_message(session_id, "user", message)?;

        let session = self
            .sessions
            .get(session_id)
            .ok_or_else(|| ProviderAdapterError::SessionNotFound(session_id.to_string()))?;

        let request = CodexRequest {
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

        let codex_response: CodexResponse = parse_json_response(response).await?;

        let assistant_text = codex_response
            .choices
            .first()
            .map(|c| c.message.content.clone())
            .unwrap_or_default();

        self.push_message(session_id, "assistant", &assistant_text)?;

        let usage = codex_response.usage.unwrap_or(CodexUsage {
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

        let request = CodexRequest {
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
                                if let Ok(event) = serde_json::from_str::<CodexStreamEvent>(json_str)
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
                                        session.messages.push(CodexMessage {
                                            role: "assistant".to_string(),
                                            content: collected.clone(),
                                        });
                                    }
                                } else {
                                    session.messages.push(CodexMessage {
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
        info!(session_id = %session_id, "Closed Codex session");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_codex_session_lifecycle() {
        let adapter = CodexAdapter::with_config(
            HttpProviderConfig::new("https://api.openai.com").with_api_key("test-key"),
        );
        let model = ModelId::new("codex-mini-latest");

        let session_id = adapter.start_session(&model).await.unwrap();
        assert!(!session_id.is_empty());

        adapter.close_session(&session_id).await.unwrap();
        assert!(adapter.sessions.get(&session_id).is_none());
    }

    #[tokio::test]
    async fn test_codex_info_without_key() {
        let adapter = CodexAdapter::with_config(HttpProviderConfig::new("https://api.openai.com"));
        let info = adapter.info();
        assert_eq!(info.name, ProviderName::Codex);
        assert!(!info.available);
    }

    #[tokio::test]
    async fn test_codex_info_with_key() {
        let adapter = CodexAdapter::with_config(
            HttpProviderConfig::new("https://api.openai.com").with_api_key("test-key"),
        );
        let info = adapter.info();
        assert!(info.available);
    }
}
