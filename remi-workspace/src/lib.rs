//! # Remi Workspace - 工作空间与文件系统管理模块
//!
//! ## 模块职责
//!
//! 本模块是 Remi 系统中负责**工作空间管理**的核心模块，提供对本地文件系统的统一抽象。
//! 主要职责包括：
//!
//! - **目录浏览**：支持递归/非递归浏览目录结构，返回结构化的目录条目信息
//! - **文件搜索**：基于名称匹配和 glob 模式的文件/目录搜索，支持大小写不敏感查询
//! - **文件操作**：提供安全的文件读写、删除、存在性检查等操作，内置路径安全校验
//! - **路径安全**：所有文件操作均经过路径合法性验证，防止路径穿越攻击（Path Traversal）
//!
//! ## 核心功能
//!
//! | 功能 | 说明 | 对应子模块 |
//! |------|------|-----------|
//! | 目录浏览 | 列出指定目录下的文件和子目录，支持深度控制和隐藏文件过滤 | [`entries`] |
//! | 文件搜索 | 按名称关键字和文件类型模式搜索工作空间内的文件 | [`entries`] |
//! | 目录列举 | 递归列出工作空间内的所有目录结构 | [`entries`] |
//! | 文件读写 | 安全地读取和写入工作空间内的文件 | [`filesystem`] |
//! | 文件删除 | 删除工作空间内的指定文件 | [`filesystem`] |
//! | 错误处理 | 统一的错误类型定义和结果类型别名 | [`error`] |
//!
//! ## 使用场景
//!
//! - IDE/编辑器中的文件树浏览与展示
//! - 工作空间内的文件快速搜索与定位
//! - 代码生成、文件创建等需要安全写入文件的场景
//! - 任何需要限制在指定工作空间根目录内操作文件的上层应用
//!
//! ## 模块结构
//!
//! - [`error`] — 定义工作空间相关的错误类型（`WorkspaceError`）和结果类型别名（`WorkspaceResult`）
//! - [`entries`] — 提供目录浏览、文件搜索、目录列举等功能（`WorkspaceEntries` 服务）
//! - [`filesystem`] — 提供文件读写、删除、存在性检查等文件系统操作（`WorkspaceFileSystem` 服务）
//!
//! ## 安全设计
//!
//! 所有文件操作均通过 [`filesystem::WorkspaceFileSystem::validate_path`] 进行路径校验，
//! 确保操作目标路径不会超出工作空间根目录，从而防止路径穿越等安全风险。
//!
//! ## 典型用法
//!
//! ```rust,no_run
//! #[tokio::main]
//! async fn main() {
//! use remi_workspace::{WorkspaceEntries, WorkspaceFileSystem, BrowseInput};
//! 
//! // 浏览工作空间根目录
//! let entries = WorkspaceEntries::new();
//! let result = entries.browse(BrowseInput {
//!     cwd: "/path/to/workspace".to_string(),
//!     relative_path: None,
//!     include_hidden: false,
//!     max_depth: Some(2),
//! }).await.unwrap();
//! 
//! // 安全地读取文件
//! let fs = WorkspaceFileSystem::new();
//! let content = fs.read_file("/path/to/workspace", "src/main.rs").await.unwrap();
//! }

/// 工作空间目录浏览与搜索模块，提供目录结构遍历、文件搜索和目录列举功能
pub mod entries;

/// 工作空间错误类型定义模块，包含统一的错误枚举和结果类型别名
pub mod error;

/// 工作空间文件系统操作模块，提供安全的文件读写、删除和存在性检查功能
pub mod filesystem;

// 重导出子模块的所有公开类型，方便上层调用方直接使用
pub use entries::*;
pub use error::*;
pub use filesystem::*;
