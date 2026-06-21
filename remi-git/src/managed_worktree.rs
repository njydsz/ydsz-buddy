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
///
/// 记录单个 Worktree 的生命周期元数据，用于跟踪和管理所有活跃的 Worktree。
///
/// # 字段说明
///
/// - `path`: Worktree 在文件系统中的绝对路径
/// - `thread_id`: 关联的工作线程 ID，用于将 Worktree 与特定的 AI Agent 会话绑定
/// - `created_at`: Worktree 的创建时间（UTC）
/// - `last_active_at`: 最近一次活跃时间，用于判断是否过期
///
/// # 使用场景
///
/// - 查询 Worktree 的关联线程，支持线程切换
/// - 判断 Worktree 是否过期，触发自动清理
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
///
/// 控制 Worktree 生命周期管理的行为参数。
///
/// # 字段说明
///
/// - `ttl`: Worktree 过期时间（Time To Live），超过此时间未活跃的 Worktree 将被自动清理
/// - `cleanup_interval`: 后台清理任务的执行间隔，控制清理频率
///
/// # 默认值
///
/// - `ttl`: 7 天（`3600 * 24 * 7` 秒）
/// - `cleanup_interval`: 1 小时（`3600` 秒）
///
/// # 使用示例
///
/// ```rust,ignore
/// let config = ManagedWorktreeConfig {
///     ttl: Duration::from_secs(3600 * 24),     // 1 天过期
///     cleanup_interval: Duration::from_secs(600), // 每 10 分钟检查
/// };
/// ```
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
/// 本服务通过 `RwLock` 保护内部注册表，支持多线程并发访问。
///
/// # 核心功能
///
/// 1. **Worktree 注册**：创建 Worktree 时记录元数据（路径、关联线程、创建时间）
/// 2. **Worktree 注销**：删除 Worktree 时移除记录
/// 3. **过期清理**：自动清理超过 TTL 未活跃的 Worktree
/// 4. **状态查询**：查询所有活跃 Worktree 及其关联信息
/// 5. **活跃标记**：更新 Worktree 的最近活跃时间，防止被过期清理
///
/// # 设计特点
///
/// - **线程安全**：使用 `RwLock` 保护内部状态，支持并发读写
/// - **自动清理**：后台定时任务自动清理过期 Worktree
/// - **路径规范**：Worktree 统一存放在 `<repo_parent>/.remi-worktrees/` 目录下
///
/// # 使用示例
///
/// ```rust,ignore
/// let service = ManagedWorktreeService::new(git_core, ManagedWorktreeConfig::default());
/// let path = service.create_worktree("/repo", "feature-1", Some("thread-123")).await?;
/// ```
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
    ///
    /// # 参数
    ///
    /// - `git_core`: Git 核心操作实例，用于执行底层 Git worktree 命令
    /// - `config`: 服务配置，控制过期时间和清理间隔
    ///
    /// # 返回值
    ///
    /// 返回一个新的 `ManagedWorktreeService` 实例，内部注册表初始为空。
    pub fn new(git_core: Arc<GitCore>, config: ManagedWorktreeConfig) -> Self {
        Self {
            git_core,
            worktrees: RwLock::new(HashMap::new()),
            config,
        }
    }

    /// 创建一个新的托管 Worktree
    ///
    /// 在仓库旁边创建新的 Worktree 目录，关联到指定分支，并注册到管理服务中。
    /// Worktree 路径自动计算为 `<repo_parent>/.remi-worktrees/<branch_name>`。
    ///
    /// # 参数
    ///
    /// - `repo_path`: 仓库根路径（必须是绝对路径）
    /// - `branch_name`: 要创建的分支名（新 Worktree 将检出此分支）
    /// - `thread_id`: 关联的线程 ID（可选），用于将 Worktree 绑定到特定的 AI Agent 会话
    ///
    /// # 返回值
    ///
    /// - `Ok(PathBuf)`: 创建的 Worktree 路径
    /// - `Err(GitError)`: 创建失败（分支已存在、路径冲突等）
    ///
    /// # 实现细节
    ///
    /// 1. 调用 `compute_worktree_path` 计算 Worktree 路径
    /// 2. 调用 `GitCore::create_worktree` 创建 Git worktree
    /// 3. 将 Worktree 元数据注册到内部注册表
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

    /// 创建一个 detached Worktree（不关联新分支）
    ///
    /// 从当前 HEAD 创建一个分离的 Worktree，不创建新分支。
    /// 分支名使用 `detached-<timestamp>` 格式自动生成。
    ///
    /// # 参数
    ///
    /// - `repo_path`: 仓库根路径（必须是绝对路径）
    /// - `thread_id`: 关联的线程 ID（可选）
    ///
    /// # 返回值
    ///
    /// - `Ok(PathBuf)`: 创建的 Worktree 路径
    /// - `Err(GitError)`: 创建失败
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
    ///
    /// 删除指定的 Worktree 目录，并从内部注册表中移除对应的记录。
    ///
    /// # 参数
    ///
    /// - `repo_path`: 主仓库根路径
    /// - `worktree_path`: 要删除的 Worktree 路径
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 移除成功
    /// - `Err(GitError)`: 移除失败（Worktree 不存在、有未提交更改等）
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
    ///
    /// 更新指定 Worktree 的最近活跃时间为当前时间，防止被过期清理任务删除。
    /// 如果 Worktree 路径不在注册表中，操作将被忽略。
    ///
    /// # 参数
    ///
    /// - `worktree_path`: Worktree 的绝对路径
    ///
    /// # 使用场景
    ///
    /// - AI Agent 在 Worktree 中执行操作时，定期调用此方法保持活跃状态
    /// - 用户手动刷新 Worktree 时更新活跃时间
    pub async fn touch_worktree(&self, worktree_path: &str) {
        let path = PathBuf::from(worktree_path);
        let mut worktrees = self.worktrees.write().await;
        if let Some(record) = worktrees.get_mut(&path) {
            record.last_active_at = Utc::now();
        }
    }

    /// 获取所有已注册的 Worktree
    ///
    /// 返回当前所有活跃 Worktree 的元数据列表。
    ///
    /// # 返回值
    ///
    /// 返回 `Vec<ManagedWorktree>`，包含所有已注册但尚未清理的 Worktree 记录。
    pub async fn list_worktrees(&self) -> Vec<ManagedWorktree> {
        self.worktrees.read().await.values().cloned().collect()
    }

    /// 按线程 ID 查询关联的 Worktree
    ///
    /// 查找与指定线程 ID 关联的 Worktree。每个线程最多关联一个 Worktree。
    ///
    /// # 参数
    ///
    /// - `thread_id`: 要查询的线程 ID
    ///
    /// # 返回值
    ///
    /// - `Some(ManagedWorktree)`: 找到关联的 Worktree
    /// - `None`: 没有线程关联的 Worktree
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
    /// 遍历所有已注册的 Worktree，删除超过 TTL 未活跃的记录。
    /// 对于每个过期的 Worktree，先调用 Git 命令删除目录，再从注册表中移除。
    ///
    /// # 返回值
    ///
    /// 返回已清理的 Worktree 路径列表。如果某些 Worktree 删除失败，
    /// 仅记录警告日志，不会中断清理过程。
    ///
    /// # 实现细节
    ///
    /// 1. 读取注册表，筛选出 `last_active_at` 超过 `ttl` 的记录
    /// 2. 推断所属仓库路径（取 worktree_path 的父目录的父目录）
    /// 3. 调用 `GitCore::remove_worktree` 删除 Git worktree
    /// 4. 从注册表中移除记录
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
    /// 在后台异步任务中定期执行 `cleanup_expired`，间隔由 `cleanup_interval` 配置决定。
    /// 任务会持续运行直到进程退出。
    ///
    /// # 使用示例
    ///
    /// ```rust,ignore
    /// let service = Arc::new(ManagedWorktreeService::new(git_core, config));
    /// service.start_cleanup_task();
    /// ```
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

    /// 获取已注册 Worktree 数量
    ///
    /// # 返回值
    ///
    /// 返回当前注册表中的 Worktree 总数（包括可能已过期的）。
    pub async fn count(&self) -> usize {
        self.worktrees.read().await.len()
    }
}

/// 计算 worktree 路径：`<repo_parent>/.remi-worktrees/<branch>`
///
/// 根据仓库路径和分支名计算 Worktree 的存放路径。
/// Worktree 统一存放在仓库同级目录的 `.remi-worktrees` 子目录下。
///
/// # 参数
///
/// - `repo_path`: 仓库根路径
/// - `branch_name`: 分支名称（会被清理为安全字符）
///
/// # 返回值
///
/// 返回 Worktree 的绝对路径，格式为 `<repo_parent>/.remi-worktrees/<sanitized_branch>`。
fn compute_worktree_path(repo_path: &str, branch_name: &str) -> PathBuf {
    let repo = Path::new(repo_path);
    let parent = repo.parent().unwrap_or(Path::new("."));
    let safe_branch = sanitize_branch_name(branch_name);
    parent.join(".remi-worktrees").join(safe_branch)
}

/// 清理分支名中的不安全字符
///
/// 将分支名中的文件系统不安全字符（`/\:*?"<>|`）替换为下划线 `_`，
/// 确保生成的目录名在 Windows 和 Unix 系统上都是合法的。
///
/// # 参数
///
/// - `name`: 原始分支名称
///
/// # 返回值
///
/// 返回清理后的安全字符串，可用作目录名。
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