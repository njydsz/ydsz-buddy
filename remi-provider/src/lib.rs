//! Remi Provider 模块 - AI Provider 统一管理层
//!
//! # 模块概述
//!
//! 本模块是 Remi 系统中负责 AI Provider 管理的核心组件，提供统一的接口来管理多种 AI 服务提供商。
//! 主要职责包括：
//!
//! - **适配器管理**：通过 [`adapter`] 模块定义统一的 Provider 适配器接口
//! - **多 Provider 支持**：通过 [`adapters`] 模块实现多种 AI Provider 的具体适配器
//! - **错误处理**：通过 [`error`] 模块定义统一的错误类型
//! - **健康检查**：通过 [`health`] 模块监控 Provider 的可用状态
//! - **会话清理**：通过 [`reaper`] 模块自动清理过期会话
//! - **服务门面**：通过 [`service`] 模块提供跨 Provider 的统一操作接口
//!
//! # 架构设计
//!
//! 本模块采用适配器模式（Adapter Pattern），将不同 AI Provider 的异构接口统一为标准接口，
//! 使上层业务无需关心底层 Provider 的具体实现差异。
//!
//! # 核心组件
//!
//! - **[`adapter`] 模块**：定义统一的 Provider 适配器接口（`ProviderAdapter` trait）
//! - **[`adapters`] 模块**：实现多种 AI Provider 的具体适配器（Claude、Codex、Cursor 等）
//! - **[`error`] 模块**：定义统一的错误类型（`ProviderError` 枚举）
//! - **[`health`] 模块**：提供 Provider 健康状态监控功能
//! - **[`reaper`] 模块**：自动清理过期会话，防止资源泄漏
//! - **[`service`] 模块**：提供跨 Provider 的统一操作接口（门面模式）
//!
//! # 设计模式
//!
//! - **适配器模式（Adapter Pattern）**：将不同 Provider 的异构接口统一为标准接口
//! - **门面模式（Facade Pattern）**：通过 `ProviderService` 提供统一的访问入口
//! - **策略模式（Strategy Pattern）**：不同适配器可互换，实现不同的 Provider 策略
//!
//! # 使用场景
//!
//! 本模块适用于需要同时支持多种 AI Provider 的场景，例如：
//! - 多模型对话系统
//! - AI 助手应用
//! - 智能客服平台
//! - 代码生成工具
//!
//! # 示例
//!
//! ```rust,ignore
//! use remi_provider::{ProviderService, ClaudeAdapter};
//! use std::sync::Arc;
//!
//! // 创建 Provider 服务
//! let service = ProviderService::new();
//!
//! // 注册 Claude 适配器
//! let claude_adapter = Arc::new(ClaudeAdapter::new());
//! service.register_adapter(claude_adapter).await;
//! ```

/// Provider 适配器 trait 定义模块
///
/// 定义了所有 Provider 适配器必须实现的标准接口，包括会话管理、消息发送、事件流等核心功能。
pub mod adapter;

/// Provider 适配器实现模块
///
/// 包含各种 AI Provider 的具体适配器实现，如 Claude、Codex、Cursor、Gemini、Grok、Kilo、OpenCode、Pi 等。
pub mod adapters;

/// Provider 错误类型定义模块
///
/// 定义了 Provider 模块中所有可能的错误类型，提供统一的错误处理机制。
pub mod error;

/// Provider 健康检查模块
///
/// 提供 Provider 健康状态监控功能，支持定期检查 Provider 可用性并缓存状态。
pub mod health;

/// JSON-RPC over stdio 客户端
///
/// 提供与 Provider 进程通过标准输入输出进行 JSON-RPC 通信的能力。
pub mod jsonrpc_client;

/// Provider 会话清理模块
///
/// 提供自动清理过期会话的功能，防止会话资源泄漏。
pub mod reaper;

/// Provider 服务门面模块
///
/// 提供跨 Provider 的统一操作接口，是上层业务与 Provider 交互的主要入口。
pub mod service;

// 重新导出所有公共 API，方便外部使用
pub use adapter::*;
pub use error::*;
pub use health::*;
pub use jsonrpc_client::*;
pub use reaper::*;
pub use service::*;
