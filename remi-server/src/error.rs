//! Server 错误定义

use thiserror::Error;

/// Server 错误类型
#[derive(Error, Debug)]
pub enum ServerError {
    #[error("WebSocket 错误: {0}")]
    WebSocketError(String),

    #[error("RPC 方法未找到: {0}")]
    MethodNotFound(String),

    #[error("RPC 参数无效: {0}")]
    InvalidParams(String),

    #[error("认证失败: {0}")]
    AuthenticationFailed(String),

    #[error("权限不足: {0}")]
    Forbidden(String),

    #[error("内部错误: {0}")]
    InternalError(String),

    #[error("IO 错误: {0}")]
    IoError(#[from] std::io::Error),
}

/// Server 结果类型
pub type ServerResult<T> = Result<T, ServerError>;
