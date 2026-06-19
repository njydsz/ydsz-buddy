//! 错误类型定义

use thiserror::Error;

/// 核心错误类型
#[derive(Error, Debug)]
pub enum CoreError {
    #[error("验证错误: {0}")]
    ValidationError(String),

    #[error("未找到: {0}")]
    NotFoundError(String),

    #[error("序列化错误: {0}")]
    SerializationError(String),

    #[error("无效操作: {0}")]
    InvalidOperation(String),

    #[error("内部错误: {0}")]
    InternalError(String),
}

/// 核心结果类型
pub type CoreResult<T> = Result<T, CoreError>;
