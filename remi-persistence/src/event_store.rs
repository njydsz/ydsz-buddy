//! 事件存储模块
//!
//! 本模块实现了基于 SQLite 的事件存储系统，用于持久化领域事件。
//! 事件存储是事件溯源（Event Sourcing）模式的核心组件，负责：
//! - 追加新事件到事件流
//! - 按序列号顺序读取事件
//! - 跟踪事件序列号（用于投影同步）
//!
//! # 设计说明
//!
//! 事件存储采用追加写入模式，所有事件按序列号（sequence）递增排序。
//! 每个事件包含聚合根信息（aggregate_kind + aggregate_id），便于按聚合查询事件。

use async_trait::async_trait;
use chrono::Utc;
use remi_core::events::OrchestrationEvent;
use remi_core::models::Sequence;
use uuid::Uuid;

use crate::error::{PersistenceError, PersistenceResult};
use crate::sqlite_client::SqliteClient;

/// 事件存储 trait
///
/// 定义了事件存储的核心接口，所有事件存储实现都必须实现此 trait。
/// 使用 `async_trait` 支持异步操作，并通过 `Send + Sync` 约束保证线程安全。
///
/// # 主要功能
///
/// - `append_event`: 追加事件到事件流
/// - `read_events`: 从指定序列号开始读取事件
/// - `get_latest_sequence`: 获取当前最新的序列号
#[async_trait]
pub trait EventStore: Send + Sync {
    /// 追加事件到事件存储
    ///
    /// 将新事件持久化到数据库，并返回分配的序列号。
    /// 序列号由数据库自动生成（自增主键），保证全局唯一且递增。
    ///
    /// # 参数
    ///
    /// * `event` - 要追加的编排事件引用
    ///
    /// # 返回值
    ///
    /// 成功时返回事件被分配的序列号（`Sequence`），失败时返回 `PersistenceError`
    fn append_event(&self, event: &OrchestrationEvent) -> PersistenceResult<Sequence>;

    /// 从指定序列号开始读取事件
    ///
    /// 按序列号升序读取事件，支持分页查询。
    /// 读取范围为 `(from_sequence, from_sequence + limit]`，即不包含 `from_sequence` 本身。
    ///
    /// # 参数
    ///
    /// * `from_sequence` - 起始序列号（不包含），从此序列号之后开始读取
    /// * `limit` - 最大返回事件数量
    ///
    /// # 返回值
    ///
    /// 成功时返回 `StoredEvent` 列表，按序列号升序排列。
    /// 如果没有更多事件，返回空列表。
    fn read_events(&self, from_sequence: Sequence, limit: usize) -> PersistenceResult<Vec<StoredEvent>>;

    /// 获取当前最新的序列号
    ///
    /// 返回事件存储中已分配的最大序列号。
    /// 如果事件存储为空，返回 0。
    ///
    /// # 返回值
    ///
    /// 当前最新的序列号，用于投影器跟踪已处理的事件位置
    fn get_latest_sequence(&self) -> PersistenceResult<Sequence>;
}

/// 存储的事件表示
///
/// 从数据库中读取的事件数据，包含事件的所有元数据和负载信息。
/// 此结构体是事件在数据库中的原始表示，尚未反序列化为具体的领域事件类型。
///
/// # 字段说明
///
/// - `sequence`: 事件的全局序列号，用于排序和同步
/// - `event_id`: 事件的唯一标识符（UUID）
/// - `event_type`: 事件类型名称，如 "project.created"
/// - `aggregate_kind`: 聚合根类型，如 "project" 或 "thread"
/// - `aggregate_id`: 聚合根的唯一标识符
/// - `payload`: 事件的 JSON 序列化负载
/// - `occurred_at`: 事件发生的时间戳（RFC3339 格式）
/// - `command_id`: 触发此事件的命令 ID（可选）
/// - `metadata`: 事件的额外元数据（可选）
#[derive(Debug, Clone)]
pub struct StoredEvent {
    /// 事件序列号，全局唯一且递增
    pub sequence: Sequence,
    /// 事件唯一标识符
    pub event_id: String,
    /// 事件类型名称
    pub event_type: String,
    /// 聚合根类型
    pub aggregate_kind: String,
    /// 聚合根 ID
    pub aggregate_id: String,
    /// 事件负载（JSON 格式）
    pub payload: String,
    /// 事件发生时间
    pub occurred_at: String,
    /// 触发命令 ID（可选）
    pub command_id: Option<String>,
    /// 事件元数据（可选）
    pub metadata: Option<String>,
}

