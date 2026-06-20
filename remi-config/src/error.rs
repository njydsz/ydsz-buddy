//! # 配置错误类型
//!
//! 本模块定义了配置管理过程中可能产生的所有错误类型。
//!
//! 基于 `thiserror` 派生 `Display` 和 `Error` trait，提供统一的错误分类与友好的中文错误信息。
//! 同时通过 [`ConfigResult`] 类型别名简化函数签名中的错误处理。

use thiserror::Error;

/// 配置错误枚举
///
/// 涵盖配置管理全流程中可能出现的四类错误：
///
/// | 变体 | 触发场景 |
/// |------|----------|
/// | [`ParseError`](ConfigError::ParseError) | 配置文件格式解析失败 |
/// | [`PathError`](ConfigError::PathError) | 路径无效或路径操作失败 |
/// | [`EnvError`](ConfigError::EnvError) | 环境变量读取失败 |
/// | [`ValidationError`](ConfigError::ValidationError) | 配置值合法性校验失败 |
///
/// # 示例
///
///```rust,ignore
/// use remi_config::ConfigError;
///
/// let err = ConfigError::ParseError("JSON 格式错误".to_string());
/// assert_eq!(format!("{}", err), "配置解析错误: JSON 格式错误");
/// ```
#[derive(Error, Debug)]
pub enum ConfigError {
    /// 配置解析错误
    ///
    /// 当配置文件（如 JSON、TOML）格式不合法或字段缺失时返回。
    ///
    /// - `String` — 具体的解析失败原因描述
    #[error("配置解析错误: {0}")]
    ParseError(String),

    /// 路径错误
    ///
    /// 当配置中的文件路径无效、不可访问或路径转换失败时返回。
    ///
    /// - `String` — 具体的路径错误原因描述
    #[error("路径错误: {0}")]
    PathError(String),

    /// 环境变量错误
    ///
    /// 当必需的环境变量未设置或读取失败时返回。
    ///
    /// - `String` — 具体的环境变量错误原因描述
    #[error("环境变量错误: {0}")]
    EnvError(String),

    /// 配置校验错误
    ///
    /// 当配置值不满足业务约束（如端口号为 0、路径为空等）时返回。
    ///
    /// - `String` — 具体的校验失败原因描述
    #[error("验证错误: {0}")]
    ValidationError(String),
}

/// 配置操作的结果类型别名
///
/// 将 `Result<T, ConfigError>` 简化为 `ConfigResult<T>`，
/// 统一配置模块中所有可能失败的操作的返回值类型，提升代码可读性。
///
/// # 泛型参数
///
/// - `T` — 操作成功时返回的值类型
pub type ConfigResult<T> = Result<T, ConfigError>;
