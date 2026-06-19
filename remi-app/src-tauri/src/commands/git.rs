use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

use remi_git::{GitCore, GitManager, GitStatusBroadcaster};

/// Git 状态结构（前端序列化）
#[derive(Debug, Serialize)]
pub struct GitStatus {
    pub branch: String,
    pub changes: Vec<GitChange>,
    pub ahead: usize,
    pub behind: usize,
}

/// Git 变更结构
#[derive(Debug, Serialize)]
pub struct GitChange {
    pub path: String,
    pub status: String,
}

/// Git 服务状态
pub struct GitState {
    core: Arc<GitCore>,
    manager: Arc<GitManager>,
    broadcaster: Arc<GitStatusBroadcaster>,
}

impl GitState {
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

    pub fn core(&self) -> &Arc<GitCore> {
        &self.core
    }

    pub fn manager(&self) -> &Arc<GitManager> {
        &self.manager
    }

    pub fn broadcaster(&self) -> &Arc<GitStatusBroadcaster> {
        &self.broadcaster
    }
}

/// 获取 Git 状态
#[tauri::command]
pub async fn git_status(
    state: State<'_, GitState>,
    cwd: String,
) -> Result<GitStatus, String> {
    let status = state.broadcaster().get_status(&cwd).await.map_err(|e| e.to_string())?;

    // 转换为前端格式
    let mut changes = Vec::new();

    for file in &status.staged_files {
        changes.push(GitChange {
            path: file.clone(),
            status: "staged".to_string(),
        });
    }

    for file in &status.modified_files {
        changes.push(GitChange {
            path: file.clone(),
            status: "modified".to_string(),
        });
    }

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

/// 列出 Git 分支
#[tauri::command]
pub async fn git_list_branches(
    state: State<'_, GitState>,
    cwd: String,
) -> Result<Vec<String>, String> {
    state.core().list_branches(&cwd).await.map_err(|e| e.to_string())
}

/// 切换分支
#[tauri::command]
pub async fn git_checkout(
    state: State<'_, GitState>,
    cwd: String,
    branch: String,
) -> Result<(), String> {
    state.core().checkout_branch(&cwd, &branch).await.map_err(|e| e.to_string())
}

/// 提交更改
#[tauri::command]
pub async fn git_commit(
    state: State<'_, GitState>,
    cwd: String,
    message: String,
) -> Result<(), String> {
    state.core().commit(&cwd, &message).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// 推送当前分支
#[tauri::command]
pub async fn git_push(
    state: State<'_, GitState>,
    cwd: String,
) -> Result<(), String> {
    state.core().push_current_branch(&cwd).await.map_err(|e| e.to_string())
}

/// 拉取当前分支
#[tauri::command]
pub async fn git_pull(
    state: State<'_, GitState>,
    cwd: String,
) -> Result<(), String> {
    state.core().pull_current_branch(&cwd).await.map_err(|e| e.to_string())
}

/// 获取 diff
#[tauri::command]
pub async fn git_diff(
    state: State<'_, GitState>,
    cwd: String,
    staged: bool,
) -> Result<String, String> {
    state.core().diff(&cwd, staged).await.map_err(|e| e.to_string())
}

/// 获取 Git 日志
#[tauri::command]
pub async fn git_log(
    state: State<'_, GitState>,
    cwd: String,
    max_count: Option<usize>,
) -> Result<String, String> {
    state.core().log(&cwd, max_count.unwrap_or(50)).await.map_err(|e| e.to_string())
}

/// 创建分支
#[tauri::command]
pub async fn git_create_branch(
    state: State<'_, GitState>,
    cwd: String,
    branch_name: String,
) -> Result<(), String> {
    state.core().create_branch(&cwd, &branch_name).await.map_err(|e| e.to_string())
}

/// 暂存更改
#[tauri::command]
pub async fn git_stash(
    state: State<'_, GitState>,
    cwd: String,
) -> Result<(), String> {
    state.core().stash(&cwd).await.map_err(|e| e.to_string())
}

/// 恢复暂存
#[tauri::command]
pub async fn git_stash_pop(
    state: State<'_, GitState>,
    cwd: String,
) -> Result<(), String> {
    state.core().stash_pop(&cwd).await.map_err(|e| e.to_string())
}
