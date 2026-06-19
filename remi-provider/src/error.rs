//! Provider 模块错误类型

use thiserror::Error;

/// Provider 错误
#[derive(Error, Debug)]
pub enum ProviderError {
    #[error("Provider 未找到: {0}")]
    ProviderNotFound(String),

    #[error("会话未找到: {0}")]
    SessionNotFound(String),

    #[error("会话已存在: {0}")]
    SessionAlreadyExists(String),

    #[error("不支持的操作: {0}")]
    UnsupportedOperation(String),

    #[error("适配器错误: {0}")]
    AdapterError(String),

    #[error("内部错误: {0}")]
    InternalError(String),
}

/// Provider 结果类型
pub type ProviderResult<T> = Result<T, ProviderError>;
