//! 对话轮次投影仓库
//!
//! 管理 `projection_turns` 表的 CRUD 操作。

use async_trait::async_trait;
use remi_core::models::{ThreadId, TurnId};
use serde::{Deserialize, Serialize};

use crate::error::PersistenceResult;
use crate::sqlite_client::SqliteClient;

/// 对话轮次状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TurnState {
    Pending,
    Running,
    Interrupted,
    Completed,
    Error,
}

/// 对话轮次
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectionTurn {
    pub thread_id: ThreadId,
    pub turn_id: TurnId,
    pub pending_message_id: Option<String>,
    pub source_proposed_plan_thread_id: Option<ThreadId>,
    pub source_proposed_plan_id: Option<String>,
    pub assistant_message_id: Option<String>,
    pub state: TurnState,
    pub requested_at: chrono::DateTime<chrono::Utc>,
    pub started_at: Option<chrono::DateTime<chrono::Utc>>,
    pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
    pub checkpoint_turn_count: Option<i64>,
    pub checkpoint_ref: Option<String>,
    pub checkpoint_status: Option<String>,
    pub checkpoint_files_json: String,
}

/// 对话轮次仓库 trait
#[async_trait]
pub trait ProjectionTurnRepository: Send + Sync {
    fn upsert(&self, turn: &ProjectionTurn) -> PersistenceResult<()>;
    fn list_by_thread_id(&self, thread_id: ThreadId) -> PersistenceResult<Vec<ProjectionTurn>>;
    fn get_by_turn_id(&self, thread_id: ThreadId, turn_id: TurnId) -> PersistenceResult<Option<ProjectionTurn>>;
    fn delete_by_thread_id(&self, thread_id: ThreadId) -> PersistenceResult<()>;
}

/// SQLite 对话轮次仓库实现
pub struct SqliteProjectionTurnRepository {
    client: SqliteClient,
}

impl SqliteProjectionTurnRepository {
    pub fn new(client: SqliteClient) -> Self {
        Self { client }
    }
}

impl ProjectionTurnRepository for SqliteProjectionTurnRepository {
    fn upsert(&self, turn: &ProjectionTurn) -> PersistenceResult<()> {
        let state_str = match turn.state {
            TurnState::Pending => "pending",
            TurnState::Running => "running",
            TurnState::Interrupted => "interrupted",
            TurnState::Completed => "completed",
            TurnState::Error => "error",
        };

        self.client.execute(
            "INSERT OR REPLACE INTO projection_turns
             (thread_id, turn_id, pending_message_id, source_proposed_plan_thread_id,
              source_proposed_plan_id, assistant_message_id, state, requested_at,
              started_at, completed_at, checkpoint_turn_count, checkpoint_ref,
              checkpoint_status, checkpoint_files_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            &[
                &turn.thread_id.to_string(),
                &turn.turn_id.to_string(),
                &turn.pending_message_id,
                &turn.source_proposed_plan_thread_id.map(|id| id.to_string()),
                &turn.source_proposed_plan_id,
                &turn.assistant_message_id,
                &state_str,
                &turn.requested_at.to_rfc3339(),
                &turn.started_at.map(|d| d.to_rfc3339()),
                &turn.completed_at.map(|d| d.to_rfc3339()),
                &turn.checkpoint_turn_count,
                &turn.checkpoint_ref,
                &turn.checkpoint_status,
                &turn.checkpoint_files_json,
            ],
        )?;
        Ok(())
    }

    fn list_by_thread_id(&self, thread_id: ThreadId) -> PersistenceResult<Vec<ProjectionTurn>> {
        let rows = self.client.query_map(
            "SELECT thread_id, turn_id, pending_message_id, source_proposed_plan_thread_id,
                    source_proposed_plan_id, assistant_message_id, state, requested_at,
                    started_at, completed_at, checkpoint_turn_count, checkpoint_ref,
                    checkpoint_status, checkpoint_files_json
             FROM projection_turns WHERE thread_id = ?1 ORDER BY requested_at",
            &[&thread_id.to_string()],
            row_to_turn,
        )?;

        Ok(rows)
    }

    fn get_by_turn_id(&self, thread_id: ThreadId, turn_id: TurnId) -> PersistenceResult<Option<ProjectionTurn>> {
        let rows = self.client.query_map(
            "SELECT thread_id, turn_id, pending_message_id, source_proposed_plan_thread_id,
                    source_proposed_plan_id, assistant_message_id, state, requested_at,
                    started_at, completed_at, checkpoint_turn_count, checkpoint_ref,
                    checkpoint_status, checkpoint_files_json
             FROM projection_turns WHERE thread_id = ?1 AND turn_id = ?2",
            &[&thread_id.to_string(), &turn_id.to_string()],
            row_to_turn,
        )?;

        Ok(rows.into_iter().next())
    }

    fn delete_by_thread_id(&self, thread_id: ThreadId) -> PersistenceResult<()> {
        self.client.execute(
            "DELETE FROM projection_turns WHERE thread_id = ?1",
            &[&thread_id.to_string()],
        )?;
        Ok(())
    }
}

fn row_to_turn(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectionTurn> {
    let thread_id_str: String = row.get(0)?;
    let turn_id_str: String = row.get(1)?;
    let pending_message_id: Option<String> = row.get(2)?;
    let source_plan_thread_id_str: Option<String> = row.get(3)?;
    let source_plan_id: Option<String> = row.get(4)?;
    let assistant_message_id: Option<String> = row.get(5)?;
    let state_str: String = row.get(6)?;
    let requested_at_str: String = row.get(7)?;
    let started_at_str: Option<String> = row.get(8)?;
    let completed_at_str: Option<String> = row.get(9)?;
    let checkpoint_turn_count: Option<i64> = row.get(10)?;
    let checkpoint_ref: Option<String> = row.get(11)?;
    let checkpoint_status: Option<String> = row.get(12)?;
    let checkpoint_files_json: String = row.get(13)?;

    let thread_id = thread_id_str.parse::<uuid::Uuid>().map_err(|e: uuid::Error| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
    })?;
    let turn_id = turn_id_str;
    let source_proposed_plan_thread_id = source_plan_thread_id_str.map(|s| s.parse::<uuid::Uuid>()).transpose().map_err(|e: uuid::Error| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
    })?;
    let source_proposed_plan_id = source_plan_id;

    let state = match state_str.as_str() {
        "pending" => TurnState::Pending,
        "running" => TurnState::Running,
        "interrupted" => TurnState::Interrupted,
        "completed" => TurnState::Completed,
        "error" => TurnState::Error,
        _ => return Err(rusqlite::Error::InvalidColumnIndex(6)),
    };

    let requested_at = requested_at_str.parse().map_err(|_| rusqlite::Error::InvalidColumnIndex(7))?;
    let started_at = started_at_str.map(|s| s.parse()).transpose().map_err(|_| rusqlite::Error::InvalidColumnIndex(8))?;
    let completed_at = completed_at_str.map(|s| s.parse()).transpose().map_err(|_| rusqlite::Error::InvalidColumnIndex(9))?;

    Ok(ProjectionTurn {
        thread_id,
        turn_id,
        pending_message_id,
        source_proposed_plan_thread_id,
        source_proposed_plan_id,
        assistant_message_id,
        state,
        requested_at,
        started_at,
        completed_at,
        checkpoint_turn_count,
        checkpoint_ref,
        checkpoint_status,
        checkpoint_files_json,
    })
}
