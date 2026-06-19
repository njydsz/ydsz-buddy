//! Auth 模块错误类型

use thiserror::Error;

/// Auth 错误
#[derive(Error, Debug)]
pub enum AuthError {
    #[error("认证失败: {0}")]
    AuthenticationFailed(String),

    #[error("令牌无效")]
    InvalidToken,

    #[error("令牌已过期")]
    TokenExpired,

    #[error("会话不存在: {0}")]
    SessionNotFound(String),

    #[error("权限不足: {0}")]
    Forbidden(String),

    #[error("密钥存储错误: {0}")]
    SecretStoreError(String),

    #[error("配对链接不存在: {0}")]
    PairingLinkNotFound(String),

    #[error("内部错误: {0}")]
    InternalError(String),
}

/// Auth 结果类型
pub type AuthResult<T> = Result<T, AuthError>;
