// ydsz-shared: 持久化存储

use serde::{Deserialize, Serialize};
use std::fmt::Debug;

pub mod event_store;
pub mod memory_store_sqlite;

// Re-export MemoryStore implementation
pub use memory_store_sqlite::SqliteMemoryStore;

/// SQLite-based event store stub
#[derive(Debug)]
pub struct SqliteEventStore;

impl SqliteEventStore {
    pub fn new() -> Self { Self }
    pub async fn init(&self) -> anyhow::Result<()> { Ok(()) }
    pub fn read_events(&self, _offset: u64, _limit: u64) -> anyhow::Result<Vec<EventRecord>> {
        Ok(vec![])
    }
}

impl Default for SqliteEventStore {
    fn default() -> Self { Self::new() }
}

/// Event record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventRecord {
    pub id: String,
    pub sequence: u64,
    pub event_type: String,
    pub aggregate_kind: String,
    pub stream_id: String,
    pub payload: serde_json::Value,
    pub occurred_at: String,
    pub created_at: String,
}
