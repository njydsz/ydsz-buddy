//! # 错误类型定义
//!
//! 本模块定义了 Remi Core 模块的统一错误类型与结果别名。
//! 所有核心层的操作均使用 [`CoreError`] 作为错误类型，
//! 并通过 [`CoreResult<T>`] 作为返回值类型别名，简化函数签名。
//!
//! ## 错误分类
//!
//! | 变体 | 用途 | 典型场景 |
//! |------|------|----------|
//! | [`ValidationError`](CoreError::ValidationError) | 输入数据校验失败 | 参数格式不正确、必填字段缺失 |
//! | [`NotFoundError`](CoreError::NotFoundError) | 请求的资源不存在 | 项目/线程/消息 ID 无效 |
//! | [`SerializationError`](CoreError::SerializationError) | 序列化/反序列化失败 | JSON 解析错误、数据格式不匹配 |
//! | [`InvalidOperation`](CoreError::InvalidOperation) | 非法的业务操作 | 对已删除的线程发送消息、状态转换不合法 |
//! | [`InternalError`](CoreError::InternalError) | 内部未预期的错误 | 系统内部异常、不可恢复的错误 |
//!
//! ## 使用示例
//!
//! ```rust
//! use remi_core::{CoreError, CoreResult};
//!
//! fn lookup_id(id: &str) -> CoreResult<String> {
//!     // 查找资源...
//!     Err(CoreError::NotFoundError(format!('资源 {} 不存在', id)))
//! }
//! ```

use thiserror::Error;

/// # 核心错误类型
///
/// Remi Core 模块的统一错误枚举，涵盖核心层所有可能的错误场景。
/// 使用 [`thiserror`] 派生 [`std::error::Error`] 实现，
/// 每个变体通过 `#[error(...)]` 属性定义人类可读的错误消息格式。
///
/// ## 错误处理建议
///
/// - [`ValidationError`](CoreError::ValidationError) 和
///   [`NotFoundError`](CoreError::NotFoundError) 属于**可恢复错误**，
///   通常由用户输入引起，应向用户展示友好的错误提示
/// - [`InvalidOperation`](CoreError::InvalidOperation) 属于**业务逻辑错误**，
///   通常表示调用方违反了业务约束
/// - [`SerializationError`](CoreError::SerializationError) 和
///   [`InternalError`](CoreError::InternalError) 属于**系统错误**，
///   通常表示程序内部异常，应记录日志并上报
#[derive(Error, Debug)]
pub enum CoreError {
    /// 验证错误
    ///
    /// 当输入数据未通过校验时返回。
    /// 常见场景包括：参数格式不正确、必填字段缺失、值超出合法范围等。
    ///
    /// # 示例
    ///
    /// ```rust
    /// use remi_core::CoreError;
    ///
    /// let err = CoreError::ValidationError('项目标题不能为空'.to_string());
    /// assert_eq!(err.to_string(), '验证错误: 项目标题不能为空');
    /// ```
    #[error("验证错误: {0}")]
    ValidationError(String),

    /// 未找到错误
    ///
    /// 当请求的资源不存在时返回。
    /// 常见场景包括：项目 ID、线程 ID、消息 ID 等无效或已被删除。
    ///
    /// # 示例
    ///
    /// ```rust
    /// use remi_core::CoreError;
    ///
    /// let err = CoreError::NotFoundError('线程不存在'.to_string());
    /// assert_eq!(err.to_string(), '未找到: 线程不存在');
    /// ```
    #[error("未找到: {0}")]
    NotFoundError(String),

    /// 序列化错误
    ///
    /// 当数据的序列化或反序列化操作失败时返回。
    /// 常见场景包括：JSON 格式不合法、字段类型不匹配、数据损坏等。
    ///
    /// # 示例
    ///
    /// ```rust
    /// use remi_core::CoreError;
    ///
    /// let err = CoreError::SerializationError('JSON 解析失败: 缺少字段 'id''.to_string());
    /// assert_eq!(err.to_string(), '序列化错误: JSON 解析失败: 缺少字段 'id'');
    /// ```
    #[error("序列化错误: {0}")]
    SerializationError(String),

    /// 无效操作错误
    ///
    /// 当执行了违反业务规则的操作时返回。
    /// 常见场景包括：对已删除的线程发送消息、在错误的会话状态下启动 Turn 等。
    ///
    /// # 示例
    ///
    /// ```rust
    /// use remi_core::CoreError;
    ///
    /// let err = CoreError::InvalidOperation('无法在已归档的线程中发送消息'.to_string());
    /// assert_eq!(err.to_string(), '无效操作: 无法在已归档的线程中发送消息');
    /// ```
    #[error("无效操作: {0}")]
    InvalidOperation(String),

    /// 内部错误
    ///
    /// 当发生未预期的系统内部错误时返回。
    /// 此类错误通常表示程序 Bug 或不可恢复的异常，应记录详细日志并上报。
    ///
    /// # 示例
    ///
    /// ```rust
    /// use remi_core::CoreError;
    ///
    /// let err = CoreError::InternalError('数据库连接超时'.to_string());
    /// assert_eq!(err.to_string(), '内部错误: 数据库连接超时');
    /// ```
    #[error("内部错误: {0}")]
    InternalError(String),
}

/// # 核心结果类型
///
/// 基于 [`CoreError`] 的结果类型别名，用于简化函数签名。
/// 所有核心层的操作均应返回此类型。
///
/// ## 泛型参数
///
/// - `T`: 操作成功时返回的值类型
///
/// ## 使用示例
///
/// ```rust
/// use remi_core::CoreResult;
///
/// fn do_something() -> CoreResult<String> {
///     Ok('成功'.to_string())
/// }
/// ```
pub type CoreResult<T> = Result<T, CoreError>;
