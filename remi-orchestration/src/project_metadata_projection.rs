//! # 项目元数据投影模块
//!
//! 本模块负责维护项目（Project）的元数据投影。
//!
//! ## 模块职责
//!
//! - **元数据派生**：从事件流派生项目元数据（标签、最近活动、统计信息等）
//! - **统计信息**：维护线程数、消息数、活跃度等聚合指标
//! - **缓存维护**：提供轻量级的内存索引以加速项目列表查询
//! - **变更通知**：在元数据变更时发出通知供订阅者消费
//!
//! ## 投影结构
//!
//! ```text
//! ProjectMetadataProjection
//! ├── id, title, workspace_root
//! ├── thread_count, active_thread_count
//! ├── last_activity_at
//! ├── tags
//! └── derived_at
//! ```
//!
//! ## 派生时机
//!
//! - 项目创建（`ProjectCreated`）
//! - 项目元数据更新（`ProjectMetaUpdated`）
//! - 线程创建（`ThreadCreated`）—— 递增线程计数并建立 thread_id → project_id 索引
//! - 线程删除/归档（`ThreadDeleted` / `ThreadArchived`）—— 通过索引定位项目后递减计数
//! - 任何消息事件（`ThreadMessageSent`）—— 通过索引更新时间戳

use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, RwLock};
use tracing::debug;

use remi_core::events::OrchestrationEvent;
use remi_core::models::{ProjectId, ThreadId};

use crate::error::OrchestrationResult;

/// 派生的项目元数据投影
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMetadataProjection {
    /// 项目 ID
    pub project_id: ProjectId,
    /// 项目标题
    pub title: String,
    /// 工作区根路径
    pub workspace_root: String,
    /// 线程总数（含已归档/已删除）
    pub thread_count: u32,
    /// 活跃线程数（未归档、未删除）
    pub active_thread_count: u32,
    /// 最近活动时间
    pub last_activity_at: Option<DateTime<Utc>>,
    /// 标签列表
    pub tags: Vec<String>,
    /// 派生时间（用于增量同步）
    pub derived_at: DateTime<Utc>,
}

impl ProjectMetadataProjection {
    /// 创建一个空投影
    pub fn empty(project_id: ProjectId) -> Self {
        Self {
            project_id,
            title: String::new(),
            workspace_root: String::new(),
            thread_count: 0,
            active_thread_count: 0,
            last_activity_at: None,
            tags: Vec::new(),
            derived_at: Utc::now(),
        }
    }
}

/// 元数据变更通知
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MetadataChange {
    /// 项目创建
    ProjectCreated(ProjectId),
    /// 项目更新
    ProjectUpdated(ProjectId),
    /// 项目删除
    ProjectDeleted(ProjectId),
    /// 活动变化
    ActivityChanged(ProjectId),
}

/// 项目元数据投影器
///
/// 维护所有项目的元数据投影，支持事件驱动的增量更新。
/// 内部通过 `thread_id -> project_id` 反向索引，支持基于线程事件定位所属项目。
pub struct ProjectMetadataProjector {
    /// 投影仓库（id -> projection）
    projections: Arc<RwLock<HashMap<ProjectId, ProjectMetadataProjection>>>,
    /// 线程到项目的反向索引
    thread_to_project: Arc<RwLock<HashMap<ThreadId, ProjectId>>>,
    /// 变更广播
    change_tx: broadcast::Sender<MetadataChange>,
}

impl Default for ProjectMetadataProjector {
    fn default() -> Self {
        Self::new()
    }
}

impl ProjectMetadataProjector {
    /// 创建新的投影器
    pub fn new() -> Self {
        let (change_tx, _) = broadcast::channel(256);
        Self {
            projections: Arc::new(RwLock::new(HashMap::new())),
            thread_to_project: Arc::new(RwLock::new(HashMap::new())),
            change_tx,
        }
    }

