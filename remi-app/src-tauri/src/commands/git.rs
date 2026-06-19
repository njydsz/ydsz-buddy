//! # Git 版本控制命令模块
//!
//! 本模块提供与 Git 版本控制相关的 Tauri 命令，支持仓库状态查询、分支管理、提交、推送等操作。
//!
//! ## 模块职责
//!
//! - 封装 `remi_git` 库的能力，提供前端可调用的 Git 操作命令
//! - 管理 Git 服务状态（核心、管理器、广播器）
//! - 将 Git 状态转换为前端可序列化的格式
//!
//! ## 核心功能
//!
//! 1. **状态查询**：获取当前分支、变更文件列表、ahead/behind 信息
//! 2. **分支管理**：列出分支、切换分支、创建分支
//! 3. **提交操作**：提交更改、暂存/恢复暂存
//! 4. **远程操作**：推送、拉取
//! 5. **差异查询**：获取文件差异（staged/unstaged）
//! 6. **日志查询**：获取提交历史
//!
//! ## 使用场景
//!
//! - 前端需要显示 Git 状态面板时调用 `git_status`
//! - 用户需要切换分支时调用 `git_checkout`
//! - 用户需要提交代码时调用 `git_commit`
//! - 用户需要同步远程仓库时调用 `git_push` / `git_pull`
//!
//! ## 依赖说明
//!
//! 本模块依赖 `remi_git` 库提供的 `GitCore`、`GitManager`、`GitStatusBroadcaster`。

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

use remi_git::{GitCore, GitManager, GitStatusBroadcaster};

/// Git 状态结构（前端序列化）
///
/// 用于向前端返回 Git 仓库的当前状态信息。
///
/// # 字段说明
///
/// - `branch`: 当前分支名称（如果是 detached HEAD 则为 "HEAD"）
/// - `changes`: 变更文件列表（包括 staged、modified、untracked）
/// - `ahead`: 领先远程的提交数（当前未实现，始终为 0）
/// - `behind`: 落后远程的提交数（当前未实现，始终为 0）
///
/// # 使用场景
///
/// 前端通过 `git_status` 命令获取该结构，用于渲染 Git 状态面板。
#[derive(Debug, Serialize)]
pub struct GitStatus {
    /// 当前分支名称
    pub branch: String,
    /// 变更文件列表
    pub changes: Vec<GitChange>,
    /// 领先远程的提交数
    pub ahead: usize,
    /// 落后远程的提交数
    pub behind: usize,
}

/// Git 变更结构
///
/// 表示单个文件的变更状态。
///
/// # 字段说明
///
/// - `path`: 文件路径（相对于仓库根目录）
/// - `status`: 变更状态，可能的值：
///   - `"staged"`: 已暂存（等待提交）
///   - `"modified"`: 已修改（未暂存）
///   - `"untracked"`: 未跟踪（新文件）
///
/// # 使用场景
///
/// 作为 `GitStatus` 的组成部分，用于向前端展示变更文件列表。
#[derive(Debug, Serialize)]
pub struct GitChange {
    /// 文件路径
    pub path: String,
    /// 变更状态
    pub status: String,
}

/// Git 服务状态
///
/// 持有 Git 相关的核心服务实例，通过 Arc 实现共享所有权。
///
/// # 字段说明
///
/// - `core`: Git 核心操作实例，提供底层 Git 命令执行能力
/// - `manager`: Git 管理器实例，提供高级 Git 操作（当前未使用）
/// - `broadcaster`: Git 状态广播器实例，定期轮询并缓存仓库状态
///
/// # 使用场景
///
/// 在 `lib.rs` 中通过 `.manage(GitState::new())` 注入，
/// 各命令通过 `State<'_, GitState>` 参数获取该状态。
pub struct GitState {
    core: Arc<GitCore>,
    manager: Arc<GitManager>,
    broadcaster: Arc<GitStatusBroadcaster>,
}

impl GitState {
    /// 创建新的 Git 服务状态
    ///
    /// 初始化 GitCore、GitManager 和 GitStatusBroadcaster 实例。
    ///
    /// # 返回值
    ///
    /// 返回初始化后的 `GitState` 实例
    ///
    /// # 设计说明
    ///
    /// - `GitStatusBroadcaster` 每 30 秒轮询一次仓库状态
    /// - 所有实例通过 `Arc` 包装，支持多线程共享
    pub fn new() -> Self {
        let core = Arc::new(GitCore::new());
        let manager = Arc::new(GitManager::new(core.clone()));
        let broadcaster = Arc::new(GitStatusBroadcaster::new(
            core.clone(),
            std::time::Duration::from_secs(30),
        ));

        Self {
            core,
            manager,
            broadcaster,
        }
    }

    /// 获取 Git 核心实例的引用
    ///
    /// # 返回值
    ///
    /// 返回 `GitCore` 的 Arc 引用
    pub fn core(&self) -> &Arc<GitCore> {
        &self.core
    }

    /// 获取 Git 管理器实例的引用
    ///
    /// # 返回值
    ///
    /// 返回 `GitManager` 的 Arc 引用
    pub fn manager(&self) -> &Arc<GitManager> {
        &self.manager
    }

