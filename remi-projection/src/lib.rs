//! Remi Code 投影管道。
//!
//! 将 `OrchestrationEvent` 流物化到 SQLite 中的 `projection_*` 表，
//! 与内存 `ReadModel` 保持一致。
//!
//! 大厂标准要求：
//! - **单一真相来源**：事件流是唯一的事实，投影表是缓存
//! - **可重放**：从 sequence=0 重放可重建所有投影
//! - **可分阶段**：可以构建多个投影器（threads / messages / checkpoints / providers）
//! - **顺序保证**：单线程内严格按 sequence 顺序处理

use async_trait::async_trait;
use remi_contracts::{OrchestrationEvent, ThreadId};
use remi_core::{Error, Result};
use remi_orchestration::ReadModel;
use remi_persistence::Database;
use sqlx::SqlitePool;
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

/// 单个投影器必须实现的 trait。
///
/// 每个投影器负责将事件物化到自己的 SQL 表或外部存储。
#[async_trait]
pub trait Projector: Send + Sync {
    /// 投影器名称（用于日志）。
    fn name(&self) -> &'static str;

    /// 对单个事件执行投影。
    async fn project(&self, event: &OrchestrationEvent, pool: &SqlitePool) -> Result<()>;

    /// 全量重建（从 sequence=0 重放所有事件）。
    async fn rebuild(&self, events: &[OrchestrationEvent], pool: &SqlitePool) -> Result<()> {
        // 默认实现：清空表 + 逐个 project
        self.truncate(pool).await?;
        for event in events {
            self.project(event, pool).await?;
        }
        Ok(())
    }

    /// 清空该投影器拥有的表。
    async fn truncate(&self, pool: &SqlitePool) -> Result<()>;
}

// ---------------------------------------------------------------------------
// 投影器：线程表（projection_threads）
// ---------------------------------------------------------------------------

/// 将 `ThreadCreated` / `ThreadRenamed` / `ThreadStateChanged` / `ThreadDeleted`
/// 物化到 `projection_threads` 表。
pub struct ThreadProjector;

#[async_trait]
impl Projector for ThreadProjector {
    fn name(&self) -> &'static str {
        "threads"
    }

    async fn project(&self, event: &OrchestrationEvent, pool: &SqlitePool) -> Result<()> {
        match event {
            OrchestrationEvent::ThreadCreated { thread_id, project_id, timestamp } => {
                upsert_thread(pool, *thread_id, *project_id, None, "idle", timestamp).await
            }
            OrchestrationEvent::ThreadRenamed { thread_id, title, timestamp } => {
                rename_thread(pool, *thread_id, title, timestamp).await
            }
            OrchestrationEvent::ThreadStateChanged { thread_id, to, timestamp } => {
                update_thread_state(pool, *thread_id, to, timestamp).await
            }
            OrchestrationEvent::ThreadDeleted { thread_id, .. } => {
                delete_thread(pool, *thread_id).await
            }
            _ => Ok(()),
        }
    }

    async fn rebuild(&self, events: &[OrchestrationEvent], pool: &SqlitePool) -> Result<()> {
        self.truncate(pool).await?;
        for event in events {
            self.project(event, pool).await?;
        }
        Ok(())
    }

    async fn truncate(&self, pool: &SqlitePool) -> Result<()> {
        sqlx::query("DELETE FROM projection_threads")
            .execute(pool)
            .await
            .map_err(|e| Error::Database(format!("清空 projection_threads 失败: {e}")))?;
        Ok(())
    }
}

