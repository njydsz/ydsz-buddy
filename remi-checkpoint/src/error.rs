//! # Checkpoint 错误定义模块
//!
//! 本模块定义了检查点（Checkpoint）子系统中所有操作可能产生的错误类型。
//! 通过 [`thiserror`] 库派生 [`std::error::Error`] trait，提供统一的错误枚举
//! [`CheckpointError`] 和便捷的结果类型别名 [`CheckpointResult`]。
//!
//! ## 设计原则
//!
//! - **穷举性**：覆盖检查点操作中所有可能的失败场景，包括检查点不存在、
//!   Git 操作失败、序列化失败、数据库错误和底层 IO 错误。
//! - **可转换性**：对 [`std::io::Error`] 自动实现 `From` trait，支持使用 `?` 运算符
//!   在函数中直接透传 IO 错误。
//! - **可读性**：每个错误变体均提供中文格式化描述，便于日志输出和用户提示。
//!
//! ## 使用示例
//!
//! ```rust,ignore
//! use remi_checkpoint::error::{CheckpointError, CheckpointResult};
//!
//! fn do_something() -> CheckpointResult<()> {
//!     // 当检查点不存在时
//!     Err(CheckpointError::NotFound("checkpoint-123".to_string()))
//! }
//! ```

use thiserror::Error;

/// # Checkpoint 错误类型
///
/// 枚举了检查点子系统中所有可能的错误场景。每个变体携带一个 `String` 类型的
/// 上下文信息，用于描述具体的错误原因。
///
/// ## 变体说明
///
/// | 变体 | 触发场景 |
/// |------|----------|
/// | [`NotFound`](CheckpointError::NotFound) | 按 ID 查询检查点时，目标检查点不存在 |
/// | [`GitOperationFailed`](CheckpointError::GitOperationFailed) | 调用 Git 底层操作（如 diff、revert）失败 |
/// | [`SerializationFailed`](CheckpointError::SerializationFailed) | 检查点数据的序列化或反序列化失败 |
/// | [`DatabaseError`](CheckpointError::DatabaseError) | 数据库读写操作失败（如持久化、查询） |
/// | [`IoError`](CheckpointError::IoError) | 底层文件系统 IO 错误（自动从 [`std::io::Error`] 转换） |
#[derive(Error, Debug)]
pub enum CheckpointError {
    /// 检查点不存在
    ///
    /// 当通过 ID 查询、删除或回滚检查点时，若目标检查点在存储中不存在，则返回此错误。
    ///
    /// - **参数**：`String` - 不存在检查点的 ID
    #[error("检查点不存在: {0}")]
    NotFound(String),

    /// Git 操作失败
    ///
    /// 当调用底层 Git 操作（如计算两个 Commit 之间的 Diff、回滚到指定 Commit）失败时，
    /// 返回此错误。通常由 [`remi_git::GitCore`] 的错误转换而来。
    ///
    /// - **参数**：`String` - Git 操作的错误描述信息
    #[error("Git 操作失败: {0}")]
    GitOperationFailed(String),

    /// 序列化失败
    ///
    /// 当检查点数据在序列化（如转为 JSON）或反序列化（如从 JSON 解析）过程中失败时，
    /// 返回此错误。
    ///
    /// - **参数**：`String` - 序列化/反序列化的错误描述信息
    #[error("序列化失败: {0}")]
    SerializationFailed(String),

    /// 数据库错误
    ///
    /// 当检查点的持久化存储（如 SQLite、PostgreSQL 等数据库）发生读写错误时，
    /// 返回此错误。
    ///
    /// - **参数**：`String` - 数据库操作的错误描述信息
    #[error("数据库错误: {0}")]
    DatabaseError(String),

    /// IO 错误
    ///
    /// 底层文件系统操作（如文件读写、目录创建）失败时产生的错误。
    /// 通过 `#[from]` 属性自动实现 `From<std::io::Error>`，支持使用 `?` 运算符
    /// 直接透传标准 IO 错误。
    ///
    /// - **参数**：`std::io::Error` - 标准库 IO 错误
    #[error("IO 错误: {0}")]
    IoError(#[from] std::io::Error),
}

/// # Checkpoint 结果类型别名
///
/// 对 [`Result<T, CheckpointError>`] 的类型别名，简化检查点子系统中所有函数的返回值声明。
///
/// ## 使用场景
///
/// 所有可能产生 [`CheckpointError`] 的函数均应返回此类型，以保持错误处理的一致性。
///
/// ```rust,ignore
/// use remi_checkpoint::error::CheckpointResult;
///
/// fn example() -> CheckpointResult<String> {
///     Ok("success".to_string())
/// }
/// ```
pub type CheckpointResult<T> = Result<T, CheckpointError>;
