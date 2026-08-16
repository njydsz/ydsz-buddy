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
use serde::Serialize;
use tokio::sync::RwLock;
use tracing::{info, warn};

use super::error::GitError;
use super::core::GitCore;

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
#[derive(Debug, Clone, Serialize)]
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
/// - **路径规范**：Worktree 统一存放在 `<repo_parent>/.ydsz-worktrees/` 目录下
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
    /// Worktree 路径自动计算为 `<repo_parent>/.ydsz-worktrees/<branch_name>`。
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

    /// 注册一个外部已创建的 Worktree（不执行 git 命令）
    ///
    /// 当调用方通过 `GitCore::create_worktree` / `attach_worktree` 直接创建了 worktree 时，
    /// 用本方法把元数据登记到注册表，避免 `create_worktree` 方法重复执行 git 命令。
    /// 这是修复 `git.createWorktree` RPC handler 与 ManagedWorktreeService 注册表脱节的关键路径。
    ///
    /// # 参数
    ///
    /// - `repo_path`: 主仓库根路径（仅用于日志/调试，不参与路径计算）
    /// - `worktree_path`: 已创建的 Worktree 绝对路径
    /// - `branch_name`: Worktree 检出的分支名（仅用于日志）
    /// - `thread_id`: 关联的线程 ID（可选），用于将 Worktree 绑定到特定的 AI Agent 会话
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 注册成功（如果路径已存在则覆盖更新）
    /// - `Err(GitError)`: 当前不返回错误，保留 `Result` 以与其它方法签名对齐，便于未来扩展
    pub async fn register_existing_worktree(
        &self,
        repo_path: &str,
        worktree_path: &str,
        branch_name: &str,
        thread_id: Option<&str>,
    ) -> Result<(), GitError> {
        let path = PathBuf::from(worktree_path);
        let now = Utc::now();
        let record = ManagedWorktree {
            path: path.clone(),
            thread_id: thread_id.map(|s| s.to_string()),
            created_at: now,
            last_active_at: now,
        };
        self.worktrees.write().await.insert(path, record);
        info!(
            "已注册外部创建的 Worktree: {} (repo: {}, branch: {}, thread: {:?})",
            worktree_path, repo_path, branch_name, thread_id
        );
        Ok(())
    }

    /// 注销一个外部已删除的 Worktree（不执行 git 命令）
    ///
    /// 与 [`register_existing_worktree`] 对称:调用方通过 `GitCore::remove_worktree`
    /// 直接删除 worktree 后,用本方法从注册表移除记录,避免 `remove_worktree` 重复执行 git 命令。
    ///
    /// # 参数
    ///
    /// - `worktree_path`: 已删除的 Worktree 绝对路径
    ///
    /// # 返回值
    ///
    /// - `Ok(bool)`: true=已注销(原本存在);false=原本不存在(幂等)
    pub async fn unregister_worktree(&self, worktree_path: &str) -> bool {
        let path = PathBuf::from(worktree_path);
        let removed = self.worktrees.write().await.remove(&path).is_some();
        if removed {
            info!("已注销外部删除的 Worktree: {}", worktree_path);
        }
        removed
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
            // 推断所属仓库：取 worktree_path 父目录的父目录（`.ydsz/worktrees/<branch>` 形式）
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

    /// 对账：扫描 git worktree list，同步内存注册表
    ///
    /// 调用 `git worktree list --porcelain` 获取 git 自身登记的所有 worktree，
    /// 与内存注册表比对，修复以下脱节：
    ///
    /// 1. **磁盘有但内存无**（孤儿）：进程崩溃或重启后，git 已落盘但注册表丢失的 worktree。
    ///    仅注册路径位于 `<repo_parent>/.ydsz-worktrees/` 下的（我们创建的），其它 worktree
    ///    （用户手动 `git worktree add` 的、IDE 创建的）不纳入托管。
    /// 2. **内存有但磁盘无**（悬空）：注册表中记录的 worktree 路径在 git list 中不存在，
    ///    说明磁盘已被外部删除（`git worktree remove` 或手动 rm）。从注册表移除。
    ///
    /// # 参数
    ///
    /// - `repo_cwd`: 仓库工作目录（可以是仓库内任意子目录，git 会自动定位仓库根）
    ///
    /// # 返回值
    ///
    /// 返回 `ReconcileResult`，包含新增注册数、移除注册数和最终活跃 worktree 列表。
    ///
    /// # 使用场景
    ///
    /// - **启动对账**：bootstrap 后调用，恢复崩溃前的注册表状态
    /// - **RPC 触发**：前端打开 workspace 时调用 `git.reconcileWorktrees`
    /// - **创建前对账**：`git.createWorktree` 前调用，确保注册表新鲜
    ///
    /// # 注意事项
    ///
    /// - 本方法不删除磁盘上的 worktree 目录（那是 `cleanup_expired` 的职责）
    /// - 仅托管 `.ydsz-worktrees/` 下的 worktree，避免误纳用户手动创建的 worktree
    /// - 对账失败（非 git 仓库等）不返回错误，仅记录警告并返回空结果
    pub async fn reconcile_repo(&self, repo_cwd: &str) -> ReconcileResult {
        let git_entries = match self.git_core.list_worktrees_porcelain(repo_cwd).await {
            Ok(entries) => entries,
            Err(e) => {
                warn!(
                    "对账失败：无法列出 {} 的 worktree: {}",
                    repo_cwd, e
                );
                return ReconcileResult::default();
            }
        };

        // 仅托管 .ydsz-worktrees/ 下的 worktree（我们创建的）
        let ydsz_worktree_entries: Vec<&super::core::WorktreeListEntry> = git_entries
            .iter()
            .filter(|entry| {
                let path = Path::new(&entry.path);
                path.parent()
                    .map(|parent| parent.file_name().map(|name| name == ".ydsz-worktrees").unwrap_or(false))
                    .unwrap_or(false)
            })
            .collect();

        let mut registered = 0u32;
        let mut removed = 0u32;
        let mut live_paths: Vec<PathBuf> = Vec::with_capacity(ydsz_worktree_entries.len());

        {
            let mut worktrees = self.worktrees.write().await;
            // 1. 注册磁盘有但内存无的 worktree（孤儿）
            for entry in &ydsz_worktree_entries {
                let path = PathBuf::from(&entry.path);
                live_paths.push(path.clone());
                if !worktrees.contains_key(&path) {
                    let now = Utc::now();
                    let branch_name = entry
                        .branch
                        .as_deref()
                        .and_then(|b| b.rsplit('/').next())
                        .unwrap_or("unknown")
                        .to_string();
                    let record = ManagedWorktree {
                        path: path.clone(),
                        thread_id: None, // 对账无法恢复 thread 关联
                        created_at: now,
                        last_active_at: now,
                    };
                    worktrees.insert(path.clone(), record);
                    registered += 1;
                    info!(
                        "对账：注册孤儿 Worktree: {} (branch: {})",
                        path.display(),
                        branch_name
                    );
                }
            }

            // 2. 移除内存有但磁盘无的 worktree（悬空）
            // 仅移除路径属于此 repo 的 .ydsz-worktrees/ 下的，避免误删其它 repo 的记录
            let repo_path = Path::new(repo_cwd);
            let ydsz_worktrees_dir = repo_path
                .parent()
                .map(|parent| parent.join(".ydsz-worktrees"))
                .filter(|dir| dir.is_dir())
                .or_else(|| {
                    // repo_cwd 可能是子目录，回退到 .ydsz-worktrees 不在此 repo 的情况
                    Some(repo_path.join(".ydsz-worktrees"))
                });

            if let Some(ydsz_dir) = ydsz_worktrees_dir {
                let stale_paths: Vec<PathBuf> = worktrees
                    .keys()
                    .filter(|path| path.starts_with(&ydsz_dir) && !live_paths.contains(path))
                    .cloned()
                    .collect();
                for path in stale_paths {
                    worktrees.remove(&path);
                    removed += 1;
                    warn!("对账：移除悬空 Worktree 记录: {}", path.display());
                }
            }
        }

        let worktrees_snapshot = self.list_worktrees().await;
        ReconcileResult {
            registered,
            removed,
            worktrees: worktrees_snapshot,
        }
    }
}

