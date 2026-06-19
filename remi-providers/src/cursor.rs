//! Cursor provider adapter.
//!
//! Cursor exposes its agent through the Cursor IDE / CLI. This adapter
//! discovers the `cursor` executable and communicates with it via the
//! Cursor Agent Control Protocol (ACP) — see [`crate::acp`] for the JSON-RPC
//! client and typed payloads.

use crate::acp::{
    AcpClient, AcpCommand, AgentSendParams, AgentSendResult, InitializeParams,
};
use crate::errors::ProviderAdapterError;
use crate::traits::ProviderAdapter;
use async_trait::async_trait;
use dashmap::DashMap;
use futures::{Stream, StreamExt};
use remi_contracts::{
    ModelId, ProviderHealth, ProviderInfo, ProviderListCommandsInput,
    ProviderListCommandsOutput, ProviderName,
};
use remi_core::Result;
use serde_json::{json, Value};
use std::pin::Pin;
use std::sync::Arc;
use tokio::process::Command;
use tracing::{info, warn};
use uuid::Uuid;

/// Cursor session state.
#[allow(dead_code)]
#[derive(Clone)]
struct CursorSession {
    /// Logical session id (Remi-side).
    id: String,
    /// Underlying ACP session id (Cursor-side).
    acp_session_id: String,
    /// Model selected at start.
    model: String,
    /// Shared ACP client (the child process is shared across turns).
    client: Arc<AcpClient>,
    /// Monotonic request id counter for diagnostics.
    request_id: u64,
}

/// Cursor provider adapter.
pub struct CursorAdapter {
    /// Path to the `cursor` executable, if discovered on PATH.
    executable: Option<String>,
    /// Active sessions.
    sessions: Arc<DashMap<String, CursorSession>>,
    /// Remi Code version (sent in the ACP `agent/initialize` handshake).
    client_version: String,
}

impl CursorAdapter {
    /// Create a new Cursor adapter, probing for the `cursor` executable.
    pub fn new() -> Self {
        Self::with_version(env!("CARGO_PKG_VERSION"))
    }

    /// Create a Cursor adapter with an explicit client version string.
    pub fn with_version(version: impl Into<String>) -> Self {
        Self {
            executable: find_cursor_executable(),
            sessions: Arc::new(DashMap::new()),
            client_version: version.into(),
        }
    }

    /// Returns true if the Cursor executable is available.
    fn is_configured(&self) -> bool {
        self.executable.is_some()
    }

    /// Spawn a `cursor agent --stdio` child and wrap it as an ACP client.
    fn spawn_acp_client(&self) -> Result<Arc<AcpClient>> {
        let executable = self
            .executable
            .as_ref()
            .ok_or_else(|| ProviderAdapterError::NotConfigured(ProviderName::Cursor))?;
        let child = Command::new(executable)
            .args(["agent", "--stdio"])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| {
                ProviderAdapterError::Transport(format!("Failed to start cursor: {e}"))
            })?;
        Ok(Arc::new(AcpClient::new(child)))
    }
}

impl Default for CursorAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ProviderAdapter for CursorAdapter {
    fn info(&self) -> ProviderInfo {
        ProviderInfo {
            name: ProviderName::Cursor,
            display_name: "Cursor".to_string(),
            models: vec![
                ModelId::new("cursor-default"),
                ModelId::new("cursor-fast"),
            ],
            available: self.is_configured(),
        }
    }

