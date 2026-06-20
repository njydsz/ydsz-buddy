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

// From trait implementations for module errors

impl From<remi_auth::AuthError> for ServerError {
    fn from(err: remi_auth::AuthError) -> Self {
        match err {
            remi_auth::AuthError::AuthenticationFailed(msg) => ServerError::AuthenticationFailed(msg),
            remi_auth::AuthError::Forbidden(msg) => ServerError::Forbidden(msg),
            _ => ServerError::InternalError(err.to_string()),
        }
    }
}

impl From<remi_checkpoint::CheckpointError> for ServerError {
    fn from(err: remi_checkpoint::CheckpointError) -> Self {
        ServerError::InternalError(err.to_string())
    }
}

impl From<remi_provider::ProviderError> for ServerError {
    fn from(err: remi_provider::ProviderError) -> Self {
        ServerError::InternalError(err.to_string())
    }
}

impl From<remi_git::GitError> for ServerError {
    fn from(err: remi_git::GitError) -> Self {
        ServerError::InternalError(err.to_string())
    }
}

impl From<remi_terminal::TerminalError> for ServerError {
    fn from(err: remi_terminal::TerminalError) -> Self {
        ServerError::InternalError(err.to_string())
    }
}

impl From<remi_workspace::WorkspaceError> for ServerError {
    fn from(err: remi_workspace::WorkspaceError) -> Self {
        ServerError::InternalError(err.to_string())
    }
}

impl From<remi_orchestration::OrchestrationError> for ServerError {
    fn from(err: remi_orchestration::OrchestrationError) -> Self {
        ServerError::InternalError(err.to_string())
    }
}

impl From<remi_telemetry::TelemetryError> for ServerError {
    fn from(err: remi_telemetry::TelemetryError) -> Self {
        ServerError::InternalError(err.to_string())
    }
}
