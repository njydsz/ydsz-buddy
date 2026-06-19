//! Remi Orchestration - 编排引擎
//!
//! 本模块负责命令分发、事件持久化、投影器、读模型查询、Reactor 模式

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