    async fn health(&self) -> Result<ProviderHealth> {
        if !self.is_configured() {
            return Ok(ProviderHealth {
                provider: ProviderName::Cursor,
                status: ProviderHealthStatus::Unhealthy,
                last_checked: chrono::Utc::now().to_rfc3339(),
                error: Some("cursor executable not found on PATH".to_string()),
            });
        }

        // Light health probe: spawn the agent, run `agent/initialize`, and
        // kill the process. This is cheap and confirms the executable is
        // launchable and speaks the expected protocol.
        match self.spawn_acp_client() {
            Ok(client) => {
                let probe = client
                    .request(
                        "agent/initialize",
                        serde_json::to_value(InitializeParams::remi_code(&self.client_version))
                            .unwrap_or(Value::Null),
                    )
                    .await;
                let _ = client.shutdown().await;
                match probe {
                    Ok(_) => Ok(ProviderHealth {
                        provider: ProviderName::Cursor,
                        status: ProviderHealthStatus::Healthy,
                        last_checked: chrono::Utc::now().to_rfc3339(),
                        error: None,
                    }),
                    Err(e) => Ok(ProviderHealth {
                        provider: ProviderName::Cursor,
                        status: ProviderHealthStatus::Degraded,
                        last_checked: chrono::Utc::now().to_rfc3339(),
                        error: Some(format!("ACP handshake failed: {e}")),
                    }),
                }
            }
            Err(e) => Ok(ProviderHealth {
                provider: ProviderName::Cursor,
                status: ProviderHealthStatus::Unhealthy,
                last_checked: chrono::Utc::now().to_rfc3339(),
                error: Some(format!("spawn failed: {e}")),
            }),
        }
    }

    async fn start_session(&self, model: &ModelId) -> Result<String> {
        if !self.is_configured() {
            return Err(ProviderAdapterError::NotConfigured(ProviderName::Cursor).into());
        }

        let client = self.spawn_acp_client()?;

        // ACP handshake. We treat the result as opaque (we don't depend on
        // its shape) and just verify that the agent responds.
        client
            .request(
                "agent/initialize",
                serde_json::to_value(InitializeParams::remi_code(&self.client_version))
                    .unwrap_or(Value::Null),
            )
            .await
            .map_err(|e| ProviderAdapterError::Internal(format!("ACP initialize: {e}")))?;

        let session_id = Uuid::new_v4().to_string();
        let session = CursorSession {
            id: session_id.clone(),
            acp_session_id: String::new(),
            model: model.0.clone(),
            client,
            request_id: 0,
        };
        self.sessions.insert(session_id.clone(), session);
        info!(session_id = %session_id, model = %model, "Started Cursor session");
        Ok(session_id)
    }

    async fn send_message(&self, session_id: &str, message: &str) -> Result<Value> {
        if !self.is_configured() {
            return Err(ProviderAdapterError::NotConfigured(ProviderName::Cursor).into());
        }
        let session = self
            .sessions
            .get(session_id)
            .ok_or_else(|| ProviderAdapterError::SessionNotFound(session_id.to_string()))?
            .clone();

        let params = AgentSendParams::new(message)
            .with_session(&session.acp_session_id)
            .with_model(&session.model);
        let value = serde_json::to_value(&params)
            .map_err(|e| ProviderAdapterError::Internal(format!("serialize params: {e}")))?;

        let result = session
            .client
            .request("agent/send", value)
            .await
            .map_err(|e| ProviderAdapterError::Internal(format!("ACP agent/send: {e}")))?;

        // Try to decode the typed result so we can surface the ACP session
        // id and tool calls. If the agent returns a different shape, we
        // fall back to the raw value.
        match serde_json::from_value::<AgentSendResult>(result.clone()) {
            Ok(parsed) => {
                if let Some(mut s) = self.sessions.get_mut(session_id) {
                    if s.acp_session_id.is_empty() && !parsed.session_id.is_empty() {
                        s.acp_session_id = parsed.session_id.clone();
                    }
                    s.request_id += 1;
                }
                Ok(json!({
                    "response": parsed.response,
                    "session_id": parsed.session_id,
                    "tool_calls": parsed.tool_calls,
                    "approval_required": parsed.approval_required,
                    "usage": parsed.usage,
                }))
            }
            Err(_) => Ok(result),
        }
    }

