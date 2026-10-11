// ! ACP stdio
// !
// ! Agent Client Protocol (ACP) stdio server implementation.
// ! Communicates with IDE Agents via stdin/stdout line-delimited JSON.

use super::types::*;
use std::io::{BufRead, BufReader, Write};
use tracing::{info, debug, error};

/// ACP stdio server struct.
pub struct AcpStdioServer {}

impl AcpStdioServer {
    pub fn new() -> Self {
        Self {}
    }

    /// Start the stdio service loop (blocking).
    /// Reads JSON lines from stdin, processes them, writes JSON lines to stdout.
    pub fn run_forever(&self) -> Result<(), String> {
        info!("ACP stdio server started, waiting for stdin...");
        let stdin = std::io::stdin();
        let stdout = std::io::stdout();
        let reader = BufReader::new(stdin.lock());
        let mut writer = stdout.lock();

        for line in reader.lines() {
            let line = match line {
                Ok(l) => l,
                Err(e) => {
                    error!("Failed to read stdin: {}", e);
                    break;
                }
            };

            if line.trim().is_empty() {
                continue;
            }

            debug!("Received: {}", line.chars().take(100).collect::<String>());

            let response = match serde_json::from_str::<serde_json::Value>(&line) {
                Ok(value) => self.handle_request(&value),
                Err(e) => {
                    serde_json::json!({ "error": format!("JSON parse error: {}", e) })
                }
            };

            match serde_json::to_string(&response) {
                Ok(json) => {
                    if writeln!(writer, "{}", json).is_err() {
                        error!("Failed to write stdout");
                        break;
                    }
                    let _ = writer.flush();
                }
                Err(e) => {
                    error!("Failed to serialize response: {}", e);
                }
            }
        }

        info!("ACP stdio server stopped");
        Ok(())
    }

    /// Handle a single ACP request.
    fn handle_request(&self, request: &serde_json::Value) -> serde_json::Value {
        let method = request.get("method").and_then(|m| m.as_str()).unwrap_or("");

        match method {
            "session/create" => {
                let session_id = uuid::Uuid::new_v4().to_string();
                serde_json::json!({ "sessionId": session_id, "status": "created" })
            }
            "session/send" => {
                let session_id = request.get("sessionId").and_then(|s| s.as_str()).unwrap_or("");
                let task = request.get("task").and_then(|t| t.as_str()).unwrap_or("");
                debug!("session/send: id={}, task={}", session_id, task.chars().take(50).collect::<String>());
                serde_json::json!({
                    "sessionId": session_id,
                    "status": "completed",
                    "output": format!("Task received: {}", task)
                })
            }
            "session/status" => {
                let session_id = request.get("sessionId").and_then(|s| s.as_str()).unwrap_or("");
                serde_json::json!({ "sessionId": session_id, "state": "idle" })
            }
            _ => {
                serde_json::json!({ "error": format!("Unknown method: {}", method) })
            }
        }
    }
}

impl Default for AcpStdioServer {
    fn default() -> Self {
        Self::new()
    }
}
