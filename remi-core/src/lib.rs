//! # Remi Core - 核心领域模型与合约
//!
//! 本 crate 是 Remi 系统的核心基础库，定义了跨模块共享的领域模型、事件、命令和错误类型。
//!
//! ## 模块概览
//!
//! - [`models`] - 领域模型定义，包含项目、线程、消息、会话等核心实体
//! - [`provider`] - AI Provider 相关类型，包括 Provider 类型、模型选择、运行时事件等
//! - [`events`] - 编排事件定义，基于事件溯源（Event Sourcing）模式的领域事件
//! - [`commands`] - 编排命令定义，用于驱动状态变更的命令对象
//! - [`error`] - 统一的错误类型与结果别名
//!
//! ## 设计原则
//!
//! - 所有类型均派生 `Serialize` / `Deserialize`，支持 JSON 序列化
//! - 事件与命令采用带标签的枚举（tagged enum），便于序列化时区分变体
//! - 使用 `chrono::DateTime<Utc>` 统一时间表示
//! - 使用 `uuid::Uuid` 作为全局唯一标识符

/// 编排命令定义，包含项目与线程的所有可执行命令
pub mod commands;
/// 统一错误类型与结果别名
pub mod error;
/// 编排事件定义，基于事件溯源模式的领域事件
pub mod events;
/// 领域模型定义，包含核心业务实体与值对象
pub mod models;
/// AI Provider 相关类型定义，包括 Provider 类型、模型选择、运行时事件等
pub mod provider;

/// 重导出 error 模块中的所有公开类型，方便外部直接使用
pub use error::*;
