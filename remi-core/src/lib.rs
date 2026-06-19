//! Remi Code 核心类型和工具库
//!
//! 本 crate 包含所有 Remi Code 模块共享的类型、错误定义和配置结构。

pub mod config;
pub mod error;
pub mod log;
pub mod runtime_mode;
pub mod types;

pub use config::{
    CorsConfig, DatabaseConfig, LogConfig, LogFormat, ProviderConfig, ProviderSettings,
    RuntimeMode, SecurityConfig, ServerConfig, ServerSettings,
};
pub use error::{Error, Result};
pub use runtime_mode::{EffectiveRuntimeMode, detect};
pub use types::{
    MessageId, Page, PageRequest, ProjectId, ProviderSessionId, TerminalId, ThreadId, Timestamp,
    TurnId, WorktreeId, now, now_string,
};
