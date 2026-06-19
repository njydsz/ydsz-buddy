//! Remi Core - 核心领域模型与合约
//!
//! 本模块定义了跨模块共享的领域模型、事件、命令、错误类型

pub mod commands;
pub mod error;
pub mod events;
pub mod models;
pub mod provider;

pub use error::*;
