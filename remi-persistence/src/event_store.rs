//! 事件存储

use async_trait::async_trait;
use chrono::Utc;
use remi_core::events::OrchestrationEvent;
use remi_core::models::Sequence;
use uuid::Uuid;

use crate::error::{PersistenceError, PersistenceResult};
use crate::sqlite_client::SqliteClient;

/// 事件存储 trait
#[async_trait]
pub trait EventStore: Send + Sync {
    /// 追加事件
    fn append_event(&self, event: &OrchestrationEvent) -> PersistenceResult<Sequence>;

    /// 读取事件
    fn read_events(&self, from_sequence: Sequence, limit: usize) -> PersistenceResult<Vec<StoredEvent>>;

    /// 获取最新序列号
    fn get_latest_sequence(&self) -> PersistenceResult<Sequence>;
}

/// 存储的事件
#[derive(Debug, Clone)]
pub struct StoredEvent {
    pub sequence: Sequence,
    pub event_id: String,
    pub event_type: String,
    pub aggregate_kind: String,
    pub aggregate_id: String,
    pub payload: String,
    pub occurred_at: String,
    pub command_id: Option<String>,
    pub metadata: Option<String>,
}

/// SQLite 事件存储实现
pub struct SqliteEventStore {
    client: SqliteClient,
}

impl SqliteEventStore {
    pub fn new(client: SqliteClient) -> Self {
        Self { client }
    }

    /// 从事件中提取聚合信息
    fn extract_aggregate_info(event: &OrchestrationEvent) -> (String, String, String) {
        match event {
            OrchestrationEvent::ProjectCreated(e) => ("project".to_string(), e.project_id.to_string(), "project.created".to_string()),
            OrchestrationEvent::ProjectMetaUpdated(e) => ("project".to_string(), e.project_id.to_string(), "project.meta-updated".to_string()),
            OrchestrationEvent::ProjectDeleted(e) => ("project".to_string(), e.project_id.to_string(), "project.deleted".to_string()),
            OrchestrationEvent::ThreadCreated(e) => ("thread".to_string(), e.thread_id.to_string(), "thread.created".to_string()),
            OrchestrationEvent::ThreadDeleted(e) => ("thread".to_string(), e.thread_id.to_string(), "thread.deleted".to_string()),
            OrchestrationEvent::ThreadArchived(e) => ("thread".to_string(), e.thread_id.to_string(), "thread.archived".to_string()),
            OrchestrationEvent::ThreadUnarchived(e) => ("thread".to_string(), e.thread_id.to_string(), "thread.unarchived".to_string()),
            OrchestrationEvent::ThreadMetaUpdated(e) => ("thread".to_string(), e.thread_id.to_string(), "thread.meta-updated".to_string()),
            OrchestrationEvent::ThreadRuntimeModeSet(e) => ("thread".to_string(), e.thread_id.to_string(), "thread.runtime-mode-set".to_string()),
            OrchestrationEvent::ThreadInteractionModeSet(e) => ("thread".to_string(), e.thread_id.to_string(), "thread.interaction-mode-set".to_string()),
            OrchestrationEvent::ThreadMessageSent(e) => ("thread".to_string(), e.thread_id.to_string(), "thread.message-sent".to_string()),
            OrchestrationEvent::ThreadTurnQueued(e) => ("thread".to_string(), e.thread_id.to_string(), "thread.turn-queued".to_string()),
            OrchestrationEvent::ThreadTurnStartRequested(e) => ("thread".to_string(), e.thread_id.to_string(), "thread.turn-start-requested".to_string()),
            OrchestrationEvent::ThreadTurnInterruptRequested(e) => ("thread".to_string(), e.thread_id.to_string(), "thread.turn-interrupt-requested".to_string()),
            OrchestrationEvent::ThreadApprovalResponseRequested(e) => ("thread".to_string(), e.thread_id.to_string(), "thread.approval-response-requested".to_string()),
            OrchestrationEvent::ThreadUserInputResponseRequested(e) => ("thread".to_string(), e.thread_id.to_string(), "thread.user-input-response-requested".to_string()),
            OrchestrationEvent::ThreadCheckpointRevertRequested(e) => ("thread".to_string(), e.thread_id.to_string(), "thread.checkpoint-revert-requested".to_string()),
            OrchestrationEvent::ThreadReverted(e) => ("thread".to_string(), e.thread_id.to_string(), "thread.reverted".to_string()),
            OrchestrationEvent::ThreadTurnDiffCompleted(e) => ("thread".to_string(), e.thread_id.to_string(), "thread.turn-diff-completed".to_string()),
            OrchestrationEvent::ThreadConversationRollbackRequested(e) => ("thread".to_string(), e.thread_id.to_string(), "thread.conversation-rollback-requested".to_string()),
            OrchestrationEvent::ThreadConversationRolledBack(e) => ("thread".to_string(), e.thread_id.to_string(), "thread.conversation-rolled-back".to_string()),
            OrchestrationEvent::ThreadMessageEditResendRequested(e) => ("thread".to_string(), e.thread_id.to_string(), "thread.message-edit-resend-requested".to_string()),
            OrchestrationEvent::ThreadSessionStopRequested(e) => ("thread".to_string(), e.thread_id.to_string(), "thread.session-stop-requested".to_string()),
            OrchestrationEvent::ThreadSessionSet(e) => ("thread".to_string(), e.thread_id.to_string(), "thread.session-set".to_string()),
            OrchestrationEvent::ThreadProposedPlanUpserted(e) => ("thread".to_string(), e.thread_id.to_string(), "thread.proposed-plan-upserted".to_string()),
            OrchestrationEvent::ThreadActivityAppended(e) => ("thread".to_string(), e.thread_id.to_string(), "thread.activity-appended".to_string()),
        }
    }
}

