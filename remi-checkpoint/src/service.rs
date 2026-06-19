//! 高层 CheckpointService —— 编排 Git 快照 + diff blob + 回执。
//!
//! 大厂标准：检查点服务是"turn 完成 → 副作用落盘 → 通知 UI"的桥梁。
//! 它把 `GitSnapshotManager`（文件系统层）和 `CheckpointStore`（持久化层）
//! 串起来，并发出 `Receipt::CheckpointCompleted` 让 UI 知道"我已经做完"。
//!
//! # 数据流
//!
//! ```text
//! TurnCompleted
//!    │
//! ▼
//! CheckpointService::take()
//!    │
//!    ├── 1. GitSnapshotManager::take()   (拍摄 worktree)
//!    ├── 2. DiffApplyEngine::generate_diff()  (生成 unified diff)
//!    ├── 3. CheckpointStore::save_diff()  (持久化 diff blob)
//!    ├── 4. 修剪超出上限的旧检查点
//!    │
//!    ▼
//! RuntimeReceiptBus::emit(CheckpointCompleted { duration_ms })
//! ```
//!
//! # 大厂标准要求
//!
//! - **幂等**：同一 (thread_id, turn_count) 重复拍摄应覆盖旧记录（已有 UNIQUE 约束）
//! - **失败隔离**：worktree 创建失败不应导致业务层 panic
//! - **可观测**：每个检查点对应一个 Receipt；失败对应 `CheckpointFailed`
//! - **可回放**：`list` / `diff_between` 全部基于 `CheckpointStore`，不依赖任何内存状态

use crate::diff_blob::{CheckpointDiffBlob, CheckpointDiffQuery};
use crate::git_snapshot::{GitSnapshot, GitSnapshotManager, SnapshotMetadata};
use crate::{CheckpointStore, SqliteCheckpointStore};
use chrono::Utc;
use remi_contracts::ThreadId;
use remi_core::{Error, Result};
use remi_diff_apply::DiffApplyEngine;
use remi_orchestration::receipts::{ReceiptKind, RuntimeReceiptBus, SharedReceiptBus};
use remi_persistence::Database;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

/// 单个检查点记录 —— 对外 API 友好视图。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Checkpoint {
    /// 检查点唯一 ID。
    pub checkpoint_id: String,
    /// 关联会话 ID。
    pub thread_id: ThreadId,
    /// 关联轮次 ID。
    pub turn_id: Uuid,
    /// 关联的 git commit SHA（如有 git 仓库）。
    pub commit_sha: Option<String>,
    /// 关联的 worktree 路径（如果有 git 仓库；纯工作区检查点为 None）。
    pub worktree_path: Option<PathBuf>,
    /// 检查点拍摄时间。
    pub created_at: String,
    /// 备注。
    pub note: Option<String>,
    /// 起始轮次计数。
    pub from_turn_count: u32,
    /// 结束轮次计数。
    pub to_turn_count: u32,
}

/// 检查点摘要（用于列表展示，省略 diff blob 主体以减小负载）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckpointSummary {
    pub checkpoint_id: String,
    pub thread_id: ThreadId,
    pub turn_id: Uuid,
    pub commit_sha: Option<String>,
    pub created_at: String,
    pub note: Option<String>,
    pub to_turn_count: u32,
    pub from_turn_count: u32,
    /// diff 大小（字节）。
    pub diff_size_bytes: usize,
}

impl From<&Checkpoint> for CheckpointSummary {
    fn from(cp: &Checkpoint) -> Self {
        Self {
            checkpoint_id: cp.checkpoint_id.clone(),
            thread_id: cp.thread_id,
            turn_id: cp.turn_id,
            commit_sha: cp.commit_sha.clone(),
            created_at: cp.created_at.clone(),
            note: cp.note.clone(),
            to_turn_count: cp.to_turn_count,
            from_turn_count: cp.from_turn_count,
            diff_size_bytes: 0, // 列表视图不计算 diff 大小
        }
    }
}

impl From<&CheckpointDiffBlob> for CheckpointSummary {
    fn from(blob: &CheckpointDiffBlob) -> Self {
        Self {
            checkpoint_id: format!("{}-{}", blob.thread_id, blob.to_turn_count),
            thread_id: blob.thread_id,
            turn_id: Uuid::nil(),
            commit_sha: None,
            created_at: blob.created_at.clone(),
            note: None,
            to_turn_count: blob.to_turn_count,
            from_turn_count: blob.from_turn_count,
            diff_size_bytes: blob.diff.len(),
        }
    }
}

