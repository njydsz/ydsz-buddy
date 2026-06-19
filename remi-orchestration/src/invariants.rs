//! # 命令校验模块
//!
//! 本模块实现了编排命令的前置条件校验逻辑,确保命令在执行前满足所有必要的不变量。
//!
//! ## 核心职责
//!
//! - 验证项目/线程的存在性或不存在性
//! - 检查线程的归档状态
//! - 验证工作区路径的可用性
//! - 确保命令参数的合法性
//!
//! ## 设计原则
//!
//! - 所有校验函数返回 `OrchestrationResult<()>`
//! - 校验失败时返回 `OrchestrationError::CommandError`
//! - 校验逻辑应尽可能高效,避免不必要的数据库查询

use remi_core::models::{ProjectId, ThreadId};
use remi_persistence::ProjectionRepository;

use crate::error::{OrchestrationError, OrchestrationResult};

/// 校验项目必须存在
///
/// # 参数
///
/// - `projection_repo`: 投影仓库引用
/// - `project_id`: 项目ID
///
/// # 错误
///
/// 当项目不存在时返回 `CommandError`
pub fn require_project_exists(
    projection_repo: &dyn ProjectionRepository,
    project_id: ProjectId,
) -> OrchestrationResult<()> {
    let project = projection_repo.get_project(project_id)?;
    if project.is_none() {
        return Err(OrchestrationError::CommandError(format!(
            "Project {} does not exist",
            project_id
        )));
    }
    Ok(())
}

/// 校验项目必须不存在
///
/// # 参数
///
/// - `projection_repo`: 投影仓库引用
/// - `project_id`: 项目ID
///
/// # 错误
///
/// 当项目已存在时返回 `CommandError`
pub fn require_project_not_exists(
    projection_repo: &dyn ProjectionRepository,
    project_id: ProjectId,
) -> OrchestrationResult<()> {
    let project = projection_repo.get_project(project_id)?;
    if project.is_some() {
        return Err(OrchestrationError::CommandError(format!(
            "Project {} already exists",
            project_id
        )));
    }
    Ok(())
}

/// 校验线程必须存在
///
/// # 参数
///
/// - `projection_repo`: 投影仓库引用
/// - `thread_id`: 线程ID
///
/// # 错误
///
/// 当线程不存在时返回 `CommandError`
pub fn require_thread_exists(
    projection_repo: &dyn ProjectionRepository,
    thread_id: ThreadId,
) -> OrchestrationResult<()> {
    let thread = projection_repo.get_thread(thread_id)?;
    if thread.is_none() {
        return Err(OrchestrationError::CommandError(format!(
            "Thread {} does not exist",
            thread_id
        )));
    }
    Ok(())
}

/// 校验线程必须不存在
///
/// # 参数
///
/// - `projection_repo`: 投影仓库引用
/// - `thread_id`: 线程ID
///
/// # 错误
///
/// 当线程已存在时返回 `CommandError`
pub fn require_thread_not_exists(
    projection_repo: &dyn ProjectionRepository,
    thread_id: ThreadId,
) -> OrchestrationResult<()> {
    let thread = projection_repo.get_thread(thread_id)?;
    if thread.is_some() {
        return Err(OrchestrationError::CommandError(format!(
            "Thread {} already exists",
            thread_id
        )));
    }
    Ok(())
}

/// 校验线程必须已归档
///
/// # 参数
///
/// - `projection_repo`: 投影仓库引用
/// - `thread_id`: 线程ID
///
/// # 错误
///
/// 当线程未归档或不存在时返回 `CommandError`
pub fn require_thread_archived(
    projection_repo: &dyn ProjectionRepository,
    thread_id: ThreadId,
) -> OrchestrationResult<()> {
    let thread = projection_repo
        .get_thread(thread_id)?
        .ok_or_else(|| OrchestrationError::CommandError(format!("Thread {} not found", thread_id)))?;

    if thread.archived_at.is_none() {
        return Err(OrchestrationError::CommandError(format!(
            "Thread {} is not archived",
            thread_id
        )));
    }
    Ok(())
}

/// 校验线程必须未归档
///
/// # 参数
///
/// - `projection_repo`: 投影仓库引用
/// - `thread_id`: 线程ID
///
/// # 错误
///
/// 当线程已归档或不存在时返回 `CommandError`
pub fn require_thread_not_archived(
    projection_repo: &dyn ProjectionRepository,
    thread_id: ThreadId,
) -> OrchestrationResult<()> {
    let thread = projection_repo
        .get_thread(thread_id)?
        .ok_or_else(|| OrchestrationError::CommandError(format!("Thread {} not found", thread_id)))?;

    if thread.archived_at.is_some() {
        return Err(OrchestrationError::CommandError(format!(
            "Thread {} is already archived",
            thread_id
        )));
    }
    Ok(())
}

