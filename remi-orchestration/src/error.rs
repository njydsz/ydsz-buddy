//! 编排引擎错误类型定义模块
//!
//! 本模块定义了编排引擎（Orchestration Engine）中所有可能出现的错误类型，
//! 以及统一的结果类型别名。基于 `thiserror` 派生宏实现 `Display` 和 `Error` trait，
//! 提供结构化的错误分类与友好的错误信息输出。

use thiserror::Error;

/// 编排引擎错误枚举
///
/// 涵盖编排引擎运行过程中可能产生的所有错误类型，包括持久化层错误、
/// 序列化错误、命令处理错误、投影错误和内部错误。
///
/// # 变体说明
///
/// - `PersistenceError`: 底层持久化存储（如 SQLite）操作失败时产生
/// - `SerializationError`: 事件/命令的 JSON 序列化或反序列化失败时产生
/// - `CommandError`: 命令校验或处理逻辑失败时产生
/// - `ProjectionError`: 投影器在应用事件到读模型时失败时产生
/// - `InternalError`: 引擎内部通道关闭等非业务逻辑错误
#[derive(Error, Debug)]
pub enum OrchestrationError {
    /// 持久化层错误，由底层存储引擎（如 SQLite）抛出
    ///
    /// 通过 `#[from]` 自动从 `PersistenceError` 转换，支持 `?` 运算符直接传播。
    #[error("持久化错误: {0}")]
    PersistenceError(#[from] remi_persistence::PersistenceError),

    /// 序列化/反序列化错误
    ///
    /// 当命令或事件在 JSON 编码/解码过程中失败时产生，
    /// 错误信息包含具体的序列化失败原因。
    #[error("序列化错误: {0}")]
    SerializationError(String),

    /// 命令处理错误
    ///
    /// 当命令无法被正确识别、校验或执行时产生，
    /// 例如命令类型未实现或参数不合法。
    #[error("命令处理错误: {0}")]
    CommandError(String),

    /// 投影错误
    ///
    /// 当事件在应用到读模型（投影）过程中发生异常时产生，
    /// 例如数据不一致或投影状态更新失败。
    #[error("投影错误: {0}")]
    ProjectionError(String),

    /// 内部错误
    ///
    /// 引擎内部非业务逻辑错误，如命令队列通道关闭、
    /// 响应通道关闭等运行时异常。
    #[error("内部错误: {0}")]
    InternalError(String),
}

/// 编排引擎统一结果类型
///
/// 所有编排引擎对外暴露的接口均使用此类型作为返回值，
/// 成功时返回泛型 `T`，失败时返回 [`OrchestrationError`]。
///
/// # 示例
///
/// ```ignore
/// fn do_something() -> OrchestrationResult<String> {
///     Ok("success".to_string())
/// }
/// ```
pub type OrchestrationResult<T> = Result<T, OrchestrationError>;

/// 将 `serde_json::Error` 转换为编排引擎错误
///
/// 实现 `From` trait 以支持在事件/命令的 JSON 序列化与反序列化过程中，
/// 使用 `?` 运算符将 `serde_json` 的错误自动传播为 [`OrchestrationError::SerializationError`]。
impl From<serde_json::Error> for OrchestrationError {
    fn from(err: serde_json::Error) -> Self {
        OrchestrationError::SerializationError(err.to_string())
    }
}