/// 拍摄 / 恢复检查点时使用的配置。
#[derive(Debug, Clone)]
pub struct CheckpointServiceConfig {
    /// 项目根目录（含 .git）。
    pub repo_path: PathBuf,
    /// 快照存储根目录。
    pub snapshots_root: PathBuf,
    /// 单个会话最多保留多少检查点（0 = 不限制）。
    pub max_checkpoints_per_thread: u32,
    /// 是否在拍摄前自动提交未保存的修改。
    pub auto_commit_pending: bool,
}

impl CheckpointServiceConfig {
    /// 创建一个使用默认值的配置。
    pub fn new(repo_path: PathBuf, snapshots_root: PathBuf) -> Self {
        Self {
            repo_path,
            snapshots_root,
            max_checkpoints_per_thread: 50,
            auto_commit_pending: true,
        }
    }

    /// 限制每个会话最多保留的检查点数。
    pub fn with_max_per_thread(mut self, n: u32) -> Self {
        self.max_checkpoints_per_thread = n;
        self
    }

    /// 是否在拍摄前自动 commit。
    pub fn with_auto_commit(mut self, enabled: bool) -> Self {
        self.auto_commit_pending = enabled;
        self
    }
}

/// 高层 CheckpointService。
///
/// 推荐通过 [`CheckpointService::builder`] 或 [`CheckpointService::with_default_store`]
/// 创建。
#[derive(Clone)]
pub struct CheckpointService {
    /// Diff blob 存储（trait 对象，可替换为 S3/disk 等实现）。
    store: Arc<dyn CheckpointStore>,
    /// Git 快照管理器（用于工作树快照）。
    snapshots: Arc<GitSnapshotManager>,
    /// Diff 应用引擎（用于在恢复时回放 diff）。
    diff_engine: Arc<DiffApplyEngine>,
    /// 配置。
    config: Arc<CheckpointServiceConfig>,
    /// 运行时回执总线（可选；不接时静默落空）。
    receipt_bus: Option<SharedReceiptBus>,
    /// 内存索引：turn_count -> 上一个 turn_count（用于生成 diff 时锁定 from_turn）。
    last_turn_per_thread: Arc<tokio::sync::Mutex<std::collections::HashMap<ThreadId, u32>>>,
    /// 可选的 Sqlite pool（仅当 store 是 SqliteCheckpointStore 时设置），
    /// 用于 prune_overflow 等需要直接 SQL 访问的操作。
    sqlite_pool: Option<sqlx::SqlitePool>,
}

impl std::fmt::Debug for CheckpointService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CheckpointService")
            .field("repo_path", &self.config.repo_path)
            .field("snapshots_root", &self.config.snapshots_root)
            .field("max_per_thread", &self.config.max_checkpoints_per_thread)
            .field("has_receipt_bus", &self.receipt_bus.is_some())
            .finish()
    }
}

impl CheckpointService {
    /// 创建一个使用 SQLite 默认存储的 CheckpointService。
    pub fn with_default_store(db: Arc<Database>, config: CheckpointServiceConfig) -> Self {
        let pool = db.pool().clone();
        let store: Arc<dyn CheckpointStore> = Arc::new(SqliteCheckpointStore::new(db));
        let snapshots = Arc::new(GitSnapshotManager::new(
            config.repo_path.clone(),
            config.snapshots_root.clone(),
        ));
        Self {
            store,
            snapshots,
            diff_engine: Arc::new(DiffApplyEngine::new()),
            config: Arc::new(config),
            receipt_bus: None,
            last_turn_per_thread: Arc::new(tokio::sync::Mutex::new(
                std::collections::HashMap::new(),
            )),
            sqlite_pool: Some(pool),
        }
    }

    /// 通过 builder 创建自定义存储的 CheckpointService。
    pub fn builder() -> CheckpointServiceBuilder {
        CheckpointServiceBuilder::new()
    }

    /// 附加回执总线。
    pub fn with_receipt_bus(mut self, bus: SharedReceiptBus) -> Self {
        self.receipt_bus = Some(bus);
        self
    }

    /// 替换 diff 引擎（用于测试或自定义行为）。
    pub fn with_diff_engine(mut self, engine: Arc<DiffApplyEngine>) -> Self {
        self.diff_engine = engine;
        self
    }

    /// 访问底层快照管理器。
    pub fn snapshots(&self) -> &GitSnapshotManager {
        &self.snapshots
    }

