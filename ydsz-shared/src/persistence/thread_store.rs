//! Thread / Turn / Message 持久化存储
//!
//! 使用 SQLite 存储对话线程，支持崩溃恢复后继续对话。

use anyhow::Result;
use parking_lot::Mutex;
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;

/// Thread 持久化存储
#[derive(Debug, Clone)]
pub struct ThreadStore {
    conn: Arc<Mutex<Connection>>,
}

impl ThreadStore {
    /// 打开或创建 SQLite 数据库
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;
        let store = Self { conn: Arc::new(Mutex::new(conn)) };
        store.init_tables()?;
        Ok(store)
    }

    /// 创建内存存储（主要用于测试）
    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        let store = Self { conn: Arc::new(Mutex::new(conn)) };
        store.init_tables()?;
        Ok(store)
    }

    fn init_tables(&self) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS threads (
                id              TEXT PRIMARY KEY,
                title           TEXT NOT NULL,
                mode            TEXT NOT NULL DEFAULT 'code',
                status          TEXT NOT NULL DEFAULT 'active',
                turn_count      INTEGER NOT NULL DEFAULT 0,
                message_count   INTEGER NOT NULL DEFAULT 0,
                user_id         TEXT,                   -- P0-3: 多用户隔离
                created_at      TEXT NOT NULL,
                updated_at      TEXT NOT NULL,
                metadata        TEXT NOT NULL DEFAULT '{}'
            );
            CREATE INDEX IF NOT EXISTS idx_threads_user ON threads(user_id);

            CREATE TABLE IF NOT EXISTS turns (
                id              TEXT PRIMARY KEY,
                thread_id       TEXT NOT NULL,
                sequence        INTEGER NOT NULL,
                status          TEXT NOT NULL DEFAULT 'running',
                provider_name   TEXT,
                model_name      TEXT,
                started_at      TEXT NOT NULL,
                completed_at    TEXT,
                FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS messages (
                id              TEXT PRIMARY KEY,
                thread_id       TEXT NOT NULL,
                turn_id         TEXT NOT NULL,
                role            TEXT NOT NULL,
                content         TEXT NOT NULL,
                token_count     INTEGER,
                tool_calls      TEXT NOT NULL DEFAULT '[]',
                created_at      TEXT NOT NULL,
                FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
                FOREIGN KEY (turn_id) REFERENCES turns(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_turns_thread ON turns(thread_id);
            CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
            CREATE INDEX IF NOT EXISTS idx_messages_turn ON messages(turn_id);
            "#,
        )?;
        Ok(())
    }

    /// 保存线程
    pub fn save_thread(&self, record: &ThreadRecord) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT OR REPLACE INTO threads (id, title, mode, status, turn_count, message_count, user_id, created_at, updated_at, metadata)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                &record.id,
                &record.title,
                &record.mode,
                &record.status,
                record.turn_count as i64,
                record.message_count as i64,
                &record.user_id,
                &record.created_at,
                &record.updated_at,
                serde_json::to_string(&record.metadata)?,
            ],
        )?;
        Ok(())
    }

    /// 获取线程
    pub fn get_thread(&self, id: &str) -> Result<Option<ThreadRecord>> {
        let conn = self.conn.lock();
        let result = conn
            .query_row(
                "SELECT id, title, mode, status, turn_count, message_count, user_id, created_at, updated_at, metadata
                 FROM threads WHERE id = ?1",
                rusqlite::params![id],
                |row| {
                    Ok(ThreadRecord {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        mode: row.get(2)?,
                        status: row.get(3)?,
                        turn_count: row.get::<_, i64>(4)? as u32,
                        message_count: row.get::<_, i64>(5)? as u32,
                        user_id: row.get(7)?,
                        created_at: row.get(8)?,
                        updated_at: row.get(9)?,
                        metadata: serde_json::from_str(&row.get::<_, String>(10)?)
                            .unwrap_or_default(),
                    })
                },
            )
            .optional()?;
        Ok(result)
    }

    /// 列出所有线程（兼容旧行为：全局列表）
    pub fn list_threads(&self, limit: Option<usize>) -> Result<Vec<ThreadRecord>> {
        let conn = self.conn.lock();
        let sql = if let Some(l) = limit {
            format!(
                "SELECT id, title, mode, status, turn_count, message_count, user_id, created_at, updated_at, metadata
                 FROM threads ORDER BY updated_at DESC LIMIT {}",
                l
            )
        } else {
            "SELECT id, title, mode, status, turn_count, message_count, user_id, created_at, updated_at, metadata
             FROM threads ORDER BY updated_at DESC".to_string()
        };
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map([], |row| {
            Ok(ThreadRecord {
                id: row.get(0)?,
                title: row.get(1)?,
                mode: row.get(2)?,
                status: row.get(3)?,
                turn_count: row.get::<_, i64>(4)? as u32,
                message_count: row.get::<_, i64>(5)? as u32,
                user_id: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
                metadata: serde_json::from_str(&row.get::<_, String>(9)?).unwrap_or_default(),
            })
        })?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    /// 按 user_id 列出线程（P0-3: 多用户隔离）
    pub fn list_threads_for_user(&self, user_id: &str, limit: Option<usize>) -> Result<Vec<ThreadRecord>> {
        let conn = self.conn.lock();
        let sql = if let Some(l) = limit {
            format!(
                "SELECT id, title, mode, status, turn_count, message_count, user_id, created_at, updated_at, metadata
                 FROM threads WHERE user_id = ?1 ORDER BY updated_at DESC LIMIT {}",
                l
            )
        } else {
            "SELECT id, title, mode, status, turn_count, message_count, user_id, created_at, updated_at, metadata
             FROM threads WHERE user_id = ?1 ORDER BY updated_at DESC".to_string()
        };
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params![user_id], |row| {
            Ok(ThreadRecord {
                id: row.get(0)?,
                title: row.get(1)?,
                mode: row.get(2)?,
                status: row.get(3)?,
                turn_count: row.get::<_, i64>(4)? as u32,
                message_count: row.get::<_, i64>(5)? as u32,
                user_id: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
                metadata: serde_json::from_str(&row.get::<_, String>(9)?).unwrap_or_default(),
            })
        })?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    /// 更新线程更新时间
    pub fn touch_thread(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE threads SET updated_at = ?1 WHERE id = ?2",
            rusqlite::params![now, id],
        )?;
        Ok(())
    }

    /// 保存消息
    pub fn save_message(&self, record: &MessageRecord) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT OR REPLACE INTO messages (id, thread_id, turn_id, role, content, token_count, tool_calls, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                &record.id,
                &record.thread_id,
                &record.turn_id,
                &record.role,
                &record.content,
                record.token_count.map(|v| v as i64),
                serde_json::to_string(&record.tool_calls)?,
                &record.created_at,
            ],
        )?;
        Ok(())
    }

    /// 获取线程的所有消息
    pub fn get_thread_messages(&self, thread_id: &str) -> Result<Vec<MessageRecord>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, thread_id, turn_id, role, content, token_count, tool_calls, created_at
             FROM messages WHERE thread_id = ?1 ORDER BY created_at ASC",
        )?;
        let rows = stmt.query_map(rusqlite::params![thread_id], |row| {
            Ok(MessageRecord {
                id: row.get(0)?,
                thread_id: row.get(1)?,
                turn_id: row.get(2)?,
                role: row.get(3)?,
                content: row.get(4)?,
                token_count: row.get::<_, Option<i64>>(5)?.map(|v| v as u32),
                tool_calls: serde_json::from_str(&row.get::<_, String>(6)?).unwrap_or_default(),
                created_at: row.get(7)?,
            })
        })?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    /// 保存 Turn
    pub fn save_turn(&self, record: &TurnRecord) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT OR REPLACE INTO turns (id, thread_id, sequence, status, provider_name, model_name, started_at, completed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                &record.id,
                &record.thread_id,
                record.sequence as i64,
                &record.status,
                &record.provider_name,
                &record.model_name,
                &record.started_at,
                &record.completed_at,
            ],
        )?;
        Ok(())
    }

    /// 获取线程的所有 Turn
    pub fn get_thread_turns(&self, thread_id: &str) -> Result<Vec<TurnRecord>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, thread_id, sequence, status, provider_name, model_name, started_at, completed_at
             FROM turns WHERE thread_id = ?1 ORDER BY sequence ASC",
        )?;
        let rows = stmt.query_map(rusqlite::params![thread_id], |row| {
            Ok(TurnRecord {
                id: row.get(0)?,
                thread_id: row.get(1)?,
                sequence: row.get::<_, i64>(2)? as u32,
                status: row.get(3)?,
                provider_name: row.get(4)?,
                model_name: row.get(5)?,
                started_at: row.get(6)?,
                completed_at: row.get(7)?,
            })
        })?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    /// 删除线程及其关联数据
    pub fn delete_thread(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM threads WHERE id = ?1", rusqlite::params![id])?;
        Ok(())
    }
}

impl Default for ThreadStore {
    fn default() -> Self {
        Self::open_in_memory().expect("Failed to create in-memory thread store")
    }
}

/// 线程记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreadRecord {
    pub id: String,
    pub title: String,
    pub mode: String,
    pub status: String,
    pub turn_count: u32,
    pub message_count: u32,
    pub user_id: Option<String>,    // P0-3: 多用户隔离（None = 全局/旧数据兼容）
    pub created_at: String,
    pub updated_at: String,
    pub metadata: serde_json::Value,
}

/// Turn 记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TurnRecord {
    pub id: String,
    pub thread_id: String,
    pub sequence: u32,
    pub status: String,
    pub provider_name: Option<String>,
    pub model_name: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
}

/// 消息记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageRecord {
    pub id: String,
    pub thread_id: String,
    pub turn_id: String,
    pub role: String,
    pub content: String,
    pub token_count: Option<u32>,
    pub tool_calls: Vec<serde_json::Value>,
    pub created_at: String,
}