    /// 获取 Git 状态广播器实例的引用
    ///
    /// # 返回值
    ///
    /// 返回 `GitStatusBroadcaster` 的 Arc 引用
    pub fn broadcaster(&self) -> &Arc<GitStatusBroadcaster> {
        &self.broadcaster
    }
}

/// 获取 Git 状态命令
///
/// 查询指定仓库的 Git 状态，包括当前分支、变更文件列表等。
///
/// # 参数
///
/// - `state`: Git 服务状态（通过 Tauri State 注入）
/// - `cwd`: 仓库工作目录的绝对路径
///
/// # 返回值
///
/// - `Ok(GitStatus)`: 查询成功，返回 Git 状态结构
/// - `Err(String)`: 查询失败（如路径不是 Git 仓库）
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// const status = await window.__TAURI__.invoke('git_status', {
///     cwd: '/path/to/repo'
/// });
/// console.log('当前分支:', status.branch);
/// console.log('变更文件:', status.changes);
/// ```
#[tauri::command]
pub async fn git_status(
    state: State<'_, GitState>,
    cwd: String,
) -> Result<GitStatus, String> {
    // 从广播器获取缓存的状态（避免频繁执行 git 命令）
    let status = state.broadcaster().get_status(&cwd).await.map_err(|e| e.to_string())?;

    // 转换为前端格式
    let mut changes = Vec::new();

    // 添加已暂存的文件
    for file in &status.staged_files {
        changes.push(GitChange {
            path: file.clone(),
            status: "staged".to_string(),
        });
    }

    // 添加已修改但未暂存的文件
    for file in &status.modified_files {
        changes.push(GitChange {
            path: file.clone(),
            status: "modified".to_string(),
        });
    }

    // 添加未跟踪的新文件
    for file in &status.untracked_files {
        changes.push(GitChange {
            path: file.clone(),
            status: "untracked".to_string(),
        });
    }

    Ok(GitStatus {
        branch: status.current_branch.unwrap_or_else(|| "HEAD".to_string()),
        changes,
        ahead: 0, // TODO: 计算 ahead/behind
        behind: 0,
    })
}

/// 列出 Git 分支命令
///
/// 获取指定仓库的所有本地分支名称列表。
///
/// # 参数
///
/// - `state`: Git 服务状态
/// - `cwd`: 仓库工作目录的绝对路径
///
/// # 返回值
///
/// - `Ok(Vec<String>)`: 查询成功，返回分支名称列表
/// - `Err(String)`: 查询失败
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// const branches = await window.__TAURI__.invoke('git_list_branches', {
///     cwd: '/path/to/repo'
/// });
/// console.log('分支列表:', branches);
/// ```
#[tauri::command]
pub async fn git_list_branches(
    state: State<'_, GitState>,
    cwd: String,
) -> Result<Vec<String>, String> {
    state.core().list_branches(&cwd).await.map_err(|e| e.to_string())
}

/// 切换分支命令
///
/// 将当前工作目录切换到指定的分支。
///
/// # 参数
///
/// - `state`: Git 服务状态
/// - `cwd`: 仓库工作目录的绝对路径
/// - `branch`: 目标分支名称
///
/// # 返回值
///
/// - `Ok(())`: 切换成功
/// - `Err(String)`: 切换失败（如分支不存在、有未提交的更改）
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// await window.__TAURI__.invoke('git_checkout', {
///     cwd: '/path/to/repo',
///     branch: 'feature/new-feature'
/// });
/// ```
#[tauri::command]
pub async fn git_checkout(
    state: State<'_, GitState>,
    cwd: String,
    branch: String,
) -> Result<(), String> {
    state.core().checkout_branch(&cwd, &branch).await.map_err(|e| e.to_string())
}

