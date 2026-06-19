//! Stdio JSON-RPC client for provider CLIs.
//!
//! This module provides a unified, line-based JSON-RPC client for talking to
//! local provider CLIs (OpenCode, Pi, Kilo, Cursor's `agent --stdio` mode,
//! …). All of these tools speak the same shape: one JSON request per line
//! in, one JSON response (or notification) per line out, requests matched
//! by `id`.
//!
//! Most providers in this crate have their own historical bespoke client
//! implementation; the goal of [`StdioJsonRpcClient`] is to give new
//! adapters a single, well-tested entry point.

use crate::errors::ProviderAdapterError;
use serde_json::Value;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout};
use tokio::sync::Mutex;
use tracing::{debug, warn};

/// Shared state for the stdio JSON-RPC client.
struct Inner {
    stdin: Mutex<ChildStdin>,
    reader: Mutex<BufReader<ChildStdout>>,
    next_id: Mutex<u64>,
    child: Mutex<Child>,
}

/// Stdio JSON-RPC client wrapping a child process with piped stdio.
#[derive(Clone)]
pub struct StdioJsonRpcClient {
    inner: Arc<Inner>,
}

impl StdioJsonRpcClient {
    /// Wrap a spawned child as a stdio JSON-RPC client.
    pub fn new(mut child: Child) -> Self {
        let stdin = child
            .stdin
            .take()
            .expect("child stdin must be piped for stdio JSON-RPC client");
        let stdout = child
            .stdout
            .take()
            .expect("child stdout must be piped for stdio JSON-RPC client");
        Self {
            inner: Arc::new(Inner {
                stdin: Mutex::new(stdin),
                reader: Mutex::new(BufReader::new(stdout)),
                next_id: Mutex::new(0),
                child: Mutex::new(child),
            }),
        }
    }

    /// Send a request and read the matching response.
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

        let mut reader = self.inner.reader.lock().await;
        loop {
            let mut buf = String::new();
            let n = reader
                .read_line(&mut buf)
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("read line: {e}")))?;
            if n == 0 {
                return Err(ProviderAdapterError::Internal(
                    "stdio JSON-RPC child closed before responding".to_string(),
                ));
            }
            let trimmed = buf.trim();
            if trimmed.is_empty() {
                continue;
            }
            let parsed: Value = match serde_json::from_str(trimmed) {
                Ok(v) => v,
                Err(e) => {
                    warn!(error = %e, "received non-JSON line; ignoring");
                    continue;
                }
            };
            if parsed.get("id").is_none() {
                debug!(payload = %trimmed, "notification");
                continue;
            }
            if let Some(resp_id) = parsed.get("id").and_then(|v| v.as_u64()) {
                if resp_id == id {
                    if let Some(err) = parsed.get("error") {
                        return Err(ProviderAdapterError::Internal(format!(
                            "JSON-RPC error: {}",
                            err
                        )));
                    }
                    return Ok(parsed.get("result").cloned().unwrap_or(Value::Null));
                }
                warn!(id = resp_id, "received out-of-order response");
                continue;
            }
        }
    }

    /// Send a request and return the raw response, but also tolerate the
    /// child not having the method implemented by returning `Ok(None)`.
    pub async fn try_request(
        &self,
        method: &str,
        params: Value,
    ) -> Result<Option<Value>, ProviderAdapterError> {
        match self.request(method, params).await {
            Ok(v) => Ok(Some(v)),
            Err(ProviderAdapterError::Internal(msg)) if msg.contains("JSON-RPC error") => {
                Ok(None)
            }
            Err(e) => Err(e),
        }
    }

    /// Terminate the child process. Best-effort: ignores errors.
    pub async fn shutdown(&self) {
        if let Ok(mut child) = self.inner.child.lock().await {
            let _ = child.start_kill();
        }
    }

    /// Borrow a clone of the inner child handle. Currently unused but
    /// exposed for future adapters that need direct `Child` access.
    #[allow(dead_code)]
    pub fn inner(&self) -> Arc<Inner> {
        self.inner.clone()
    }
}
