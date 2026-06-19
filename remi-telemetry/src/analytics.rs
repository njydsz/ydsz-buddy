//! 分析数据收集服务

use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use remi_core::models::ThreadId;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use tracing::{debug, info};

use crate::error::{TelemetryError, TelemetryResult};

/// 事件类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnalyticsEventType {
    /// 线程创建
    ThreadCreated,
    /// 线程删除
    ThreadDeleted,
    /// Turn 开始
    TurnStarted,
    /// Turn 完成
    TurnCompleted,
    /// Turn 中断
    TurnInterrupted,
    /// Provider 调用
    ProviderInvoked,
    /// 检查点创建
    CheckpointCreated,
    /// 检查点恢复
    CheckpointReverted,
    /// 会话启动
    SessionStarted,
    /// 会话停止
    SessionStopped,
}

/// 分析事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyticsEvent {
    /// 事件 ID
    pub id: String,
    /// 事件类型
    pub event_type: AnalyticsEventType,
    /// 线程 ID
    pub thread_id: Option<ThreadId>,
    /// Provider 类型
    pub provider: Option<String>,
    /// 模型
    pub model: Option<String>,
    /// 时间戳
    pub timestamp: DateTime<Utc>,
    /// 元数据
    pub metadata: HashMap<String, String>,
}

/// 使用统计
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UsageStats {
    /// 总线程数
    pub total_threads: u64,
    /// 总 Turn 数
    pub total_turns: u64,
    /// 总 Provider 调用次数
    pub total_provider_calls: u64,
    /// 总检查点数
    pub total_checkpoints: u64,
    /// 按 Provider 统计
    pub by_provider: HashMap<String, u64>,
    /// 按模型统计
    pub by_model: HashMap<String, u64>,
}

/// 分析服务
pub struct AnalyticsService {
    events: Arc<RwLock<Vec<AnalyticsEvent>>>,
    stats: Arc<RwLock<UsageStats>>,
}

impl AnalyticsService {
    /// 创建新的分析服务
    pub fn new() -> Self {
        Self {
            events: Arc::new(RwLock::new(Vec::new())),
            stats: Arc::new(RwLock::new(UsageStats::default())),
        }
    }

    /// 记录事件
    pub async fn record_event(&self, event: AnalyticsEvent) -> TelemetryResult<()> {
        debug!("记录分析事件: {:?}", event.event_type);

        // 存储事件
        {
            let mut events = self.events.write().await;
            events.push(event.clone());
        }

        // 更新统计
        {
            let mut stats = self.stats.write().await;
            match event.event_type {
                AnalyticsEventType::ThreadCreated => {
                    stats.total_threads += 1;
                }
                AnalyticsEventType::TurnStarted | AnalyticsEventType::TurnCompleted => {
                    stats.total_turns += 1;
                }
                AnalyticsEventType::ProviderInvoked => {
                    stats.total_provider_calls += 1;
                    if let Some(provider) = &event.provider {
                        *stats.by_provider.entry(provider.clone()).or_insert(0) += 1;
                    }
                    if let Some(model) = &event.model {
                        *stats.by_model.entry(model.clone()).or_insert(0) += 1;
                    }
                }
                AnalyticsEventType::CheckpointCreated => {
                    stats.total_checkpoints += 1;
                }
                _ => {}
            }
        }

        Ok(())
    }

    /// 获取使用统计
    pub async fn get_usage_stats(&self) -> TelemetryResult<UsageStats> {
        let stats = self.stats.read().await;
        Ok(stats.clone())
    }

    /// 获取事件列表
    pub async fn get_events(&self, limit: usize) -> TelemetryResult<Vec<AnalyticsEvent>> {
        let events = self.events.read().await;
        let result: Vec<AnalyticsEvent> = events.iter().rev().take(limit).cloned().collect();
        Ok(result)
    }

    /// 清除事件历史
    pub async fn clear_events(&self) -> TelemetryResult<()> {
        let mut events = self.events.write().await;
        events.clear();
        info!("已清除分析事件历史");
        Ok(())
    }

    /// 创建线程创建事件
    pub fn create_thread_created_event(thread_id: ThreadId) -> AnalyticsEvent {
        AnalyticsEvent {
            id: uuid::Uuid::new_v4().to_string(),
            event_type: AnalyticsEventType::ThreadCreated,
            thread_id: Some(thread_id),
            provider: None,
            model: None,
            timestamp: Utc::now(),
            metadata: HashMap::new(),
        }
    }

    /// 创建 Turn 开始事件
    pub fn create_turn_started_event(
        thread_id: ThreadId,
        provider: String,
        model: String,
    ) -> AnalyticsEvent {
        AnalyticsEvent {
            id: uuid::Uuid::new_v4().to_string(),
            event_type: AnalyticsEventType::TurnStarted,
            thread_id: Some(thread_id),
            provider: Some(provider),
            model: Some(model),
            timestamp: Utc::now(),
            metadata: HashMap::new(),
        }
    }

    /// 创建 Provider 调用事件
    pub fn create_provider_invoked_event(
        thread_id: ThreadId,
        provider: String,
        model: String,
    ) -> AnalyticsEvent {
        AnalyticsEvent {
            id: uuid::Uuid::new_v4().to_string(),
            event_type: AnalyticsEventType::ProviderInvoked,
            thread_id: Some(thread_id),
            provider: Some(provider),
            model: Some(model),
            timestamp: Utc::now(),
            metadata: HashMap::new(),
        }
    }
}

impl Default for AnalyticsService {
    fn default() -> Self {
        Self::new()
    }
}