impl EventStore for SqliteEventStore {
    fn append_event(&self, event: &OrchestrationEvent) -> PersistenceResult<Sequence> {
        let event_id = Uuid::new_v4().to_string();
        let (aggregate_kind, aggregate_id, event_type) = Self::extract_aggregate_info(event);
        let payload = serde_json::to_string(event)?;
        let occurred_at = event.occurred_at().to_rfc3339();
        let command_id = event.command_id();

        self.client.execute(
            "INSERT INTO orchestration_events (event_id, event_type, aggregate_kind, aggregate_id, payload, occurred_at, command_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            &[
                &event_id,
                &event_type,
                &aggregate_kind,
                &aggregate_id,
                &payload,
                &occurred_at,
                &command_id,
            ],
        )?;

        let sequence = self.client.last_insert_rowid()? as Sequence;
        Ok(sequence)
    }

    fn read_events(&self, from_sequence: Sequence, limit: usize) -> PersistenceResult<Vec<StoredEvent>> {
        let rows = self.client.query_map(
            "SELECT sequence, event_id, event_type, aggregate_kind, aggregate_id, payload, occurred_at, command_id, metadata
             FROM orchestration_events
             WHERE sequence > ?1
             ORDER BY sequence ASC
             LIMIT ?2",
            &[&from_sequence, &(limit as i64)],
            |row| {
                Ok(StoredEvent {
                    sequence: row.get(0)?,
                    event_id: row.get(1)?,
                    event_type: row.get(2)?,
                    aggregate_kind: row.get(3)?,
                    aggregate_id: row.get(4)?,
                    payload: row.get(5)?,
                    occurred_at: row.get(6)?,
                    command_id: row.get(7)?,
                    metadata: row.get(8)?,
                })
            },
        )?;

        Ok(rows)
    }

    fn get_latest_sequence(&self) -> PersistenceResult<Sequence> {
        let sequence: Sequence = self.client.query_row(
            "SELECT COALESCE(MAX(sequence), 0) FROM orchestration_events",
            &[],
            |row| row.get(0),
        )?;

        Ok(sequence)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::migrations::run_migrations;
    use remi_core::events::{ProjectCreatedEvent, OrchestrationEvent};
    use remi_core::models::ProjectId;
    use std::path::PathBuf;

    #[test]
    fn test_event_store() {
        let temp_dir = std::env::temp_dir().join("remi-test-event-store");
        let db_path = temp_dir.join("test.sqlite");
        
        let client = SqliteClient::new(&db_path).unwrap();
        run_migrations(&client).unwrap();
        
        let store = SqliteEventStore::new(client);

        // 创建测试事件
        let event = OrchestrationEvent::ProjectCreated(ProjectCreatedEvent {
            sequence: 0,
            occurred_at: Utc::now(),
            command_id: None,
            project_id: ProjectId::new_v4(),
            title: "Test Project".to_string(),
            workspace_root: "/tmp/test".to_string(),
        });

        // 追加事件
        let seq = store.append_event(&event).unwrap();
        assert_eq!(seq, 1);

        // 读取事件
        let events = store.read_events(0, 10).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].sequence, 1);

        // 获取最新序列号
        let latest = store.get_latest_sequence().unwrap();
        assert_eq!(latest, 1);

        // 清理
        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
