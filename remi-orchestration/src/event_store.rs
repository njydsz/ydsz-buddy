//! 编排事件的事件存储。

use remi_contracts::OrchestrationEvent;
use remi_core::{Error, Result};
use remi_persistence::Database;
use std::sync::Arc;
use tracing::info;
use uuid::Uuid;

/// 编排事件持久化的抽象层。
#[async_trait::async_trait]
pub trait EventStore: Send + Sync {
    /// 向存储中追加一个事件。
    async fn append(&self, event: &OrchestrationEvent) -> Result<()>;

    /// 按创建时间顺序读取所有事件。
    async fn read_all(&self) -> Result<Vec<OrchestrationEvent>>;
}

/// 基于 SQLite 的事件存储实现。
pub struct SqliteEventStore {
    db: Arc<Database>,
}

impl SqliteEventStore {
    /// 创建一个新的 SQLite 事件存储。
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    /// 提取事件类型字符串用于存储。
    fn event_type(event: &OrchestrationEvent) -> &'static str {
        match event {
            OrchestrationEvent::ThreadCreated { .. } => "ThreadCreated",
            OrchestrationEvent::ThreadUpdated { .. } => "ThreadUpdated",
            OrchestrationEvent::ThreadDeleted { .. } => "ThreadDeleted",
            OrchestrationEvent::MessageAdded { .. } => "MessageAdded",
            OrchestrationEvent::TurnStarted { .. } => "TurnStarted",
            OrchestrationEvent::TurnCompleted { .. } => "TurnCompleted",
        }
    }

    /// 提取会话 ID 字符串用于存储。
    fn thread_id(event: &OrchestrationEvent) -> String {
        match event {
            OrchestrationEvent::ThreadCreated { thread_id, .. }
            | OrchestrationEvent::ThreadUpdated { thread_id, .. }
            | OrchestrationEvent::ThreadDeleted { thread_id, .. }
            | OrchestrationEvent::MessageAdded { thread_id, .. }
            | OrchestrationEvent::TurnStarted { thread_id, .. }
            | OrchestrationEvent::TurnCompleted { thread_id, .. } => thread_id.to_string(),
        }
    }

    /// 提取时间戳字符串用于存储。
    fn timestamp(event: &OrchestrationEvent) -> Option<String> {
        match event {
            OrchestrationEvent::ThreadCreated { timestamp, .. }
            | OrchestrationEvent::ThreadUpdated { timestamp, .. }
            | OrchestrationEvent::ThreadDeleted { timestamp, .. }
            | OrchestrationEvent::MessageAdded { timestamp, .. }
            | OrchestrationEvent::TurnStarted { timestamp, .. }
            | OrchestrationEvent::TurnCompleted { timestamp, .. } => Some(timestamp.clone()),
        }
    }
}

#[async_trait::async_trait]
impl EventStore for SqliteEventStore {
    async fn append(&self, event: &OrchestrationEvent) -> Result<()> {
        let event_id = Uuid::new_v4().to_string();
        let event_type = Self::event_type(event);
        let thread_id = Self::thread_id(event);
        let payload_json = serde_json::to_string(event).map_err(|e| {
            Error::Serialization(format!("序列化编排事件失败: {e}"))
        })?;
        let occurred_at = Self::timestamp(event).unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

        // 计算该会话聚合的下一个流版本号。
        let stream_version: i64 = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM orchestration_events WHERE aggregate_kind = 'thread' AND stream_id = ?",
        )
        .bind(&thread_id)
        .fetch_one(self.db.pool())
        .await
        .map_err(|e| Error::Database(format!("计算流版本号失败: {e}")))?
            + 1;

        sqlx::query(
            r#"
            INSERT INTO orchestration_events (
                event_id,
                aggregate_kind,
                stream_id,
                stream_version,
                event_type,
                occurred_at,
                command_id,
                causation_event_id,
                correlation_id,
                actor_kind,
                payload_json,
                metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&event_id)
        .bind("thread")
        .bind(&thread_id)
        .bind(stream_version)
        .bind(event_type)
        .bind(&occurred_at)
        .bind(None::<String>)
        .bind(None::<String>)
        .bind(None::<String>)
        .bind("system")
        .bind(&payload_json)
        .bind("{}")
        .execute(self.db.pool())
        .await
        .map_err(|e| Error::Database(format!("追加事件失败: {e}")))?;

        Ok(())
    }

    async fn read_all(&self) -> Result<Vec<OrchestrationEvent>> {
        let rows: Vec<(String,)> = sqlx::query_as(
            "SELECT payload_json FROM orchestration_events ORDER BY sequence ASC",
        )
        .fetch_all(self.db.pool())
        .await
        .map_err(|e| Error::Database(format!("读取事件失败: {e}")))?;

        let mut events = Vec::with_capacity(rows.len());
        for (payload_json,) in rows {
            let event: OrchestrationEvent = serde_json::from_str(&payload_json).map_err(|e| {
                Error::Serialization(format!("反序列化编排事件失败: {e}"))
            })?;
            events.push(event);
        }

        info!(count = events.len(), "已从存储中读取事件");
        Ok(events)
    }
}