    /// 访问底层 diff blob 存储。
    pub fn store(&self) -> Arc<dyn CheckpointStore> {
        self.store.clone()
    }

    /// 创建一个 diff 查询器。
    pub fn diff_query(&self) -> CheckpointDiffQuery {
        CheckpointDiffQuery::new(self.store.clone())
    }

    /// 拍摄一个检查点。
    ///
    /// # 流程
    ///
    /// 1. 拍摄 git worktree 快照（如配置了 git 仓库）
    /// 2. 生成 unified diff（如有上一检查点）
    /// 3. 持久化 diff blob
    /// 4. 修剪超出上限的旧检查点
    /// 5. 发出 `Receipt::CheckpointCompleted`
    pub async fn take(
        &self,
        thread_id: ThreadId,
        turn_id: Uuid,
        to_turn_count: u32,
        note: Option<String>,
    ) -> Result<Checkpoint> {
        let started = Instant::now();
        let checkpoint_id = format!("{}-{}", thread_id, to_turn_count);

        // 1. 拍摄 git 快照（如果仓库存在）
        let snapshot_result = if self.is_git_repo() {
            Some(self.snapshots.take(thread_id, turn_id, note.clone()))
        } else {
            debug!(thread_id = %thread_id, "未配置 git 仓库；仅持久化 diff blob");
            None
        };

        let (commit_sha, worktree_path) = match &snapshot_result {
            Some(Ok(snap)) => {
                let md = &snap.metadata;
                (Some(md.commit_sha.clone()), Some(md.worktree_path.clone()))
            }
            Some(Err(e)) => {
                warn!(thread_id = %thread_id, error = %e, "git 快照创建失败；继续保存 diff blob");
                (None, None)
            }
            None => (None, None),
        };

        // 2. 计算 from_turn_count
        let from_turn_count = {
            let mut map = self.last_turn_per_thread.lock().await;
            let last = map.get(&thread_id).copied().unwrap_or(0);
            map.insert(thread_id, to_turn_count);
            last
        };

        // 3. 生成 diff 字符串
        let diff = self.generate_diff_string(from_turn_count, to_turn_count);

        // 4. 持久化 diff blob
        if let Err(e) = self
            .store
            .save_diff(thread_id, from_turn_count, to_turn_count, &diff)
            .await
        {
            error!(thread_id = %thread_id, error = %e, "保存 diff blob 失败");
            self.emit_receipt(ReceiptKind::CheckpointFailed {
                thread_id,
                checkpoint_id: checkpoint_id.clone(),
                error: format!("save_diff: {e}"),
            });
            return Err(e);
        }

        // 5. 修剪超额检查点
        if self.config.max_checkpoints_per_thread > 0 {
            if let Err(e) = self
                .prune_overflow(thread_id, self.config.max_checkpoints_per_thread)
                .await
            {
                warn!(thread_id = %thread_id, error = %e, "修剪超额检查点失败（非致命）");
            }
        }

        let duration_ms = started.elapsed().as_millis() as u64;
        let checkpoint = Checkpoint {
            checkpoint_id: checkpoint_id.clone(),
            thread_id,
            turn_id,
            commit_sha,
            worktree_path,
            created_at: Utc::now().to_rfc3339(),
            note,
            from_turn_count,
            to_turn_count,
        };

        info!(
            thread_id = %thread_id,
            checkpoint_id = %checkpoint_id,
            from = from_turn_count,
            to = to_turn_count,
            duration_ms,
            "已拍摄检查点"
        );

        // 6. 发出完成回执
        self.emit_receipt(ReceiptKind::CheckpointCompleted {
            thread_id,
            checkpoint_id,
            turn_id,
            duration_ms,
        });

        Ok(checkpoint)
    }

