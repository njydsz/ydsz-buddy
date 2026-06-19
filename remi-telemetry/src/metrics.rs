//! # 性能指标收集模块
//!
//! ## 模块职责
//!
//! 本模块负责 Remi 系统运行时性能指标的采集、存储与查询。
//! 通过 [`MetricsCollector`] 提供统一的指标记录入口，支持三种标准指标类型：
//! 计数器（Counter）、仪表（Gauge）和直方图（Histogram），覆盖请求量、响应时间、
//! 活跃连接数、错误率等典型监控场景。
//!
//! ## 核心类型
//!
//! - [`MetricType`]：定义指标的三种标准类型（Counter/Gauge/Histogram），
//!   决定指标在外部监控系统中的语义与聚合方式。
//! - [`MetricRecord`]：单次指标记录的数据载体，包含指标名称、类型、数值、
//!   标签（维度）及时间戳。
//! - [`PerformanceMetrics`]：系统级性能指标快照，提供请求总数、平均/P95/P99 响应时间、
//!   活跃连接数与错误总数等聚合数据。
//! - [`MetricsCollector`]：指标收集器的核心实现，封装指标存储、分类记录与查询逻辑，
//!   对外暴露计数器递增、仪表设置、直方图观察等便捷 API。
//!
//! ## 使用场景
//!
//! 1. **请求监控**：通过 Counter 记录请求总数与错误数，计算错误率并触发告警。
//! 2. **延迟分析**：通过 Histogram 记录每次请求的响应时间，计算 P95/P99 分位数，
//!    评估服务 SLA 达成情况。
//! 3. **资源监控**：通过 Gauge 记录活跃连接数、内存占用等瞬时值，辅助容量规划。
//!
//! ## 并发安全
//!
//! [`MetricsCollector`] 内部通过 `Arc<RwLock<_>>` 保护指标记录列表，
//! 支持在 Tokio 异步运行时中跨任务安全共享。多个任务可同时记录指标，
//! 读写操作通过读写锁互斥，保证数据一致性。

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use tracing::debug;

use crate::error::TelemetryResult;

/// # 指标类型枚举
///
/// 定义遥测子系统中支持的三种标准指标类型。每种类型对应不同的语义与聚合方式，
/// 便于外部监控系统（如 Prometheus）正确解析与展示。
///
/// ## 序列化约定
///
/// 通过 `#[serde(rename_all = "snake_case")]` 将变体名称序列化为蛇形命名格式
/// （如 `Counter` → `"counter"`），便于与外部监控系统对接。
///
/// ## 类型说明
///
/// | 类型 | 语义 | 典型用途 |
/// |------|------|----------|
/// | `Counter` | 只增不减的累计值 | 请求总数、错误总数、事件触发次数 |
/// | `Gauge` | 可增可减的瞬时值 | 活跃连接数、内存占用、队列长度 |
/// | `Histogram` | 观测值的分布统计 | 响应时间、请求体大小、处理耗时 |
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MetricType {
    /// 计数器（Counter）。
    ///
    /// 只增不减的累计值指标，适用于记录请求总数、错误总数等单调递增的场景。
    /// 在外部监控系统中通常用于计算速率（rate）。
    Counter,
    /// 仪表（Gauge）。
    ///
    /// 可增可减的瞬时值指标，适用于记录活跃连接数、内存占用、队列深度等
    /// 随时间波动的场景。
    Gauge,
    /// 直方图（Histogram）。
    ///
    /// 用于统计观测值分布的指标类型，适用于记录响应时间、请求体大小等
    /// 需要计算分位数（P50/P95/P99）的场景。
    Histogram,
}