/// 提交更改命令
///
/// 将暂存区的更改提交到当前分支。
///
/// # 参数
///
/// - `state`: Git 服务状态
/// - `cwd`: 仓库工作目录的绝对路径
/// - `message`: 提交信息（commit message）
///
/// # 返回值
///
/// - `Ok(())`: 提交成功
/// - `Err(String)`: 提交失败（如没有暂存的更改）
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// await window.__TAURI__.invoke('git_commit', {
///     cwd: '/path/to/repo',
///     message: 'feat: add new feature'
/// });
/// ```
#[tauri::command]
pub async fn git_commit(
    state: State<'_, GitState>,
    cwd: String,
    message: String,
) -> Result<(), String> {
    state.core().commit(&cwd, &message).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// 推送当前分支命令
///
/// 将当前分支的提交推送到远程仓库。
///
/// # 参数
///
/// - `state`: Git 服务状态
/// - `cwd`: 仓库工作目录的绝对路径
///
/// # 返回值
///
/// - `Ok(())`: 推送成功
/// - `Err(String)`: 推送失败（如远程有更新、网络错误）
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// await window.__TAURI__.invoke('git_push', {
///     cwd: '/path/to/repo'
/// });
/// ```
#[tauri::command]
pub async fn git_push(
    state: State<'_, GitState>,
    cwd: String,
) -> Result<(), String> {
    state.core().push_current_branch(&cwd).await.map_err(|e| e.to_string())
}

/// 拉取当前分支命令
///
/// 从远程仓库拉取当前分支的最新更改并合并。
///
/// # 参数
///
/// - `state`: Git 服务状态
/// - `cwd`: 仓库工作目录的绝对路径
///
/// # 返回值
///
/// - `Ok(())`: 拉取成功
/// - `Err(String)`: 拉取失败（如合并冲突、网络错误）
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// await window.__TAURI__.invoke('git_pull', {
///     cwd: '/path/to/repo'
/// });
/// ```
#[tauri::command]
pub async fn git_pull(
    state: State<'_, GitState>,
    cwd: String,
) -> Result<(), String> {
    state.core().pull_current_branch(&cwd).await.map_err(|e| e.to_string())
}

/// 获取差异命令
///
/// 获取工作区或暂存区的文件差异（diff）。
///
/// # 参数
///
/// - `state`: Git 服务状态
/// - `cwd`: 仓库工作目录的绝对路径
/// - `staged`: 是否获取暂存区的差异（true）或工作区的差异（false）
///
/// # 返回值
///
/// - `Ok(String)`: 查询成功，返回 diff 格式的字符串
/// - `Err(String)`: 查询失败
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// const diff = await window.__TAURI__.invoke('git_diff', {
///     cwd: '/path/to/repo',
///     staged: false  // 获取未暂存的更改
/// });
/// console.log(diff);
/// ```
#[tauri::command]
pub async fn git_diff(
    state: State<'_, GitState>,
    cwd: String,
    staged: bool,
) -> Result<String, String> {
    state.core().diff(&cwd, staged).await.map_err(|e| e.to_string())
}

/// 获取 Git 日志命令
///
/// 获取当前分支的提交历史记录。
///
/// # 参数
///
/// - `state`: Git 服务状态
/// - `cwd`: 仓库工作目录的绝对路径
/// - `max_count`: 可选的最大返回提交数，默认为 50
///
/// # 返回值
///
/// - `Ok(String)`: 查询成功，返回日志字符串（格式取决于 GitCore 实现）
/// - `Err(String)`: 查询失败
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// const log = await window.__TAURI__.invoke('git_log', {
///     cwd: '/path/to/repo',
///     max_count: 20  // 只获取最近 20 条提交
/// });
/// console.log(log);
/// ```
#[tauri::command]
pub async fn git_log(
    state: State<'_, GitState>,
    cwd: String,
    max_count: Option<usize>,
) -> Result<String, String> {
    state.core().log(&cwd, max_count.unwrap_or(50)).await.map_err(|e| e.to_string())
}

/// 创建分支命令
///
/// 在当前 HEAD 位置创建新的分支（不切换）。
///
/// # 参数
///
/// - `state`: Git 服务状态
/// - `cwd`: 仓库工作目录的绝对路径
/// - `branch_name`: 新分支名称
///
/// # 返回值
///
/// - `Ok(())`: 创建成功
/// - `Err(String)`: 创建失败（如分支已存在）
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// await window.__TAURI__.invoke('git_create_branch', {
///     cwd: '/path/to/repo',
///     branch_name: 'feature/new-feature'
/// });
/// ```
#[tauri::command]
pub async fn git_create_branch(
    state: State<'_, GitState>,
    cwd: String,
    branch_name: String,
) -> Result<(), String> {
    state.core().create_branch(&cwd, &branch_name).await.map_err(|e| e.to_string())
}

/// 暂存更改命令
///
/// 将当前工作区的更改暂存起来（git stash），恢复工作区到干净状态。
///
/// # 参数
///
/// - `state`: Git 服务状态
/// - `cwd`: 仓库工作目录的绝对路径
///
/// # 返回值
///
/// - `Ok(())`: 暂存成功
/// - `Err(String)`: 暂存失败
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// await window.__TAURI__.invoke('git_stash', {
///     cwd: '/path/to/repo'
/// });
/// ```
#[tauri::command]
pub async fn git_stash(
    state: State<'_, GitState>,
    cwd: String,
) -> Result<(), String> {
    state.core().stash(&cwd).await.map_err(|e| e.to_string())
}

/// 恢复暂存命令
///
/// 恢复最近一次暂存的更改到工作区（git stash pop）。
///
/// # 参数
///
/// - `state`: Git 服务状态
/// - `cwd`: 仓库工作目录的绝对路径
///
/// # 返回值
///
/// - `Ok(())`: 恢复成功
/// - `Err(String)`: 恢复失败（如没有可恢复的暂存、存在冲突）
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// await window.__TAURI__.invoke('git_stash_pop', {
///     cwd: '/path/to/repo'
/// });
/// ```
#[tauri::command]
pub async fn git_stash_pop(
    state: State<'_, GitState>,
    cwd: String,
) -> Result<(), String> {
    state.core().stash_pop(&cwd).await.map_err(|e| e.to_string())
}
