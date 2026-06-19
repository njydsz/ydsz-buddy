//! 配置错误类型

use thiserror::Error;

/// 配置错误
#[derive(Error, Debug)]
pub enum ConfigError {
    #[error("配置解析错误: {0}")]
    ParseError(String),

    #[error("路径错误: {0}")]
    PathError(String),

    #[error("环境变量错误: {0}")]
    EnvError(String),

    #[error("验证错误: {0}")]
    ValidationError(String),
}

/// 配置结果类型
pub type ConfigResult<T> = Result<T, ConfigError>;
