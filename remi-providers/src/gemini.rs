//! Google Gemini provider adapter.
//!
//! Targets the Gemini REST API (`v1beta/models/{model}:generateContent` and
//! `streamGenerateContent`). Reads `GEMINI_API_KEY` from the environment.

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

/// Gemini content part.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct GeminiPart {
    text: String,
}

/// Gemini content.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct GeminiContent {
    role: String,
    parts: Vec<GeminiPart>,
}

/// Gemini generate content request.
#[derive(Debug, Serialize)]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
}

/// Gemini response candidate.
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct GeminiCandidate {
    content: GeminiContent,
}

/// Gemini non-streaming response.
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct GeminiResponse {
    candidates: Vec<GeminiCandidate>,
}

/// Gemini streaming response chunk.
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct GeminiStreamChunk {
    candidates: Vec<GeminiCandidate>,
}

/// Gemini session state.
#[derive(Clone)]
#[allow(dead_code)]
struct GeminiSession {
    id: String,
    model: String,
    messages: Vec<GeminiContent>,
}

/// Google Gemini provider adapter.
pub struct GeminiAdapter {
    config: HttpProviderConfig,
    sessions: Arc<DashMap<String, GeminiSession>>,
    client: reqwest::Client,
}

impl GeminiAdapter {
    /// Create a new Gemini adapter reading `GEMINI_API_KEY` from the environment.
    pub fn new() -> Self {
        let api_key = std::env::var("GEMINI_API_KEY").ok();
        let config = HttpProviderConfig::new("https://generativelanguage.googleapis.com")
            .with_api_key(api_key.unwrap_or_default());
        Self::with_config(config)
    }

    /// Create a Gemini adapter with explicit configuration.
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
            .ok_or(ProviderAdapterError::NotConfigured(ProviderName::Gemini))
    }

    fn push_message(&self, session_id: &str, role: &str, content: &str) -> Result<()> {
        let mut session = self
            .sessions
            .get_mut(session_id)
            .ok_or_else(|| ProviderAdapterError::SessionNotFound(session_id.to_string()))?;
        session.messages.push(GeminiContent {
            role: role.to_string(),
            parts: vec![GeminiPart {
                text: content.to_string(),
            }],
        });
        Ok(())
    }
}

impl Default for GeminiAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl ProviderAdapter for GeminiAdapter {
    fn info(&self) -> ProviderInfo {
        ProviderInfo {
            name: ProviderName::Gemini,
            display_name: "Gemini".to_string(),
            models: vec![
                ModelId::new("gemini-1.5-pro-latest"),
                ModelId::new("gemini-1.5-flash-latest"),
                ModelId::new("gemini-2.0-flash-exp"),
            ],
            available: self.is_configured(),
        }
    }

    async fn health(&self) -> Result<ProviderHealth> {
        if !self.is_configured() {
            return Ok(ProviderHealth {
                provider: ProviderName::Gemini,
                status: ProviderHealthStatus::Unhealthy,
                last_checked: chrono::Utc::now().to_rfc3339(),
                error: Some("GEMINI_API_KEY not configured".to_string()),
            });
        }

        Ok(ProviderHealth {
            provider: ProviderName::Gemini,
            status: ProviderHealthStatus::Healthy,
            last_checked: chrono::Utc::now().to_rfc3339(),
            error: None,
        })
    }

    async fn start_session(&self, model: &ModelId) -> Result<String> {
        let session_id = Uuid::new_v4().to_string();
        let session = GeminiSession {
            id: session_id.clone(),
            model: model.0.clone(),
            messages: Vec::new(),
        };

        self.sessions.insert(session_id.clone(), session);
        info!(session_id = %session_id, model = %model, "Started Gemini session");

        Ok(session_id)
    }

    async fn send_message(&self, session_id: &str, message: &str) -> Result<Value> {
        let api_key = self.api_key()?;
        self.push_message(session_id, "user", message)?;

        let session = self
            .sessions
            .get(session_id)
            .ok_or_else(|| ProviderAdapterError::SessionNotFound(session_id.to_string()))?;

        let request = GeminiRequest {
            contents: session.messages.clone(),
        };

        let model_name = session.model.clone();
        let response = self
            .client
            .post(format!(
                "{}/v1beta/models/{}:generateContent?key={}",
                self.config.base_url, model_name, api_key
            ))
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| ProviderAdapterError::Transport(e.to_string()))?;

        let gemini_response: GeminiResponse = parse_json_response(response).await?;

        let assistant_text = gemini_response
            .candidates
            .first()
            .and_then(|c| c.content.parts.first())
            .map(|p| p.text.clone())
            .unwrap_or_default();

        self.push_message(session_id, "model", &assistant_text)?;

        Ok(serde_json::json!({
            "response": assistant_text,
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

        let request = GeminiRequest {
            contents: session.messages.clone(),
        };

        let model_name = session.model.clone();
        let base_url = self.config.base_url.clone();
        let client = self.client.clone();
        let sessions = self.sessions.clone();
        let owned_session_id = session_id.to_string();

        let response = client
            .post(format!(
                "{}/v1beta/models/{}:streamGenerateContent?key={}",
                base_url, model_name, api_key
            ))
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
                            if line.starts_with("data: ") {
                                if let Some(json_str) = line.strip_prefix("data: ") {
                                    if let Ok(chunk) =
                                        serde_json::from_str::<GeminiStreamChunk>(json_str)
                                    {
                                        for candidate in &chunk.candidates {
                                            for part in &candidate.content.parts {
                                                collected.push_str(&part.text);
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        if !collected.is_empty() {
                            if let Some(mut session) = sessions.get_mut(&session_id) {
                                if let Some(last) = session.messages.last_mut() {
                                    if last.role == "model" {
                                        for part in &mut last.parts {
                                            part.text.push_str(&collected);
                                        }
                                    } else {
                                        session.messages.push(GeminiContent {
                                            role: "model".to_string(),
                                            parts: vec![GeminiPart {
                                                text: collected.clone(),
                                            }],
                                        });
                                    }
                                } else {
                                    session.messages.push(GeminiContent {
                                        role: "model".to_string(),
                                        parts: vec![GeminiPart {
                                            text: collected.clone(),
                                        }],
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
        info!(session_id = %session_id, "Closed Gemini session");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_gemini_session_lifecycle() {
        let adapter = GeminiAdapter::with_config(
            HttpProviderConfig::new("https://generativelanguage.googleapis.com")
                .with_api_key("test-key"),
        );
        let model = ModelId::new("gemini-1.5-pro-latest");

        let session_id = adapter.start_session(&model).await.unwrap();
        assert!(!session_id.is_empty());

        adapter.close_session(&session_id).await.unwrap();
        assert!(adapter.sessions.get(&session_id).is_none());
    }

    #[tokio::test]
    async fn test_gemini_info_availability() {
        let adapter = GeminiAdapter::with_config(HttpProviderConfig::new(
            "https://generativelanguage.googleapis.com",
        ));
        let info = adapter.info();
        assert_eq!(info.name, ProviderName::Gemini);
        assert!(!info.available);

        let adapter_with_key = GeminiAdapter::with_config(
            HttpProviderConfig::new("https://generativelanguage.googleapis.com")
                .with_api_key("test-key"),
        );
        assert!(adapter_with_key.info().available);
    }
}
