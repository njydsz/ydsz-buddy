//! # MCP 集成（Code 域能力）
//!
//! 提供 Model Context Protocol 客户端能力，支持连接外部 MCP 服务器、列出工具、
//! 调用工具（tools/call）以及读取资源（resources/read）。
//!
//! ## 核心职责
//!
//! - 启动/管理 MCP 服务器进程（stdio transport + SSE transport，JSON-RPC 2.0）
//! - 预置 8 个官方 server 模板（filesystem / fetch / memory / github / git / sqlite / postgres / playwright）
//! - 提供 `initialize` / `list_tools` / `call_tool` / `read_resource` 核心 API
//!
//! ## 架构
//!
//! ```text
//! ┌──────────────────────────────────────────┐
//! │ McpService                               │
//! ├──────────────────────────────────────────┤
//! │  ┌──────────────┐  ┌──────────────────┐  │
//! │  │ McpClient    │  │ McpTransport     │  │
//! │  │ (JSON-RPC 2) │  │ (stdio / SSE)   │  │
//! │  └──────────────┘  └──────────────────┘  │
//! │  ┌──────────────────────────────────────┐│
//! │  │ McpServerPreset × 8                  ││
//! │  └──────────────────────────────────────┘│
//! │  ┌──────────────────────────────────────┐│
//! │  │ McpConfig (工作区根 .ydsz/mcp.json)  ││
//! │  └──────────────────────────────────────┘│
//! └──────────────────────────────────────────┘
//! ```
//!
//! ## 协议参考
//!
//! - <https://modelcontextprotocol.io/specification/2025-06-18/basic>
//! - <https://modelcontextprotocol.io/specification/2025-06-18/server/tools>

pub mod client;
pub mod config;
pub mod error;
pub mod presets;
pub mod sse_transport;
pub mod state;
pub mod transport;

pub use client::{McpClient, McpContent, McpServerInfo, McpTool, McpToolCallResult};
pub use config::{McpServerConfig, McpServerStatus, McpStore, McpTransportType};
pub use error::McpError;
pub use presets::{
    builtin_presets, find_preset, presets_by_category, resolve_preset, search_presets,
    validate_github_token, validate_postgres_connection_string, McpServerPreset,
};
pub use sse_transport::McpSseTransport;
pub use state::McpState;
pub use transport::McpTransport;

pub type McpResult<T> = Result<T, McpError>;