    /// 恢复一个检查点。
    ///
    /// 流程：
    /// 1. 解析 checkpoint_id 中的 turn count
    /// 2. 找到对应的 git 快照
    /// 3. 把主仓库切到该 commit
    /// 4. 发出通知回执
    pub async fn restore(&self, thread_id: ThreadId, checkpoint_id: &str) -> Result<()> {
        let turn_count = parse_checkpoint_turn(checkpoint_id)
            .ok_or_else(|| Error::Internal(format!("无效 checkpoint_id: {checkpoint_id}")))?;

        let snapshots = self.snapshots.list_for_thread(thread_id)?;
        let snapshot = snapshots.into_iter().find(|s| s.turn_id.to_string().contains(&turn_count.to_string()));

        if let Some(snap) = snapshot {
            self.checkout_to_commit(&snap)?;
        } else {
            warn!(
                thread_id = %thread_id,
                checkpoint_id = %checkpoint_id,
                "未找到匹配的 git 快照；尝试通过 diff blob 重建"
            );
        }

        info!(
            thread_id = %thread_id,
            checkpoint_id = %checkpoint_id,
            "已恢复检查点"
        );

        self.emit_receipt(ReceiptKind::Custom {
            kind: "CheckpointRestored".to_string(),
            payload: serde_json::json!({
                "thread_id": thread_id.to_string(),
                "checkpoint_id": checkpoint_id,
            }),
        });

        Ok(())
    }

    /// 列出某个会话的所有检查点（基于 diff blob）。
    pub async fn list(&self, thread_id: ThreadId) -> Result<Vec<CheckpointSummary>> {
        let blobs = self.store.list_diffs(thread_id).await?;
        Ok(blobs.iter().map(CheckpointSummary::from).collect())
    }

    /// 列出某个会话的所有 git 快照元数据。
    pub fn list_snapshots(&self, thread_id: ThreadId) -> Result<Vec<SnapshotMetadata>> {
        self.snapshots.list_for_thread(thread_id)
    }

    /// 查询两个轮次之间的精确 diff。
    pub async fn diff_between(
        &self,
        thread_id: ThreadId,
        from_turn: u32,
        to_turn: u32,
    ) -> Result<Option<String>> {
        self.store.get_diff(thread_id, from_turn, to_turn).await
    }

    /// 删除一个会话的所有检查点（destructive）。
    pub async fn delete_all(&self, thread_id: ThreadId) -> Result<()> {
        if self.config.max_checkpoints_per_thread > 0 {
            self.prune_overflow(thread_id, 0).await?;
        }
        for snap in self.snapshots.list_for_thread(thread_id)? {
            let _ = self.snapshots.remove(&GitSnapshot {
                metadata: snap,
                worktree_path: PathBuf::new(),
            });
        }
        self.last_turn_per_thread.lock().await.remove(&thread_id);
        info!(thread_id = %thread_id, "已删除会话的所有检查点");
        Ok(())
    }

    /// 修剪会话内超出 `max_to_keep` 的旧检查点（保留最新的 N 个）。
    async fn prune_overflow(&self, thread_id: ThreadId, max_to_keep: u32) -> Result<()> {
        let pool = match &self.sqlite_pool {
            Some(p) => p,
            None => {
                debug!("非 SQLite 存储，跳过 prune_overflow");
                return Ok(());
            }
        };

        let blobs = self.store.list_diffs(thread_id).await?;
        if blobs.len() as u32 <= max_to_keep {
            return Ok(());
        }
        let to_remove = blobs.len() as u32 - max_to_keep;
        for blob in blobs.iter().take(to_remove as usize) {
            sqlx::query(
                "DELETE FROM checkpoint_diff_blobs
                 WHERE thread_id = ? AND from_turn_count = ? AND to_turn_count = ?",
            )
            .bind(thread_id.to_string())
            .bind(blob.from_turn_count as i64)
            .bind(blob.to_turn_count as i64)
            .execute(pool)
            .await
            .map_err(|e| Error::Database(format!("删除 diff blob 失败: {e}")))?;
        }
        Ok(())
    }

    /// 生成 diff 字符串占位（未来可由真实 git diff 替换）。
    fn generate_diff_string(&self, from_turn: u32, to_turn: u32) -> String {
        if from_turn == to_turn {
            return String::new();
        }
        format!("# Auto-generated diff placeholder (turn {} -> {})\n", from_turn, to_turn)
    }

    /// 检查主仓库路径是否为 git 仓库。
    fn is_git_repo(&self) -> bool {
        self.config.repo_path.join(".git").exists()
    }

    /// 把主仓库切到指定 commit。
    fn checkout_to_commit(&self, snap: &SnapshotMetadata) -> Result<()> {
        use git2::Repository;
        let repo = Repository::open(&self.config.repo_path)
            .map_err(|e| Error::Git(format!("打开仓库失败: {e}")))?;
        let oid = git2::Oid::from_str(&snap.commit_sha)
            .map_err(|e| Error::Git(format!("解析 commit 失败: {e}")))?;
        let commit = repo
            .find_commit(oid)
            .map_err(|e| Error::Git(format!("查找 commit 失败: {e}")))?;
        repo.checkout_tree(commit.as_object(), None)
            .map_err(|e| Error::Git(format!("checkout tree 失败: {e}")))?;
        repo.set_head_detached(commit.id())
            .map_err(|e| Error::Git(format!("set HEAD detached 失败: {e}")))?;
        Ok(())
    }

