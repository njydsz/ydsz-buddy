//! # Remi Config — 配置管理模块
//!
//! 本模块是 `remi-code` 项目的配置中心，负责统一管理服务器运行所需的全部配置信息。
//!
//! ## 核心职责
//!
//! - **CLI 参数解析**：通过 [`config::CliArgs`] 解析命令行参数（基于 `clap`）。
//! - **环境变量读取**：支持通过环境变量覆盖默认配置项（如 `REMI_PORT`、`REMI_HOST` 等）。
//! - **路径派生**：根据基础目录（`base_dir`）自动派生数据库、日志、密钥、附件等子目录路径。
//! - **配置校验**：通过 [`config::ServerConfig::validate`] 对关键配置项进行合法性校验。
//!
//! ## 模块结构
//!
//! | 子模块 | 说明 |
//! |--------|------|
//! | [`config`] | 服务器配置结构体、CLI 参数定义、路径派生与校验逻辑 |
//! | [`error`] | 配置相关的错误类型定义（基于 `thiserror`） |
//!
//! ## 使用示例
//!
//!```rust,ignore
//! #[tokio::main]
//! async fn main() {
//! use remi_config::{CliArgs, ServerConfig};
//! use clap::Parser;
//! 
//! // 从命令行参数和环境变量构建配置
//! let args = CliArgs::parse();
//! let config = ServerConfig::from_args_and_env(args).expect("配置初始化失败");
//! config.validate().expect("配置校验失败");
//! }

/// 服务器配置模块，包含配置结构体、CLI 参数、运行时模式及路径派生逻辑
pub mod config;

/// 配置错误类型模块，定义配置解析与校验过程中可能产生的错误
pub mod error;

// 将子模块中的公开类型重新导出到 crate 根，方便外部直接使用
pub use config::*;
pub use error::*;
