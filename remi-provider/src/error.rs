//! Provider 模块错误类型定义
//!
//! 本模块定义了 Provider 模块中所有可能的错误类型，基于 `thiserror` 库实现，
//! 提供类型安全、易于调试的错误处理机制。
//!
//! # 错误类型
//!
//! | 变体 | 说明 | 典型场景 |
//! |------|------|----------|
//! | [`ProviderError::ProviderNotFound`] | Provider 未找到 | Provider 名称拼写错误、适配器未注册 |
//! | [`ProviderError::SessionNotFound`] | 会话未找到 | 会话已过期、thread_id 无效 |
//! | [`ProviderError::SessionAlreadyExists`] | 会话已存在 | 重复创建相同 thread_id 的会话 |
//! | [`ProviderError::UnsupportedOperation`] | 不支持的操作 | 调用了适配器未实现的可选方法 |
//! | [`ProviderError::AdapterError`] | 适配器内部错误 | 底层 SDK 调用失败、网络错误 |
//! | [`ProviderError::InternalError`] | 内部错误 | 程序逻辑错误、未处理的边界情况 |
//!
//! # 设计原则
//!
//! - **类型安全**：通过枚举区分不同错误类型，避免字符串匹配
//! - **上下文丰富**：每个变体都携带 `String` 类型的上下文信息，便于问题定位
//! - **易于调试**：派生 `Debug` trait，支持格式化输出
//! - **兼容标准**：实现 `std::error::Error` trait，可与 `?` 运算符无缝配合
//! - **可扩展性**：新增错误类型只需添加枚举变体，不影响现有代码
//!
//! # 模块依赖
//!
//! - 被 [`crate::adapter`]、[`crate::service`]、[`crate::health`]、[`crate::reaper`] 等模块依赖
//! - 依赖 `thiserror` 库自动生成 `Display` 和 `Error` trait 实现
//!
//! # 使用示例
//!
//! ```rust,ignore
//! use remi_provider::error::{ProviderError, ProviderResult};
//!
//! fn do_something() -> ProviderResult<()> {
//!     // 成功时返回 Ok
//!
Ok(())
//! }
//!
//! fn fail_example() -> ProviderResult<()> {
//!     // 失败时返回具体错误
//!
Err(ProviderError::ProviderNotFound('unknown'.to_string()))
//! }
//! ```

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Provider 错误类型枚举
///
/// 定义了 Provider 模块中所有可能的错误情况，每种错误都携带相关的上下文信息。
/// 使用 `thiserror` 库自动生成 `Display` 和 `Error` trait 实现。
///
/// # 设计原则
///
/// - **类型安全**：通过枚举区分不同错误类型，避免字符串匹配
/// - **上下文丰富**：每个变体都携带 `String` 类型的上下文信息
/// - **易于调试**：派生 `Debug` trait，方便打印调试信息
/// - **兼容标准**：实现 `std::error::Error` trait，可与 `?` 运算符无缝配合
#[derive(Error, Debug, Serialize, Deserialize)]
pub enum ProviderError {
    /// Provider 未找到错误
    ///
    /// 当请求的 Provider 类型未注册时返回此错误。
    /// 常见原因：
    /// - Provider 名称拼写错误
    /// - 对应的 Provider 适配器未注册
    /// - Provider 配置缺失
    #[error("Provider 未找到: {0}")]
    ProviderNotFound(String),

    /// 会话未找到错误
    ///
    /// 当操作的会话不存在时返回此错误。
    /// 常见原因：
    /// - 会话已被清理或超时
    /// - thread_id 无效
    /// - 会话尚未启动
    #[error("会话未找到: {0}")]
    SessionNotFound(String),

    /// 会话已存在错误
    ///
    /// 当尝试创建已存在的会话时返回此错误。
    /// 常见原因：
    /// - 重复启动相同 thread_id 的会话
    /// - 并发创建会话时的竞争条件
    #[error("会话已存在: {0}")]
    SessionAlreadyExists(String),

    /// 不支持的操作错误
    ///
    /// 当调用了 Provider 不支持的操作时返回此错误。
    /// 常见原因：
    /// - 调用了可选的 trait 方法但适配器未实现
    /// - Provider 功能限制
    #[error("不支持的操作: {0}")]
    UnsupportedOperation(String),

    /// 适配器内部错误
    ///
    /// 当 Provider 适配器内部发生错误时返回此错误。
    /// 常见原因：
    /// - 底层 Provider SDK 调用失败
    /// - 网络通信错误
    /// - 协议解析失败
    #[error("适配器错误: {0}")]
    AdapterError(String),

    /// 内部错误
    ///
    /// 当发生未预期的内部错误时返回此错误。
    /// 通常表示程序逻辑错误或未处理的边界情况。
    #[error("内部错误: {0}")]
    InternalError(String),

    /// 启动失败错误
    ///
    /// 当 Provider 子进程（如 Codex App Server）启动失败时返回此错误。
    #[error("启动失败: {0}")]
    StartupFailed(String),
}

/// Provider 操作结果类型别名
///
/// 简化 `Result<T, ProviderError>` 的写法，统一 Provider 模块的返回值类型。
///
/// # 使用示例
///
/// ```rust,ignore
/// fn my_function() -> ProviderResult<String> {
///     Ok("success".to_string())
/// }
/// ```
pub type ProviderResult<T> = Result<T, ProviderError>;

