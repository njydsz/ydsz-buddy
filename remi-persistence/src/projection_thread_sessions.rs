//! 线程会话投影仓库
//!
//! 管理 `projection_thread_sessions` 表的 CRUD 操作。

use async_trait::async_trait;
use remi_core::models::{ThreadId, TurnId};
use serde::{Deserialize, Serialize};

use crate::error::PersistenceResult;
use crate::sqlite_client::SqliteClient;

/// 线程会话状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Idle,
    Active,
    Error,
}

/// 线程会话
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreadSession {
    pub thread_id: ThreadId,
    pub status: SessionStatus,
    pub provider_name: Option<String>,
    pub provider_session_id: Option<String>,
    pub provider_thread_id: Option<String>,
    pub runtime_mode: String,
    pub active_turn_id: Option<TurnId>,
    pub last_error: Option<String>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

/// 线程会话仓库 trait
#[async_trait]
pub trait ThreadSessionRepository: Send + Sync {
    fn upsert(&self, session: &ThreadSession) -> PersistenceResult<()>;
    fn get_by_thread_id(&self, thread_id: ThreadId) -> PersistenceResult<Option<ThreadSession>>;
    fn delete_by_thread_id(&self, thread_id: ThreadId) -> PersistenceResult<()>;
}

/// SQLite 线程会话仓库实现
pub struct SqliteThreadSessionRepository {
    client: SqliteClient,
}

impl SqliteThreadSessionRepository {
    pub fn new(client: SqliteClient) -> Self {
        Self { client }
    }
}

impl ThreadSessionRepository for SqliteThreadSessionRepository {
    fn upsert(&self, session: &ThreadSession) -> PersistenceResult<()> {
        let status_str = match session.status {
            SessionStatus::Idle => "idle",
            SessionStatus::Active => "active",
            SessionStatus::Error => "error",
        };

        self.client.execute(
            "INSERT OR REPLACE INTO projection_thread_sessions
             (thread_id, status, provider_name, provider_session_id, provider_thread_id,
              runtime_mode, active_turn_id, last_error, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            &[
                &session.thread_id.to_string(),
                &status_str,
                &session.provider_name,
                &session.provider_session_id,
                &session.provider_thread_id,
                &session.runtime_mode,
                &session.active_turn_id.as_ref().map(|id| id.to_string()),
                &session.last_error,
                &session.updated_at.to_rfc3339(),
            ],
        )?;
        Ok(())
    }

    fn get_by_thread_id(&self, thread_id: ThreadId) -> PersistenceResult<Option<ThreadSession>> {
        let rows = self.client.query_map(
            "SELECT thread_id, status, provider_name, provider_session_id, provider_thread_id,
                    runtime_mode, active_turn_id, last_error, updated_at
             FROM projection_thread_sessions WHERE thread_id = ?1",
            &[&thread_id.to_string()],
            |row| {
                let thread_id_str: String = row.get(0)?;
                let status_str: String = row.get(1)?;
                let provider_name: Option<String> = row.get(2)?;
                let provider_session_id: Option<String> = row.get(3)?;
                let provider_thread_id: Option<String> = row.get(4)?;
                let runtime_mode: String = row.get(5)?;
                let active_turn_id_str: Option<String> = row.get(6)?;
                let last_error: Option<String> = row.get(7)?;
                let updated_at_str: String = row.get(8)?;

                Ok((thread_id_str, status_str, provider_name, provider_session_id, provider_thread_id,
                    runtime_mode, active_turn_id_str, last_error, updated_at_str))
            },
        )?;

        if rows.is_empty() {
            return Ok(None);
        }

        let (thread_id_str, status_str, provider_name, provider_session_id, provider_thread_id,
             runtime_mode, active_turn_id_str, last_error, updated_at_str) = rows.into_iter().next().unwrap();

        let thread_id = thread_id_str.parse::<uuid::Uuid>().map_err(|e| crate::error::PersistenceError::DatabaseError(e.to_string()))?;
        let status = match status_str.as_str() {
            "idle" => SessionStatus::Idle,
            "active" => SessionStatus::Active,
            "error" => SessionStatus::Error,
            _ => return Err(crate::error::PersistenceError::DatabaseError(format!("Invalid status: {}", status_str))),
        };
        let active_turn_id = active_turn_id_str;
        let updated_at = updated_at_str.parse().map_err(|e| crate::error::PersistenceError::DatabaseError(e.to_string()))?;

        Ok(Some(ThreadSession {
            thread_id,
            status,
            provider_name,
            provider_session_id,
            provider_thread_id,
            runtime_mode,
            active_turn_id,
            last_error,
            updated_at,
        }))
    }

    fn delete_by_thread_id(&self, thread_id: ThreadId) -> PersistenceResult<()> {
        self.client.execute(
            "DELETE FROM projection_thread_sessions WHERE thread_id = ?1",
            &[&thread_id.to_string()],
        )?;
        Ok(())
    }
}