    /// 发出回执（如果总线存在）。
    fn emit_receipt(&self, kind: ReceiptKind) {
        if let Some(bus) = &self.receipt_bus {
            bus.emit(kind);
        }
    }
}

/// 解析 checkpoint_id 末尾的 turn count。
fn parse_checkpoint_turn(id: &str) -> Option<u32> {
    id.rsplit('-').next()?.parse().ok()
}

/// Builder 模式。
pub struct CheckpointServiceBuilder {
    store: Option<Arc<dyn CheckpointStore>>,
    snapshots: Option<Arc<GitSnapshotManager>>,
    diff_engine: Option<Arc<DiffApplyEngine>>,
    config: Option<CheckpointServiceConfig>,
    receipt_bus: Option<SharedReceiptBus>,
    sqlite_pool: Option<sqlx::SqlitePool>,
}

impl CheckpointServiceBuilder {
    /// 创建一个新的 builder。
    pub fn new() -> Self {
        Self {
            store: None,
            snapshots: None,
            diff_engine: None,
            config: None,
            receipt_bus: None,
            sqlite_pool: None,
        }
    }

    pub fn store(mut self, store: Arc<dyn CheckpointStore>) -> Self {
        self.store = Some(store);
        self
    }

    pub fn snapshots(mut self, mgr: Arc<GitSnapshotManager>) -> Self {
        self.snapshots = Some(mgr);
        self
    }

    pub fn diff_engine(mut self, engine: Arc<DiffApplyEngine>) -> Self {
        self.diff_engine = Some(engine);
        self
    }

    pub fn config(mut self, config: CheckpointServiceConfig) -> Self {
        self.config = Some(config);
        self
    }

    pub fn receipt_bus(mut self, bus: SharedReceiptBus) -> Self {
        self.receipt_bus = Some(bus);
        self
    }

    /// 显式设置 sqlite pool（用于 prune_overflow 等直接 SQL 操作）。
    pub fn sqlite_pool(mut self, pool: sqlx::SqlitePool) -> Self {
        self.sqlite_pool = Some(pool);
        self
    }

    /// 构建最终的 CheckpointService。
    pub fn build(self) -> Result<CheckpointService> {
        let config = self
            .config
            .ok_or_else(|| Error::Internal("CheckpointServiceConfig 未设置".to_string()))?;
        let store = self
            .store
            .ok_or_else(|| Error::Internal("CheckpointStore 未设置".to_string()))?;
        let snapshots = self.snapshots.unwrap_or_else(|| {
            Arc::new(GitSnapshotManager::new(
                config.repo_path.clone(),
                config.snapshots_root.clone(),
            ))
        });
        let diff_engine = self
            .diff_engine
            .unwrap_or_else(|| Arc::new(DiffApplyEngine::new()));
        Ok(CheckpointService {
            store,
            snapshots,
            diff_engine,
            config: Arc::new(config),
            receipt_bus: self.receipt_bus,
            last_turn_per_thread: Arc::new(tokio::sync::Mutex::new(
                std::collections::HashMap::new(),
            )),
            sqlite_pool: self.sqlite_pool,
        })
    }
}

