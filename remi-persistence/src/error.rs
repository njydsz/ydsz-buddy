//! 持久化错误类型

use thiserror::Error;

/// 持久化错误
#[derive(Error, Debug)]
pub enum PersistenceError {
    #[error("数据库错误: {0}")]
    DatabaseError(String),

    #[error("迁移错误: {0}")]
    MigrationError(String),

    #[error("序列化错误: {0}")]
    SerializationError(String),

    #[error("未找到: {0}")]
    NotFoundError(String),

    #[error("并发冲突: {0}")]
    ConcurrencyError(String),
}

/// 持久化结果类型
pub type PersistenceResult<T> = Result<T, PersistenceError>;

impl From<rusqlite::Error> for PersistenceError {
    fn from(err: rusqlite::Error) -> Self {
        PersistenceError::DatabaseError(err.to_string())
    }
}

impl From<serde_json::Error> for PersistenceError {
    fn from(err: serde_json::Error) -> Self {
        PersistenceError::SerializationError(err.to_string())
    }
}
