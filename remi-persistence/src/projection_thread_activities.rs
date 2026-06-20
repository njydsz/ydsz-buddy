//! 线程活动投影仓库
//!
//! 管理 `projection_thread_activities` 表的 CRUD 操作。

use async_trait::async_trait;
use remi_core::models::{ThreadId, TurnId};
use serde::{Deserialize, Serialize};

use crate::error::PersistenceResult;
use crate::sqlite_client::SqliteClient;

/// 线程活动
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreadActivity {
    pub activity_id: String,
    pub thread_id: ThreadId,
    pub turn_id: Option<TurnId>,
    pub tone: String,
    pub kind: String,
    pub summary: String,
    pub payload_json: String,
    pub sequence: Option<i64>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// 线程活动仓库 trait
#[async_trait]
pub trait ThreadActivityRepository: Send + Sync {
    fn upsert(&self, activity: &ThreadActivity) -> PersistenceResult<()>;
    fn list_by_thread_id(&self, thread_id: ThreadId) -> PersistenceResult<Vec<ThreadActivity>>;
    fn delete_by_thread_id(&self, thread_id: ThreadId) -> PersistenceResult<()>;
}

/// SQLite 线程活动仓库实现
pub struct SqliteThreadActivityRepository {
    client: SqliteClient,
}

impl SqliteThreadActivityRepository {
    pub fn new(client: SqliteClient) -> Self {
        Self { client }
    }
}

impl ThreadActivityRepository for SqliteThreadActivityRepository {
    fn upsert(&self, activity: &ThreadActivity) -> PersistenceResult<()> {
        self.client.execute(
            "INSERT OR REPLACE INTO projection_thread_activities
             (activity_id, thread_id, turn_id, tone, kind, summary, payload_json, sequence, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            &[
                &activity.activity_id,
                &activity.thread_id.to_string(),
                &activity.turn_id.as_ref().map(|id| id.to_string()),
                &activity.tone,
                &activity.kind,
                &activity.summary,
                &activity.payload_json,
                &activity.sequence,
                &activity.created_at.to_rfc3339(),
            ],
        )?;
        Ok(())
    }

    fn list_by_thread_id(&self, thread_id: ThreadId) -> PersistenceResult<Vec<ThreadActivity>> {
        let rows = self.client.query_map(
            "SELECT activity_id, thread_id, turn_id, tone, kind, summary, payload_json, sequence, created_at
             FROM projection_thread_activities
             WHERE thread_id = ?1
             ORDER BY
               CASE WHEN sequence IS NULL THEN 0 ELSE 1 END DESC,
               sequence DESC,
               created_at DESC,
               activity_id DESC",
            &[&thread_id.to_string()],
            |row| {
                let activity_id: String = row.get(0)?;
                let thread_id_str: String = row.get(1)?;
                let turn_id_str: Option<String> = row.get(2)?;
                let tone: String = row.get(3)?;
                let kind: String = row.get(4)?;
                let summary: String = row.get(5)?;
                let payload_json: String = row.get(6)?;
                let sequence: Option<i64> = row.get(7)?;
                let created_at_str: String = row.get(8)?;

                Ok((activity_id, thread_id_str, turn_id_str, tone, kind, summary, payload_json, sequence, created_at_str))
            },
        )?;

        rows.into_iter()
            .map(|(activity_id, thread_id_str, turn_id_str, tone, kind, summary, payload_json, sequence, created_at_str)| -> PersistenceResult<ThreadActivity> {
                let thread_id = thread_id_str.parse::<uuid::Uuid>().map_err(|e| crate::error::PersistenceError::DatabaseError(e.to_string()))?;
                let turn_id = turn_id_str;
                let created_at = created_at_str.parse::<chrono::DateTime<chrono::Utc>>().map_err(|e: chrono::ParseError| crate::error::PersistenceError::DatabaseError(e.to_string()))?;

                Ok(ThreadActivity {
                    activity_id,
                    thread_id,
                    turn_id,
                    tone,
                    kind,
                    summary,
                    payload_json,
                    sequence,
                    created_at,
                })
            })
            .collect()
    }

    fn delete_by_thread_id(&self, thread_id: ThreadId) -> PersistenceResult<()> {
        self.client.execute(
            "DELETE FROM projection_thread_activities WHERE thread_id = ?1",
            &[&thread_id.to_string()],
        )?;
        Ok(())
    }
}
