//! AI Provider adapters for Remi Code.
//!
//! This crate provides adapters for various AI providers (Claude, Codex, Cursor, etc.)
//! using stdio JSON-RPC communication.

use dashmap::DashMap;
use futures::Stream;
use remi_contracts::{ModelId, ProviderHealth, ProviderHealthStatus, ProviderInfo, ProviderName};
use remi_core::{Error, Result};
use serde_json::Value;
use std::pin::Pin;
use std::sync::Arc;
use tokio::process::{Child, Command};
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
        self.child.kill().await.map_err(|e| {
            Error::Provider(format!("Failed to stop provider: {}", e))
        })?;
        Ok(())
    }
}

/// Claude provider adapter.
#[allow(dead_code)]
pub struct ClaudeAdapter {
    client: Option<StdioJsonRpcClient>,
}

impl ClaudeAdapter {
    /// Create a new Claude adapter.
    pub fn new() -> Self {
        Self { client: None }
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
            ],
            available: true,
        }
    }

    async fn health(&self) -> Result<ProviderHealth> {
        Ok(ProviderHealth {
            provider: ProviderName::Claude,
            status: ProviderHealthStatus::Healthy,
            last_checked: chrono::Utc::now().to_rfc3339(),
            error: None,
        })
    }

    async fn start_session(&self, _model: &ModelId) -> Result<String> {
        // TODO: Start Claude CLI process
        Ok(Uuid::new_v4().to_string())
    }

    async fn send_message(&self, _session_id: &str, message: &str) -> Result<Value> {
        // TODO: Send message to Claude
        Ok(serde_json::json!({"response": message}))
    }

    async fn stream_response(
        &self,
        _session_id: &str,
        _message: &str,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String>> + Send>>> {
        // TODO: Implement streaming
        let stream = futures::stream::empty();
        Ok(Box::pin(stream))
    }

    async fn close_session(&self, _session_id: &str) -> Result<()> {
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
}
