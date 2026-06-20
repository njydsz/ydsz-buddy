//! # Telemetry 错误定义
//!
//! ## 模块职责
//!
//! 本模块定义了遥测子系统（`remi-telemetry`）所使用的统一错误类型。
//! 通过 [`thiserror`] 派生宏自动生成 `std::error::Error` 与 `Display` 实现，
//! 确保错误信息在日志、监控告警以及上层调用链中能够被一致地展示与处理。
//!
//! ## 核心类型
//!
//! - [`TelemetryError`]：遥测子系统的顶层错误枚举，涵盖分析服务、指标采集、
//!   序列化以及底层 IO 四类典型失败场景。
//! - [`TelemetryResult<T>`]：基于 `TelemetryError` 的 `Result` 类型别名，
//!   作为本模块所有公共 API 的默认返回类型，简化调用方代码。
//!
//! ## 错误层次结构
//!
//! ```text
//! TelemetryError (顶层错误枚举)
//! ├── AnalyticsError(String)    ← 分析服务层错误
//! ├── MetricsError(String)      ← 指标采集层错误
//! ├── SerializationError(String) ← 序列化/反序列化层错误
//! └── IoError(std::io::Error)   ← 底层 IO 错误（支持 From 自动转换）
//! ```
//!
//! ## 使用场景
//!
//! 1. 在 `AnalyticsService`、`MetricsCollector` 等服务的公共方法中，
//!    使用 `TelemetryResult<T>` 作为返回类型统一错误传播路径。
//! 2. 当需要将底层 `std::io::Error` 向上层透传时，可直接通过 `?` 运算符
//!    自动转换为 `TelemetryError::IoError`（已实现 `From<std::io::Error>`）。
//! 3. 在日志记录或监控告警中，利用 `Display` 实现输出可读的中文错误描述。

use thiserror::Error;

/// # Telemetry 错误类型
///
/// 遥测子系统的顶层错误枚举，聚合了分析服务、指标采集、序列化及 IO 四类常见错误。
///
/// ## 变体说明
///
/// | 变体 | 触发场景 |
/// |------|----------|
/// | `AnalyticsError` | 分析服务内部逻辑失败，例如事件记录异常、统计聚合出错等 |
/// | `MetricsError` | 指标采集过程中发生错误，例如指标写入失败、收集器状态异常等 |
/// | `SerializationError` | 事件或指标的序列化/反序列化失败（如 JSON 编解码错误） |
/// | `IoError` | 底层 IO 操作失败（如文件读写、网络通信），支持通过 `?` 自动转换 |
///
/// ## 使用示例
///
/// ```rust,ignore
/// use remi_telemetry::error::{TelemetryError, TelemetryResult};
///
/// fn do_work() -> TelemetryResult<()> {
///     // 若底层 IO 失败，会自动转换为 TelemetryError::IoError
///     std::fs::File::open("metrics.json")?;
///     Ok(())
/// }
/// ```
#[derive(Error, Debug)]
pub enum TelemetryError {
    /// 分析服务错误。
    ///
    /// 当分析事件记录、使用统计聚合等分析服务内部操作失败时抛出。
    /// 附带字符串携带具体错误原因，便于日志排查。
    #[error("分析服务错误: {0}")]
    AnalyticsError(String),

    /// 指标收集失败。
    ///
    /// 当指标写入、收集器状态访问等指标采集相关操作失败时抛出。
    /// 附带字符串携带具体错误原因。
    #[error("指标收集失败: {0}")]
    MetricsError(String),

    /// 序列化失败。
    ///
    /// 当 `AnalyticsEvent`、`MetricRecord` 等数据结构在序列化（如 JSON 编码）
    /// 或反序列化过程中发生错误时抛出。附带字符串携带具体错误原因。
    #[error("序列化失败: {0}")]
    SerializationError(String),

    /// IO 错误。
    ///
    /// 封装标准库 `std::io::Error`，用于透传底层文件读写、网络通信等 IO 操作的失败。
    /// 已通过 `#[from]` 属性实现 `From<std::io::Error>` 自动转换，
    /// 支持在函数中使用 `?` 运算符直接传播。
    ///
    /// ## 设计说明
    ///
    /// 使用 `#[from]` 而非手动实现 `From` 转换，是因为 `thiserror` 的 `#[from]` 属性
    /// 会同时自动生成 `From<std::io::Error> for TelemetryError` 实现和
    /// `std::error::Error::source()` 方法，确保错误链完整可追溯。
    /// 其他变体（如 `AnalyticsError`、`MetricsError`）使用 `String` 而非具体错误类型，
    /// 是因为这些错误场景目前不需要向下追溯错误源，简化了类型定义。
    #[error("IO 错误: {0}")]
    IoError(#[from] std::io::Error),
}

/// # Telemetry Result 类型别名
///
/// 基于 [`TelemetryError`] 的 `Result` 类型别名，作为遥测子系统所有公共 API 的默认返回类型。
///
/// ## 使用场景
///
/// 在 `AnalyticsService`、`MetricsCollector` 等服务的方法签名中统一使用，
/// 简化调用方的错误处理代码，并保持错误类型的一致性。
///
/// ## 示例
///
/// ```rust,ignore
/// use remi_telemetry::error::TelemetryResult;
///
/// fn fetch_stats() -> TelemetryResult<UsageStats> {
///     // ...
/// }
/// ```
pub type TelemetryResult<T> = Result<T, TelemetryError>;
