//! Cursor provider adapter.
//!
//! Cursor exposes its agent through the Cursor IDE / CLI. This adapter
//! discovers the `cursor` executable and communicates via stdio JSON-RPC.

use crate::errors::ProviderAdapterError;
use crate::traits::ProviderAdapter;
use dashmap::DashMap;
use futures::{Stream, StreamExt};
use remi_contracts::{
    ModelId, ProviderHealth, ProviderHealthStatus, ProviderInfo, ProviderName,
};
use remi_core::Result;
use serde_json::Value;
use std::pin::Pin;
use std::sync::Arc;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use tracing::{debug, info};
use uuid::Uuid;

/// Cursor session state.
#[allow(dead_code)]
struct CursorSession {
    id: String,
    model: String,
    child: Arc<Mutex<Child>>,
    request_id: Arc<Mutex<u64>>,
}

/// Cursor provider adapter.
pub struct CursorAdapter {
    executable: Option<String>,
    sessions: Arc<DashMap<String, CursorSession>>,
}

impl CursorAdapter {
    /// Create a new Cursor adapter, probing for the `cursor` executable.
    pub fn new() -> Self {
        let executable = find_cursor_executable();
        Self {
            executable,
            sessions: Arc::new(DashMap::new()),
        }
    }

    /// Returns true if the Cursor executable is available.
    fn is_configured(&self) -> bool {
        self.executable.is_some()
    }
}

impl Default for CursorAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl ProviderAdapter for CursorAdapter {
    fn info(&self) -> ProviderInfo {
        ProviderInfo {
            name: ProviderName::Cursor,
            display_name: "Cursor".to_string(),
            models: vec![ModelId::new("cursor-default")],
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

        Ok(ProviderHealth {
            provider: ProviderName::Cursor,
            status: ProviderHealthStatus::Healthy,
            last_checked: chrono::Utc::now().to_rfc3339(),
            error: None,
        })
    }

    async fn start_session(&self, model: &ModelId) -> Result<String> {
        if !self.is_configured() {
            return Err(ProviderAdapterError::NotConfigured(ProviderName::Cursor).into());
        }

        let session_id = Uuid::new_v4().to_string();
        
        // Start cursor CLI process with agent mode
        let executable = self.executable.as_ref().unwrap();
        let child = Command::new(executable)
            .args(&["agent", "--stdio"])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| ProviderAdapterError::Transport(format!("Failed to start cursor: {e}")))?;

        let session = CursorSession {
            id: session_id.clone(),
            model: model.0.clone(),
            child: Arc::new(Mutex::new(child)),
            request_id: Arc::new(Mutex::new(0)),
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
            .ok_or_else(|| ProviderAdapterError::SessionNotFound(session_id.to_string()))?;

        let mut child = session.child.lock().await;
        let mut request_id = session.request_id.lock().await;
        *request_id += 1;
        let id = *request_id;

        // Send JSON-RPC request via stdin
        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "agent/send",
            "params": {
                "message": message
            }
        });

        if let Some(mut stdin) = child.stdin.take() {
            use tokio::io::AsyncWriteExt;
            let request_str = serde_json::to_string(&request)?;
            stdin
                .write_all(request_str.as_bytes())
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("Failed to write to stdin: {e}")))?;
            stdin
                .write_all(b"\n")
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("Failed to write newline: {e}")))?;
            child.stdin.replace(stdin);
        }

        // Read response from stdout
        if let Some(stdout) = child.stdout.take() {
            use tokio::io::AsyncBufReadExt;
            let mut reader = tokio::io::BufReader::new(stdout);
            let mut line = String::new();
            reader
                .read_line(&mut line)
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("Failed to read response: {e}")))?;
            child.stdout.replace(reader.into_inner());

            if line.trim().is_empty() {
                return Err(ProviderAdapterError::Internal("Empty response from Cursor".to_string()).into());
            }

            let response: Value = serde_json::from_str(line.trim())?;
            debug!(session_id = %session_id, "Received Cursor response");
            return Ok(response);
        }

        Err(ProviderAdapterError::Internal("No stdout stream available".to_string()).into())
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
            .ok_or_else(|| ProviderAdapterError::SessionNotFound(session_id.to_string()))?;

        let mut child = session.child.lock().await;
        let mut request_id = session.request_id.lock().await;
        *request_id += 1;
        let id = *request_id;

        // Send streaming request
        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "agent/stream",
            "params": {
                "message": message
            }
        });

        if let Some(mut stdin) = child.stdin.take() {
            use tokio::io::AsyncWriteExt;
            let request_str = serde_json::to_string(&request)?;
            stdin
                .write_all(request_str.as_bytes())
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("Failed to write to stdin: {e}")))?;
            stdin
                .write_all(b"\n")
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("Failed to write newline: {e}")))?;
            child.stdin.replace(stdin);
        }

        // Create stream from stdout
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| ProviderAdapterError::Internal("No stdout stream available".to_string()))?;

        let stream = tokio_util::io::ReaderStream::new(stdout)
            .map(|result| {
                result
                    .map(|bytes| String::from_utf8_lossy(&bytes).to_string())
                    .map_err(|e| ProviderAdapterError::Transport(format!("Stream error: {e}")).into())
            });

        Ok(Box::pin(stream))
    }

    async fn close_session(&self, session_id: &str) -> Result<()> {
        self.sessions.remove(session_id);
        info!(session_id = %session_id, "Closed Cursor session");
        Ok(())
    }
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
    async fn test_cursor_session_lifecycle() {
        let adapter = CursorAdapter::new();
        let model = ModelId::new("cursor-default");

        let result = adapter.start_session(&model).await;
        if adapter.is_configured() {
            let session_id = result.unwrap();
            adapter.close_session(&session_id).await.unwrap();
        } else {
            assert!(result.is_err());
        }
    }
}