/// # 指标记录数据结构
///
/// 单次指标采集的数据载体，封装了指标标识、类型、数值、维度标签及时间戳。
/// 所有字段均为公共可见，支持序列化/反序列化以便持久化或跨服务传输。
///
/// ## 字段说明
///
/// | 字段 | 类型 | 说明 |
/// |------|------|------|
/// | `name` | `String` | 指标名称（如 `"http_requests_total"`），用于唯一标识一类指标 |
/// | `metric_type` | `MetricType` | 指标类型（Counter/Gauge/Histogram），决定聚合语义 |
/// | `value` | `f64` | 指标数值，Counter 为增量值，Gauge 为当前值，Histogram 为单次观测值 |
/// | `labels` | `HashMap<String, String>` | 维度标签（如 `{"method": "GET", "status": "200"}`），用于多维度聚合与过滤 |
/// | `timestamp` | `DateTime<Utc>` | 指标采集的 UTC 时间戳，采用 ISO 8601 格式序列化 |
///
/// ## 使用场景
///
/// - 通过 [`MetricsCollector::record`] 直接写入，或使用便捷方法
///   [`MetricsCollector::increment_counter`]、[`MetricsCollector::set_gauge`]、
///   [`MetricsCollector::observe_histogram`] 按类型记录。
/// - 通过 [`MetricsCollector::get_metrics`] 查询全部已记录指标。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricRecord {
    /// 指标名称（如 `"http_requests_total"`、"`response_time_seconds"`），
    /// 用于唯一标识一类指标，建议采用蛇形命名规范。
    pub name: String,
    /// 指标类型（Counter/Gauge/Histogram），决定该指标在外部监控系统中的聚合语义。
    pub metric_type: MetricType,
    /// 指标数值。对于 Counter 为增量值，对于 Gauge 为当前值，对于 Histogram 为单次观测值。
    pub value: f64,
    /// 维度标签，用于多维度聚合与过滤。
    /// 例如 `{"method": "GET", "status": "200"}` 可按 HTTP 方法和状态码分别统计。
    pub labels: HashMap<String, String>,
    /// 指标采集的 UTC 时间戳，采用 ISO 8601 格式序列化。
    pub timestamp: DateTime<Utc>,
}

/// # 系统级性能指标快照
///
/// 聚合后的系统性能指标快照，提供请求量、响应时间分位数、连接数与错误数等关键数据。
/// 所有字段均为公共可见，支持序列化/反序列化以便上报至外部监控系统。
///
/// ## 字段说明
///
/// | 字段 | 类型 | 说明 |
/// |------|------|------|
/// | `total_requests` | `u64` | 累计请求总数 |
/// | `avg_response_time_ms` | `f64` | 平均响应时间（毫秒） |
/// | `p95_response_time_ms` | `f64` | P95 响应时间（毫秒），即 95% 的请求在此时间内完成 |
/// | `p99_response_time_ms` | `f64` | P99 响应时间（毫秒），即 99% 的请求在此时间内完成 |
/// | `active_connections` | `u64` | 当前活跃连接数 |
/// | `total_errors` | `u64` | 累计错误总数 |
///
/// ## 使用场景
///
/// 用于仪表盘实时展示、SLA 评估报告或定期上报至监控系统。
/// 该结构体为纯数据快照，不包含更新逻辑，由上层服务根据 [`MetricRecord`] 聚合计算后填充。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PerformanceMetrics {
    /// 累计请求总数。包含所有已成功接收的请求（无论成功或失败）。
    pub total_requests: u64,
    /// 平均响应时间（毫秒）。所有请求响应时间的算术平均值。
    pub avg_response_time_ms: f64,
    /// P95 响应时间（毫秒）。即 95% 的请求在此时间内完成，用于评估长尾延迟。
    pub p95_response_time_ms: f64,
    /// P99 响应时间（毫秒）。即 99% 的请求在此时间内完成，用于评估极端长尾延迟。
    pub p99_response_time_ms: f64,
    /// 当前活跃连接数。反映系统当前的并发负载水平。
    pub active_connections: u64,
    /// 累计错误总数。包含所有处理失败的请求数。
    pub total_errors: u64,
}

/// # 指标收集器
///
/// 遥测子系统的核心服务之一，负责性能指标的异步记录、存储与查询。
/// 支持 Counter（计数器）、Gauge（仪表）、Histogram（直方图）三种标准指标类型，
/// 并提供按类型分类的便捷记录方法。
///
/// ## 内部状态
///
/// | 字段 | 类型 | 说明 |
/// |------|------|------|
/// | `metrics` | `Arc<RwLock<Vec<MetricRecord>>>` | 指标记录列表，按写入顺序存储，支持并发读写 |
/// | `start_time` | `Instant` | 收集器启动时刻，用于计算运行时间（uptime） |
///
/// ## 并发安全
///
/// 内部指标列表通过 `Arc<RwLock<_>>` 保护，支持在 Tokio 异步运行时中
/// 跨任务安全共享。多个任务可同时记录指标，读写操作通过读写锁互斥，保证数据一致性。
///
/// ## 使用示例
///
/// ```rust,ignore
/// use remi_telemetry::metrics::MetricsCollector;
/// use std::collections::HashMap;
///
/// let collector = MetricsCollector::new();
///
/// // 记录计数器
/// collector.increment_counter("http_requests_total", 1.0, HashMap::new()).await?;
///
/// // 记录仪表
/// collector.set_gauge("active_connections", 42.0, HashMap::new()).await?;
///
/// // 记录直方图
/// collector.observe_histogram("response_time_seconds", 0.123, HashMap::new()).await?;
///
/// // 查询所有指标
/// let metrics = collector.get_metrics().await?;
///
/// // 获取运行时间
/// println!("Uptime: {:?}", collector.uptime());
/// ```
pub struct MetricsCollector {
    /// 指标记录列表，按写入顺序存储所有已记录的指标数据。
    /// 通过 `Arc<RwLock<_>>` 保护，支持异步并发安全访问。
    metrics: Arc<RwLock<Vec<MetricRecord>>>,
    /// 收集器启动时刻，用于计算运行时间（uptime）。
    /// 在 [`MetricsCollector::new`] 中初始化为 `Instant::now()`。
    start_time: Instant,
}

