//! AI Provider adapters for Remi Code.
//!
//! This crate provides adapters for various AI providers (Claude, Codex, Cursor,
//! Gemini, Grok, OpenCode, Pi, Kilo) using HTTP APIs and stdio JSON-RPC
//! communication.
//!
//! # Module layout
//!
//! - [`traits`] — the provider adapter contract.
//! - [`registry`] — registry of provider adapters.
//! - [`config`] — shared adapter configuration.
//! - [`errors`] — provider-specific error types.
//! - [`common`] — shared utilities for HTTP adapters.
//! - [`claude`] — Anthropic Claude adapter.
//! - [`codex`] — OpenAI Codex adapter.
//! - [`gemini`] — Google Gemini adapter.
//! - [`grok`] — xAI Grok adapter.
//! - [`opencode`] — OpenCode CLI adapter.
//! - [`cursor`] — Cursor CLI adapter.
//! - [`pi`] — Pi CLI adapter.
//! - [`kilo`] — Kilo CLI adapter.

pub mod claude;
pub mod codex;
pub mod common;
pub mod config;
pub mod cursor;
pub mod errors;
pub mod gemini;
pub mod grok;
pub mod kilo;
pub mod opencode;
pub mod pi;
pub mod registry;
pub mod traits;

pub use claude::ClaudeAdapter;
pub use codex::CodexAdapter;
pub use config::HttpProviderConfig;
pub use cursor::CursorAdapter;
pub use errors::ProviderAdapterError;
pub use gemini::GeminiAdapter;
pub use grok::GrokAdapter;
pub use kilo::KiloAdapter;
pub use opencode::OpenCodeAdapter;
pub use pi::PiAdapter;
pub use registry::ProviderRegistry;
pub use traits::ProviderAdapter;

use tokio::process::{Child, Command};
use uuid::Uuid;

/// Stdio JSON-RPC client for provider communication.
#[allow(dead_code)]
pub struct StdioJsonRpcClient {
    child: Child,
    session_id: String,
}

impl StdioJsonRpcClient {
    /// Start a new stdio JSON-RPC client.
    pub async fn start(command: &str, args: &[&str]) -> remi_core::Result<Self> {
        let child = Command::new(command)
            .args(args)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| ProviderAdapterError::Transport(format!("Failed to start provider: {e}")))?;

        let session_id = Uuid::new_v4().to_string();

        Ok(Self { child, session_id })
    }

    /// Send a JSON-RPC request.
    pub async fn send_request(&mut self, method: &str, params: serde_json::Value) -> remi_core::Result<serde_json::Value> {
        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params
        });

        let request_str = serde_json::to_string(&request)?;

        if let Some(mut stdin) = self.child.stdin.take() {
            use tokio::io::AsyncWriteExt;
            stdin
                .write_all(request_str.as_bytes())
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("Failed to write to stdin: {e}")))?;
            stdin
                .write_all(b"\n")
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("Failed to write newline: {e}")))?;
            self.child.stdin.replace(stdin);
        }

        if let Some(stdout) = self.child.stdout.take() {
            use tokio::io::AsyncBufReadExt;
            let mut reader = tokio::io::BufReader::new(stdout);
            let mut line = String::new();
            reader
                .read_line(&mut line)
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("Failed to read line: {e}")))?;
            self.child.stdout = Some(reader.into_inner());
            if line.trim().is_empty() {
                return Err(ProviderAdapterError::Internal("Empty response from provider".to_string()).into());
            }
            let response: serde_json::Value = serde_json::from_str(line.trim())?;
            return Ok(response);
        }

        Err(ProviderAdapterError::Internal("No response from provider".to_string()).into())
    }

    /// Stop the client.
    pub async fn stop(&mut self) -> remi_core::Result<()> {
        self.child
            .kill()
            .await
            .map_err(|e| ProviderAdapterError::Transport(format!("Failed to stop provider: {e}")))?;
        Ok(())
    }
}
