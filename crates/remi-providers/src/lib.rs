//! AI Provider adapters for Remi Code.
//!
//! This crate provides adapters for various AI providers (Claude, Codex, Cursor, etc.)
//! using HTTP API and stdio JSON-RPC communication.

use dashmap::DashMap;
use futures::Stream;
use remi_contracts::{ModelId, ProviderHealth, ProviderHealthStatus, ProviderInfo, ProviderName};
use remi_core::{Error, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::pin::Pin;
use std::sync::Arc;
use tokio::process::{Child, Command};
use tokio_stream::StreamExt;
use tracing::{error, info};
use uuid::Uuid;

/// Provider adapter trait.
#[async_trait::async_trait]
pub trait ProviderAdapter: Send + Sync {
    /// Get provider information.
    fn info(&self) -> ProviderInfo;

    /// Check provider health.
    async fn health(&self) -> Result<ProviderHealth>;

    /// Start a session.
    async fn start_session(&self, model: &ModelId) -> Result<String>;

    /// Send a message to a session.
    async fn send_message(&self, session_id: &str, message: &str) -> Result<Value>;

    /// Stream a response from a session.
    async fn stream_response(
        &self,
        session_id: &str,
        message: &str,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String>> + Send>>>;

    /// Close a session.
    async fn close_session(&self, session_id: &str) -> Result<()>;
}

/// Provider registry.
#[derive(Clone)]
pub struct ProviderRegistry {
    adapters: Arc<DashMap<ProviderName, Arc<dyn ProviderAdapter>>>,
}

impl ProviderRegistry {
    /// Create a new provider registry.
    pub fn new() -> Self {
        Self {
            adapters: Arc::new(DashMap::new()),
        }
    }

    /// Register a provider adapter.
    pub fn register(&self, adapter: Arc<dyn ProviderAdapter>) {
        let info = adapter.info();
        let name = info.name.clone();
        self.adapters.insert(name.clone(), adapter);
        info!("Registered provider: {}", name);
    }

    /// Get a provider adapter.
    pub fn get(&self, name: &ProviderName) -> Option<Arc<dyn ProviderAdapter>> {
        self.adapters.get(name).map(|a| a.clone())
    }

    /// List all providers.
    pub fn list(&self) -> Vec<ProviderInfo> {
        self.adapters.iter().map(|a| a.value().info()).collect()
    }

    /// Check health of all providers.
    pub async fn health_check_all(&self) -> Vec<ProviderHealth> {
        let mut results = Vec::new();
        for adapter in self.adapters.iter() {
            match adapter.value().health().await {
                Ok(health) => results.push(health),
                Err(e) => {
                    error!("Health check failed for {}: {}", adapter.key(), e);
                }
            }
        }
        results
    }
}

impl Default for ProviderRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// Claude API message.
#[derive(Debug, Clone, Serialize)]
struct ClaudeMessage {
    role: String,
    content: String,
}

/// Claude API request.
#[derive(Debug, Serialize)]
struct ClaudeRequest {
    model: String,
    messages: Vec<ClaudeMessage>,
    max_tokens: u32,
    stream: bool,
}

/// Claude API response.
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct ClaudeResponse {
    id: String,
    content: Vec<ClaudeContent>,
    usage: ClaudeUsage,
}

/// Claude API content block.
#[derive(Debug, Deserialize)]
struct ClaudeContent {
    r#type: String,
    text: Option<String>,
}

/// Claude API usage.
#[derive(Debug, Deserialize)]
struct ClaudeUsage {
    input_tokens: u32,
    output_tokens: u32,
}

/// Claude session state.
#[derive(Clone)]
#[allow(dead_code)]
struct ClaudeSession {
    id: String,
    model: String,
    messages: Vec<ClaudeMessage>,
}

/// Claude provider adapter using HTTP API.
pub struct ClaudeAdapter {
    api_key: Option<String>,
    sessions: Arc<DashMap<String, ClaudeSession>>,
    client: reqwest::Client,
}

impl ClaudeAdapter {
    /// Create a new Claude adapter.
    pub fn new() -> Self {
        Self {
            api_key: std::env::var("ANTHROPIC_API_KEY").ok(),
            sessions: Arc::new(DashMap::new()),
            client: reqwest::Client::new(),
        }
    }

    /// Create with explicit API key.
    pub fn with_api_key(api_key: String) -> Self {
        Self {
            api_key: Some(api_key),
            sessions: Arc::new(DashMap::new()),
            client: reqwest::Client::new(),
        }
    }

    /// Get API key or error.
    fn get_api_key(&self) -> Result<&str> {
        self.api_key
            .as_deref()
            .ok_or_else(|| Error::Provider("ANTHROPIC_API_KEY not set".to_string()))
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
            available: self.api_key.is_some(),
        }
    }

    async fn health(&self) -> Result<ProviderHealth> {
        if self.api_key.is_none() {
            return Ok(ProviderHealth {
                provider: ProviderName::Claude,
                status: ProviderHealthStatus::Unhealthy,
                last_checked: chrono::Utc::now().to_rfc3339(),
                error: Some("API key not configured".to_string()),
            });
        }

        // Simple health check - just verify we have an API key
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
        info!("Started Claude session: {}", session_id);

        Ok(session_id)
    }

    async fn send_message(&self, session_id: &str, message: &str) -> Result<Value> {
        let api_key = self.get_api_key()?;

        // Get session
        let mut session = self
            .sessions
            .get_mut(session_id)
            .ok_or_else(|| Error::Provider(format!("Session not found: {}", session_id)))?;

        // Add user message
        session.messages.push(ClaudeMessage {
            role: "user".to_string(),
            content: message.to_string(),
        });

        // Build request
        let request = ClaudeRequest {
            model: session.model.clone(),
            messages: session.messages.clone(),
            max_tokens: 4096,
            stream: false,
        };

        // Send request to Claude API
        let response = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| Error::Provider(format!("Failed to send request: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(Error::Provider(format!(
                "Claude API error ({}): {}",
                status, error_text
            )));
        }

        let claude_response: ClaudeResponse = response
            .json()
            .await
            .map_err(|e| Error::Provider(format!("Failed to parse response: {}", e)))?;

        // Extract text from response
        let assistant_text = claude_response
            .content
            .iter()
            .filter(|c| c.r#type == "text")
            .filter_map(|c| c.text.as_ref())
            .cloned()
            .collect::<Vec<_>>()
            .join("\n");

        // Add assistant response to session
        session.messages.push(ClaudeMessage {
            role: "assistant".to_string(),
            content: assistant_text.clone(),
        });

        // Return response with usage info
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
        let api_key = self.get_api_key()?;

        // Get session
        let mut session = self
            .sessions
            .get_mut(session_id)
            .ok_or_else(|| Error::Provider(format!("Session not found: {}", session_id)))?;

        // Add user message
        session.messages.push(ClaudeMessage {
            role: "user".to_string(),
            content: message.to_string(),
        });

        // Build request
        let request = ClaudeRequest {
            model: session.model.clone(),
            messages: session.messages.clone(),
            max_tokens: 4096,
            stream: true,
        };

        // Send streaming request
        let response = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| Error::Provider(format!("Failed to send request: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(Error::Provider(format!(
                "Claude API error ({}): {}",
                status, error_text
            )));
        }

        // Create a stream that processes SSE events
        let stream = response
            .bytes_stream()
            .filter_map(|chunk_result| {
                match chunk_result {
                    Ok(chunk) => {
                        let text = String::from_utf8_lossy(&chunk);
                        // Parse SSE format: "data: {...}"
                        for line in text.lines() {
                            if let Some(json_str) = line.strip_prefix("data: ") {
                                if let Ok(event) = serde_json::from_str::<Value>(json_str) {
                                    if let Some(content) = event.get("content") {
                                        if let Some(text) = content.get("text").and_then(|t| t.as_str()) {
                                            return Some(Ok(text.to_string()));
                                        }
                                    }
                                }
                            }
                        }
                        None
                    }
                    Err(e) => Some(Err(Error::Provider(format!("Stream error: {}", e)))),
                }
            });

        // Update session with assistant response in background
        let session_id_owned = session_id.to_string();
        let sessions_clone = self.sessions.clone();
        tokio::spawn(async move {
            // Note: In a real implementation, we'd collect from the stream
            // For now, we'll just log that streaming started
            info!("Streaming response for session: {}", session_id_owned);
            let _ = sessions_clone; // suppress unused warning
        });

        Ok(Box::pin(stream))
    }

    async fn close_session(&self, session_id: &str) -> Result<()> {
        self.sessions.remove(session_id);
        info!("Closed Claude session: {}", session_id);
        Ok(())
    }
}

