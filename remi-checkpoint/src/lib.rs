//! Remi Code 检查点系统。
//!
//! 大厂标准要求：每个 turn 完成后自动拍摄"工作树快照" + "消息快照"，
//! 允许用户在任意时间点回滚。
//!
//! # 数据流
//!
//! ```text
//! TurnCompleted 事件
//!        ↓
//! CheckpointReactor (mem receipt)
//!        ↓
//! CheckpointService.take()
//!        ↓
//! 1. git worktree add（保存工作树状态）
//! 2. 截取消息快照
//! 3. 计算 diff（与上一检查点比较）
//! 4. 持久化到 checkpoint_diff_blobs
//!        ↓
//! 发出 Receipt::CheckpointCompleted
//! ```
//!
//! # 模块
//!
//! - [`git_snapshot`] — git worktree 快照管理
//! - [`diff_blob`] — diff blob 存储与查询
//! - [`service`] — 高层 CheckpointService

pub mod diff_blob;
pub mod git_snapshot;
pub mod service;

pub use diff_blob::{CheckpointDiffBlob, CheckpointDiffQuery, DiffBlobStore};
pub use git_snapshot::{GitSnapshot, GitSnapshotManager, SnapshotMetadata};
pub use service::{Checkpoint, CheckpointService, CheckpointSummary};

use remi_contracts::ThreadId;
use remi_core::{Error, Result};
use remi_persistence::Database;
use std::sync::Arc;
use tracing::info;
use uuid::Uuid;

/// 检查点存储后端（trait）—— 允许在不同存储（SQLite / S3 / disk）间切换。
#[async_trait::async_trait]
pub trait CheckpointStore: Send + Sync {
    /// 保存 diff blob。
    async fn save_diff(
        &self,
        thread_id: ThreadId,
        from_turn: u32,
        to_turn: u32,
        diff: &str,
    ) -> Result<()>;
    /// 查询会话内任意 turn 范围对应的 diff。
    async fn get_diff(
        &self,
        thread_id: ThreadId,
        from_turn: u32,
        to_turn: u32,
    ) -> Result<Option<String>>;
    /// 列出某会话的所有 diff blob（按 turn 排序）。
    async fn list_diffs(&self, thread_id: ThreadId) -> Result<Vec<CheckpointDiffBlob>>;
}

/// 默认基于 SQLite 的检查点存储实现（直接复用 migration_003）。
pub struct SqliteCheckpointStore {
    db: Arc<Database>,
}

impl SqliteCheckpointStore {
    /// 创建一个新的 SQLite 检查点存储。
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }
}

#[async_trait::async_trait]
impl CheckpointStore for SqliteCheckpointStore {
    async fn save_diff(
        &self,
        thread_id: ThreadId,
        from_turn: u32,
        to_turn: u32,
        diff: &str,
    ) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO checkpoint_diff_blobs (thread_id, from_turn_count, to_turn_count, diff, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(thread_id, from_turn_count, to_turn_count) DO UPDATE SET
                diff = excluded.diff,
                created_at = excluded.created_at
            "#,
        )
        .bind(thread_id.to_string())
        .bind(from_turn as i64)
        .bind(to_turn as i64)
        .bind(diff)
        .bind(chrono::Utc::now().to_rfc3339())
        .execute(self.db.pool())
        .await
        .map_err(|e| Error::Database(format!("保存 checkpoint diff 失败: {e}")))?;
        info!(thread_id = %thread_id, from_turn, to_turn, "检查点 diff 已保存");
        Ok(())
    }

    async fn get_diff(
        &self,
        thread_id: ThreadId,
        from_turn: u32,
        to_turn: u32,
    ) -> Result<Option<String>> {
        let row: Option<(String,)> = sqlx::query_as(
            r#"
            SELECT diff FROM checkpoint_diff_blobs
            WHERE thread_id = ? AND from_turn_count = ? AND to_turn_count = ?
            "#,
        )
        .bind(thread_id.to_string())
        .bind(from_turn as i64)
        .bind(to_turn as i64)
        .fetch_optional(self.db.pool())
        .await
        .map_err(|e| Error::Database(format!("查询 checkpoint diff 失败: {e}")))?;
        Ok(row.map(|(d,)| d))
    }

    async fn list_diffs(&self, thread_id: ThreadId) -> Result<Vec<CheckpointDiffBlob>> {
        let rows: Vec<(i64, i64, String, String)> = sqlx::query_as(
            r#"
            SELECT from_turn_count, to_turn_count, diff, created_at
            FROM checkpoint_diff_blobs
            WHERE thread_id = ?
            ORDER BY to_turn_count ASC
            "#,
        )
        .bind(thread_id.to_string())
        .fetch_all(self.db.pool())
        .await
        .map_err(|e| Error::Database(format!("列出 checkpoint diff 失败: {e}")))?;

        Ok(rows
            .into_iter()
            .map(|(f, t, d, c)| CheckpointDiffBlob {
                thread_id,
                from_turn_count: f as u32,
                to_turn_count: t as u32,
                diff: d,
                created_at: c,
            })
            .collect())
    }
}

/// 创建一个默认的 CheckpointStore。
pub fn default_store(db: Arc<Database>) -> Arc<dyn CheckpointStore> {
    Arc::new(SqliteCheckpointStore::new(db))
}

/// 检查点 ID 命名空间 —— 避免与 thread/turn 的 UUID 冲突。
pub fn make_checkpoint_id(thread_id: ThreadId, turn_count: u32) -> String {
    format!("{}-{}", thread_id, turn_count)
}

/// 从 checkpoint ID 解析 turn count。
pub fn parse_checkpoint_turn(id: &str) -> Option<u32> {
    id.rsplit('-').next()?.parse().ok()
}

/// 唯一标识一个检查点。
pub fn new_checkpoint_id() -> Uuid {
    Uuid::new_v4()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_make_checkpoint_id() {
        let tid = ThreadId::new();
        let id = make_checkpoint_id(tid, 5);
        assert!(id.ends_with("-5"));
    }

    #[test]
    fn test_parse_checkpoint_turn() {
        let tid = ThreadId::new();
        let id = make_checkpoint_id(tid, 7);
        assert_eq!(parse_checkpoint_turn(&id), Some(7));
    }
}