    async fn stream_response(
        &self,
        session_id: &str,
        message: &str,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String>> + Send>>> {
        if !self.is_configured() {
            return Err(ProviderAdapterError::NotConfigured(ProviderName::Cursor).into());
        }
        let session = self
            .sessions
            .get(session_id)
            .ok_or_else(|| ProviderAdapterError::SessionNotFound(session_id.to_string()))?
            .clone();

        let params = AgentSendParams::new(message)
            .with_session(&session.acp_session_id)
            .with_model(&session.model);
        let value = serde_json::to_value(&params)
            .map_err(|e| ProviderAdapterError::Internal(format!("serialize params: {e}")))?;

        let stream = session
            .client
            .stream("agent/stream", value)
            .await
            .map_err(|e| ProviderAdapterError::Internal(format!("ACP agent/stream: {e}")))?;

        let mapped = stream.map(|res| res.map_err(Into::into));
        Ok(Box::pin(mapped))
    }

    async fn close_session(&self, session_id: &str) -> Result<()> {
        if let Some((_, session)) = self.sessions.remove(session_id) {
            session.client.shutdown().await;
            info!(session_id = %session_id, "Closed Cursor session");
        } else {
            warn!(session_id = %session_id, "Cursor session not found on close");
        }
        Ok(())
    }

    async fn list_commands(
        &self,
        _input: ProviderListCommandsInput,
    ) -> Result<ProviderListCommandsOutput> {
        if !self.is_configured() {
            return Ok(ProviderListCommandsOutput {
                commands: Vec::new(),
                source: Some(ProviderName::Cursor.to_string()),
                cached: Some(false),
            });
        }
        // Probe by spawning a short-lived ACP client to enumerate native
        // commands. The child is killed on the way out.
        let client = self.spawn_acp_client()?;
        let result = list_cursor_commands(&client).await;
        let _ = client.shutdown().await;
        match result {
            Ok(commands) => Ok(ProviderListCommandsOutput {
                commands: commands
                    .into_iter()
                    .map(|c| remi_contracts::ProviderNativeCommandDescriptor {
                        name: c.name,
                        description: c.description,
                    })
                    .collect(),
                source: Some(ProviderName::Cursor.to_string()),
                cached: Some(false),
            }),
            Err(_) => Ok(ProviderListCommandsOutput {
                commands: Vec::new(),
                source: Some(ProviderName::Cursor.to_string()),
                cached: Some(false),
            }),
        }
    }
}

/// List provider-native slash commands exposed by the running Cursor agent.
///
/// This is an ACP-specific helper (it sends `agent/list_commands`). It
/// returns an empty list when the adapter is not configured.
pub async fn list_cursor_commands(client: &AcpClient) -> Result<Vec<AcpCommand>> {
    let raw = client
        .request("agent/list_commands", Value::Null)
        .await
        .map_err(|e| ProviderAdapterError::Internal(format!("ACP list_commands: {e}")))?;
    let commands: Vec<AcpCommand> = serde_json::from_value(raw).unwrap_or_default();
    Ok(commands)
}

/// Search for the `cursor` executable on PATH.
fn find_cursor_executable() -> Option<String> {
    let candidates = ["cursor", "cursor.exe"];
    let path_var = std::env::var_os("PATH")?;

    for candidate in &candidates {
        for dir in std::env::split_paths(&path_var) {
            let full_path = dir.join(candidate);
            if full_path.is_file() {
                return Some(full_path.to_string_lossy().to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_cursor_info() {
        let adapter = CursorAdapter::new();
        let info = adapter.info();
        assert_eq!(info.name, ProviderName::Cursor);
        assert_eq!(info.display_name, "Cursor");
    }

    #[tokio::test]
    async fn test_cursor_session_lifecycle() {
        let adapter = CursorAdapter::new();
        let model = ModelId::new("cursor-default");
        if !adapter.is_configured() {
            // The `cursor` executable is not available in the test
            // environment: verify that `start_session` returns the expected
            // error and `info.available` is false.
            assert!(!adapter.info().available);
            let err = adapter.start_session(&model).await.unwrap_err();
            let msg = err.to_string();
            assert!(
                msg.contains("not configured") || msg.contains("NotConfigured"),
                "unexpected error: {msg}"
            );
        } else {
            let session_id = adapter.start_session(&model).await.unwrap();
            assert!(!session_id.is_empty());
            adapter.close_session(&session_id).await.unwrap();
            assert!(adapter.sessions.get(&session_id).is_none());
        }
    }
}
