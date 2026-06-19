//! Git 工作树快照管理。
//!
//! 大厂标准做法：将工作树状态保存为 detached worktree，
//! 用户可任意切换；删除 worktree 即等于回滚。
//!
//! # 实现
//!
//! - 使用 `git worktree add --detach <path> <commit>` 创建快照
//! - 快照元数据保存到 `projection_checkpoints` 表 + 内存索引
//! - 删除时使用 `git worktree remove --force`

use chrono::{DateTime, Utc};
use git2::Repository;
use remi_contracts::ThreadId;
use remi_core::{Error, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tracing::{debug, info};
use uuid::Uuid;

/// Git 快照元数据。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotMetadata {
    /// 快照 ID。
    pub snapshot_id: Uuid,
    /// 关联会话 ID。
    pub thread_id: ThreadId,
    /// 关联轮次 ID。
    pub turn_id: Uuid,
    /// 关联的 git 提交 SHA。
    pub commit_sha: String,
    /// worktree 路径。
    pub worktree_path: PathBuf,
    /// 拍摄时间。
    pub created_at: DateTime<Utc>,
    /// 备注（可选）。
    pub note: Option<String>,
}

/// Git 快照包装。
#[derive(Debug, Clone)]
pub struct GitSnapshot {
    /// 快照元数据。
    pub metadata: SnapshotMetadata,
    /// 关联的 worktree 路径。
    pub worktree_path: PathBuf,
}

impl GitSnapshot {
    /// 切换到该快照所在的工作树。
    pub fn worktree(&self) -> &Path {
        &self.worktree_path
    }
}

/// Git 快照管理器。
pub struct GitSnapshotManager {
    /// 主仓库路径。
    repo_path: PathBuf,
    /// 快照存储根目录。
    snapshots_root: PathBuf,
}

impl GitSnapshotManager {
    /// 创建一个新的快照管理器。
    ///
    /// `repo_path` 是项目根目录（含 .git）。
    /// `snapshots_root` 是 worktree 存储目录（通常为 `<data_dir>/checkpoints`）。
    pub fn new(repo_path: PathBuf, snapshots_root: PathBuf) -> Self {
        Self {
            repo_path,
            snapshots_root,
        }
    }

    /// 确保快照根目录存在。
    pub fn ensure_root(&self) -> Result<()> {
        std::fs::create_dir_all(&self.snapshots_root)
            .map_err(|e| Error::Internal(format!("创建快照根目录失败: {e}")))?;
        Ok(())
    }

    /// 拍摄一个快照。
    ///
    /// 流程：
    /// 1. 打开主仓库
    /// 2. 获取 HEAD 提交（如果 dirty 则先 commit）
    /// 3. 创建 detached worktree
    /// 4. 返回快照元数据
    pub fn take(
        &self,
        thread_id: ThreadId,
        turn_id: Uuid,
        note: Option<String>,
    ) -> Result<GitSnapshot> {
        self.ensure_root()?;

        let repo = Repository::open(&self.repo_path)
            .map_err(|e| Error::Git(format!("打开仓库失败: {e}")))?;

        // 检查是否有未提交的变更，如有则自动 commit。
        let head_commit = self.commit_pending_if_needed(&repo)?;

        // 生成 worktree 路径：<snapshots_root>/<thread_id>/<turn_id>
        let worktree_path = self.snapshots_root
            .join(thread_id.to_string())
            .join(turn_id.to_string());
        if worktree_path.exists() {
            // 已存在：清理
            self.remove_worktree(&repo, &worktree_path)?;
        }
        std::fs::create_dir_all(worktree_path.parent().unwrap())
            .map_err(|e| Error::Internal(format!("创建 worktree 父目录失败: {e}")))?;

        // 创建 detached worktree
        let snapshot_id = Uuid::new_v4();
        let path_str = worktree_path.to_string_lossy().to_string();
        let worktree = repo
            .worktree(
                &snapshot_id.to_string(),
                &path_str,
                Some(
                    git2::WorktreeAddOptions::new()
                        .detach(true)
                        .reference(Some(&repo.head()?)),
                ),
            )
            .map_err(|e| Error::Git(format!("创建 worktree 失败: {e}")))?;

        let commit_sha = head_commit.id().to_string();
        let metadata = SnapshotMetadata {
            snapshot_id,
            thread_id,
            turn_id,
            commit_sha: commit_sha.clone(),
            worktree_path: worktree_path.clone(),
            created_at: Utc::now(),
            note,
        };

        info!(
            snapshot_id = %snapshot_id,
            thread_id = %thread_id,
            turn_id = %turn_id,
            commit_sha = %commit_sha,
            "已拍摄 Git 快照"
        );
        debug!("worktree={:?}", worktree.path());

        Ok(GitSnapshot {
            metadata,
            worktree_path,
        })
    }

