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
}

#[async_trait::async_trait]
impl EventStore for SqliteEventStore {
    async fn append(&self, event: &OrchestrationEvent) -> Result<()> {
        let id = Uuid::new_v4().to_string();
        let event_type = Self::event_type(event);
        let thread_id = Self::thread_id(event);
        let payload = serde_json::to_string(event).map_err(|e| {
            Error::Serialization(format!("Failed to serialize orchestration event: {e}"))
        })?;
        let now = chrono::Utc::now().to_rfc3339();

        sqlx::query(
            "INSERT INTO orchestration_events (id, thread_id, event_type, payload, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(&thread_id)
        .bind(event_type)
        .bind(&payload)
        .bind(&now)
        .execute(self.db.pool())
        .await
        .map_err(|e| Error::Database(format!("Failed to append event: {e}")))?;

        Ok(())
    }

    async fn read_all(&self) -> Result<Vec<OrchestrationEvent>> {
        let rows: Vec<(String, String, String, String)> = sqlx::query_as(
            "SELECT id, thread_id, event_type, payload FROM orchestration_events ORDER BY created_at ASC",
        )
        .fetch_all(self.db.pool())
        .await
        .map_err(|e| Error::Database(format!("Failed to read events: {e}")))?;

        let mut events = Vec::with_capacity(rows.len());
        for (_id, _thread_id, _event_type, payload) in rows {
            let event: OrchestrationEvent = serde_json::from_str(&payload).map_err(|e| {
                Error::Serialization(format!("Failed to deserialize orchestration event: {e}"))
            })?;
            events.push(event);
        }

        info!(count = events.len(), "Read events from store");
        Ok(events)
    }
}
