//! Remi Persistence - 持久化层
//!
//! 本模块负责 SQLite 数据库管理、迁移、事件存储、投影存储

pub mod error;
pub mod event_store;
pub mod migrations;
pub mod projection_repo;
pub mod sqlite_client;

pub use error::*;
pub use event_store::*;
pub use migrations::*;
pub use projection_repo::*;
pub use sqlite_client::*;