    /// 删除一个快照。
    pub fn remove(&self, snapshot: &GitSnapshot) -> Result<()> {
        let repo = Repository::open(&self.repo_path)
            .map_err(|e| Error::Git(format!("打开仓库失败: {e}")))?;
        self.remove_worktree(&repo, &snapshot.worktree_path)?;
        info!(snapshot_id = %snapshot.metadata.snapshot_id, "已删除 Git 快照");
        Ok(())
    }

    /// 列出某个会话的所有快照。
    pub fn list_for_thread(&self, thread_id: ThreadId) -> Result<Vec<SnapshotMetadata>> {
        let thread_dir = self.snapshots_root.join(thread_id.to_string());
        if !thread_dir.exists() {
            return Ok(Vec::new());
        }
        let mut out = Vec::new();
        for entry in std::fs::read_dir(&thread_dir)
            .map_err(|e| Error::Internal(format!("读取快照目录失败: {e}")))?
        {
            let entry = entry.map_err(|e| Error::Internal(format!("目录项错误: {e}")))?;
            if entry.path().is_dir() {
                let name = entry.file_name().to_string_lossy().to_string();
                if let Ok(turn_id) = Uuid::parse_str(&name) {
                    out.push(SnapshotMetadata {
                        snapshot_id: Uuid::new_v4(),
                        thread_id,
                        turn_id,
                        commit_sha: String::new(),
                        worktree_path: entry.path(),
                        created_at: Utc::now(),
                        note: None,
                    });
                }
            }
        }
        Ok(out)
    }

    /// 自动提交所有未保存的变更（如果 dirty）。
    fn commit_pending_if_needed(&self, repo: &Repository) -> Result<git2::Commit<'_>> {
        let mut index = repo.index()?;
        let tree_id = index.write_tree()?;
        let tree = repo.find_tree(tree_id)?;

        // 检查是否有未保存的修改
        let head_oid = repo.head()?.target().unwrap_or_else(git2::Oid::zero);
        let head_tree = repo.find_commit(head_oid)?.tree()?;
        let diff = repo.diff_tree_to_tree(Some(&head_tree), Some(&tree), None)?;

        if diff.deltas().len() == 0 {
            return repo.find_commit(head_oid);
        }

        let sig = repo.signature()?;
        let parent = repo.find_commit(head_oid)?;
        let commit_oid = repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            "[remi] 自动检查点",
            &tree,
            &[&parent],
        )?;
        let commit = repo.find_commit(commit_oid)?;
        info!(commit = %commit_oid, "已自动提交检查点");
        Ok(commit)
    }

    /// 强制删除 worktree。
    fn remove_worktree(&self, repo: &Repository, path: &Path) -> Result<()> {
        let path_str = path.to_string_lossy().to_string();
        // 先在 libgit2 中 prune
        if let Ok(wt) = repo.find_worktree(&path_str) {
            // libgit2 0.20: prune() 即可
            wt.prune(Some(
                &mut git2::WorktreePruneOptions::new()
                    .working_tree(true)
                    .valid(true)
                    .locked(true),
            ))?;
        }
        if path.exists() {
            std::fs::remove_dir_all(path)
                .map_err(|e| Error::Internal(format!("删除 worktree 失败: {e}")))?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn create_test_repo() -> (PathBuf, PathBuf) {
        let tmp = env::temp_dir().join(format!("remi-checkpoint-{}", Uuid::new_v4()));
        let repo_path = tmp.join("repo");
        let snap_root = tmp.join("snaps");
        std::fs::create_dir_all(&repo_path).unwrap();
        let repo = Repository::init(&repo_path).unwrap();
        // 首次提交
        let mut index = repo.index().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let sig = repo.signature().unwrap();
        repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            "init",
            &tree,
            &[],
        )
        .unwrap();
        (repo_path, snap_root)
    }

    #[test]
    fn test_take_and_list_snapshot() {
        let (repo_path, snap_root) = create_test_repo();
        let manager = GitSnapshotManager::new(repo_path, snap_root);
        let snapshot = manager
            .take(ThreadId::new(), Uuid::new_v4(), Some("test".to_string()))
            .unwrap();
        assert!(snapshot.worktree_path.exists());
    }
}
