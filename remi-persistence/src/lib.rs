//! Remi Persistence - 持久化层
//!
//! 本模块是 Remi 系统的持久化基础设施，基于 SQLite 数据库实现，提供以下核心功能：
//!
//! - **错误管理**（`error`）：定义持久化层的统一错误类型和结果类型
//! - **事件存储**（`event_store`）：基于事件溯源模式的事件持久化，支持追加写入和顺序读取
//! - **数据库迁移**（`migrations`）：Schema 版本管理和增量迁移，确保数据库结构随应用演进
//! - **投影存储**（`projection_repo`）：CQRS 读模型的持久化，支持项目和线程的 CRUD 操作
//! - **SQLite 客户端**（`sqlite_client`）：线程安全的数据库连接封装，提供 SQL 执行和事务支持
//!
//! # 架构说明
//!
//! 本模块采用事件溯源（Event Sourcing）+ CQRS 架构模式：
//! - 写侧通过 `EventStore` 追加领域事件
//! - 读侧通过 `ProjectionRepository` 维护查询优化的投影数据
//! - 投影器通过跟踪事件序列号实现增量同步
//!
//! # 使用示例
//!
//!```rust,ignore
//! #[tokio::main]
//! async fn main() {
//! use remi_persistence::{SqliteClient, run_migrations, SqliteEventStore, SqliteProjectionRepository};
//! use std::path::Path;
//! 
//! // 初始化数据库客户端
//! let client = SqliteClient::new(Path::new('/path/to/db.sqlite')).unwrap();
//! 
//! // 执行数据库迁移
//! run_migrations(&client).unwrap();
//! 
//! // 创建事件存储和投影仓库
//! let event_store = SqliteEventStore::new(client.clone());
//! let projection_repo = SqliteProjectionRepository::new(client);
//! }

// 错误类型定义模块
pub mod error;
// 事件存储模块
pub mod event_store;
// 数据库迁移模块
pub mod migrations;
// 投影仓库模块
pub mod projection_repo;
// SQLite 客户端模块
pub mod sqlite_client;
// 检查点存储模块
pub mod checkpoint_store;
// 配对链接存储模块
pub mod pairing_store;
// 待审批请求投影仓库
pub mod projection_pending_approvals;
// 线程会话投影仓库
pub mod projection_thread_sessions;
// 对话轮次投影仓库
pub mod projection_turns;
// 线程活动投影仓库
pub mod projection_thread_activities;
// 线程提议计划投影仓库
pub mod projection_thread_proposed_plans;
// 编排命令收据仓库
pub mod orchestration_command_receipts;

// 重导出所有模块的公开类型，简化外部引用路径
pub use error::*;
pub use event_store::*;
pub use migrations::*;
pub use projection_repo::*;
pub use sqlite_client::*;
pub use checkpoint_store::*;
pub use pairing_store::*;
pub use projection_pending_approvals::*;
pub use projection_thread_sessions::*;
pub use projection_turns::*;
pub use projection_thread_activities::*;
pub use projection_thread_proposed_plans::*;
pub use orchestration_command_receipts::*;