    /// 订阅元数据变更
    pub fn subscribe(&self) -> broadcast::Receiver<MetadataChange> {
        self.change_tx.subscribe()
    }

    /// 获取指定项目的元数据
    pub async fn get(&self, project_id: ProjectId) -> Option<ProjectMetadataProjection> {
        self.projections.read().await.get(&project_id).cloned()
    }

    /// 列出所有项目元数据
    pub async fn list(&self) -> Vec<ProjectMetadataProjection> {
        self.projections.read().await.values().cloned().collect()
    }

    /// 通过线程 ID 查找所属项目
    pub async fn project_of_thread(&self, thread_id: ThreadId) -> Option<ProjectId> {
        self.thread_to_project.read().await.get(&thread_id).copied()
    }

    /// 应用一个事件到投影
    pub async fn apply(&self, event: &OrchestrationEvent) -> OrchestrationResult<()> {
        match event {
            OrchestrationEvent::ProjectCreated(e) => {
                let mut guard = self.projections.write().await;
                let mut p = ProjectMetadataProjection::empty(e.project_id);
                p.title = e.title.clone();
                p.workspace_root = e.workspace_root.clone();
                p.derived_at = e.occurred_at;
                guard.insert(e.project_id, p);
                drop(guard);
                let _ = self.change_tx.send(MetadataChange::ProjectCreated(e.project_id));
            }
            OrchestrationEvent::ProjectMetaUpdated(e) => {
                let mut guard = self.projections.write().await;
                if let Some(p) = guard.get_mut(&e.project_id) {
                    if let Some(ref title) = e.title {
                        p.title = title.clone();
                    }
                    p.derived_at = e.occurred_at;
                }
                drop(guard);
                let _ = self.change_tx.send(MetadataChange::ProjectUpdated(e.project_id));
            }
            OrchestrationEvent::ProjectDeleted(e) => {
                let mut guard = self.projections.write().await;
                guard.remove(&e.project_id);
                drop(guard);
                let _ = self.change_tx.send(MetadataChange::ProjectDeleted(e.project_id));
            }
            OrchestrationEvent::ThreadCreated(e) => {
                {
                    let mut guard = self.projections.write().await;
                    if let Some(p) = guard.get_mut(&e.project_id) {
                        p.thread_count += 1;
                        p.active_thread_count += 1;
                        p.last_activity_at = Some(e.occurred_at);
                        p.derived_at = e.occurred_at;
                    }
                }
                self.thread_to_project
                    .write()
                    .await
                    .insert(e.thread_id, e.project_id);
                let _ = self.change_tx.send(MetadataChange::ActivityChanged(e.project_id));
            }
            OrchestrationEvent::ThreadDeleted(e) => {
                if let Some(pid) = self.thread_to_project.write().await.remove(&e.thread_id) {
                    self.decrement_active(pid, e.occurred_at, true).await;
                }
            }
            OrchestrationEvent::ThreadArchived(e) => {
                if let Some(pid) = self.project_of_thread(e.thread_id).await {
                    self.decrement_active(pid, e.occurred_at, false).await;
                }
            }
            OrchestrationEvent::ThreadMessageSent(e) => {
                if let Some(pid) = self.project_of_thread(e.thread_id).await {
                    let mut guard = self.projections.write().await;
                    if let Some(p) = guard.get_mut(&pid) {
                        p.last_activity_at = Some(e.occurred_at);
                        p.derived_at = e.occurred_at;
                    }
                    drop(guard);
                    let _ = self.change_tx.send(MetadataChange::ActivityChanged(pid));
                }
            }
            _ => {
                debug!("忽略事件对元数据投影的影响");
            }
        }
        Ok(())
    }