async fn upsert_thread(
    pool: &SqlitePool,
    thread_id: ThreadId,
    project_id: Uuid,
    title: Option<&str>,
    state: &str,
    timestamp: &str,
) -> Result<()> {
    sqlx::query(
        r#"
        INSERT INTO projection_threads (thread_id, project_id, title, state, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(thread_id) DO UPDATE SET
            title = COALESCE(excluded.title, projection_threads.title),
            state = excluded.state,
            updated_at = excluded.updated_at
        "#,
    )
    .bind(thread_id.to_string())
    .bind(project_id.to_string())
    .bind(title)
    .bind(state)
    .bind(timestamp)
    .bind(timestamp)
    .execute(pool)
    .await
    .map_err(|e| Error::Database(format!("upsert_thread 失败: {e}")))?;
    Ok(())
}

async fn rename_thread(
    pool: &SqlitePool,
    thread_id: ThreadId,
    title: &str,
    timestamp: &str,
) -> Result<()> {
    sqlx::query(
        r#"
        UPDATE projection_threads
        SET title = ?, updated_at = ?
        WHERE thread_id = ?
        "#,
    )
    .bind(title)
    .bind(timestamp)
    .bind(thread_id.to_string())
    .execute(pool)
    .await
    .map_err(|e| Error::Database(format!("rename_thread 失败: {e}")))?;
    Ok(())
}

async fn update_thread_state(
    pool: &SqlitePool,
    thread_id: ThreadId,
    state: &remi_contracts::ThreadState,
    timestamp: &str,
) -> Result<()> {
    sqlx::query(
        r#"
        UPDATE projection_threads
        SET state = ?, updated_at = ?
        WHERE thread_id = ?
        "#,
    )
    .bind(state.to_string())
    .bind(timestamp)
    .bind(thread_id.to_string())
    .execute(pool)
    .await
    .map_err(|e| Error::Database(format!("update_thread_state 失败: {e}")))?;
    Ok(())
}

async fn delete_thread(pool: &SqlitePool, thread_id: ThreadId) -> Result<()> {
    sqlx::query("DELETE FROM projection_threads WHERE thread_id = ?")
        .bind(thread_id.to_string())
        .execute(pool)
        .await
        .map_err(|e| Error::Database(format!("delete_thread 失败: {e}")))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// 投影器：消息表（projection_thread_messages）
// ---------------------------------------------------------------------------

/// 将 `MessageAdded` / `MessageUpdated` 物化到 `projection_thread_messages` 表。
pub struct MessageProjector;

#[async_trait]
impl Projector for MessageProjector {
    fn name(&self) -> &'static str {
        "messages"
    }

    async fn project(&self, event: &OrchestrationEvent, pool: &SqlitePool) -> Result<()> {
        match event {
            OrchestrationEvent::MessageAdded { message_id, thread_id, role, timestamp } => {
                let role_str = match role {
                    remi_contracts::MessageRole::User => "user",
                    remi_contracts::MessageRole::Assistant => "assistant",
                    remi_contracts::MessageRole::System => "system",
                };
                sqlx::query(
                    r#"
                    INSERT INTO projection_thread_messages (message_id, thread_id, role, content, created_at)
                    VALUES (?, ?, ?, '', ?)
                    ON CONFLICT(message_id) DO NOTHING
                    "#,
                )
                .bind(message_id.to_string())
                .bind(thread_id.to_string())
                .bind(role_str)
                .bind(timestamp)
                .execute(pool)
                .await
                .map_err(|e| Error::Database(format!("插入消息失败: {e}")))?;
                Ok(())
            }
            OrchestrationEvent::MessageUpdated { message_id, content, .. } => {
                sqlx::query(
                    r#"
                    UPDATE projection_thread_messages
                    SET content = content || ?
                    WHERE message_id = ?
                    "#,
                )
                .bind(content)
                .bind(message_id.to_string())
                .execute(pool)
                .await
                .map_err(|e| Error::Database(format!("追加消息内容失败: {e}")))?;
                Ok(())
            }
            OrchestrationEvent::ThreadDeleted { thread_id, .. } => {
                sqlx::query("DELETE FROM projection_thread_messages WHERE thread_id = ?")
                    .bind(thread_id.to_string())
                    .execute(pool)
                    .await
                    .map_err(|e| Error::Database(format!("删除会话消息失败: {e}")))?;
                Ok(())
            }
            _ => Ok(()),
        }
    }

    async fn rebuild(&self, events: &[OrchestrationEvent], pool: &SqlitePool) -> Result<()> {
        self.truncate(pool).await?;
        for event in events {
            self.project(event, pool).await?;
        }
        Ok(())
    }

    async fn truncate(&self, pool: &SqlitePool) -> Result<()> {
        sqlx::query("DELETE FROM projection_thread_messages")
            .execute(pool)
            .await
            .map_err(|e| Error::Database(format!("清空 projection_thread_messages 失败: {e}")))?;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// 投影器：检查点表（projection_checkpoints）
// ---------------------------------------------------------------------------

/// 将 `CheckpointCreated` / `CheckpointRestored` 物化到 `projection_checkpoints` 表。
pub struct CheckpointProjector;

#[async_trait]
impl Projector for CheckpointProjector {
    fn name(&self) -> &'static str {
        "checkpoints"
    }

    async fn project(&self, event: &OrchestrationEvent, pool: &SqlitePool) -> Result<()> {
        match event {
            OrchestrationEvent::CheckpointCreated { checkpoint_id, thread_id, turn_id, timestamp } => {
                sqlx::query(
                    r#"
                    INSERT INTO projection_checkpoints (checkpoint_id, thread_id, turn_id, created_at, restored_at)
                    VALUES (?, ?, ?, ?, NULL)
                    ON CONFLICT(checkpoint_id) DO NOTHING
                    "#,
                )
                .bind(checkpoint_id)
                .bind(thread_id.to_string())
                .bind(turn_id.to_string())
                .bind(timestamp)
                .execute(pool)
                .await
                .map_err(|e| Error::Database(format!("插入检查点失败: {e}")))?;
                Ok(())
            }
            OrchestrationEvent::CheckpointRestored { checkpoint_id, timestamp, .. } => {
                sqlx::query(
                    r#"
                    UPDATE projection_checkpoints
                    SET restored_at = ?
                    WHERE checkpoint_id = ?
                    "#,
                )
                .bind(timestamp)
                .bind(checkpoint_id)
                .execute(pool)
                .await
                .map_err(|e| Error::Database(format!("标记检查点恢复失败: {e}")))?;
                Ok(())
            }
            _ => Ok(()),
        }
    }

    async fn rebuild(&self, events: &[OrchestrationEvent], pool: &SqlitePool) -> Result<()> {
        self.truncate(pool).await?;
        for event in events {
            self.project(event, pool).await?;
        }
        Ok(())
    }

    async fn truncate(&self, pool: &SqlitePool) -> Result<()> {
        sqlx::query("DELETE FROM projection_checkpoints")
            .execute(pool)
            .await
            .map_err(|e| Error::Database(format!("清空 projection_checkpoints 失败: {e}")))?;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// 投影器：审批表（projection_pending_approvals）
// ---------------------------------------------------------------------------

/// 将 `ApprovalRequested` / `ApprovalDecided` 物化到 `projection_pending_approvals` 表。
pub struct ApprovalProjector;

#[async_trait]
impl Projector for ApprovalProjector {
    fn name(&self) -> &'static str {
        "approvals"
    }

    async fn project(&self, event: &OrchestrationEvent, pool: &SqlitePool) -> Result<()> {
        match event {
            OrchestrationEvent::ApprovalRequested { request_id, thread_id, reason, timestamp } => {
                sqlx::query(
                    r#"
                    INSERT INTO projection_pending_approvals (request_id, thread_id, reason, requested_at, decided_at)
                    VALUES (?, ?, ?, ?, NULL)
                    ON CONFLICT(request_id) DO UPDATE SET
                        reason = excluded.reason,
                        requested_at = excluded.requested_at,
                        decided_at = NULL
                    "#,
                )
                .bind(request_id.to_string())
                .bind(thread_id.to_string())
                .bind(reason)
                .bind(timestamp)
                .execute(pool)
                .await
                .map_err(|e| Error::Database(format!("插入审批请求失败: {e}")))?;
                Ok(())
            }
            OrchestrationEvent::ApprovalDecided { request_id, timestamp, .. } => {
                sqlx::query(
                    r#"
                    UPDATE projection_pending_approvals
                    SET decided_at = ?
                    WHERE request_id = ?
                    "#,
                )
                .bind(timestamp)
                .bind(request_id.to_string())
                .execute(pool)
                .await
                .map_err(|e| Error::Database(format!("标记审批决定失败: {e}")))?;
                Ok(())
            }
            _ => Ok(()),
        }
    }

    async fn rebuild(&self, events: &[OrchestrationEvent], pool: &SqlitePool) -> Result<()> {
        self.truncate(pool).await?;
        for event in events {
            self.project(event, pool).await?;
        }
        Ok(())
    }

    async fn truncate(&self, pool: &SqlitePool) -> Result<()> {
        sqlx::query("DELETE FROM projection_pending_approvals")
            .execute(pool)
            .await
            .map_err(|e| Error::Database(format!("清空 projection_pending_approvals 失败: {e}")))?;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// 投影管道（ProjectionPipeline）
// ---------------------------------------------------------------------------

/// 投影管道：注册多个投影器并异步处理事件流。
pub struct ProjectionPipeline {
    db: Arc<Database>,
    projectors: Vec<Arc<dyn Projector>>,
    rx: Arc<tokio::sync::Mutex<mpsc::Receiver<OrchestrationEvent>>>,
    tx: mpsc::Sender<OrchestrationEvent>,
    handle: Arc<tokio::sync::Mutex<Option<tokio::task::JoinHandle<()>>>>,
    last_sequence: Arc<tokio::sync::Mutex<i64>>,
    in_memory_model: Arc<tokio::sync::RwLock<ReadModel>>,
}

impl ProjectionPipeline {
    /// 创建一个新的投影管道。
    pub fn new(db: Arc<Database>, in_memory_model: Arc<tokio::sync::RwLock<ReadModel>>) -> Self {
        let (tx, rx) = mpsc::channel(1024);
        Self {
            db,
            projectors: Vec::new(),
            rx: Arc::new(tokio::sync::Mutex::new(rx)),
            tx,
            handle: Arc::new(tokio::sync::Mutex::new(None)),
            last_sequence: Arc::new(tokio::sync::Mutex::new(0)),
            in_memory_model,
        }
    }

    /// 注册一个投影器。
    pub fn register(&mut self, projector: Arc<dyn Projector>) {
        self.projectors.push(projector);
    }

    /// 提交一个事件到投影管道。
    pub async fn submit(&self, event: OrchestrationEvent) -> Result<()> {
        self.tx
            .send(event)
            .await
            .map_err(|e| Error::Internal(format!("提交事件到投影管道失败: {e}")))?;
        Ok(())
    }

    /// 启动后台消费循环。
    pub async fn start(&self) {
        let rx = self.rx.clone();
        let projectors = self.projectors.clone();
        let db = self.db.clone();
        let model = self.in_memory_model.clone();
        let last_seq = self.last_sequence.clone();

        let handle = tokio::spawn(async move {
            let mut rx_guard = rx.lock().await;
            info!("投影管道已启动");
            while let Some(event) = rx_guard.recv().await {
                let pool = db.pool();
                for projector in &projectors {
                    if let Err(e) = projector.project(&event, pool).await {
                        error!(
                            projector = projector.name(),
                            error = %e,
                            "投影失败"
                        );
                    }
                }
                // 同步到内存读模型
                let mut m = model.write().await;
                m.apply(&event);
                drop(m);

                // 推进 sequence
                let mut seq = last_seq.lock().await;
                *seq += 1;
                debug!(sequence = *seq, "事件已投影");
            }
            warn!("投影管道已停止");
        });

        let mut guard = self.handle.lock().await;
        *guard = Some(handle);
    }

    /// 停止后台消费循环。
    pub async fn stop(&self) {
        let mut guard = self.handle.lock().await;
        if let Some(handle) = guard.take() {
            handle.abort();
        }
    }

    /// 重建所有投影（从事件存储重放）。
    pub async fn rebuild_all(&self, events: &[OrchestrationEvent]) -> Result<()> {
        info!(event_count = events.len(), "正在全量重建投影");
        let pool = self.db.pool();
        for projector in &self.projectors {
            projector.rebuild(events, pool).await?;
        }
        // 重置内存读模型
        let mut model = self.in_memory_model.write().await;
        *model = ReadModel::default();
        model.apply_all(events);
        // 重置 sequence
        let mut seq = self.last_sequence.lock().await;
        *seq = events.len() as i64;
        Ok(())
    }

    /// 已注册的投影器数量。
    pub fn projector_count(&self) -> usize {
        self.projectors.len()
    }

    /// 当前已处理的 sequence。
    pub async fn last_sequence(&self) -> i64 {
        *self.last_sequence.lock().await
    }
}

/// 创建一个默认的投影管道，注册全部 4 个标准投影器。
pub fn default_pipeline(
    db: Arc<Database>,
    in_memory_model: Arc<tokio::sync::RwLock<ReadModel>>,
) -> ProjectionPipeline {
    let mut pipeline = ProjectionPipeline::new(db, in_memory_model);
    pipeline.register(Arc::new(ThreadProjector));
    pipeline.register(Arc::new(MessageProjector));
    pipeline.register(Arc::new(CheckpointProjector));
    pipeline.register(Arc::new(ApprovalProjector));
    pipeline
}

/// 投影快照查询：从已投影的 SQLite 表中读取数据。
pub struct ProjectionSnapshotQuery {
    db: Arc<Database>,
}

impl ProjectionSnapshotQuery {
    /// 创建新的快照查询器。
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    /// 列出所有线程（从投影表）。
    pub async fn list_threads(&self) -> Result<Vec<ThreadSnapshot>> {
        let rows: Vec<(String, String, Option<String>, String, String, String)> = sqlx::query_as(
            r#"
            SELECT thread_id, project_id, title, state, created_at, updated_at
            FROM projection_threads
            ORDER BY updated_at DESC
            "#,
        )
        .fetch_all(self.db.pool())
        .await
        .map_err(|e| Error::Database(format!("查询线程投影失败: {e}")))?;

        Ok(rows
            .into_iter()
            .map(|(tid, pid, title, state, created_at, updated_at)| ThreadSnapshot {
                thread_id: tid,
                project_id: pid,
                title,
                state,
                created_at,
                updated_at,
            })
            .collect())
    }

    /// 列出某会话的消息（从投影表）。
    pub async fn list_messages(&self, thread_id: ThreadId) -> Result<Vec<MessageSnapshot>> {
        let rows: Vec<(String, String, String, String, String)> = sqlx::query_as(
            r#"
            SELECT message_id, thread_id, role, content, created_at
            FROM projection_thread_messages
            WHERE thread_id = ?
            ORDER BY created_at ASC, rowid ASC
            "#,
        )
        .bind(thread_id.to_string())
        .fetch_all(self.db.pool())
        .await
        .map_err(|e| Error::Database(format!("查询消息投影失败: {e}")))?;

        Ok(rows
            .into_iter()
            .map(|(mid, tid, role, content, created_at)| MessageSnapshot {
                message_id: mid,
                thread_id: tid,
                role,
                content,
                created_at,
            })
            .collect())
    }

    /// 列出待审批请求。
    pub async fn list_pending_approvals(&self) -> Result<Vec<ApprovalSnapshot>> {
        let rows: Vec<(String, String, String, String, Option<String>)> = sqlx::query_as(
            r#"
            SELECT request_id, thread_id, reason, requested_at, decided_at
            FROM projection_pending_approvals
            WHERE decided_at IS NULL
            ORDER BY requested_at ASC
            "#,
        )
        .fetch_all(self.db.pool())
        .await
        .map_err(|e| Error::Database(format!("查询审批投影失败: {e}")))?;

        Ok(rows
            .into_iter()
            .map(|(rid, tid, reason, requested_at, decided_at)| ApprovalSnapshot {
                request_id: rid,
                thread_id: tid,
                reason,
                requested_at,
                decided_at,
            })
            .collect())
    }

    /// 列出某会话的检查点。
    pub async fn list_checkpoints(&self, thread_id: ThreadId) -> Result<Vec<CheckpointSnapshot>> {
        let rows: Vec<(String, String, String, String, Option<String>)> = sqlx::query_as(
            r#"
            SELECT checkpoint_id, thread_id, turn_id, created_at, restored_at
            FROM projection_checkpoints
            WHERE thread_id = ?
            ORDER BY created_at DESC
            "#,
        )
        .bind(thread_id.to_string())
        .fetch_all(self.db.pool())
        .await
        .map_err(|e| Error::Database(format!("查询检查点投影失败: {e}")))?;

        Ok(rows
            .into_iter()
            .map(|(cid, tid, turn_id, created_at, restored_at)| CheckpointSnapshot {
                checkpoint_id: cid,
                thread_id: tid,
                turn_id,
                created_at,
                restored_at,
            })
            .collect())
    }
}

/// 线程投影快照。
#[derive(Debug, Clone, serde::Serialize)]
pub struct ThreadSnapshot {
    pub thread_id: String,
    pub project_id: String,
    pub title: Option<String>,
    pub state: String,
    pub created_at: String,
    pub updated_at: String,
}

/// 消息投影快照。
#[derive(Debug, Clone, serde::Serialize)]
pub struct MessageSnapshot {
    pub message_id: String,
    pub thread_id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
}

/// 审批投影快照。
#[derive(Debug, Clone, serde::Serialize)]
pub struct ApprovalSnapshot {
    pub request_id: String,
    pub thread_id: String,
    pub reason: String,
    pub requested_at: String,
    pub decided_at: Option<String>,
}

/// 检查点投影快照。
#[derive(Debug, Clone, serde::Serialize)]
pub struct CheckpointSnapshot {
    pub checkpoint_id: String,
    pub thread_id: String,
    pub turn_id: String,
    pub created_at: String,
    pub restored_at: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_projector_trait_is_object_safe() {
        // 编译期测试：确保 Projector trait 是 object safe。
        fn _assert_object_safe(_p: Box<dyn Projector>) {}
    }
}
