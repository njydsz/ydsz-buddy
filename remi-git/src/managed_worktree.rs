//! # 托管 Worktree 服务
//!
//! 本模块提供集中的 Worktree 生命周期管理，跟踪所有活跃 Worktree 的状态，
//! 支持清理过期 Worktree 和查询关联线程。
//!
//! ## 核心功能
//!
//! 1. **Worktree 注册**：创建 Worktree 时记录元数据（路径、关联线程、创建时间）
//! 2. **Worktree 注销**：删除 Worktree 时移除记录
//! 3. **过期清理**：自动清理超过 TTL 的 Worktree
//! 4. **状态查询**：查询所有活跃 Worktree 及其关联信息

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use chrono::{DateTime, Utc};
use tokio::sync::RwLock;
use tracing::{info, warn};

use crate::error::GitError;
use crate::GitCore;

/// 托管 Worktree 的元数据记录
#[derive(Debug, Clone)]
pub struct ManagedWorktree {
    /// Worktree 路径
    pub path: PathBuf,
    /// 关联的线程 ID（可选）
    pub thread_id: Option<String>,
    /// 创建时间
    pub created_at: DateTime<Utc>,
    /// 最近活跃时间
    pub last_active_at: DateTime<Utc>,
}

/// 托管 Worktree 服务配置
#[derive(Debug, Clone)]
pub struct ManagedWorktreeConfig {
    /// Worktree 过期时间（超过此时间未活跃将被清理）
    pub ttl: Duration,
    /// 清理检查间隔
    pub cleanup_interval: Duration,
}

impl Default for ManagedWorktreeConfig {
    fn default() -> Self {
        Self {
            ttl: Duration::from_secs(3600 * 24 * 7), // 7 天
            cleanup_interval: Duration::from_secs(3600), // 1 小时
        }
    }
}

/// 托管 Worktree 服务
///
/// 管理所有 Worktree 的生命周期，提供注册、注销、查询和清理功能。
pub struct ManagedWorktreeService {
    /// Git 核心操作实例
    git_core: Arc<GitCore>,
    /// Worktree 注册表：路径 -> 元数据
    worktrees: RwLock<HashMap<PathBuf, ManagedWorktree>>,
    /// 配置
    config: ManagedWorktreeConfig,
}

impl ManagedWorktreeService {
    /// 创建新的托管 Worktree 服务
    pub fn new(git_core: Arc<GitCore>, config: ManagedWorktreeConfig) -> Self {
        Self {
            git_core,
            worktrees: RwLock::new(HashMap::new()),
            config,
        }
    }

    /// 创建一个新的托管 Worktree
    ///
    /// # 参数
    /// - `repo_path`: 仓库根路径
    /// - `branch_name`: 要创建的分支名
    /// - `thread_id`: 关联的线程 ID（可选）
    ///
    /// # 返回值
    /// 返回创建的 Worktree 路径
    pub async fn create_worktree(
        &self,
        repo_path: &str,
        branch_name: &str,
        thread_id: Option<&str>,
    ) -> Result<PathBuf, GitError> {
        let worktree_path = compute_worktree_path(repo_path, branch_name);
        self.git_core
            .create_worktree(
                repo_path,
                worktree_path.to_string_lossy().as_ref(),
                branch_name,
                None,
            )
            .await?;

        let now = Utc::now();
        let record = ManagedWorktree {
            path: worktree_path.clone(),
            thread_id: thread_id.map(|s| s.to_string()),
            created_at: now,
            last_active_at: now,
        };

        self.worktrees
            .write()
            .await
            .insert(worktree_path.clone(), record);
        info!(
            "已注册托管 Worktree: {} (branch: {}, thread: {:?})",
            worktree_path.display(),
            branch_name,
            thread_id
        );

        Ok(worktree_path)
    }

    /// 创建一个 detached Worktree（不关联分支）
    pub async fn create_detached_worktree(
        &self,
        repo_path: &str,
        thread_id: Option<&str>,
    ) -> Result<PathBuf, GitError> {
        let branch_name = format!("detached-{}", &Utc::now().timestamp_millis().to_string());
        let worktree_path = compute_worktree_path(repo_path, &branch_name);
        self.git_core
            .create_detached_worktree(
                repo_path,
                worktree_path.to_string_lossy().as_ref(),
                "HEAD",
            )
            .await?;

        let now = Utc::now();
        let record = ManagedWorktree {
            path: worktree_path.clone(),
            thread_id: thread_id.map(|s| s.to_string()),
            created_at: now,
            last_active_at: now,
        };

        self.worktrees
            .write()
            .await
            .insert(worktree_path.clone(), record);
        info!(
            "已注册托管 Worktree (detached): {} (thread: {:?})",
            worktree_path.display(),
            thread_id
        );

        Ok(worktree_path)
    }

