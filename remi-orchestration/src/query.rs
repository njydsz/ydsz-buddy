//! 读模型查询服务模块
//!
//! 本模块提供对编排引擎读模型（投影数据）的查询接口，支持：
//! - 完整快照查询（包含所有项目和线程的完整信息）
//! - Shell 快照查询（仅包含基本信息，适用于列表展示）
//! - 单个线程/项目的详情查询
//! - 投影数据统计（项目数、线程数）
//!
//! 查询服务独立于编排引擎，可直接从投影仓库读取数据，
//! 适用于不需要命令分发能力的只读场景。

use std::sync::Arc;

use remi_core::models::{Project, ProjectId, Thread, ThreadId};
use remi_persistence::{ProjectionRepository, SqliteProjectionRepository};

use crate::error::OrchestrationResult;
use crate::engine::{OrchestrationReadModel, OrchestrationShellSnapshot, ShellProject, ShellThread};

/// 投影快照查询服务
///
/// 提供对投影仓库（读模型）的查询能力，独立于编排引擎的命令分发流程。
/// 适用于前端展示、状态查询等只读场景。
///
/// # 使用场景
///
/// - 前端页面加载时获取完整项目/线程列表
/// - 轮询获取 Shell 快照以更新界面状态
/// - 查询单个项目或线程的详细信息
/// - 获取系统统计数据（项目数、线程数）
pub struct ProjectionSnapshotQuery {
    /// 投影仓库实例，用于读取物化视图数据
    projection_repo: Arc<SqliteProjectionRepository>,
}

impl ProjectionSnapshotQuery {
    /// 创建新的查询服务实例
    ///
    /// # 参数
    ///
    /// - `projection_repo`: 投影仓库实例，提供对读模型的访问能力
    ///
    /// # 返回值
    ///
    /// 返回配置完成的查询服务实例。
    pub fn new(projection_repo: Arc<SqliteProjectionRepository>) -> Self {
        Self { projection_repo }
    }

    /// 获取完整的编排读模型快照
    ///
    /// 从投影仓库中读取所有项目和线程的完整信息，构造完整的读模型快照。
    ///
    /// # 返回值
    ///
    /// 成功时返回 [`OrchestrationReadModel`]，包含：
    /// - 所有项目的完整信息
    /// - 所有线程的完整信息
    /// - 快照生成时间戳
    ///
    /// # 注意事项
    ///
    /// 当前实现中 `snapshot_sequence` 固定为 0，
    /// 如需准确的序列号，应通过 [`OrchestrationEngine::get_snapshot`] 获取。
    pub async fn get_snapshot(&self) -> OrchestrationResult<OrchestrationReadModel> {
        let projects = self.projection_repo.list_projects()?;
        let threads = self.projection_repo.list_threads()?;

        Ok(OrchestrationReadModel {
            snapshot_sequence: 0, // 需要从引擎获取准确的序列号
            projects,
            threads,
            updated_at: chrono::Utc::now(),
        })
    }

    /// 获取轻量级 Shell 快照
    ///
    /// 从投影仓库中读取项目和线程的基本信息，构造精简的 Shell 快照。
    /// 不包含消息、活动、检查点等详细数据，传输体积更小。
    ///
    /// # 返回值
    ///
    /// 成功时返回 [`OrchestrationShellSnapshot`]，包含：
    /// - 项目精简信息（ID、标题、工作区路径）
    /// - 线程精简信息（ID、所属项目、标题、运行模式、状态标识）
    /// - 快照生成时间戳
    ///
    /// # 使用场景
    ///
    /// 适用于前端列表展示、状态轮询等对数据量敏感的场景。
    pub async fn get_shell_snapshot(&self) -> OrchestrationResult<OrchestrationShellSnapshot> {
        let projects = self.projection_repo.list_projects()?;
        let threads = self.projection_repo.list_threads()?;

        // 将完整项目数据映射为精简的 Shell 项目数据
        let shell_projects: Vec<ShellProject> = projects
            .into_iter()
            .map(|p| ShellProject {
                id: p.id,
                title: p.title,
                workspace_root: p.workspace_root,
            })
            .collect();

        // 将完整线程数据映射为精简的 Shell 线程数据
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

    /// 获取单个线程的详细信息
    ///
    /// 根据线程 ID 查询线程的完整信息，包括消息、活动、检查点等详细数据。
    ///
    /// # 参数
    ///
    /// - `thread_id`: 待查询线程的唯一标识
    ///
    /// # 返回值
    ///
    /// - `Ok(Some(Thread))`: 找到对应线程，返回其完整信息
    /// - `Ok(None)`: 未找到对应线程
    /// - `Err(_)`: 查询过程中发生错误
    pub async fn get_thread_detail(&self, thread_id: ThreadId) -> OrchestrationResult<Option<Thread>> {
        let thread = self.projection_repo.get_thread(thread_id)?;
        Ok(thread)
    }

    /// 获取单个项目的详细信息
    ///
    /// 根据项目 ID 查询项目的完整信息。
    ///
    /// # 参数
    ///
    /// - `project_id`: 待查询项目的唯一标识
    ///
    /// # 返回值
    ///
    /// - `Ok(Some(Project))`: 找到对应项目，返回其完整信息
    /// - `Ok(None)`: 未找到对应项目
    /// - `Err(_)`: 查询过程中发生错误
    pub async fn get_project_detail(&self, project_id: ProjectId) -> OrchestrationResult<Option<Project>> {
        let project = self.projection_repo.get_project(project_id)?;
        Ok(project)
    }

    /// 获取投影数据统计
    ///
    /// 统计当前投影仓库中的项目数量和线程数量，用于监控和展示。
    ///
    /// # 返回值
    ///
    /// 成功时返回 [`ProjectionCounts`]，包含：
    /// - `project_count`: 项目总数
    /// - `thread_count`: 线程总数
    pub async fn get_counts(&self) -> OrchestrationResult<ProjectionCounts> {
        let projects = self.projection_repo.list_projects()?;
        let threads = self.projection_repo.list_threads()?;

        Ok(ProjectionCounts {
            project_count: projects.len(),
            thread_count: threads.len(),
        })
    }
}

/// 投影数据统计
///
/// 记录当前投影仓库中的实体数量，用于系统监控和状态展示。
///
/// # 字段说明
///
/// - `project_count`: 项目总数
/// - `thread_count`: 线程总数
#[derive(Debug, Clone)]
pub struct ProjectionCounts {
    /// 项目总数
    pub project_count: usize,
    /// 线程总数
    pub thread_count: usize,
}