impl MetricsCollector {
    /// # 创建新的指标收集器实例
    ///
    /// 初始化一个空的 [`MetricsCollector`]，指标记录列表为空，启动时间为当前时刻。
    ///
    /// ## 返回值
    ///
    /// 返回一个新构建的 `MetricsCollector` 实例，内部状态通过 `Arc<RwLock<_>>` 管理，
    /// 可安全地在异步任务间共享。
    ///
    /// ## 使用场景
    ///
    /// 通常在应用启动时创建单例，并通过 `Arc` 或直接克隆（内部 `Arc` 支持浅拷贝）
    /// 注入到需要记录指标的各个业务组件中。
    pub fn new() -> Self {
        Self {
            metrics: Arc::new(RwLock::new(Vec::new())),
            start_time: Instant::now(),
        }
    }

    /// # 记录指标
    ///
    /// 将指定的 [`MetricRecord`] 追加到内部指标记录列表。
    /// 这是所有指标记录的底层方法，其他便捷方法（`increment_counter`、`set_gauge`、
    /// `observe_histogram`）均通过调用此方法完成实际写入。
    ///
    /// ## 参数
    ///
    /// - `metric`: [`MetricRecord`] —— 待记录的指标数据，包含名称、类型、数值、标签及时间戳。
    ///
    /// ## 返回值
    ///
    /// - `Ok(())`：指标记录成功。
    /// - `Err(TelemetryError)`：理论上当前实现不会失败，但保留错误返回类型以兼容未来扩展
    ///   （如持久化到外部存储时的 IO 失败）。
    ///
    /// ## 并发行为
    ///
    /// 方法内部获取指标列表的写锁，锁持有时间极短（仅内存 Vec push 操作），
    /// 在高并发场景下不会成为性能瓶颈。
    pub async fn record(&self, metric: MetricRecord) -> TelemetryResult<()> {
        debug!("记录指标: {} = {}", metric.name, metric.value);

        let mut metrics = self.metrics.write().await;
        metrics.push(metric);

        Ok(())
    }

    /// # 记录计数器（Counter）
    ///
    /// 构造一个 [`MetricType::Counter`] 类型的 [`MetricRecord`] 并写入收集器。
    /// Counter 为只增不减的累计值指标，适用于请求总数、错误总数等单调递增场景。
    ///
    /// ## 参数
    ///
    /// - `name`: `&str` —— 指标名称（如 `"http_requests_total"`），建议采用蛇形命名规范。
    /// - `value`: `f64` —— 计数器增量值，通常为正数。
    /// - `labels`: [`HashMap<String, String>`] —— 维度标签，用于多维度聚合与过滤。
    ///   例如 `{"method": "GET", "status": "200"}`。
    ///
    /// ## 返回值
    ///
    /// - `Ok(())`：指标记录成功。
    /// - `Err(TelemetryError)`：理论上当前实现不会失败，保留错误返回类型以兼容未来扩展。
    pub async fn increment_counter(
        &self,
        name: &str,
        value: f64,
        labels: HashMap<String, String>,
    ) -> TelemetryResult<()> {
        let metric = MetricRecord {
            name: name.to_string(),
            metric_type: MetricType::Counter,
            value,
            labels,
            timestamp: Utc::now(),
        };

        self.record(metric).await
    }

    /// # 记录仪表（Gauge）
    ///
    /// 构造一个 [`MetricType::Gauge`] 类型的 [`MetricRecord`] 并写入收集器。
    /// Gauge 为可增可减的瞬时值指标，适用于活跃连接数、内存占用等波动值场景。
    ///
    /// ## 参数
    ///
    /// - `name`: `&str` —— 指标名称（如 `"active_connections"`），建议采用蛇形命名规范。
    /// - `value`: `f64` —— 仪表当前值，可为正数、负数或零。
    /// - `labels`: [`HashMap<String, String>`] —— 维度标签，用于多维度聚合与过滤。
    ///
    /// ## 返回值
    ///
    /// - `Ok(())`：指标记录成功。
    /// - `Err(TelemetryError)`：理论上当前实现不会失败，保留错误返回类型以兼容未来扩展。
    pub async fn set_gauge(
        &self,
        name: &str,
        value: f64,
        labels: HashMap<String, String>,
    ) -> TelemetryResult<()> {
        let metric = MetricRecord {
            name: name.to_string(),
            metric_type: MetricType::Gauge,
            value,
            labels,
            timestamp: Utc::now(),
        };

        self.record(metric).await
    }

