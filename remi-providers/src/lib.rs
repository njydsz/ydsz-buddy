//! Remi Code 的 AI Provider 适配器。
//!
//! 本 crate 为多种 AI Provider（Claude、Codex、Cursor、
//! Gemini、Grok、OpenCode、Pi、Kilo）提供适配器，支持 HTTP API 和 stdio JSON-RPC
//! 通信方式。
//!
//! # 模块布局
//!
//! - [`traits`] — Provider 适配器契约定义。
//! - [`registry`] — Provider 适配器注册中心。
//! - [`config`] — 适配器共享配置。
//! - [`errors`] — Provider 特定错误类型。
//! - [`common`] — HTTP 适配器共享工具函数。
//! - [`acp`] — Cursor Agent Control Protocol 客户端。
//! - [`claude`] — Anthropic Claude 适配器。
//! - [`codex`] — OpenAI Codex 适配器。
//! - [`gemini`] — Google Gemini 适配器。
//! - [`grok`] — xAI Grok 适配器。
//! - [`opencode`] — OpenCode CLI 适配器。
//! - [`cursor`] — Cursor CLI 适配器。
//! - [`pi`] — Pi CLI 适配器。
//! - [`kilo`] — Kilo CLI 适配器。

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
