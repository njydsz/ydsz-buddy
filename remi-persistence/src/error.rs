//! 持久化层错误类型定义
//!
//! 本模块定义了持久化层可能遇到的所有错误类型，包括数据库错误、迁移错误、序列化错误等。
//! 通过统一的错误类型，便于上层调用者进行错误处理和恢复。

use thiserror::Error;

/// 持久化层错误枚举
///
/// 定义了持久化操作中可能遇到的各种错误类型，每种错误都包含详细的错误信息。
/// 使用 `thiserror` 库自动实现 `Display` 和 `Error` trait，便于错误传播和格式化。
///
/// # 变体说明
///
/// - `DatabaseError`: 数据库操作相关的错误，如 SQL 执行失败、连接问题等
/// - `MigrationError`: 数据库迁移过程中的错误，如迁移脚本执行失败
/// - `SerializationError`: 数据序列化/反序列化错误，如 JSON 转换失败
/// - `NotFoundError`: 请求的资源未找到，如查询不存在的记录
/// - `ConcurrencyError`: 并发操作冲突导致的错误，如乐观锁冲突
#[derive(Error, Debug)]
pub enum PersistenceError {
    /// 数据库错误
    ///
    /// 当底层数据库操作失败时返回此错误，包括但不限于：
    /// - SQL 语法错误
    /// - 约束违反（唯一性、外键等）
    /// - 连接失败或超时
    /// - 文件系统错误
    ///
    /// # 参数
    ///
    /// * `String` - 数据库返回的详细错误信息
    #[error("数据库错误: {0}")]
    DatabaseError(String),

    /// 迁移错误
    ///
    /// 当数据库迁移过程中发生错误时返回，包括：
    /// - 迁移脚本执行失败
    /// - 版本冲突
    /// - 迁移状态不一致
    ///
    /// # 参数
    ///
    /// * `String` - 迁移失败的详细原因
    #[error("迁移错误: {0}")]
    MigrationError(String),

    /// 序列化错误
    ///
    /// 当数据在 Rust 对象和存储格式（如 JSON）之间转换失败时返回，包括：
    /// - JSON 序列化/反序列化失败
    /// - 数据格式不匹配
    /// - 字段缺失或类型错误
    ///
    /// # 参数
    ///
    /// * `String` - 序列化过程的详细错误信息
    #[error("序列化错误: {0}")]
    SerializationError(String),

    /// 未找到错误
    ///
    /// 当请求查询的资源不存在时返回，例如：
    /// - 查询不存在的记录 ID
    /// - 访问已删除的资源
    ///
    /// # 参数
    ///
    /// * `String` - 描述未找到资源的上下文信息
    #[error("未找到: {0}")]
    NotFoundError(String),

    /// 并发冲突错误
    ///
    /// 当多个并发操作产生冲突时返回，例如：
    /// - 乐观锁版本冲突
    /// - 同时修改同一资源
    /// - 事务隔离级别导致的冲突
    ///
    /// # 参数
    ///
    /// * `String` - 并发冲突的详细描述
    #[error("并发冲突: {0}")]
    ConcurrencyError(String),
}

/// 持久化层统一结果类型
///
/// 这是一个类型别名，将所有持久化操作的返回值统一为 `Result<T, PersistenceError>`。
/// 使用此类型可以简化函数签名，提高代码可读性。
///
/// # 泛型参数
///
/// * `T` - 成功时返回的值类型
///
/// # 示例
///
///```rust,ignore
/// fn get_user(id: UserId) -> PersistenceResult<User> {
///     // 实现...
/// }
/// ```
pub type PersistenceResult<T> = Result<T, PersistenceError>;

/// 从 rusqlite 错误转换为持久化错误
///
/// 将 rusqlite 库返回的数据库错误自动转换为 `PersistenceError::DatabaseError`，
/// 便于使用 `?` 操作符进行错误传播。
///
/// # 参数
///
/// * `err` - rusqlite 库返回的原始错误
///
/// # 返回值
///
/// 转换后的 `PersistenceError::DatabaseError` 变体
impl From<rusqlite::Error> for PersistenceError {
    fn from(err: rusqlite::Error) -> Self {
        PersistenceError::DatabaseError(err.to_string())
    }
}

/// 从 serde_json 错误转换为持久化错误
///
/// 将 serde_json 库返回的序列化错误自动转换为 `PersistenceError::SerializationError`，
/// 便于使用 `?` 操作符进行错误传播。
///
/// # 参数
///
/// * `err` - serde_json 库返回的原始错误
///
/// # 返回值
///
/// 转换后的 `PersistenceError::SerializationError` 变体
impl From<serde_json::Error> for PersistenceError {
    fn from(err: serde_json::Error) -> Self {
        PersistenceError::SerializationError(err.to_string())
    }
}