/// 校验项目必须没有关联的线程
///
/// # 参数
///
/// - `projection_repo`: 投影仓库引用
/// - `project_id`: 项目ID
///
/// # 错误
///
/// 当项目存在关联线程时返回 `CommandError`
pub fn require_project_has_no_threads(
    projection_repo: &dyn ProjectionRepository,
    project_id: ProjectId,
) -> OrchestrationResult<()> {
    let threads = projection_repo.list_threads_by_project(project_id)?;
    if !threads.is_empty() {
        return Err(OrchestrationError::CommandError(format!(
            "Project {} has {} associated threads",
            project_id,
            threads.len()
        )));
    }
    Ok(())
}

/// 校验工作区路径必须可用(未被其他项目占用)
///
/// # 参数
///
/// - `projection_repo`: 投影仓库引用
/// - `workspace_root`: 工作区路径
/// - `exclude_project_id`: 排除的项目ID(用于更新场景)
///
/// # 错误
///
/// 当工作区路径已被其他项目占用时返回 `CommandError`
pub fn require_workspace_root_available(
    projection_repo: &dyn ProjectionRepository,
    workspace_root: &str,
    exclude_project_id: Option<ProjectId>,
) -> OrchestrationResult<()> {
    let projects = projection_repo.list_projects()?;
    let conflicting = projects.iter().find(|p| {
        p.workspace_root == workspace_root
            && exclude_project_id.map_or(true, |exclude_id| p.id != exclude_id)
            && p.deleted_at.is_none()
    });

    if let Some(conflict) = conflicting {
        return Err(OrchestrationError::CommandError(format!(
            "Workspace root '{}' is already used by project {}",
            workspace_root, conflict.id
        )));
    }
    Ok(())
}

/// 校验线程必须属于指定项目
///
/// # 参数
///
/// - `projection_repo`: 投影仓库引用
/// - `thread_id`: 线程ID
/// - `project_id`: 项目ID
///
/// # 错误
///
/// 当线程不属于指定项目时返回 `CommandError`
pub fn require_thread_in_project(
    projection_repo: &dyn ProjectionRepository,
    thread_id: ThreadId,
    project_id: ProjectId,
) -> OrchestrationResult<()> {
    let thread = projection_repo
        .get_thread(thread_id)?
        .ok_or_else(|| OrchestrationError::CommandError(format!("Thread {} not found", thread_id)))?;

    if thread.project_id != project_id {
        return Err(OrchestrationError::CommandError(format!(
            "Thread {} does not belong to project {}",
            thread_id, project_id
        )));
    }
    Ok(())
}

/// 校验消息必须存在于线程中
///
/// # 参数
///
/// - `projection_repo`: 投影仓库引用
/// - `thread_id`: 线程ID
/// - `message_id`: 消息ID
///
/// # 错误
///
/// 当消息不存在时返回 `CommandError`
pub fn require_message_exists(
    projection_repo: &dyn ProjectionRepository,
    thread_id: ThreadId,
    message_id: &str,
) -> OrchestrationResult<()> {
    let thread = projection_repo
        .get_thread(thread_id)?
        .ok_or_else(|| OrchestrationError::CommandError(format!("Thread {} not found", thread_id)))?;

    let message_exists = thread.messages.iter().any(|m| m.id.to_string() == message_id);
    if !message_exists {
        return Err(OrchestrationError::CommandError(format!(
            "Message {} not found in thread {}",
            message_id, thread_id
        )));
    }
    Ok(())
}

/// 校验Turn必须处于运行状态
///
/// # 参数
///
/// - `projection_repo`: 投影仓库引用
/// - `thread_id`: 线程ID
/// - `turn_id`: Turn ID
///
/// # 错误
///
/// 当Turn不存在或未运行时返回 `CommandError`
pub fn require_turn_running(
    projection_repo: &dyn ProjectionRepository,
    thread_id: ThreadId,
    turn_id: &str,
) -> OrchestrationResult<()> {
    let thread = projection_repo
        .get_thread(thread_id)?
        .ok_or_else(|| OrchestrationError::CommandError(format!("Thread {} not found", thread_id)))?;

    let turn = thread
        .turns
        .iter()
        .find(|t| t.id.to_string() == turn_id)
        .ok_or_else(|| {
            OrchestrationError::CommandError(format!(
                "Turn {} not found in thread {}",
                turn_id, thread_id
            ))
        })?;

    if !turn.is_running() {
        return Err(OrchestrationError::CommandError(format!(
            "Turn {} is not running (status: {:?})",
            turn_id, turn.status
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use remi_persistence::SqliteProjectionRepository;
    use std::sync::Arc;
    use tempfile::TempDir;

    fn setup_test_repo() -> Arc<SqliteProjectionRepository> {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        Arc::new(SqliteProjectionRepository::new(db_path.to_str().unwrap()).unwrap())
    }

    #[test]
    fn test_require_project_exists() {
        let repo = setup_test_repo();
        let project_id = uuid::Uuid::new_v4();

        // 项目不存在时应返回错误
        let result = require_project_exists(repo.as_ref(), project_id);
        assert!(result.is_err());
    }

    #[test]
    fn test_require_thread_not_exists() {
        let repo = setup_test_repo();
        let thread_id = uuid::Uuid::new_v4();

        // 线程不存在时应成功
        let result = require_thread_not_exists(repo.as_ref(), thread_id);
        assert!(result.is_ok());
    }
}
