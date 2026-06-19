//! Remi Git - Git 操作服务
//!
//! 本模块负责 Git 命令封装、分支管理、worktree、状态广播

pub mod broadcaster;
pub mod core;
pub mod error;
pub mod manager;

pub use broadcaster::*;
pub use core::*;
pub use error::*;
pub use manager::*;
