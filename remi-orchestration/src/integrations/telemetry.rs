//! 遥测客户端（OpenTelemetry 兼容）。
//!
//! 大厂标准：每个事件都应产生遥测 span，方便事后追踪。
//! 本模块定义一个轻量级客户端接口，可对接 OTLP、StatsD、
//! Prometheus 等后端。

use chrono::{DateTime, Utc};
use remi_core::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{debug, info};

/// 遥测级别。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TelemetryLevel {
    /// 追踪级。
    Trace,
    /// 调试级。
    Debug,
    /// 信息级。
    Info,
    /// 警告级。
    Warn,
    /// 错误级。
    Error,
}

/// 遥测事件。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryEvent {
    /// 事件名称。
    pub name: String,
    /// 级别。
    pub level: TelemetryLevel,
    /// 时间戳。
    pub timestamp: DateTime<Utc>,
    /// 关联属性（键值对）。
    pub attributes: serde_json::Value,
    /// 持续时间（毫秒，可选）。
    pub duration_ms: Option<u64>,
}

impl TelemetryEvent {
    /// 创建一个新的遥测事件。
    pub fn new(name: impl Into<String>, level: TelemetryLevel) -> Self {
        Self {
            name: name.into(),
            level,
            timestamp: Utc::now(),
            attributes: serde_json::json!({}),
            duration_ms: None,
        }
    }

    /// 添加属性。
    pub fn with_attr(mut self, key: impl Into<String>, value: impl Into<serde_json::Value>) -> Self {
        if let Some(obj) = self.attributes.as_object_mut() {
            obj.insert(key.into(), value.into());
        }
        self
    }

    /// 设置持续时间。
    pub fn with_duration(mut self, ms: u64) -> Self {
        self.duration_ms = Some(ms);
        self
    }
}

/// 遥测客户端 trait。
#[async_trait::async_trait]
pub trait TelemetrySink: Send + Sync {
    /// 发送一条遥测事件。
    async fn emit(&self, event: TelemetryEvent) -> Result<()>;
}

/// 内存版遥测客户端 —— 仅缓存最近 N 条事件，方便本地调试。
pub struct TelemetryClient {
    sink: Arc<dyn TelemetrySink>,
    recent: Arc<Mutex<Vec<TelemetryEvent>>>,
    max_recent: usize,
}

impl TelemetryClient {
    /// 创建一个使用内存 sink 的遥测客户端。
    pub fn in_memory(max_recent: usize) -> Self {
        let sink = Arc::new(InMemorySink::new(max_recent));
        Self {
            sink: sink.clone(),
            recent: sink.recent.clone(),
            max_recent,
        }
    }

    /// 自定义 sink。
    pub fn with_sink(sink: Arc<dyn TelemetrySink>, max_recent: usize) -> Self {
        Self {
            sink,
            recent: Arc::new(Mutex::new(Vec::new())),
            max_recent,
        }
    }

    /// 上报一条事件。
    pub async fn report(&self, event: TelemetryEvent) -> Result<()> {
        debug!(name = %event.name, "上报遥测事件");
        self.sink.emit(event).await
    }

    /// 获取最近的事件（用于本地调试）。
    pub async fn recent(&self) -> Vec<TelemetryEvent> {
        self.recent.lock().await.clone()
    }
}

struct InMemorySink {
    recent: Arc<Mutex<Vec<TelemetryEvent>>>,
}

impl InMemorySink {
    fn new(max: usize) -> Self {
        Self {
            recent: Arc::new(Mutex::new(Vec::with_capacity(max))),
        }
    }
}

#[async_trait::async_trait]
impl TelemetrySink for InMemorySink {
    async fn emit(&self, event: TelemetryEvent) -> Result<()> {
        let mut guard = self.recent.lock().await;
        guard.push(event);
        if guard.len() > 1000 {
            guard.remove(0);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_telemetry_event_builder() {
        let event = TelemetryEvent::new("test", TelemetryLevel::Info)
            .with_attr("thread_id", "abc-123")
            .with_duration(150);
        assert_eq!(event.name, "test");
        assert_eq!(event.duration_ms, Some(150));
        assert_eq!(
            event.attributes.get("thread_id").and_then(|v| v.as_str()),
            Some("abc-123")
        );
    }

    #[tokio::test]
    async fn test_in_memory_client() {
        let client = TelemetryClient::in_memory(100);
        client
            .report(TelemetryEvent::new("e1", TelemetryLevel::Info))
            .await
            .unwrap();
        client
            .report(TelemetryEvent::new("e2", TelemetryLevel::Warn))
            .await
            .unwrap();
        let recent = client.recent().await;
        assert_eq!(recent.len(), 2);
    }
}
