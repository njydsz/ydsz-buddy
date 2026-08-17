use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::fmt::Debug;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventQuery {
    pub limit: Option<usize>,
    pub event_type: Option<String>,
}

#[async_trait]
pub trait EventStore: Send + Sync + Debug {
    async fn append(&self, event_type: &str, payload: serde_json::Value) -> anyhow::Result<String>;
    async fn query(&self, query: &EventQuery) -> anyhow::Result<Vec<super::EventRecord>>;
    async fn get(&self, id: &str) -> anyhow::Result<Option<super::EventRecord>>;
}

#[async_trait]
impl EventStore for super::SqliteEventStore {
    async fn append(&self, _event_type: &str, _payload: serde_json::Value) -> anyhow::Result<String> {
        Ok("stub-event-id".to_string())
    }
    async fn query(&self, _query: &EventQuery) -> anyhow::Result<Vec<super::EventRecord>> {
        Ok(vec![])
    }
    async fn get(&self, _id: &str) -> anyhow::Result<Option<super::EventRecord>> {
        Ok(None)
    }
}