    async fn decrement_active(&self, project_id: ProjectId, at: DateTime<Utc>, is_delete: bool) {
        let mut guard = self.projections.write().await;
        if let Some(p) = guard.get_mut(&project_id) {
            p.active_thread_count = p.active_thread_count.saturating_sub(1);
            if is_delete {
                p.thread_count = p.thread_count.saturating_sub(1);
            }
            p.last_activity_at = Some(at);
            p.derived_at = at;
        }
        drop(guard);
        let _ = self.change_tx.send(MetadataChange::ActivityChanged(project_id));
    }

    /// 清空所有投影（用于重建）
    pub async fn clear(&self) {
        self.projections.write().await.clear();
        self.thread_to_project.write().await.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use remi_core::events::{ProjectCreatedEvent, ProjectDeletedEvent};
    use remi_core::models::{RuntimeMode, InteractionMode, EnvMode};
    use uuid::Uuid;

    #[tokio::test]
    async fn project_created_adds_projection() {
        let projector = ProjectMetadataProjector::new();
        let event = OrchestrationEvent::ProjectCreated(ProjectCreatedEvent {
            sequence: 0,
            occurred_at: Utc::now(),
            command_id: None,
            project_id: Uuid::new_v4(),
            title: "Hello".to_string(),
            workspace_root: "/tmp".to_string(),
        });
        projector.apply(&event).await.unwrap();
        let list = projector.list().await;
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].title, "Hello");
    }

    #[tokio::test]
    async fn project_deleted_removes_projection() {
        let projector = ProjectMetadataProjector::new();
        let pid = Uuid::new_v4();
        projector
            .apply(&OrchestrationEvent::ProjectCreated(ProjectCreatedEvent {
                sequence: 0,
                occurred_at: Utc::now(),
                command_id: None,
                project_id: pid,
                title: "X".to_string(),
                workspace_root: "/".to_string(),
            }))
            .await
            .unwrap();
        projector
            .apply(&OrchestrationEvent::ProjectDeleted(ProjectDeletedEvent {
                sequence: 0,
                occurred_at: Utc::now(),
                command_id: None,
                project_id: pid,
            }))
            .await
            .unwrap();
        assert!(projector.get(pid).await.is_none());
    }

    #[tokio::test]
    async fn thread_events_track_project() {
        use remi_core::events::ThreadCreatedEvent;
        use remi_core::provider::ModelSelection;
        let projector = ProjectMetadataProjector::new();
        let pid = Uuid::new_v4();
        let tid = Uuid::new_v4();
        // 1. 先创建项目
        projector
            .apply(&OrchestrationEvent::ProjectCreated(ProjectCreatedEvent {
                sequence: 0,
                occurred_at: Utc::now(),
                command_id: None,
                project_id: pid,
                title: "P".to_string(),
                workspace_root: "/".to_string(),
            }))
            .await
            .unwrap();
        // 2. 创建线程
        projector
            .apply(&OrchestrationEvent::ThreadCreated(ThreadCreatedEvent {
                sequence: 0,
                occurred_at: Utc::now(),
                command_id: None,
                thread_id: tid,
                project_id: pid,
                title: "T".to_string(),
                model_selection: ModelSelection {
                    provider: remi_core::provider::ProviderKind::Codex,
                    model: "gpt-5".to_string(),
                    options: None,
                },
                runtime_mode: RuntimeMode::Agent,
                interaction_mode: InteractionMode::Chat,
                env_mode: EnvMode::Local,
                branch: None,
                worktree_path: None,
                associated_worktree: None,
                is_pinned: false,
                parent_thread_id: None,
                subagent: None,
                fork_source_thread_id: None,
                sidechat_source_thread_id: None,
                last_known_pr: None,
                handoff: None,
            }))
            .await
            .unwrap();
        // 3. 验证
        let p = projector.get(pid).await.unwrap();
        assert_eq!(p.thread_count, 1);
        assert_eq!(p.active_thread_count, 1);
        let resolved = projector.project_of_thread(tid).await;
        assert_eq!(resolved, Some(pid));
    }
}
