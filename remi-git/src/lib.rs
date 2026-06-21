//! # Remi Git 模块
//!
//! 本模块是 Remi 系统中负责 Git 版本控制操作的核心服务层，提供对 Git 命令的高层封装。
//!
//! ## 模块职责
//!
//! - **Git 命令封装**：将底层 Git CLI 命令封装为类型安全的异步接口，屏蔽进程调用细节
//! - **分支管理**：支持分支的创建、切换、列表查询等操作
//! - **Worktree 管理**：支持 Git worktree 的创建与删除，实现多分支并行开发
//! - **状态监控与广播**：实时获取仓库状态（分支、暂存、修改、未跟踪文件等），并通过事件广播机制通知订阅者
//! - **高级操作编排**：提供堆叠式操作（提交→推送→创建 PR）等组合工作流
//! - **GitHub 集成**：通过 `gh` CLI 封装 Pull Request、Issue 等 GitHub 操作
//!
//! ## 模块结构
//!
//! | 子模块 | 职责 |
//! |--------|------|
//! | [`core`] | Git 核心操作层，封装所有底层 Git 命令的执行 |
//! | [`broadcaster`] | Git 状态广播器，负责状态的缓存、定时刷新与事件分发 |
//! | [`manager`] | Git 高级操作管理器，编排堆叠式操作（commit/push/PR）和 worktree 线程切换 |
//! | [`managed_worktree`] | 托管 Worktree 的生命周期管理 |
//! | [`github_cli`] | GitHub CLI (`gh`) 命令封装，用于 PR/Issue 等操作 |
//! | [`text_generation`] | 提交信息/PR 描述的 AI 文本生成辅助 |
//! | [`error`] | 统一的错误类型定义，基于 `thiserror` 实现 |
//!
//! ## 使用场景
//!
//! - AI Agent 需要在代码仓库中执行 Git 操作（提交、推送、分支切换等）
//! - 前端 UI 需要实时展示仓库状态变更（通过广播器的订阅机制）
//! - 多任务并行开发时，通过 worktree 实现分支隔离
//!
//! ## 典型用法
//!
//!```rust,ignore
//! #[tokio::main]
//! async fn main() {
//! use std::sync::Arc;
//! use remi_git::{GitCore, GitManager, GitStatusBroadcaster};
//! 
//! let core = Arc::new(GitCore::new());
//! let manager = GitManager::new(core.clone());
//! let broadcaster = GitStatusBroadcaster::new(core, Duration::from_secs(5));
//! }

pub mod broadcaster;
pub mod core;
pub mod error;
pub mod github_cli;
pub mod managed_worktree;
pub mod manager;
pub mod text_generation;

pub use broadcaster::*;
pub use core::*;
pub use error::*;
pub use github_cli::*;
pub use managed_worktree::*;
pub use manager::*;
pub use text_generation::*;
