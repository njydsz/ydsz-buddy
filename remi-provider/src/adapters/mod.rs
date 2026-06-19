//! Provider 适配器实现模块
//!
//! 本模块包含各种 AI Provider 的具体适配器实现，每个适配器都实现了
//! [`crate::adapter::ProviderAdapter`] trait，提供统一的接口与不同的 AI 服务交互。
//!
//! # 支持的 Provider
//!
//! - [`ClaudeAdapter`]: Claude Agent SDK 适配器
//! - [`CodexAdapter`]: Codex (JSON-RPC over stdio) 适配器
//! - [`CursorAdapter`]: Cursor (ACP 协议) 适配器
//! - [`GeminiAdapter`]: Gemini (ACP 协议) 适配器
//! - [`GrokAdapter`]: Grok (ACP 协议) 适配器
//! - [`KiloAdapter`]: Kilo (OpenCode 协议) 适配器
//! - [`OpenCodeAdapter`]: OpenCode SDK 适配器
//! - [`PiAdapter`]: Pi Agent SDK 适配器
//!
//! # 架构设计
//!
//! 所有适配器都遵循相同的设计模式：
//! 1. 实现 `ProviderAdapter` trait
//! 2. 内部维护会话列表和事件广播通道
//! 3. 通过 `Arc<RwLock<...>>` 保证并发安全
//!
//! # 使用示例
//!
//! ```rust,ignore
//! use remi_provider::adapters::{ClaudeAdapter, CodexAdapter};
//! use remi_provider::service::ProviderService;
//! use std::sync::Arc;
//!
//! let service = ProviderService::new();
//!
//! // 注册 Claude 适配器
//! service.register_adapter(Arc::new(ClaudeAdapter::new())).await;
//!
//! // 注册 Codex 适配器
//! service.register_adapter(Arc::new(CodexAdapter::new())).await;
//! ```

/// Claude Provider 适配器实现
pub mod claude;

/// Codex Provider 适配器实现
pub mod codex;

/// Cursor Provider 适配器实现
pub mod cursor;

/// Gemini Provider 适配器实现
pub mod gemini;

/// Grok Provider 适配器实现
pub mod grok;

/// Kilo Provider 适配器实现
pub mod kilo;

/// OpenCode Provider 适配器实现
pub mod opencode;

/// Pi Provider 适配器实现
pub mod pi;

// 重新导出所有适配器，方便外部使用
pub use claude::ClaudeAdapter;
pub use codex::CodexAdapter;
pub use cursor::CursorAdapter;
pub use gemini::GeminiAdapter;
pub use grok::GrokAdapter;
pub use kilo::KiloAdapter;
pub use opencode::OpenCodeAdapter;
pub use pi::PiAdapter;
