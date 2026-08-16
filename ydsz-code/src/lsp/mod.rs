//! # LSP 集成（Code 域能力）
//!
//! 提供 Language Server Protocol 客户端能力，支持跳转定义、查找引用、诊断。
//!
//! ## 核心职责
//!
//! - 启动/管理语言服务器进程（stdio transport）
//! - 预置 7 种语言服务器：typescript-language-server / pyright / rust-analyzer / gopls / jdtls / OmniSharp / clangd
//! - 提供 `definition` / `references` / `diagnostics` 查询接口
//!
//! ## 架构
//!
//! ```text
//! ┌──────────────────────────────────────────────┐
//! │ LspService                                   │
//! ├──────────────────────────────────────────────┤
//! │  ┌──────────────┐  ┌──────────────────────┐  │
//! │  │ LspClient    │  │ dyn LspTransport     │  │
//! │  │ (JSON-RPC)   │  │  ├─ LocalLspTransport│  │
//! │  │              │  │  └─ SshLspTransport  │  │
//! │  └──────────────┘  └──────────────────────┘  │
//! │  ┌──────────────────────────────────────┐    │
//!  │  │ LanguagePreset (TS/Python/Rust/Go/Java/C#/C++)    │    │
//! │  └──────────────────────────────────────┘    │
//! └──────────────────────────────────────────────┘
//! ```
//!
//! ## 传输层选择
//!
//! - 本地开发：[`LocalLspTransport`]（stdio 子进程）
//! - SSH 远端开发：[`ssh_transport::SshLspTransport`]（SSH 通道）

pub mod client;
pub mod error;
pub mod presets;
pub mod ssh_transport;
pub mod transport;

pub use client::LspClient;
pub use error::LspError;
pub use presets::LanguagePreset;
pub use ssh_transport::SshLspTransport;
pub use transport::{LocalLspTransport, LspTransport};

pub type LspResult<T> = Result<T, LspError>;
