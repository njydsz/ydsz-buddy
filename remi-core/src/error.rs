//! Remi Code 核心错误类型

use thiserror::Error;

/// Remi Code 操作的主错误类型
#[derive(Error, Debug, Clone)]
pub enum Error {
    /// 配置错误
    #[error("配置错误：{0}")]
    Config(String),

    /// 数据库错误
    #[error("数据库错误：{0}")]
    Database(String),

    /// I/O 错误
    #[error("I/O 错误：{0}")]
    Io(String),

    /// 序列化错误
    #[error("序列化错误：{0}")]
    Serialization(String),

    /// 认证错误
    #[error("认证错误：{0}")]
    Auth(String),

    /// 提供商错误
    #[error("提供商错误：{0}")]
    Provider(String),

    /// Git 错误
    #[error("Git 错误：{0}")]
    Git(String),

    /// 工作区错误
    #[error("工作区错误：{0}")]
    Workspace(String),

    /// 编排错误
    #[error("编排错误：{0}")]
    Orchestration(String),

    /// 内部错误
    #[error("内部错误：{0}")]
    Internal(String),
}

impl From<std::io::Error> for Error {
    fn from(err: std::io::Error) -> Self {
        Self::Io(err.to_string())
    }
}

impl From<serde_json::Error> for Error {
    fn from(err: serde_json::Error) -> Self {
        Self::Serialization(err.to_string())
    }
}

impl From<figment::Error> for Error {
    fn from(err: figment::Error) -> Self {
        Self::Config(err.to_string())
    }
}

/// 使用核心 Error 类型的 Result 类型别名
pub type Result<T, E = Error> = std::result::Result<T, E>;
