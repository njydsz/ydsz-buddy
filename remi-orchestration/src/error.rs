//! 编排引擎错误类型

use thiserror::Error;

/// 编排引擎错误
#[derive(Error, Debug)]
pub enum OrchestrationError {
    #[error("持久化错误: {0}")]
    PersistenceError(#[from] remi_persistence::PersistenceError),

    #[error("序列化错误: {0}")]
    SerializationError(String),

    #[error("命令处理错误: {0}")]
    CommandError(String),

    #[error("投影错误: {0}")]
    ProjectionError(String),

    #[error("内部错误: {0}")]
    InternalError(String),
}

/// 编排引擎结果类型
pub type OrchestrationResult<T> = Result<T, OrchestrationError>;

impl From<serde_json::Error> for OrchestrationError {
    fn from(err: serde_json::Error) -> Self {
        OrchestrationError::SerializationError(err.to_string())
    }
}
