//! `remi-core` 统一错误模型
//!
//! 设计要点：
//! - 使用 `thiserror` 派生 [`Error`]，避免手写 `Display`/`From` 样板。
//! - 每个变体对应一个业务错误大类（配置、数据库、IO、序列化、认证、提供商、Git、工作区、编排、内部）。
//! - 对常见标准库错误（`std::io::Error`、`serde_json::Error`、`figment::Error`）实现 `From`，
//!   允许使用 `?` 运算符在调用点透明传播。
//! - 整个工作区统一使用 [`Result<T>`] 别名，保持错误处理风格一致。
//!
//! # 错误变体分类速查
//! - `Config`：配置加载/校验错误（figment 错误自动归一化到此）。
//! - `Database`：持久化层错误（SQLite/SQLx 等）。
//! - `Io`：标准 IO 错误（文件读写、目录创建等）。
//! - `Serialization`：JSON/YAML 等序列化错误。
//! - `Auth`：认证与授权错误。
//! - `Provider`：上游 AI 提供商错误。
//! - `Git`：Git 仓储操作错误。
//! - `Workspace`：工作区路径/索引错误。
//! - `Orchestration`：会话编排/状态机错误。
//! - `Internal`：兜底内部错误，不应对外暴露具体原因。

use thiserror::Error;

/// Remi Code 顶层错误类型
///
/// 所有子 crate 的错误处理均应最终归一化到本类型，便于上层做日志聚合、对外 HTTP 状态码映射、
/// 以及 Sentry/观测平台埋点。
#[derive(Error, Debug, Clone)]
pub enum Error {
    /// 配置加载/校验错误（例如端口非法、必填项缺失）
    #[error("配置错误：{0}")]
    Config(String),

    /// 数据库错误（连接、查询、迁移等）
    #[error("数据库错误：{0}")]
    Database(String),

    /// 标准 I/O 错误（文件不存在、权限不足等）
    #[error("I/O 错误：{0}")]
    Io(String),

    /// 序列化/反序列化错误（JSON、YAML、MsgPack 等）
    #[error("序列化错误：{0}")]
    Serialization(String),

    /// 认证或授权失败
    #[error("认证错误：{0}")]
    Auth(String),

    /// 上游 AI 提供商调用失败
    #[error("提供商错误：{0}")]
    Provider(String),

    /// Git 操作错误
    #[error("Git 错误：{0}")]
    Git(String),

    /// 工作区路径或索引错误
    #[error("工作区错误：{0}")]
    Workspace(String),

    /// 会话编排/状态机错误
    #[error("编排错误：{0}")]
    Orchestration(String),

    /// 内部错误，兜底使用，不应对外暴露具体上下文
    #[error("内部错误：{0}")]
    Internal(String),
}

/// 将 [`std::io::Error`] 自动转换为 [`Error::Io`]
impl From<std::io::Error> for Error {
    fn from(err: std::io::Error) -> Self {
        Self::Io(err.to_string())
    }
}

/// 将 [`serde_json::Error`] 自动转换为 [`Error::Serialization`]
impl From<serde_json::Error> for Error {
    fn from(err: serde_json::Error) -> Self {
        Self::Serialization(err.to_string())
    }
}

/// 将 [`figment::Error`] 自动转换为 [`Error::Config`]
impl From<figment::Error> for Error {
    fn from(err: figment::Error) -> Self {
        Self::Config(err.to_string())
    }
}

/// 使用核心 [`Error`] 类型的 Result 别名
///
/// 在工作区内的子 crate 中通常会重新导出本别名，方便统一错误处理。
pub type Result<T, E = Error> = std::result::Result<T, E>;
