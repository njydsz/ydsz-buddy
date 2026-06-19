//! Remi Provider - AI Provider 管理
//!
//! 本模块负责 Provider 适配器、会话管理、健康检查、事件流

pub mod adapter;
pub mod error;
pub mod health;
pub mod reaper;
pub mod service;

pub use adapter::*;
pub use error::*;
pub use health::*;
pub use reaper::*;
pub use service::*;
