//! Cursor Agent Control Protocol (ACP).
//!
//! ACP is Cursor's JSON-RPC based protocol for communicating with the
//! `cursor` agent. The protocol runs over stdio (one JSON object per line)
//! and exposes a set of methods such as `agent/send`, `agent/stream`,
//! `agent/approval`, and `agent/list_commands`.
//!
//! This module provides a typed client used by the [`CursorAdapter`] to
//! send requests and decode responses, with first-class support for the
//! `agent/stream` notification channel used for incremental output.

use crate::errors::ProviderAdapterError;
use futures::{Stream, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::pin::Pin;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout};
use tokio::sync::Mutex;
use tracing::{debug, warn};

/// ACP protocol version implemented by this client.
pub const ACP_PROTOCOL_VERSION: &str = "1.0";

/// ACP client wrapping a running `cursor agent --stdio` child process.
///
/// The client owns the child process and serialises every request behind a
/// mutex to avoid interleaving writes on stdin. Response matching is done
/// by `id` — the response is the next message whose `id` matches the
/// request id.
pub struct AcpClient {
    inner: Arc<AcpClientInner>,
}

struct AcpClientInner {
    stdin: Mutex<ChildStdin>,
    reader: Mutex<BufReader<ChildStdout>>,
    next_id: Mutex<u64>,
    child: Mutex<Child>,
}

impl AcpClient {
    /// Take ownership of a child process that was just spawned with stdio
    /// pipes and wrap it as an ACP client.
    pub fn new(mut child: Child) -> Self {
        let stdin = child
            .stdin
            .take()
            .expect("child stdin must be piped for ACP client");
        let stdout = child
            .stdout
            .take()
            .expect("child stdout must be piped for ACP client");
        Self {
            inner: Arc::new(AcpClientInner {
                stdin: Mutex::new(stdin),
                reader: Mutex::new(BufReader::new(stdout)),
                next_id: Mutex::new(0),
                child: Mutex::new(child),
            }),
        }
    }

    /// Send a JSON-RPC request and read the matching response.
    pub async fn request(&self, method: &str, params: Value) -> Result<Value, ProviderAdapterError> {
        let id = {
            let mut guard = self.inner.next_id.lock().await;
            *guard += 1;
            *guard
        };

        let payload = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });
        let line = serde_json::to_string(&payload)
            .map_err(|e| ProviderAdapterError::Internal(format!("serialize: {e}")))?;

        {
            let mut stdin = self.inner.stdin.lock().await;
            stdin
                .write_all(line.as_bytes())
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("stdin write: {e}")))?;
            stdin
                .write_all(b"\n")
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("stdin newline: {e}")))?;
            stdin
                .flush()
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("stdin flush: {e}")))?;
        }

        // Drain notifications and read until we find a response matching the
        // request id.
        let mut reader = self.inner.reader.lock().await;
        loop {
            let mut buf = String::new();
            let read = reader
                .read_line(&mut buf)
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("read line: {e}")))?;
            if read == 0 {
                return Err(ProviderAdapterError::Internal(
                    "ACP child closed before responding".to_string(),
                ));
            }

            let trimmed = buf.trim();
            if trimmed.is_empty() {
                continue;
            }
            let parsed: Value = match serde_json::from_str(trimmed) {
                Ok(v) => v,
                Err(e) => {
                    warn!(error = %e, "ACP received non-JSON line; ignoring");
                    continue;
                }
            };

            // Server-to-client notifications (no `id`).
            if parsed.get("id").is_none() {
                debug!(payload = %trimmed, "ACP notification");
                continue;
            }

            if let Some(resp_id) = parsed.get("id").and_then(|v| v.as_u64()) {
                if resp_id == id {
                    if let Some(err) = parsed.get("error") {
                        return Err(ProviderAdapterError::Internal(format!(
                            "ACP error: {}",
                            err
                        )));
                    }
                    return Ok(parsed.get("result").cloned().unwrap_or(Value::Null));
                }
                // Not for us: a different request is in flight. Drop and
                // keep draining. (This is extremely rare with serialised
                // requests, but we keep the loop robust.)
                warn!(id = resp_id, "ACP received out-of-order response");
                continue;
            }
        }
    }

    /// Send a streaming request and produce a stream of incremental text
    /// chunks collected from `agent/stream` notifications.
    pub async fn stream(
        &self,
        method: &str,
        params: Value,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String, ProviderAdapterError>> + Send>>, ProviderAdapterError>
    {
        // Reserve the next id and send the request, then return a stream
        // that owns its own clone of the reader so that we don't lock the
        // shared reader for the entire stream lifetime.
        let id = {
            let mut guard = self.inner.next_id.lock().await;
            *guard += 1;
            *guard
        };
        let payload = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });
        let line = serde_json::to_string(&payload)
            .map_err(|e| ProviderAdapterError::Internal(format!("serialize: {e}")))?;
        {
            let mut stdin = self.inner.stdin.lock().await;
            stdin
                .write_all(line.as_bytes())
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("stdin write: {e}")))?;
            stdin
                .write_all(b"\n")
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("stdin newline: {e}")))?;
            stdin
                .flush()
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("stdin flush: {e}")))?;
        }

        let reader = self.inner.reader.lock().await;
        
        // Create a stream that reads lines from the buffered reader
        let stream = futures::stream::unfold(reader, |mut reader| async move {
            let mut line = String::new();
            loop {
                line.clear();
                match reader.read_line(&mut line).await {
                    Ok(0) => return None, // EOF
                    Ok(_) => {
                        let trimmed = line.trim();
                        if trimmed.is_empty() {
                            continue;
                        }
                        let parsed: Value = match serde_json::from_str(trimmed) {
                            Ok(v) => v,
                            Err(_) => continue,
                        };
                        // Extract text from notifications
                        if let Some(method) = parsed.get("method").and_then(|m| m.as_str()) {
                            if method == "agent/stream" || method == "agent/notification" {
                                if let Some(params) = parsed.get("params") {
                                    if let Some(text) = extract_text(params) {
                                        return Some((Ok(text), reader));
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        return Some((Err(ProviderAdapterError::Transport(format!("stream read: {e}"))), reader));
                    }
                }
            }
        });
        
        Ok(Box::pin(stream))
    }

    /// Terminate the child process. Best-effort: ignores errors.
    pub async fn shutdown(&self) {
        let mut child = self.inner.child.lock().await;
        let _ = child.start_kill();
    }
}

fn extract_text(params: &Value) -> Option<String> {
    if let Some(s) = params.as_str() {
        return Some(s.to_string());
    }
    if let Some(text) = params.get("text").and_then(|t| t.as_str()) {
        return Some(text.to_string());
    }
    if let Some(delta) = params.get("delta").and_then(|d| d.as_str()) {
        return Some(delta.to_string());
    }
    if let Some(content) = params.get("content").and_then(|c| c.as_str()) {
        return Some(content.to_string());
    }
    None
}

// ---------------------------------------------------------------------------
// Typed payloads
// ---------------------------------------------------------------------------

/// Request payload for `agent/initialize`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitializeParams {
    /// Protocol version spoken by the client.
    pub protocol_version: String,
    /// Client identifier (e.g. "remi-code").
    pub client: String,
    /// Client version.
    pub client_version: String,
}

impl InitializeParams {
    /// Build an `InitializeParams` for Remi Code.
    pub fn remi_code(version: impl Into<String>) -> Self {
        Self {
            protocol_version: ACP_PROTOCOL_VERSION.to_string(),
            client: "remi-code".to_string(),
            client_version: version.into(),
        }
    }
}

/// Request payload for `agent/send` and `agent/stream`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSendParams {
    /// Session ID (optional; Cursor may create one if absent).
    pub session_id: Option<String>,
    /// User message.
    pub message: String,
    /// Optional model override.
    pub model: Option<String>,
    /// Optional list of workspace paths to include as context.
    pub workspace_paths: Option<Vec<String>>,
}

