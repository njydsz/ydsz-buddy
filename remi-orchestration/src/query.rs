//! # 读模型查询服务模块
//!
//! 本模块提供对编排引擎读模型（投影数据）的查询接口，是 CQRS 架构中查询侧的核心组件。
//!
//! ## 核心功能
//!
//! - **完整快照查询**：返回包含所有项目和线程完整信息的 [`OrchestrationReadModel`]
//! - **Shell 快照查询**：返回仅包含基本信息的精简快照 [`OrchestrationShellSnapshot`]，适用于列表展示
//! - **详情查询**：支持单个线程/项目的详细信息查询
//! - **数据统计**：提供投影数据统计（项目数、线程数）
//!
//! ## 架构位置
//!
//! ```text
//! ┌──────────────────────────────────────────────────┐
//! │              查询侧 (Query Side)                  │
//! │                                                    │
//! │  ┌─────────────────────┐                          │
//! │  │ ProjectionSnapshotQuery │                      │
//! │  ├─────────────────────┤                          │
//! │  │ get_snapshot()          │ ← 完整快照            │
//! │  │ get_shell_snapshot()    │ ← 精简快照            │
//! │  │ get_thread_detail()     │ ← 线程详情            │
//! │  │ get_project_detail()    │ ← 项目详情            │
//! │  │ get_counts()            │ ← 数据统计            │
//! │  └──────────┬──────────┘                          │
//! │             │                                      │
//! │             ↓                                      │
//! │  ┌─────────────────────┐                          │
//! │  │ SqliteProjectionRepository │                   │
//! │  │     (投影仓库/读模型)     │                     │
//! │  └─────────────────────┘                          │
//! └──────────────────────────────────────────────────┘
//! ```
//!
//! ## 使用场景
//!
//! | 场景 | 推荐接口 | 说明 |
//! |------|---------|------|
//! | 前端页面初始化 | `get_snapshot()` | 获取全量数据 |
//! | 状态轮询/心跳检测 | `get_shell_snapshot()` | 轻量数据，低带宽 |
//! | 线程详情页 | `get_thread_detail()` | 含消息、活动等完整数据 |
//! | 项目详情页 | `get_project_detail()` | 项目完整配置 |
//! | 监控面板 | `get_counts()` | 实体数量统计 |
//!
//! ## 与 Engine 查询接口的区别
//!
//! - **本模块（`ProjectionSnapshotQuery`）**：独立查询服务，直接从投影仓库读取，
//!   适用于不需要命令分发能力的只读场景。`snapshot_sequence` 固定为 0。
//! - **[`OrchestrationEngine::get_snapshot`]**：引擎内置查询，返回准确的 `snapshot_sequence`，
//!   适用于需要版本控制和增量同步的场景。
//!
//! ## 使用示例
//!
//! ```rust,ignore
//! use std::sync::Arc;
//! use remi_orchestration::ProjectionSnapshotQuery;
//! use remi_persistence::SqliteProjectionRepository;
//!
//! // 创建查询服务
//! let query = ProjectionSnapshotQuery::new(
//!     Arc::new(projection_repo),
//! );
//!
//! // 获取 Shell 快照（适用于列表展示）
//! let shell = query.get_shell_snapshot().await?;
//! println!("项目数: {}, 线程数: {}", shell.projects.len(), shell.threads.len());
//!
//! // 获取线程详情
//! if let Some(thread) = query.get_thread_detail(thread_id).await? {
//!     println!("线程标题: {}", thread.title);
//!     println!("消息数: {}", thread.messages.len());
//! }
//!
//! // 获取统计数据
//! let counts = query.get_counts().await?;
//! println!("项目: {}, 线程: {}", counts.project_count, counts.thread_count);
//! ```
//!
//! ## 注意事项
//!
//! - 查询服务直接从投影仓库读取，不经过命令处理流程，因此是**最终一致**的
//! - `snapshot_sequence` 在本模块中固定为 0，如需准确序列号请使用 Engine 接口
//! - 所有查询接口均为异步方法，底层通过 SQLite 读取
//! - 查询操作是只读的，不会修改任何状态

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
#[derive(Debug, Clone, serde::Serialize)]
pub struct ProjectionCounts {
    /// 项目总数
    pub project_count: usize,
    /// 线程总数
    pub thread_count: usize,
}
