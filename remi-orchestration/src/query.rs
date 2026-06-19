//! 读模型查询服务

use std::sync::Arc;

use remi_core::models::{Project, ProjectId, Thread, ThreadId};
use remi_persistence::{ProjectionRepository, SqliteProjectionRepository};

use crate::error::{OrchestrationError, OrchestrationResult};
use crate::engine::{OrchestrationReadModel, OrchestrationShellSnapshot, ShellProject, ShellThread};

/// 投影快照查询服务
pub struct ProjectionSnapshotQuery {
    projection_repo: Arc<SqliteProjectionRepository>,
}

impl ProjectionSnapshotQuery {
    /// 创建新的查询服务
    pub fn new(projection_repo: Arc<SqliteProjectionRepository>) -> Self {
        Self { projection_repo }
    }

    /// 获取完整快照
    pub async fn get_snapshot(&self) -> OrchestrationResult<OrchestrationReadModel> {
        let projects = self.projection_repo.list_projects()?;
        let threads = self.projection_repo.list_threads()?;

        Ok(OrchestrationReadModel {
            snapshot_sequence: 0, // 需要从引擎获取
            projects,
            threads,
            updated_at: chrono::Utc::now(),
        })
    }

    /// 获取 Shell 快照
    pub async fn get_shell_snapshot(&self) -> OrchestrationResult<OrchestrationShellSnapshot> {
        let projects = self.projection_repo.list_projects()?;
        let threads = self.projection_repo.list_threads()?;

        let shell_projects: Vec<ShellProject> = projects
            .into_iter()
            .map(|p| ShellProject {
                id: p.id,
                title: p.title,
                workspace_root: p.workspace_root,
            })
            .collect();

        let shell_threads: Vec<ShellThread> = threads
            .into_iter()
            .map(|t| ShellThread {
                id: t.id,
                project_id: t.project_id,
                title: t.title,
                runtime_mode: t.runtime_mode,
                has_pending_approvals: t.has_pending_approvals,
                has_pending_user_input: t.has_pending_user_input,
            })
            .collect();

        Ok(OrchestrationShellSnapshot {
            snapshot_sequence: 0,
            projects: shell_projects,
            threads: shell_threads,
            updated_at: chrono::Utc::now(),
        })
    }

    /// 获取线程详情
    pub async fn get_thread_detail(&self, thread_id: ThreadId) -> OrchestrationResult<Option<Thread>> {
        let thread = self.projection_repo.get_thread(thread_id)?;
        Ok(thread)
    }

    /// 获取项目详情
    pub async fn get_project_detail(&self, project_id: ProjectId) -> OrchestrationResult<Option<Project>> {
        let project = self.projection_repo.get_project(project_id)?;
        Ok(project)
    }

    /// 获取投影计数
    pub async fn get_counts(&self) -> OrchestrationResult<ProjectionCounts> {
        let projects = self.projection_repo.list_projects()?;
        let threads = self.projection_repo.list_threads()?;

        Ok(ProjectionCounts {
            project_count: projects.len(),
            thread_count: threads.len(),
        })
    }
}

/// 投影计数
#[derive(Debug, Clone)]
pub struct ProjectionCounts {
    pub project_count: usize,
    pub thread_count: usize,
}
