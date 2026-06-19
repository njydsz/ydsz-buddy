//! # Remi Checkpoint - 检查点管理模块
//!
//! ## 模块职责
//!
//! 本模块是 Remi 系统的**检查点（Checkpoint）管理核心**，负责在 Git 仓库中创建、存储、
//! 查询和回滚检查点。检查点本质上是对代码变更过程中某一时刻的快照记录，
//! 通过 Git Commit 引用来标识，用于支持对话线程（Thread）中每一轮（Turn）变更的
//! 可追溯性与可回滚性。
//!
//! ## 核心功能
//!
//! - **检查点存储（[`store`]）**：基于 Git Commit 创建、查询、列举和删除检查点，
//!   并支持将代码回滚到指定检查点对应的 Commit 状态。
//! - **Diff 查询（[`query`]）**：计算单个 Turn 或整个 Thread 的代码变更差异（Diff），
//!   支持任意两个检查点之间的 Diff 对比，并提供增删行数、变更文件数等统计信息。
//! - **错误处理（[`error`]）**：统一定义检查点操作中可能出现的各类错误类型，
//!   包括检查点不存在、Git 操作失败、序列化失败、数据库错误及 IO 错误。
//!
//! ## 使用场景
//!
//! 1. **AI 对话编码**：每一轮 AI 生成代码后，自动创建检查点，便于用户审查和回滚。
//! 2. **变更追溯**：通过 Diff 查询，查看任意两轮对话之间的代码变更详情。
//! 3. **安全回滚**：当 AI 生成的代码不符合预期时，可快速回滚到任意历史检查点。
//!
//! ## 模块结构
//!
//! ```text
//! remi-checkpoint/
//! ├── lib.rs      # 模块入口，声明并导出子模块
//! ├── error.rs    # 错误类型定义（CheckpointError、CheckpointResult）
//! ├── store.rs    # 检查点存储服务（CheckpointStore）
//! └── query.rs    # 检查点 Diff 查询服务（CheckpointDiffQuery）
//! ```
//!
//! ## 依赖关系
//!
//! - [`remi_core`]：提供核心数据模型（如 [`Checkpoint`]、[`ThreadId`]）。
//! - [`remi_git`]：提供底层 Git 操作能力（如 Diff 计算、Commit 回滚）。
//! - [`chrono`]：时间戳处理。
//! - [`uuid`]：检查点唯一 ID 生成。
//! - [`tracing`]：结构化日志记录。
//! - [`thiserror`]：错误类型派生。

/// 检查点错误类型定义模块
pub mod error;
/// 检查点存储服务模块
pub mod store;
/// 检查点 Diff 查询服务模块
pub mod query;

// 重新导出子模块的所有公开类型，方便外部通过 `remi_checkpoint::*` 直接访问
pub use error::*;
pub use store::*;
pub use query::*;
