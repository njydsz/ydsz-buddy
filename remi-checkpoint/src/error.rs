//! Checkpoint 错误定义

use thiserror::Error;

/// Checkpoint 错误类型
#[derive(Error, Debug)]
pub enum CheckpointError {
    #[error("检查点不存在: {0}")]
    NotFound(String),

    #[error("Git 操作失败: {0}")]
    GitOperationFailed(String),

    #[error("序列化失败: {0}")]
    SerializationFailed(String),

    #[error("数据库错误: {0}")]
    DatabaseError(String),

    #[error("IO 错误: {0}")]
    IoError(#[from] std::io::Error),
}

/// Checkpoint 结果类型
pub type CheckpointResult<T> = Result<T, CheckpointError>;
