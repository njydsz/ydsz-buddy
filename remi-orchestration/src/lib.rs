//! Remi Orchestration - 编排引擎核心模块
//!
//! 本模块是 Remi 系统的编排层（Orchestration Layer），基于 **CQRS + Event Sourcing** 架构模式，
//! 负责以下核心职责：
//!
//! - **命令分发**：接收外部命令（[`OrchestrationCommand`]），通过内部消息队列串行化处理
//! - **事件持久化**：将命令产生的领域事件写入事件存储（Event Store）
//! - **投影管理**：将事件应用到读模型（Projection），维护可查询的物化视图
//! - **读模型查询**：提供完整的快照查询和轻量级 Shell 快照查询接口
//! - **Reactor 模式**：监听领域事件流，触发异步副作用（如 Provider 调用、资源清理等）
//!
//! # 模块结构
//!
//! | 子模块 | 职责 |
//! |--------|------|
//! | [`engine`] | 编排引擎核心，命令处理、事件持久化与投影应用 |
//! | [`error`] | 错误类型定义与统一结果类型 |
//! | [`projector`] | 异步投影器，从事件存储消费事件并更新读模型 |
//! | [`query`] | 读模型查询服务，提供快照与详情查询接口 |
//! | [`reactor`] | 反应器，监听事件流并触发外部系统调用 |
//!
//! # 架构概览
//!
//! ```text
//! Command → Engine → EventStore → Projector → ReadModel
//!                     ↓                        ↑
//!                  Reactor ← broadcast ────────┘
//! ```

pub mod engine;
pub mod error;
pub mod projector;
pub mod query;
pub mod reactor;

pub use engine::*;
pub use error::*;
pub use projector::*;
pub use query::*;
pub use reactor::*;
