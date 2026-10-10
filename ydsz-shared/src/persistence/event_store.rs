use anyhow::Result;
use async_trait::async_trait;
use serde_json::Value;
use std::fmt::Debug;
use std::path::Path;
use std::sync::Arc;

use super::SqliteEventStore;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct EventQuery {
    pub limit: Option<usize>,
    pub event_type: Option<String>,
}

/// 异步事件存储 trait
///
/// 前端/业务层通过此 trait 访问事件持久化，背后由 `SqliteEventStore` 提供真实 SQLite 实现。
#[async_trait]
pub trait EventStore: Send + Sync + Debug {
    async fn append(&self, event_type: &str, payload: Value) -> Result<String>;
    async fn query(&self, query: &EventQuery) -> Result<Vec<super::EventRecord>>;
    async fn get(&self, id: &str) -> Result<Option<super::EventRecord>>;
}

/// SQLite 事件存储的异步包装
///
/// 包装 `SqliteEventStore`（同步 + Mutex）以满足异步 trait 约束。
#[derive(Debug, Clone)]
pub struct AsyncSqliteEventStore {
    inner: Arc<SqliteEventStore>,
}

impl AsyncSqliteEventStore {
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
        Ok(Self {
            inner: Arc::new(SqliteEventStore::open(path)?),
        })
    }

    pub fn open_in_memory() -> Result<Self> {
        Ok(Self {
            inner: Arc::new(SqliteEventStore::open_in_memory()?),
        })
    }

    pub fn inner(&self) -> &SqliteEventStore {
        &self.inner
    }
}

impl Default for AsyncSqliteEventStore {
    fn default() -> Self {
        Self::open_in_memory().expect("Failed to create in-memory event store")
    }
}

#[async_trait]
impl EventStore for AsyncSqliteEventStore {
    async fn append(&self, event_type: &str, payload: Value) -> Result<String> {
        let store = self.inner.clone();
        let event_type = event_type.to_string();
        // 使用 tokio 阻塞线程执行同步 SQLite 操作
        tokio::task::spawn_blocking(move || {
            store.append(&event_type, "system", "global", &payload)
        })
        .await
        .map_err(|e| anyhow::anyhow!("Task join error: {}", e))?
    }

    async fn query(&self, query: &EventQuery) -> Result<Vec<super::EventRecord>> {
        let store = self.inner.clone();
        let event_type = query.event_type.clone();
        let limit = query.limit;
        tokio::task::spawn_blocking(move || store.query(event_type.as_deref(), None, limit))
            .await
            .map_err(|e| anyhow::anyhow!("Task join error: {}", e))?
    }

    async fn get(&self, id: &str) -> Result<Option<super::EventRecord>> {
        let store = self.inner.clone();
        let id = id.to_string();
        tokio::task::spawn_blocking(move || store.get(&id))
            .await
            .map_err(|e| anyhow::anyhow!("Task join error: {}", e))?
    }
}

// 为旧版 SqliteEventStore（mod.rs 中的原始空类型）保留兼容性
// 新版请使用 SqliteEventStore 或 AsyncSqliteEventStore

#[async_trait]
impl EventStore for SqliteEventStore {
    async fn append(&self, event_type: &str, payload: Value) -> Result<String> {
        self.append(event_type, "system", "global", &payload)
    }

    async fn query(&self, query: &EventQuery) -> Result<Vec<super::EventRecord>> {
        self.query(query.event_type.as_deref(), None, query.limit)
    }

    async fn get(&self, id: &str) -> Result<Option<super::EventRecord>> {
        self.get(id)
    }
}