/// SQLite 事件存储实现
///
/// 基于 SQLite 数据库的事件存储实现，提供事件的持久化和查询功能。
/// 内部使用 `SqliteClient` 进行数据库操作。
pub struct SqliteEventStore {
    /// SQLite 数据库客户端
    client: SqliteClient,
}

impl SqliteEventStore {
    /// 创建新的 SQLite 事件存储实例
    ///
    /// # 参数
    ///
    /// * `client` - 已初始化的 SQLite 客户端实例
    ///
    /// # 返回值
    ///
    /// 返回新创建的 `SqliteEventStore` 实例
    pub fn new(client: SqliteClient) -> Self {
        Self { client }
    }

    /// 从事件中提取聚合根信息
    ///
    /// 根据事件类型提取对应的聚合根类型、聚合根 ID 和事件类型名称。
    /// 这是事件存储的关键辅助方法，用于将领域事件映射到数据库存储格式。
    ///
    /// # 参数
    ///
    /// * `event` - 编排事件引用
    ///
    /// # 返回值
    ///
    /// 返回三元组 `(aggregate_kind, aggregate_id, event_type)`：
    /// - `aggregate_kind`: 聚合根类型（如 "project"、"thread"）
    /// - `aggregate_id`: 聚合根的唯一标识符
    /// - `event_type`: 事件类型名称（如 "project.created"、"thread.message-sent"）
    ///
    /// # 实现说明
    ///
    /// 使用模式匹配遍历所有事件变体，提取对应的聚合根信息。
    /// 事件类型名称采用 "聚合根.动作" 的命名约定，如 "project.created"。
    fn extract_aggregate_info(event: &OrchestrationEvent) -> (String, String, String) {
        match event {
            // 项目相关事件
            OrchestrationEvent::ProjectCreated(e) => ("project".to_string(), e.project_id.to_string(), "project.created".to_string()),
            OrchestrationEvent::ProjectMetaUpdated(e) => ("project".to_string(), e.project_id.to_string(), "project.meta-updated".to_string()),
            OrchestrationEvent::ProjectDeleted(e) => ("project".to_string(), e.project_id.to_string(), "project.deleted".to_string()),
            // 线程相关事件
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
    /// 追加事件到事件存储
    ///
    /// 实现步骤：
    /// 1. 生成唯一的事件 ID（UUID v4）
    /// 2. 提取聚合根信息（类型、ID、事件类型名称）
    /// 3. 将事件序列化为 JSON 格式
    /// 4. 插入数据库，由数据库自动生成序列号
    /// 5. 获取并返回最后插入的序列号
    fn append_event(&self, event: &OrchestrationEvent) -> PersistenceResult<Sequence> {
        // 生成唯一的事件标识符
        let event_id = Uuid::new_v4().to_string();
        // 提取聚合根信息和事件类型
        let (aggregate_kind, aggregate_id, event_type) = Self::extract_aggregate_info(event);
        // 将事件序列化为 JSON 字符串
        let payload = serde_json::to_string(event)?;
        // 获取事件发生时间并转换为 RFC3339 格式
        let occurred_at = event.occurred_at().to_rfc3339();
        // 获取触发此事件的命令 ID（如果有）
        let command_id = event.command_id();

        // 执行插入操作
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

        // 获取数据库自动生成的序列号
        let sequence = self.client.last_insert_rowid()? as Sequence;
        Ok(sequence)
    }

    /// 从指定序列号开始读取事件
    ///
    /// 实现步骤：
    /// 1. 构建查询语句，筛选序列号大于 `from_sequence` 的事件
    /// 2. 按序列号升序排序
    /// 3. 限制返回数量为 `limit`
    /// 4. 将每行数据映射为 `StoredEvent` 结构体
    fn read_events(&self, from_sequence: Sequence, limit: usize) -> PersistenceResult<Vec<StoredEvent>> {
        let rows = self.client.query_map(
            "SELECT sequence, event_id, event_type, aggregate_kind, aggregate_id, payload, occurred_at, command_id, metadata
             FROM orchestration_events
             WHERE sequence > ?1
             ORDER BY sequence ASC
             LIMIT ?2",
            &[&from_sequence, &(limit as i64)],
            |row| {
                // 将数据库行映射为 StoredEvent 结构体
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

    /// 获取当前最新的序列号
    ///
    /// 使用 `MAX(sequence)` 查询最大序列号，如果表为空则返回 0。
    /// `COALESCE` 函数确保即使没有数据也返回 0 而非 NULL。
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