    /// 移除一个 Worktree 并清理注册表
    pub async fn remove_worktree(
        &self,
        repo_path: &str,
        worktree_path: &str,
    ) -> Result<(), GitError> {
        self.git_core
            .remove_worktree(repo_path, worktree_path)
            .await?;

        let path = PathBuf::from(worktree_path);
        self.worktrees.write().await.remove(&path);
        info!("已移除托管 Worktree: {}", worktree_path);

        Ok(())
    }

    /// 标记 Worktree 为活跃状态（更新 last_active_at）
    pub async fn touch_worktree(&self, worktree_path: &str) {
        let path = PathBuf::from(worktree_path);
        let mut worktrees = self.worktrees.write().await;
        if let Some(record) = worktrees.get_mut(&path) {
            record.last_active_at = Utc::now();
        }
    }

    /// 获取所有已注册的 Worktree
    pub async fn list_worktrees(&self) -> Vec<ManagedWorktree> {
        self.worktrees.read().await.values().cloned().collect()
    }

    /// 按线程 ID 查询关联的 Worktree
    pub async fn get_worktree_by_thread(&self, thread_id: &str) -> Option<ManagedWorktree> {
        self.worktrees
            .read()
            .await
            .values()
            .find(|r| r.thread_id.as_deref() == Some(thread_id))
            .cloned()
    }

    /// 清理过期的 Worktree
    ///
    /// 遍历所有 Worktree，删除超过 TTL 未活跃的记录。
    /// 返回已清理的 Worktree 路径列表。
    pub async fn cleanup_expired(&self) -> Vec<PathBuf> {
        let now = Utc::now();
        let expired: Vec<ManagedWorktree> = {
            let worktrees = self.worktrees.read().await;
            worktrees
                .values()
                .filter(|r| {
                    let age = (now - r.last_active_at).to_std().unwrap_or(Duration::ZERO);
                    age > self.config.ttl
                })
                .cloned()
                .collect()
        };

        let mut cleaned = Vec::new();
        for record in &expired {
            // 推断所属仓库：取 worktree_path 父目录的父目录（`.remi/worktrees/<branch>` 形式）
            let repo_path = record
                .path
                .parent()
                .and_then(|p| p.parent())
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            match self
                .git_core
                .remove_worktree(&repo_path, &record.path.to_string_lossy())
                .await
            {
                Ok(()) => {
                    self.worktrees.write().await.remove(&record.path);
                    cleaned.push(record.path.clone());
                    info!("已清理过期 Worktree: {}", record.path.display());
                }
                Err(e) => {
                    warn!("清理过期 Worktree 失败 {}: {}", record.path.display(), e);
                }
            }
        }

        cleaned
    }

    /// 启动后台清理任务
    ///
    /// 定期执行 `cleanup_expired`，间隔由 `cleanup_interval` 配置决定。
    pub async fn start_cleanup_task(self: Arc<Self>) {
        let interval = self.config.cleanup_interval;
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(interval).await;
                let cleaned = self.cleanup_expired().await;
                if !cleaned.is_empty() {
                    info!(
                        "托管 Worktree 清理完成，已清理 {} 个",
                        cleaned.len()
                    );
                }
            }
        });
    }

    /// 获取 Worktree 数量
    pub async fn count(&self) -> usize {
        self.worktrees.read().await.len()
    }
}

/// 计算 worktree 路径：`<repo_parent>/.remi-worktrees/<branch>`
fn compute_worktree_path(repo_path: &str, branch_name: &str) -> PathBuf {
    let repo = Path::new(repo_path);
    let parent = repo.parent().unwrap_or(Path::new("."));
    let safe_branch = sanitize_branch_name(branch_name);
    parent.join(".remi-worktrees").join(safe_branch)
}

/// 清理分支名中的不安全字符
fn sanitize_branch_name(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_replaces_slashes() {
        assert_eq!(sanitize_branch_name("feature/foo"), "feature_foo");
        assert_eq!(sanitize_branch_name("a:b"), "a_b");
    }

    #[test]
    fn compute_worktree_path_layout() {
        let p = compute_worktree_path("/tmp/repo", "feature-1");
        assert!(p.to_string_lossy().contains(".remi-worktrees"));
        assert!(p.to_string_lossy().ends_with("feature-1"));
    }
}