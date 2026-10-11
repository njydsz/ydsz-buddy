//! # 生产级持久化 Sink 实现
//!
//! 为 ydzs-core 的 EventSink / ThreadSink trait 提供具体实现：
//! - `ProductionEventStore` — 包装 `SqliteEventStore`，实现事件溯源写入
//! - `ProductionThreadStore` — 包装 `ThreadStore`，实现消息线程持久化

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use serde_json::Value;
use uuid::Uuid;

use ydsz_core::error::{CoreError, CoreResult};
use ydsz_core::hooks::{EventSink, ThreadSink};
use ydsz_shared::persistence::{MessageRecord, SqliteEventStore, ThreadRecord, ThreadStore};

/// 生产环境事件写入 sink
pub struct ProductionEventStore {
    inner: Arc<SqliteEventStore>,
}

impl ProductionEventStore {
    pub fn new(store: Arc<SqliteEventStore>) -> Self {
        Self { inner: store }
    }
}

impl EventSink for ProductionEventStore {
    fn append_event(
        &self,
        event_type: &str,
        stream_id: &str,
        payload: &Value,
    ) -> Pin<Box<dyn Future<Output = CoreResult<()>> + Send + '_>> {
        let store = self.inner.clone();
        let event_type = event_type.to_string();
        let stream_id = stream_id.to_string();
        let payload = payload.clone();
        Box::pin(async move {
            let result: Result<(), CoreError> = tokio::task::spawn_blocking(move || {
                store
                    .append(&event_type, "thread", &stream_id, &payload)
                    .map(|_| ())
                    .map_err(|e| CoreError::InternalError(format!("事件写入失败: {e}")))
            })
            .await
            .map_err(|e| CoreError::InternalError(format!("spawn_blocking join 错误: {e}")))?;
            result
        })
    }
}

impl From<Arc<SqliteEventStore>> for ProductionEventStore {
    fn from(store: Arc<SqliteEventStore>) -> Self {
        Self::new(store)
    }
}

/// 生产环境线程消息写入 sink
pub struct ProductionThreadStore {
    inner: Arc<ThreadStore>,
}

impl ProductionThreadStore {
    pub fn new(store: Arc<ThreadStore>) -> Self {
        Self { inner: store }
    }
}

impl ThreadSink for ProductionThreadStore {
    fn save_message(
        &self,
        thread_id: &str,
        turn_id: &str,
        role: &str,
        content: &str,
        tool_name: Option<&str>,
        sequence: u32,
    ) -> Pin<Box<dyn Future<Output = CoreResult<()>> + Send + '_>> {
        let store = self.inner.clone();
        let record = MessageRecord {
            id: Uuid::new_v4().to_string(),
            thread_id: thread_id.to_string(),
            turn_id: turn_id.to_string(),
            role: role.to_string(),
            content: content.to_string(),
            token_count: None,
            tool_calls: if let Some(name) = tool_name {
                vec![serde_json::json!({ "name": name })]
            } else {
                vec![]
            },
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        let _ = sequence;
        Box::pin(async move {
            let result: Result<(), CoreError> = tokio::task::spawn_blocking(move || {
                store
                    .save_message(&record)
                    .map_err(|e| CoreError::InternalError(format!("消息持久化失败: {e}")))
            })
            .await
            .map_err(|e| CoreError::InternalError(format!("spawn_blocking join 错误: {e}")))?;
            result
        })
    }

    fn save_thread(
        &self,
        thread_id: &str,
        title: Option<&str>,
    ) -> Pin<Box<dyn Future<Output = CoreResult<()>> + Send + '_>> {
        let store = self.inner.clone();
        let thread_id = thread_id.to_string();
        let title = title.unwrap_or("新对话").to_string();
        let now = chrono::Utc::now().to_rfc3339();
        Box::pin(async move {
            let result: Result<(), CoreError> = tokio::task::spawn_blocking(move || {
                let record = ThreadRecord {
                    id: thread_id.clone(),
                    title: title.clone(),
                    mode: "code".to_string(),
                    status: "active".to_string(),
                    turn_count: 0,
                    message_count: 0,
                    created_at: now.clone(),
                    updated_at: now,
                    metadata: serde_json::json!({}),
                };
                store
                    .save_thread(&record)
                    .map_err(|e| CoreError::InternalError(format!("线程持久化失败: {e}")))
            })
            .await
            .map_err(|e| CoreError::InternalError(format!("spawn_blocking join 错误: {e}")))?;
            result
        })
    }
}

impl From<Arc<ThreadStore>> for ProductionThreadStore {
    fn from(store: Arc<ThreadStore>) -> Self {
        Self::new(store)
    }
}
