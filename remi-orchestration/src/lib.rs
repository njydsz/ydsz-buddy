//! # Remi Orchestration — 编排引擎核心模块
//!
//! 本模块是 Remi 系统的**编排层（Orchestration Layer）**，基于 **CQRS + Event Sourcing** 架构模式，
//! 承担系统核心的命令处理、事件持久化、读模型维护和事件驱动副作用触发等职责。
//!
//! ## 核心职责
//!
//! - **命令分发**：接收外部命令（[`OrchestrationCommand`]），通过内部 MPSC 消息队列串行化处理，
//!   确保命令执行的顺序一致性，避免并发冲突。
//! - **事件持久化**：将命令产生的领域事件写入事件存储（Event Store），实现完整的操作审计追踪。
//! - **投影管理**：将事件应用到读模型（Projection），维护可查询的物化视图，支持 CQRS 的查询侧。
//! - **读模型查询**：提供完整的快照查询和轻量级 Shell 快照查询接口，满足不同场景的数据需求。
//! - **Reactor 模式**：监听领域事件流，触发异步副作用（如 Provider 调用、资源清理等），
//!   实现事件驱动的松耦合架构。
//!
//! ## 模块结构
//!
//! | 子模块 | 职责 | 核心类型 |
//! |--------|------|---------|
//! | [`engine`] | 编排引擎核心，命令处理、事件持久化与投影应用 | [`OrchestrationEngine`] |
//! | [`error`] | 错误类型定义与统一结果类型 | [`OrchestrationError`], [`OrchestrationResult`] |
//! | [`projector`] | 异步投影器，从事件存储消费事件并更新读模型 | [`Projector`] |
//! | [`query`] | 读模型查询服务，提供快照与详情查询接口 | [`ProjectionSnapshotQuery`] |
//! | [`reactor`] | 反应器，监听事件流并触发外部系统调用 | [`ProviderCommandReactor`], [`CheckpointReactor`], [`ThreadDeletionReactor`] |
//!
//! ## 架构概览
//!
//! ```text
//!                          ┌──────────────────────────────────────────┐
//!                          │           Orchestration Layer            │
//!                          │                                          │
//!  Command ──→ dispatch() ─┤  ┌─────────────────────────────────┐    │
//!                          │  │       OrchestrationEngine        │    │
//!                          │  │  (Actor 模型, MPSC 串行处理)     │    │
//!                          │  └────┬────────┬────────┬──────────┘    │
//!                          │       │        │        │               │
//!                          │       ↓        ↓        ↓               │
//!                          │  EventStore  ProjRepo  broadcast        │
//!                          │       ↑        ↑        │               │
//!                          │       │        │        ↓               │
//!                          │  ┌────┴───┐ ┌──┴──┐ ┌──────────┐      │
//!                          │  │Projector│ │Query│ │ Reactor  │      │
//!                          │  │(异步投影)│ │(查询)│ │(副作用)  │      │
//!                          │  └────────┘ └─────┘ └──────────┘      │
//!                          └──────────────────────────────────────────┘
//! ```
//!
//! ## 数据流
//!
//! ```text
//! Command → Engine.dispatch()
//!     → command_to_event()       // 命令转事件
//!     → EventStore.append()      // 事件持久化
//!     → apply_projection()       // 同步更新读模型
//!     → broadcast.send()         // 事件广播
//!         → Reactor.handle()     // 异步副作用处理
//!         → Projector.process()  // 异步投影消费
//! ```
//!
//! ## 核心概念
//!
//! - **Sequence（序列号）**：全局递增的事件序号，用于标识事件顺序、版本控制和增量同步。
//! - **Event Sourcing**：所有状态变更以事件形式持久化，支持事件回放和状态重建。
//! - **CQRS**：命令侧（写）通过 Engine 处理，查询侧（读）通过 Query 服务从投影仓库读取。
//! - **Projection（投影）**：将事件流转换为可读模型（物化视图），优化查询性能。
//! - **Reactor（反应器）**：事件驱动的副作用处理器，解耦核心编排逻辑与外部系统调用。
//!
//! ## 使用示例
//!
//! ```rust,ignore
//! use std::sync::Arc;
//! use remi_orchestration::*;
//! use remi_persistence::{SqliteEventStore, SqliteProjectionRepository};
//!
//! // 1. 初始化持久化层
//! let event_store = Arc::new(SqliteEventStore::new(db_path)?);
//! let projection_repo = Arc::new(SqliteProjectionRepository::new(db_path)?);
//!
//! // 2. 创建编排引擎（自动启动后台命令处理任务）
//! let engine = Arc::new(OrchestrationEngine::new(
//!     event_store.clone(),
//!     projection_repo.clone(),
//! ));
//!
//! // 3. 分发命令
//! let sequence = engine.dispatch(command).await?;
//!
//! // 4. 查询读模型
//! let query_service = ProjectionSnapshotQuery::new(projection_repo.clone());
//! let snapshot = query_service.get_shell_snapshot().await?;
//!
//! // 5. 订阅事件流
//! let mut event_rx = engine.stream_domain_events();
//! tokio::spawn(async move {
//!     while let Ok(event) = event_rx.recv().await {
//!         // 处理事件...
//!     }
//! });
//! ```
//!
//! ## 线程安全
//!
//! 所有核心类型均使用 `Arc` + `RwLock`/`Mutex` 管理内部状态，支持在多线程/异步环境中安全共享。
//! Engine 内部通过 MPSC 通道串行处理命令，对外暴露的查询接口可并发调用。

// ==================== 子模块声明 ====================

/// 编排引擎核心模块：命令处理、事件持久化与投影应用
pub mod engine;
/// 错误类型定义与统一结果类型
pub mod error;
/// 异步投影器，从事件存储消费事件并更新读模型
pub mod projector;
/// 读模型查询服务，提供快照与详情查询接口
pub mod query;
/// 反应器，监听事件流并触发外部系统调用
pub mod reactor;
/// 运行时收据总线，发布-订阅运行时事件
pub mod runtime_receipt_bus;
/// 线程导入路由决策
pub mod import_thread_route;
/// 项目元数据投影
pub mod project_metadata_projection;
/// 分发命令归一化
pub mod dispatch_command_normalization;
/// 领域不变量检查器
pub mod invariants;
/// 线程交接模块
pub mod handoff;

// ==================== 公开导出 ====================

/// 导出编排引擎核心类型（引擎、读模型、Shell 快照等）
pub use engine::*;
/// 导出错误类型（OrchestrationError、OrchestrationResult）
pub use error::*;
/// 导出投影器类型（Projector）
pub use projector::*;
/// 导出查询服务类型（ProjectionSnapshotQuery、ProjectionCounts）
pub use query::*;
/// 导出反应器类型（ProviderCommandReactor、CheckpointReactor、ThreadDeletionReactor）
pub use reactor::*;
/// 导出运行时收据总线类型（RuntimeReceiptBus、OrchestrationRuntimeReceipt 等）
pub use runtime_receipt_bus::*;
/// 导出线程导入路由类型
pub use import_thread_route::*;
/// 导出项目元数据投影类型
pub use project_metadata_projection::*;
/// 导出分发命令归一化类型
pub use dispatch_command_normalization::*;
/// 导出领域不变量检查器
pub use invariants::*;
/// 导出线程交接模块
pub use handoff::*;