    /// # 记录直方图（Histogram）
    ///
    /// 构造一个 [`MetricType::Histogram`] 类型的 [`MetricRecord`] 并写入收集器。
    /// Histogram 用于统计观测值的分布，适用于响应时间、请求体大小等需要计算
    /// 分位数（P50/P95/P99）的场景。每次调用记录一个观测值。
    ///
    /// ## 参数
    ///
    /// - `name`: `&str` —— 指标名称（如 `"response_time_seconds"`），建议采用蛇形命名规范。
    /// - `value`: `f64` —— 单次观测值（如本次请求的响应时间，单位秒）。
    /// - `labels`: [`HashMap<String, String>`] —— 维度标签，用于多维度聚合与过滤。
    ///   例如 `{"endpoint": "/api/chat"}`。
    ///
    /// ## 返回值
    ///
    /// - `Ok(())`：指标记录成功。
    /// - `Err(TelemetryError)`：理论上当前实现不会失败，保留错误返回类型以兼容未来扩展。
    pub async fn observe_histogram(
        &self,
        name: &str,
        value: f64,
        labels: HashMap<String, String>,
    ) -> TelemetryResult<()> {
        let metric = MetricRecord {
            name: name.to_string(),
            metric_type: MetricType::Histogram,
            value,
            labels,
            timestamp: Utc::now(),
        };

        self.record(metric).await
    }

    /// # 获取所有指标记录
    ///
    /// 返回内部指标记录列表的完整克隆副本，包含所有已记录的指标数据。
    ///
    /// ## 返回值
    ///
    /// - `Ok(Vec<MetricRecord>)`：按写入顺序排列的全部指标记录。由于返回的是克隆副本，
    ///   调用方对返回值的修改不会影响收集器内部状态。
    /// - `Err(TelemetryError)`：理论上当前实现不会失败，保留错误返回类型以兼容未来扩展。
    ///
    /// ## 使用场景
    ///
    /// 用于定期将指标数据批量上报至外部监控系统（如 Prometheus、InfluxDB），
    /// 或在调试时检查已记录的全部指标。
    pub async fn get_metrics(&self) -> TelemetryResult<Vec<MetricRecord>> {
        let metrics = self.metrics.read().await;
        Ok(metrics.clone())
    }

    /// # 获取收集器运行时间
    ///
    /// 返回自收集器创建以来经过的时间（uptime）。
    ///
    /// ## 返回值
    ///
    /// 返回 [`Duration`] 类型的时间间隔，表示从 [`MetricsCollector::new`] 调用时刻
    /// 到当前时刻的经过时间。
    ///
    /// ## 使用场景
    ///
    /// 用于监控系统健康检查、计算指标采集速率（如 QPS = total_requests / uptime），
    /// 或在仪表盘上展示服务运行时长。
    pub fn uptime(&self) -> Duration {
        self.start_time.elapsed()
    }

    /// # 清除所有指标记录
    ///
    /// 清空内部指标记录列表中的所有已记录数据。
    /// 注意：此操作**不会**重置 [`start_time`](MetricsCollector::start_time)，
    /// 因此 [`MetricsCollector::uptime`] 仍从创建时刻开始计算。
    ///
    /// ## 返回值
    ///
    /// - `Ok(())`：清除成功。
    /// - `Err(TelemetryError)`：理论上当前实现不会失败，保留错误返回类型以兼容未来扩展。
    ///
    /// ## 使用场景
    ///
    /// 用于定期释放内存占用、测试环境重置或在指标已上报至外部存储后清理本地缓存。
    pub async fn clear(&self) -> TelemetryResult<()> {
        let mut metrics = self.metrics.write().await;
        metrics.clear();
        Ok(())
    }
}

/// # MetricsCollector 的 Default 实现
///
/// 委托给 [`MetricsCollector::new`]，返回一个空状态的指标收集器实例。
/// 便于在结构体派生 `Default` 时自动初始化遥测字段。
impl Default for MetricsCollector {
    fn default() -> Self {
        Self::new()
    }
}
