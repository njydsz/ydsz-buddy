//! Provider 适配器实现模块
//!
//! 本模块包含各种 AI Provider 的具体适配器实现，每个适配器都实现了
//! [`crate::adapter::ProviderAdapter`] trait，提供统一的接口与不同的 AI 服务交互。
//!
//! # 支持的 Provider
//!
//! | 适配器 | Provider 类型 | 协议/SDK | 特性支持 |
//! |--------|--------------|----------|----------|
//! | [`ClaudeAdapter`] | Claude Agent | Claude Agent SDK | 技能提及、技能发现、模型列表、Turn 转向 |
//! | [`CodexAdapter`] | Codex | JSON-RPC over stdio | 基础功能 |
//! | [`CursorAdapter`] | Cursor | ACP 协议 | 基础功能 |
//! | [`GeminiAdapter`] | Gemini | ACP 协议 | 基础功能 |
//! | [`GrokAdapter`] | Grok | ACP 协议 | 基础功能 |
//! | [`KiloAdapter`] | Kilo | OpenCode 协议 | 基础功能 |
//! | [`OpenCodeAdapter`] | OpenCode | OpenCode SDK | 基础功能 |
//! | [`PiAdapter`] | Pi | Pi Agent SDK | 基础功能 |
//!
//! # 架构设计
//!
//! 所有适配器都遵循相同的设计模式：
//! 1. 实现 `ProviderAdapter` trait
//! 2. 内部维护会话列表和事件广播通道
//! 3. 通过 `Arc<RwLock<...>>` 保证并发安全
//!
//! # 设计原则
//!
//! - **一致性**：所有适配器遵循相同的结构和命名约定
//! - **可扩展性**：新增 Provider 只需实现 `ProviderAdapter` trait
//! - **线程安全**：使用 `Arc<RwLock<...>>` 管理内部状态
//! - **事件驱动**：每个适配器维护独立的事件广播通道
//!
//! # 使用场景
//!
//! - **多模型支持**：同时注册多个适配器，支持多种 AI Provider
//! - **模型切换**：在运行时动态切换不同的 Provider
//! - **能力查询**：根据适配器能力动态调整业务逻辑
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
//!
//! // 查询适配器能力
//! let capabilities = service.get_capabilities(ProviderKind::ClaudeAgent).await?;
//! if capabilities.supports_turn_steering {
//!     // 支持 Turn 转向，可以使用 steer_turn 方法
//! }
//! ```

/// Claude Provider 适配器实现
pub mod claude;

/// Codex Provider 适配器实现
pub mod codex;

/// Codex App Server 进程管理
pub mod codex_app_server_manager;

/// Codex 错误分类
pub mod codex_error_classification;

/// Codex 生成图片管理
pub mod codex_generated_images;

/// Codex 家目录路径解析
pub mod codex_home_paths;

/// Codex 进程环境变量管理
pub mod codex_process_env;

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

