//! 性能指标收集

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use tracing::debug;

use crate::error::TelemetryResult;

/// 指标类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MetricType {
    /// 计数器
    Counter,
    /// 仪表
    Gauge,
    /// 直方图
    Histogram,
}

/// 指标记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricRecord {
    /// 指标名称
    pub name: String,
    /// 指标类型
    pub metric_type: MetricType,
    /// 值
    pub value: f64,
    /// 标签
    pub labels: HashMap<String, String>,
    /// 时间戳
    pub timestamp: DateTime<Utc>,
}

/// 性能指标
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PerformanceMetrics {
    /// 请求总数
    pub total_requests: u64,
    /// 平均响应时间（毫秒）
    pub avg_response_time_ms: f64,
    /// P95 响应时间（毫秒）
    pub p95_response_time_ms: f64,
    /// P99 响应时间（毫秒）
    pub p99_response_time_ms: f64,
    /// 活跃连接数
    pub active_connections: u64,
    /// 错误总数
    pub total_errors: u64,
}

/// 指标收集器
pub struct MetricsCollector {
    metrics: Arc<RwLock<Vec<MetricRecord>>>,
    start_time: Instant,
}

impl MetricsCollector {
    /// 创建新的指标收集器
    pub fn new() -> Self {
        Self {
            metrics: Arc::new(RwLock::new(Vec::new())),
            start_time: Instant::now(),
        }
    }

    /// 记录指标
    pub async fn record(&self, metric: MetricRecord) -> TelemetryResult<()> {
        debug!("记录指标: {} = {}", metric.name, metric.value);

        let mut metrics = self.metrics.write().await;
        metrics.push(metric);

        Ok(())
    }

    /// 记录计数器
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

    /// 记录仪表
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

    /// 记录直方图
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

    /// 获取所有指标
    pub async fn get_metrics(&self) -> TelemetryResult<Vec<MetricRecord>> {
        let metrics = self.metrics.read().await;
        Ok(metrics.clone())
    }

    /// 获取运行时间
    pub fn uptime(&self) -> Duration {
        self.start_time.elapsed()
    }

    /// 清除指标
    pub async fn clear(&self) -> TelemetryResult<()> {
        let mut metrics = self.metrics.write().await;
        metrics.clear();
        Ok(())
    }
}

impl Default for MetricsCollector {
    fn default() -> Self {
        Self::new()
    }
}
