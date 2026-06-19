//! Telemetry 错误定义

use thiserror::Error;

/// Telemetry 错误类型
#[derive(Error, Debug)]
pub enum TelemetryError {
    #[error("分析服务错误: {0}")]
    AnalyticsError(String),

    #[error("指标收集失败: {0}")]
    MetricsError(String),

    #[error("序列化失败: {0}")]
    SerializationError(String),

    #[error("IO 错误: {0}")]
    IoError(#[from] std::io::Error),
}

/// Telemetry 结果类型
pub type TelemetryResult<T> = Result<T, TelemetryError>;