/// Stdio JSON-RPC client for provider communication.
#[allow(dead_code)]
pub struct StdioJsonRpcClient {
    child: Child,
    session_id: String,
}

impl StdioJsonRpcClient {
    /// Start a new stdio JSON-RPC client.
    pub async fn start(command: &str, args: &[&str]) -> Result<Self> {
        let child = Command::new(command)
            .args(args)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| Error::Provider(format!("Failed to start provider: {}", e)))?;

        let session_id = Uuid::new_v4().to_string();

        Ok(Self { child, session_id })
    }

    /// Send a JSON-RPC request.
    pub async fn send_request(&mut self, method: &str, params: Value) -> Result<Value> {
        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params
        });

        let request_str = serde_json::to_string(&request)?;

        // Write to stdin
        if let Some(mut stdin) = self.child.stdin.take() {
            use tokio::io::AsyncWriteExt;
            stdin
                .write_all(request_str.as_bytes())
                .await
                .map_err(|e| Error::Provider(format!("Failed to write to stdin: {}", e)))?;
            stdin
                .write_all(b"\n")
                .await
                .map_err(|e| Error::Provider(format!("Failed to write newline: {}", e)))?;
            self.child.stdin.replace(stdin);
        }

        // Read from stdout
        if let Some(stdout) = self.child.stdout.take() {
            use tokio::io::AsyncBufReadExt;
            let mut reader = tokio::io::BufReader::new(stdout);
            let mut line = String::new();
            reader
                .read_line(&mut line)
                .await
                .map_err(|e| Error::Provider(format!("Failed to read line: {}", e)))?;
            self.child.stdout = Some(reader.into_inner());
            if line.trim().is_empty() {
                return Err(Error::Provider("Empty response from provider".to_string()));
            }
            let response: Value = serde_json::from_str(line.trim())?;
            return Ok(response);
        }

        Err(Error::Provider("No response from provider".to_string()))
    }

    /// Stop the client.
    pub async fn stop(&mut self) -> Result<()> {
        self.child
            .kill()
            .await
            .map_err(|e| Error::Provider(format!("Failed to stop provider: {}", e)))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_provider_registry() {
        let registry = ProviderRegistry::new();
        let adapter = Arc::new(ClaudeAdapter::new());
        registry.register(adapter);

        let providers = registry.list();
        assert_eq!(providers.len(), 1);
        assert_eq!(providers[0].name, ProviderName::Claude);
    }

    #[tokio::test]
    async fn test_claude_session_lifecycle() {
        let adapter = ClaudeAdapter::new();
        let model = ModelId::new("claude-3-5-sonnet-20241022");

        // Start session
        let session_id = adapter.start_session(&model).await.unwrap();
        assert!(!session_id.is_empty());

        // Close session
        adapter.close_session(&session_id).await.unwrap();
    }
}
