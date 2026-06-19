//! `remi-core`：Remi Code 公共基础库
//!
//! 本 crate 是整个工作区（workspace）中其他所有子 crate 共享的"基础层"，专注于提供与
//! 业务无关、可被任意模块复用的基础能力，避免在子 crate 中重复造轮子。
//!
//! 设计原则（参考大厂基础设施规范）：
//! - **零业务依赖**：本 crate 不感知任何上层业务（线程、消息、提供商等），仅提供基础设施。
//! - **稳定优先**：对外暴露的 API 一旦发布即视为稳定，新增功能以可选字段或新类型扩展。
//! - **配置集中**：所有可配置项（服务器、日志、数据库、CORS、安全、提供商）统一在 `config` 模块管理。
//! - **错误统一**：所有模块共享 [`Error`] 与 [`Result`]，便于上层做错误归一化处理。
//!
//! # 模块概览
//! - [`config`]：从环境变量（`REMI_CODE_*`）和 `remi-code.toml` 加载的服务器配置项。
//! - [`error`]：统一的错误类型 [`Error`] 与 [`Result`] 别名，支持从 `io`/`serde_json`/`figment` 转换。
//! - [`log`]：基于 `tracing` + `tracing-subscriber` 的日志初始化，支持 JSON / 美化两种输出。
//! - [`runtime_mode`]：根据环境变量与配置识别"桌面/服务器/开发"运行模式。
//! - [`types`]：跨模块复用的强类型 ID（线程、项目、轮次、消息等）与分页模型。
//!
//! # 使用示例
//! ```no_run
//! use remi_core::{ServerConfig, log};
//!
//! let config = ServerConfig::load()?;
//! log::init(&config.log)?;
//! # Ok::<(), remi_core::Error>(())
//! ```

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