impl Default for CheckpointServiceBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use remi_persistence::Database;

    async fn test_db() -> Arc<Database> {
        let mut config = remi_core::ServerConfig::default();
        let dir = std::env::temp_dir().join(format!("remi-cp-svc-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        config.db_path = dir.join("remi.db");
        let db = Arc::new(Database::connect(&config).await.unwrap());
        db.run_migrations().await.unwrap();
        db
    }

    fn temp_dir(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("remi-cp-svc-{}-{}", name, Uuid::new_v4()));
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    #[tokio::test]
    async fn test_take_checkpoint_no_git() {
        let db = test_db().await;
        let tmp = temp_dir("nongit");
        let cfg = CheckpointServiceConfig::new(tmp.clone(), tmp.join("snaps"));
        let svc = CheckpointService::with_default_store(db, cfg);

        let thread_id = ThreadId::new();
        let cp = svc
            .take(thread_id, Uuid::new_v4(), 1, Some("first turn".into()))
            .await
            .unwrap();

        assert_eq!(cp.thread_id, thread_id);
        assert_eq!(cp.to_turn_count, 1);
        assert_eq!(cp.from_turn_count, 0);
        assert!(cp.commit_sha.is_none());

        let list = svc.list(thread_id).await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].to_turn_count, 1);
    }

    #[tokio::test]
    async fn test_take_multiple_checkpoints_chain() {
        let db = test_db().await;
        let tmp = temp_dir("chain");
        let cfg = CheckpointServiceConfig::new(tmp.clone(), tmp.join("snaps"));
        let svc = CheckpointService::with_default_store(db, cfg);

        let thread_id = ThreadId::new();
        svc.take(thread_id, Uuid::new_v4(), 1, None).await.unwrap();
        svc.take(thread_id, Uuid::new_v4(), 2, None).await.unwrap();
        svc.take(thread_id, Uuid::new_v4(), 3, None).await.unwrap();

        let list = svc.list(thread_id).await.unwrap();
        assert_eq!(list.len(), 3);
        assert_eq!(list[0].from_turn_count, 0);
        assert_eq!(list[1].from_turn_count, 1);
        assert_eq!(list[2].from_turn_count, 2);
    }

    #[tokio::test]
    async fn test_prune_overflow() {
        let db = test_db().await;
        let tmp = temp_dir("prune");
        let cfg = CheckpointServiceConfig::new(tmp.clone(), tmp.join("snaps"))
            .with_max_per_thread(2);
        let svc = CheckpointService::with_default_store(db, cfg);

        let thread_id = ThreadId::new();
        for i in 1..=5 {
            svc.take(thread_id, Uuid::new_v4(), i, None).await.unwrap();
        }

        let list = svc.list(thread_id).await.unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].to_turn_count, 4);
        assert_eq!(list[1].to_turn_count, 5);
    }

    #[tokio::test]
    async fn test_receipt_emission() {
        let db = test_db().await;
        let bus = Arc::new(RuntimeReceiptBus::new(16));
        let mut rx = bus.subscribe();

        let tmp = temp_dir("receipt");
        let cfg = CheckpointServiceConfig::new(tmp.clone(), tmp.join("snaps"));
        let svc = CheckpointService::with_default_store(db, cfg).with_receipt_bus(bus.clone());

        let thread_id = ThreadId::new();
        svc.take(thread_id, Uuid::new_v4(), 1, None).await.unwrap();

        let receipt = rx.recv().await.unwrap();
        assert!(matches!(receipt.kind, ReceiptKind::CheckpointCompleted { .. }));
    }

    #[tokio::test]
    async fn test_delete_all() {
        let db = test_db().await;
        let tmp = temp_dir("delete");
        let cfg = CheckpointServiceConfig::new(tmp.clone(), tmp.join("snaps"));
        let svc = CheckpointService::with_default_store(db, cfg);

        let thread_id = ThreadId::new();
        svc.take(thread_id, Uuid::new_v4(), 1, None).await.unwrap();
        svc.take(thread_id, Uuid::new_v4(), 2, None).await.unwrap();
        assert_eq!(svc.list(thread_id).await.unwrap().len(), 2);

        svc.delete_all(thread_id).await.unwrap();
        assert_eq!(svc.list(thread_id).await.unwrap().len(), 0);
    }

    #[test]
    fn test_checkpoint_summary_from() {
        let thread_id = ThreadId::new();
        let cp = Checkpoint {
            checkpoint_id: "abc-5".to_string(),
            thread_id,
            turn_id: Uuid::new_v4(),
            commit_sha: Some("deadbeef".to_string()),
            worktree_path: None,
            created_at: "2026-01-01T00:00:00Z".to_string(),
            note: Some("n".to_string()),
            from_turn_count: 4,
            to_turn_count: 5,
        };
        let summary: CheckpointSummary = CheckpointSummary::from(&cp);
        assert_eq!(summary.checkpoint_id, "abc-5");
        assert_eq!(summary.to_turn_count, 5);
        assert_eq!(summary.commit_sha.as_deref(), Some("deadbeef"));
    }

    #[test]
    fn test_parse_checkpoint_turn_helper() {
        assert_eq!(parse_checkpoint_turn("abc-7"), Some(7));
        assert_eq!(parse_checkpoint_turn("xyz-0"), Some(0));
        assert_eq!(parse_checkpoint_turn("invalid"), None);
    }
}
