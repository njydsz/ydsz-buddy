//! # 服务器错误类型定义模块
//!
//! 本模块定义了 remi-server 统一的错误类型 [`ServerError`]，以及对应的结果类型别名 [`ServerResult`]。
//! 所有子模块（认证、Git、终端、工作空间、编排引擎、Provider、检查点、遥测）的错误
//! 均通过实现 `From` trait 自动转换为 [`ServerError`]，从而支持 `?` 操作符进行错误传播。
//!
//! ## 错误分类
//!
//! - **协议级错误**：方法未找到、参数无效（对应 JSON-RPC 2.0 标准错误码）
//! - **认证级错误**：认证失败、权限不足
//! - **系统级错误**：WebSocket 通信错误、IO 错误、内部错误

use thiserror::Error;

/// 服务器统一错误类型
///
/// 涵盖了 WebSocket 通信、RPC 协议、认证授权、IO 操作等各层错误。
/// 各子模块错误通过 `From` trait 实现自动转换。
#[derive(Error, Debug)]
pub enum ServerError {
    /// WebSocket 通信错误，如连接断开、消息发送失败等
    #[error("WebSocket 错误: {0}")]
    WebSocketError(String),

    /// RPC 方法未找到，对应 JSON-RPC 2.0 标准错误码 -32601
    #[error("RPC 方法未找到: {0}")]
    MethodNotFound(String),

    /// RPC 参数无效，对应 JSON-RPC 2.0 标准错误码 -32602
    #[error("RPC 参数无效: {0}")]
    InvalidParams(String),

    /// 认证失败，如凭证无效、会话过期等
    #[error("认证失败: {0}")]
    AuthenticationFailed(String),

    /// 权限不足，当前会话无权执行该操作
    #[error("权限不足: {0}")]
    Forbidden(String),

    /// 服务器内部错误，由各子模块错误转换而来
    #[error("内部错误: {0}")]
    InternalError(String),

    /// IO 错误，如文件读写、网络绑定失败等
    #[error("IO 错误: {0}")]
    IoError(#[from] std::io::Error),
}

/// 服务器统一结果类型
///
/// 所有服务器端函数的返回值均使用此类型别名，便于统一错误处理。
pub type ServerResult<T> = Result<T, ServerError>;

// ===== From trait 实现：各子模块错误到 ServerError 的自动转换 =====

/// 将认证模块错误转换为服务器错误
///
/// - `AuthenticationFailed` → [`ServerError::AuthenticationFailed`]
/// - `Forbidden` → [`ServerError::Forbidden`]
/// - 其他认证错误 → [`ServerError::InternalError`]
impl From<remi_auth::AuthError> for ServerError {
    fn from(err: remi_auth::AuthError) -> Self {
        match err {
            remi_auth::AuthError::AuthenticationFailed(msg) => ServerError::AuthenticationFailed(msg),
            remi_auth::AuthError::Forbidden(msg) => ServerError::Forbidden(msg),
            _ => ServerError::InternalError(err.to_string()),
        }
    }
}

/// 将检查点模块错误转换为服务器内部错误
impl From<remi_checkpoint::CheckpointError> for ServerError {
    fn from(err: remi_checkpoint::CheckpointError) -> Self {
        ServerError::InternalError(err.to_string())
    }
}

/// 将 Provider 模块错误转换为服务器内部错误
impl From<remi_provider::ProviderError> for ServerError {
    fn from(err: remi_provider::ProviderError) -> Self {
        ServerError::InternalError(err.to_string())
    }
}

/// 将 Git 模块错误转换为服务器内部错误
impl From<remi_git::GitError> for ServerError {
    fn from(err: remi_git::GitError) -> Self {
        ServerError::InternalError(err.to_string())
    }
}

/// 将终端模块错误转换为服务器内部错误
impl From<remi_terminal::TerminalError> for ServerError {
    fn from(err: remi_terminal::TerminalError) -> Self {
        ServerError::InternalError(err.to_string())
    }
}

/// 将工作空间模块错误转换为服务器内部错误
impl From<remi_workspace::WorkspaceError> for ServerError {
    fn from(err: remi_workspace::WorkspaceError) -> Self {
        ServerError::InternalError(err.to_string())
    }
}

/// 将编排引擎模块错误转换为服务器内部错误
impl From<remi_orchestration::OrchestrationError> for ServerError {
    fn from(err: remi_orchestration::OrchestrationError) -> Self {
        ServerError::InternalError(err.to_string())
    }
}

/// 将遥测模块错误转换为服务器内部错误
impl From<remi_telemetry::TelemetryError> for ServerError {
    fn from(err: remi_telemetry::TelemetryError) -> Self {
        ServerError::InternalError(err.to_string())
    }
}

