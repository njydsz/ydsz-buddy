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
//! - [`acp`] — Cursor Agent Control Protocol client.
//! - [`claude`] — Anthropic Claude adapter.
//! - [`codex`] — OpenAI Codex adapter.
//! - [`gemini`] — Google Gemini adapter.
//! - [`grok`] — xAI Grok adapter.
//! - [`opencode`] — OpenCode CLI adapter.
//! - [`cursor`] — Cursor CLI adapter.
//! - [`pi`] — Pi CLI adapter.
//! - [`kilo`] — Kilo CLI adapter.

pub mod acp;
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
pub mod stdio_client;
pub mod traits;

pub use acp::{
    ACP_PROTOCOL_VERSION, AcpClient, AcpCommand, AgentApprovalParams, AgentSendParams,
    AgentSendResult, InitializeParams, TokenUsage, ToolCall,
};
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
pub use stdio_client::StdioJsonRpcClient;
pub use traits::ProviderAdapter;
