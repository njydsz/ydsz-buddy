//! # Remi Auth - 认证与授权模块
//!
//! 本模块是 Remi 系统的安全核心，负责统一管理认证、会话凭证、配对链接和密钥存储等安全相关功能。
//!
//! ## 核心职责
//!
//! - **会话管理**: 通过 [`SessionCredentialService`] 管理客户端会话的生命周期（颁发、验证、撤销）
//! - **密钥存储**: 通过 [`SecretStore`] 安全存储 API Key、签名密钥等敏感信息
//! - **认证服务**: 通过 [`AuthService`] 提供 HTTP/WebSocket 请求的认证能力
//! - **配对机制**: 支持设备配对链接，实现多客户端的安全接入
//!
//! ## 模块结构
//!
//! | 子模块 | 说明 |
//! |--------|------|
//! | [`error`] | 认证相关的错误类型定义 |
//! | [`secret_store`] | 密钥的安全存储实现（内存 + 持久化） |
//! | [`service`] | 认证服务门面，提供统一的认证 API |
//! | [`session_credential`] | 会话凭证的核心实现，包括令牌签名与验证 |
//!
//! ## 安全特性
//!
//! - 使用 HMAC-SHA256 对会话令牌进行签名
//! - 支持令牌过期机制（默认 72 小时）
//! - 支持会话撤销和批量撤销
//! - WebSocket 令牌独立管理，支持短生命周期
//!
//! ## 使用示例
//!
//! ```rust,no_run
//! use remi_auth::{AuthService, SecretStore, SessionCredentialService};
//! use std::sync::Arc;
//!
//! // 初始化密钥存储
//! let secret_store = Arc::new(SecretStore::new(None));
//!
//! // 初始化会话凭证服务
//! let credential_service = Arc::new(SessionCredentialService::new(secret_store));
//!
//! // 初始化认证服务
//! let auth_service = AuthService::new(credential_service);
//! ```

/// 认证错误类型模块
pub mod error;

/// 密钥安全存储模块
pub mod secret_store;

/// 认证服务门面模块
pub mod service;

/// 会话凭证服务模块
pub mod session_credential;

/// 配对码生成器模块
pub mod pairing_code_generator;

// 重导出所有公开类型，方便外部使用
pub use error::*;
pub use secret_store::*;
pub use service::*;
pub use session_credential::*;
pub use pairing_code_generator::*;