impl AgentSendParams {
    /// Construct a new `AgentSendParams` for a plain text message.
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            session_id: None,
            message: message.into(),
            model: None,
            workspace_paths: None,
        }
    }

    /// Attach a session id.
    pub fn with_session(mut self, session_id: impl Into<String>) -> Self {
        self.session_id = Some(session_id.into());
        self
    }

    /// Attach a model override.
    pub fn with_model(mut self, model: impl Into<String>) -> Self {
        self.model = Some(model.into());
        self
    }
}

/// Response payload for `agent/send`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSendResult {
    /// Session ID assigned by the agent.
    pub session_id: String,
    /// Assistant reply text.
    pub response: String,
    /// Tool calls the agent wants to make (optional).
    #[serde(default)]
    pub tool_calls: Vec<ToolCall>,
    /// Whether the response requires user approval before continuing.
    #[serde(default)]
    pub approval_required: bool,
    /// Token usage, when reported.
    #[serde(default)]
    pub usage: Option<TokenUsage>,
}

/// A tool call requested by the agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    /// Tool identifier.
    pub id: String,
    /// Tool name (e.g. "file_read", "shell_run").
    pub name: String,
    /// Tool input as a JSON object.
    pub input: Value,
}

/// Token usage information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    /// Input / prompt tokens.
    pub input_tokens: u32,
    /// Output / completion tokens.
    pub output_tokens: u32,
}

/// Request payload for `agent/approval`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentApprovalParams {
    /// Session id.
    pub session_id: String,
    /// Whether the user approved the request.
    pub approved: bool,
    /// Optional feedback for the agent.
    #[serde(default)]
    pub feedback: Option<String>,
}

/// Provider-native command descriptor returned by `agent/list_commands`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpCommand {
    /// Command name (e.g. "/explain", "/test").
    pub name: String,
    /// Human-readable description.
    pub description: Option<String>,
    /// Argument hint shown to the user.
    #[serde(default)]
    pub args_hint: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn initialize_params_default() {
        let params = InitializeParams::remi_code("0.1.0");
        assert_eq!(params.protocol_version, ACP_PROTOCOL_VERSION);
        assert_eq!(params.client, "remi-code");
        assert_eq!(params.client_version, "0.1.0");
    }

    #[test]
    fn agent_send_params_builder() {
        let params = AgentSendParams::new("hi")
            .with_session("sess-1")
            .with_model("claude-3-5-sonnet");
        assert_eq!(params.message, "hi");
        assert_eq!(params.session_id.as_deref(), Some("sess-1"));
        assert_eq!(params.model.as_deref(), Some("claude-3-5-sonnet"));
    }

    #[test]
    fn deserialize_agent_send_result() {
        let raw = json!({
            "session_id": "abc",
            "response": "Hello there",
            "tool_calls": [{
                "id": "t1",
                "name": "file_read",
                "input": {"path": "/tmp/x"}
            }],
            "approval_required": false,
            "usage": { "input_tokens": 10, "output_tokens": 20 }
        });
        let parsed: AgentSendResult = serde_json::from_value(raw).unwrap();
        assert_eq!(parsed.session_id, "abc");
        assert_eq!(parsed.response, "Hello there");
        assert_eq!(parsed.tool_calls.len(), 1);
        assert_eq!(parsed.tool_calls[0].name, "file_read");
        assert_eq!(parsed.usage.unwrap().output_tokens, 20);
    }
}
