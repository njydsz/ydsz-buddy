//! Event store for orchestration events.

use remi_contracts::OrchestrationEvent;
use remi_core::{Error, Result};
use remi_persistence::Database;
use std::sync::Arc;
use tracing::info;
use uuid::Uuid;

/// Abstraction over orchestration event persistence.
#[async_trait::async_trait]
pub trait EventStore: Send + Sync {
    /// Append an event to the store.
    async fn append(&self, event: &OrchestrationEvent) -> Result<()>;

    /// Read all events ordered by creation time.
    async fn read_all(&self) -> Result<Vec<OrchestrationEvent>>;
}

/// SQLite-backed event store.
pub struct SqliteEventStore {
    db: Arc<Database>,
}

impl SqliteEventStore {
    /// Create a new SQLite event store.
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    /// Extract the event type string for storage.
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

    /// Extract the thread ID string for storage.
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

    /// Extract the timestamp string for storage.
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
            Error::Serialization(format!("Failed to serialize orchestration event: {e}"))
        })?;
        let occurred_at = Self::timestamp(event).unwrap_or_else(|| chrono::Utc::now().to_rfc3339());

        // Compute the next stream version for this thread aggregate.
        let stream_version: i64 = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM orchestration_events WHERE aggregate_kind = 'thread' AND stream_id = ?",
        )
        .bind(&thread_id)
        .fetch_one(self.db.pool())
        .await
        .map_err(|e| Error::Database(format!("Failed to compute stream version: {e}")))?
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
        .map_err(|e| Error::Database(format!("Failed to append event: {e}")))?;

        Ok(())
    }

    async fn read_all(&self) -> Result<Vec<OrchestrationEvent>> {
        let rows: Vec<(String,)> = sqlx::query_as(
            "SELECT payload_json FROM orchestration_events ORDER BY sequence ASC",
        )
        .fetch_all(self.db.pool())
        .await
        .map_err(|e| Error::Database(format!("Failed to read events: {e}")))?;

        let mut events = Vec::with_capacity(rows.len());
        for (payload_json,) in rows {
            let event: OrchestrationEvent = serde_json::from_str(&payload_json).map_err(|e| {
                Error::Serialization(format!("Failed to deserialize orchestration event: {e}"))
            })?;
            events.push(event);
        }

        info!(count = events.len(), "Read events from store");
        Ok(events)
    }
}
