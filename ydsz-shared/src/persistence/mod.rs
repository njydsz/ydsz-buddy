// ydsz-shared: 持久化存储 — SQLite 真实实现

use anyhow::Result;
use parking_lot::Mutex;
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::fmt::Debug;
use std::path::Path;
use std::sync::Arc;

pub mod event_store;
pub mod memory_store_sqlite;
pub mod thread_store;
pub mod mod_migrations;

// Re-export
pub use memory_store_sqlite::SqliteMemoryStore;
pub use thread_store::{MessageRecord, ThreadRecord, ThreadStore, TurnRecord};
pub use mod_migrations::{DbMigrator, Migration, MigrationRecord, SqlMigration, register_all_migrations};

/// SQLite 事件存储 — 真实实现
///
/// 使用 rusqlite + 连接池（每个实例持有单一连接），支持：
/// - append: 追加事件，返回唯一 ID
/// - query: 按事件类型 / limit 查询
/// - get: 按 ID 获取单条事件
#[derive(Debug, Clone)]
pub struct SqliteEventStore {
    conn: Arc<Mutex<Connection>>,
}

impl SqliteEventStore {
    /// 打开或创建 SQLite 数据库
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;
        let store = Self { conn: Arc::new(Mutex::new(conn)) };
        store.init_tables()?;
        Ok(store)
    }

    /// 打开内存数据库（主要用于测试）
    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        let store = Self { conn: Arc::new(Mutex::new(conn)) };
        store.init_tables()?;
        Ok(store)
    }

    /// 初始化数据库表
    fn init_tables(&self) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;

            CREATE TABLE IF NOT EXISTS events (
                id              TEXT PRIMARY KEY,
                sequence        INTEGER NOT NULL,
                event_type      TEXT NOT NULL,
                aggregate_kind  TEXT NOT NULL,
                stream_id       TEXT NOT NULL,
                payload         TEXT NOT NULL,
                occurred_at     TEXT NOT NULL,
                created_at      TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
            CREATE INDEX IF NOT EXISTS idx_events_stream ON events(stream_id);
            CREATE INDEX IF NOT EXISTS idx_events_sequence ON events(sequence);

            CREATE TABLE IF NOT EXISTS event_sequence (
                name TEXT PRIMARY KEY,
                value INTEGER NOT NULL DEFAULT 0
            );
            "#,
        )?;
        Ok(())
    }

    /// 追加事件到存储
    pub fn append(
        &self,
        event_type: impl AsRef<str>,
        aggregate_kind: impl AsRef<str>,
        stream_id: impl AsRef<str>,
        payload: &serde_json::Value,
    ) -> Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let event_type = event_type.as_ref();
        let aggregate_kind = aggregate_kind.as_ref();
        let stream_id = stream_id.as_ref();
        let payload_json = serde_json::to_string(payload)?;
        let now = chrono::Utc::now();
        let occurred_at = now.to_rfc3339();
        let created_at = occurred_at.clone();

        let mut conn = self.conn.lock();

        // 获取并递增序列号
        let tx = conn.transaction()?;
        let sequence: i64 = {
            let mut stmt = tx.prepare(
                "INSERT INTO event_sequence (name, value) VALUES ('global', 1)
                 ON CONFLICT(name) DO UPDATE SET value = value + 1
                 RETURNING value",
            )?;
            let seq: i64 = stmt.query_row([], |row| row.get(0))?;
            seq
        };

        tx.execute(
            "INSERT INTO events (id, sequence, event_type, aggregate_kind, stream_id, payload, occurred_at, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                &id,
                sequence,
                event_type,
                aggregate_kind,
                stream_id,
                payload_json,
                occurred_at,
                created_at,
            ],
        )?;

        tx.commit()?;

        tracing::debug!(
            event_id = %id,
            sequence = sequence,
            event_type = event_type,
            "事件已追加"
        );

        Ok(id)
    }

    /// 按条件查询事件
    pub fn query(
        &self,
        event_type: Option<&str>,
        stream_id: Option<&str>,
        limit: Option<usize>,
    ) -> Result<Vec<EventRecord>> {
        let conn = self.conn.lock();
        let mut sql = String::from(
            "SELECT id, sequence, event_type, aggregate_kind, stream_id, payload, occurred_at, created_at FROM events WHERE 1=1",
        );
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(ty) = event_type {
            sql.push_str(" AND event_type = ?");
            params.push(Box::new(ty.to_string()));
        }
        if let Some(sid) = stream_id {
            sql.push_str(" AND stream_id = ?");
            params.push(Box::new(sid.to_string()));
        }
        sql.push_str(" ORDER BY sequence ASC");
        if let Some(l) = limit {
            sql.push_str(" LIMIT ?");
            params.push(Box::new(l as i64));
        }

        let param_refs: Vec<&dyn rusqlite::ToSql> =
            params.iter().map(|p| p.as_ref()).collect();

        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(param_refs.as_slice(), |row| {
            Ok(EventRecord {
                id: row.get(0)?,
                sequence: row.get::<_, i64>(1)? as u64,
                event_type: row.get(2)?,
                aggregate_kind: row.get(3)?,
                stream_id: row.get(4)?,
                payload: serde_json::from_str(&row.get::<_, String>(5)?).unwrap_or(serde_json::Value::Null),
                occurred_at: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?;

        let mut records = Vec::new();
        for row in rows {
            records.push(row?);
        }
        Ok(records)
    }

    /// 按 ID 获取事件
    pub fn get(&self, id: &str) -> Result<Option<EventRecord>> {
        let conn = self.conn.lock();
        let result = conn
            .query_row(
                "SELECT id, sequence, event_type, aggregate_kind, stream_id, payload, occurred_at, created_at FROM events WHERE id = ?1",
                rusqlite::params![id],
                |row| {
                    Ok(EventRecord {
                        id: row.get(0)?,
                        sequence: row.get::<_, i64>(1)? as u64,
                        event_type: row.get(2)?,
                        aggregate_kind: row.get(3)?,
                        stream_id: row.get(4)?,
                        payload: serde_json::from_str(&row.get::<_, String>(5)?)
                            .unwrap_or(serde_json::Value::Null),
                        occurred_at: row.get(6)?,
                        created_at: row.get(7)?,
                    })
                },
            )
            .optional()?;
        Ok(result)
    }

    /// 事件总数
    pub fn count(&self) -> Result<u64> {
        let conn = self.conn.lock();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM events", [], |row| row.get(0))?;
        Ok(count as u64)
    }

    /// 读取事件（分页），兼容旧接口
    pub fn read_events(&self, offset: u64, limit: u64) -> anyhow::Result<Vec<EventRecord>> {
        let conn = self.conn.lock();
        let offset = offset as i64;
        let limit = limit as i64;
        let mut stmt = conn.prepare(
            "SELECT id, sequence, event_type, aggregate_kind, stream_id, payload, occurred_at, created_at
             FROM events ORDER BY sequence ASC LIMIT ?1 OFFSET ?2",
        )?;
        let rows = stmt.query_map(rusqlite::params![limit, offset], |row| {
            Ok(EventRecord {
                id: row.get(0)?,
                sequence: row.get::<_, i64>(1)? as u64,
                event_type: row.get(2)?,
                aggregate_kind: row.get(3)?,
                stream_id: row.get(4)?,
                payload: serde_json::from_str(&row.get::<_, String>(5)?).unwrap_or(serde_json::Value::Null),
                occurred_at: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?;
        let mut records = Vec::new();
        for row in rows {
            records.push(row?);
        }
        Ok(records)
    }
}

impl Default for SqliteEventStore {
    fn default() -> Self {
        Self::open_in_memory().expect("Failed to create in-memory event store")
    }
}

/// 事件记录
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