/// 对账结果
///
/// `reconcile_repo` 的返回值，记录本次对账新增/移除的 worktree 数量，
/// 以及对账后的完整活跃 worktree 列表。
#[derive(Debug, Clone, Default, Serialize)]
pub struct ReconcileResult {
    /// 新注册的孤儿 worktree 数量
    pub registered: u32,
    /// 移除的悬空 worktree 记录数量
    pub removed: u32,
    /// 对账后的活跃 worktree 列表
    pub worktrees: Vec<ManagedWorktree>,
}

/// 计算 worktree 路径：`<repo_parent>/.ydsz-worktrees/<branch>`
///
/// 根据仓库路径和分支名计算 Worktree 的存放路径。
/// Worktree 统一存放在仓库同级目录的 `.ydsz-worktrees` 子目录下。
///
/// # 参数
///
/// - `repo_path`: 仓库根路径
/// - `branch_name`: 分支名称（会被清理为安全字符）
///
/// # 返回值
///
/// 返回 Worktree 的绝对路径，格式为 `<repo_parent>/.ydsz-worktrees/<sanitized_branch>`。
fn compute_worktree_path(repo_path: &str, branch_name: &str) -> PathBuf {
    let repo = Path::new(repo_path);
    let parent = repo.parent().unwrap_or(Path::new("."));
    let safe_branch = sanitize_branch_name(branch_name);
    parent.join(".ydsz-worktrees").join(safe_branch)
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
        assert!(p.to_string_lossy().contains(".ydsz-worktrees"));
        assert!(p.to_string_lossy().ends_with("feature-1"));
    }

    #[tokio::test]
    async fn register_existing_worktree_inserts_record_with_thread_id() {
        // register_existing_worktree 不执行 git 命令,因此无需真实 git 仓库,
        // 仅验证注册表写入与 thread_id 反查。
        let git_core = Arc::new(GitCore::new());
        let svc = ManagedWorktreeService::new(git_core, ManagedWorktreeConfig::default());

        let worktree_path = "/tmp/fake-wt-feature".to_string();
        svc.register_existing_worktree("/tmp/fake-repo", &worktree_path, "feature-x", Some("thread-001"))
            .await
            .expect("register");

        let listed = svc.list_worktrees().await;
        assert_eq!(listed.len(), 1, "注册表应只有 1 条记录");
        let record = &listed[0];
        assert_eq!(record.path.to_string_lossy(), worktree_path);
        assert_eq!(record.thread_id.as_deref(), Some("thread-001"));

        // 按 thread 反查应能命中
        let found = svc.get_worktree_by_thread("thread-001").await;
        assert!(found.is_some(), "thread_id 反查应命中");
        assert_eq!(found.unwrap().path.to_string_lossy(), worktree_path);

        // 不存在的 thread 应返回 None
        assert!(svc.get_worktree_by_thread("thread-404").await.is_none());
    }

    #[tokio::test]
    async fn register_existing_worktree_overwrites_same_path() {
        let git_core = Arc::new(GitCore::new());
        let svc = ManagedWorktreeService::new(git_core, ManagedWorktreeConfig::default());
        let wt = "/tmp/fake-wt-overwrite".to_string();

        // 第一次注册:thread-A
        svc.register_existing_worktree("/tmp/fake-repo", &wt, "b1", Some("thread-A"))
            .await
            .expect("register 1");
        // 第二次注册同路径:thread-B,应覆盖
        svc.register_existing_worktree("/tmp/fake-repo", &wt, "b1", Some("thread-B"))
            .await
            .expect("register 2");

        let listed = svc.list_worktrees().await;
        assert_eq!(listed.len(), 1, "同路径应被覆盖,仍为 1 条");
        assert_eq!(listed[0].thread_id.as_deref(), Some("thread-B"));
    }

    #[tokio::test]
    async fn register_existing_worktree_without_thread_id() {
        let git_core = Arc::new(GitCore::new());
        let svc = ManagedWorktreeService::new(git_core, ManagedWorktreeConfig::default());

        svc.register_existing_worktree("/tmp/fake-repo", "/tmp/fake-wt-no-thread", "b", None)
            .await
            .expect("register");

        let listed = svc.list_worktrees().await;
        assert_eq!(listed.len(), 1);
        assert!(listed[0].thread_id.is_none(), "thread_id 应为 None");
    }

    #[tokio::test]
    async fn unregister_worktree_removes_record_and_is_idempotent() {
        let git_core = Arc::new(GitCore::new());
        let svc = ManagedWorktreeService::new(git_core, ManagedWorktreeConfig::default());

        let wt = "/tmp/fake-wt-unregister".to_string();
        svc.register_existing_worktree("/tmp/fake-repo", &wt, "b", Some("thread-X"))
            .await
            .expect("register");
        assert_eq!(svc.list_worktrees().await.len(), 1);

        // 第一次注销:应返回 true
        let removed = svc.unregister_worktree(&wt).await;
        assert!(removed, "首次注销应返回 true");
        assert!(svc.list_worktrees().await.is_empty(), "注销后注册表应为空");
        assert!(
            svc.get_worktree_by_thread("thread-X").await.is_none(),
            "注销后按 thread 反查应为 None"
        );

        // 第二次注销(幂等):应返回 false
        let removed_again = svc.unregister_worktree(&wt).await;
        assert!(!removed_again, "二次注销应返回 false(幂等)");
    }
}