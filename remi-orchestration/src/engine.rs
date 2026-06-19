//! 编排引擎核心

use std::sync::Arc;

use chrono::Utc;
use remi_core::commands::OrchestrationCommand;
use remi_core::events::OrchestrationEvent;
use remi_core::models::{Project, ProjectId, ProjectKind, Sequence, Thread, ThreadId};
use remi_persistence::{EventStore, ProjectionRepository, SqliteEventStore, SqliteProjectionRepository};
use tokio::sync::{broadcast, mpsc, RwLock};
use tracing::{info, warn};
use uuid::Uuid;

use crate::error::{OrchestrationError, OrchestrationResult};

/// 编排引擎服务
pub struct OrchestrationEngine {
    event_store: Arc<SqliteEventStore>,
    projection_repo: Arc<SqliteProjectionRepository>,
    command_tx: mpsc::Sender<CommandMessage>,
    event_tx: broadcast::Sender<OrchestrationEvent>,
    current_sequence: Arc<RwLock<Sequence>>,
}

/// 命令消息
struct CommandMessage {
    command: OrchestrationCommand,
    response_tx: tokio::sync::oneshot::Sender<OrchestrationResult<Sequence>>,
}

impl OrchestrationEngine {
    /// 创建新的编排引擎
    pub fn new(
        event_store: Arc<SqliteEventStore>,
        projection_repo: Arc<SqliteProjectionRepository>,
    ) -> Self {
        let (command_tx, command_rx) = mpsc::channel(1000);
        let (event_tx, _) = broadcast::channel(10000);

        let engine = Self {
            event_store: event_store.clone(),
            projection_repo: projection_repo.clone(),
            command_tx,
            event_tx,
            current_sequence: Arc::new(RwLock::new(0)),
        };

        // 启动命令处理循环
        let engine_clone = OrchestrationEngine {
            event_store,
            projection_repo,
            command_tx: command_tx.clone(),
            event_tx: event_tx.clone(),
            current_sequence: engine.current_sequence.clone(),
        };
        tokio::spawn(async move {
            engine_clone.process_commands(command_rx).await;
        });

        engine
    }

    /// 分发命令
    pub async fn dispatch(&self, command: OrchestrationCommand) -> OrchestrationResult<Sequence> {
        let (response_tx, response_rx) = tokio::sync::oneshot::channel();
        
        self.command_tx
            .send(CommandMessage { command, response_tx })
            .await
            .map_err(|_| OrchestrationError::InternalError("命令队列已关闭".to_string()))?;

        response_rx
            .await
            .map_err(|_| OrchestrationError::InternalError("响应通道已关闭".to_string()))?
    }

    /// 读取事件
    pub async fn read_events(
        &self,
        from_sequence: Sequence,
        limit: usize,
    ) -> OrchestrationResult<Vec<remi_persistence::StoredEvent>> {
        let events = self.event_store.read_events(from_sequence, limit)?;
        Ok(events)
    }

    /// 获取完整快照
    pub async fn get_snapshot(&self) -> OrchestrationResult<OrchestrationReadModel> {
        let projects = self.projection_repo.list_projects()?;
        let threads = self.projection_repo.list_threads()?;
        let sequence = *self.current_sequence.read().await;

        Ok(OrchestrationReadModel {
            snapshot_sequence: sequence,
            projects,
            threads,
            updated_at: Utc::now(),
        })
    }

    /// 获取 Shell 快照（轻量版）
    pub async fn get_shell_snapshot(&self) -> OrchestrationResult<OrchestrationShellSnapshot> {
        let projects = self.projection_repo.list_projects()?;
        let threads = self.projection_repo.list_threads()?;
        let sequence = *self.current_sequence.read().await;

        // Shell 快照只包含基本信息，不包含消息、活动等详细内容
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
            snapshot_sequence: sequence,
            projects: shell_projects,
            threads: shell_threads,
            updated_at: Utc::now(),
        })
    }

    /// 订阅领域事件
    pub fn stream_domain_events(&self) -> broadcast::Receiver<OrchestrationEvent> {
        self.event_tx.subscribe()
    }

    /// 处理命令循环
    async fn process_commands(self, mut command_rx: mpsc::Receiver<CommandMessage>) {
        while let Some(msg) = command_rx.recv().await {
            let result = self.handle_command(msg.command).await;
            let _ = msg.response_tx.send(result);
        }
    }

    /// 处理单个命令
    async fn handle_command(&self, command: OrchestrationCommand) -> OrchestrationResult<Sequence> {
        info!("处理命令: {:?}", std::mem::discriminant(&command));

        // 根据命令类型生成事件
        let event = self.command_to_event(command)?;

        // 持久化事件
        let sequence = self.event_store.append_event(&event)?;

        // 更新当前序列号
        {
            let mut seq = self.current_sequence.write().await;
            *seq = sequence;
        }

        // 应用投影
        self.apply_projection(&event).await?;

        // 广播事件
        let _ = self.event_tx.send(event);

        Ok(sequence)
    }

    /// 将命令转换为事件
    fn command_to_event(&self, command: OrchestrationCommand) -> OrchestrationResult<OrchestrationEvent> {
        let now = Utc::now();
        let command_id = command.command_id().map(|s| s.to_string());

        match command {
            OrchestrationCommand::ProjectCreate(c) => {
                Ok(OrchestrationEvent::ProjectCreated(remi_core::events::ProjectCreatedEvent {
                    sequence: 0, // 将在持久化后更新
                    occurred_at: now,
                    command_id,
                    project_id: c.project_id,
                    title: c.title,
                    workspace_root: c.workspace_root,
                }))
            }
            OrchestrationCommand::ProjectDelete(c) => {
                Ok(OrchestrationEvent::ProjectDeleted(remi_core::events::ProjectDeletedEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    project_id: c.project_id,
                }))
            }
            OrchestrationCommand::ThreadCreate(c) => {
                Ok(OrchestrationEvent::ThreadCreated(remi_core::events::ThreadCreatedEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    thread_id: c.thread_id,
                    project_id: c.project_id,
                    title: c.title,
                }))
            }
            OrchestrationCommand::ThreadDelete(c) => {
                Ok(OrchestrationEvent::ThreadDeleted(remi_core::events::ThreadDeletedEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    thread_id: c.thread_id,
                }))
            }
            OrchestrationCommand::ThreadArchive(c) => {
                Ok(OrchestrationEvent::ThreadArchived(remi_core::events::ThreadArchivedEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    thread_id: c.thread_id,
                }))
            }
            OrchestrationCommand::ThreadUnarchive(c) => {
                Ok(OrchestrationEvent::ThreadUnarchived(remi_core::events::ThreadUnarchivedEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    thread_id: c.thread_id,
                }))
            }
            _ => {
                // 其他命令类型暂时返回错误
                Err(OrchestrationError::CommandError(format!(
                    "未实现的命令类型: {:?}",
                    std::mem::discriminant(&command)
                )))
            }
        }
    }

    /// 应用投影
    async fn apply_projection(&self, event: &OrchestrationEvent) -> OrchestrationResult<()> {
        match event {
            OrchestrationEvent::ProjectCreated(e) => {
                let project = Project {
                    id: e.project_id,
                    kind: ProjectKind::Local,
                    title: e.title.clone(),
                    workspace_root: e.workspace_root.clone(),
                    default_model_selection: None,
                    scripts: vec![],
                    created_at: e.occurred_at,
                    updated_at: e.occurred_at,
                    deleted_at: None,
                };
                self.projection_repo.save_project(&project)?;
            }
            OrchestrationEvent::ProjectDeleted(e) => {
                self.projection_repo.delete_project(e.project_id)?;
            }
            OrchestrationEvent::ThreadCreated(e) => {
                // 创建默认线程
                let thread = Thread {
                    id: e.thread_id,
                    project_id: e.project_id,
                    title: e.title.clone(),
                    model_selection: remi_core::provider::ModelSelection {
                        provider: remi_core::provider::ProviderKind::Codex,
                        model: "default".to_string(),
                        options: None,
                    },
                    runtime_mode: remi_core::models::RuntimeMode::Agent,
                    interaction_mode: remi_core::models::InteractionMode::Chat,
                    env_mode: remi_core::models::EnvMode::Local,
                    branch: None,
                    worktree_path: None,
                    associated_worktree: None,
                    is_pinned: false,
                    parent_thread_id: None,
                    subagent: None,
                    fork_source_thread_id: None,
                    sidechat_source_thread_id: None,
                    last_known_pr: None,
                    latest_turn: None,
                    latest_user_message_at: None,
                    has_pending_approvals: false,
                    has_pending_user_input: false,
                    has_actionable_proposed_plan: false,
                    messages: vec![],
                    proposed_plans: vec![],
                    activities: vec![],
                    checkpoints: vec![],
                    session: None,
                    created_at: e.occurred_at,
                    updated_at: e.occurred_at,
                    archived_at: None,
                    deleted_at: None,
                    handoff: None,
                };
                self.projection_repo.save_thread(&thread)?;
            }
            OrchestrationEvent::ThreadDeleted(e) => {
                self.projection_repo.delete_thread(e.thread_id)?;
            }
            _ => {
                // 其他事件类型暂时忽略
                warn!("未处理的投影事件: {:?}", std::mem::discriminant(event));
            }
        }

        Ok(())
    }
}

/// 完整读模型
#[derive(Debug, Clone)]
pub struct OrchestrationReadModel {
    pub snapshot_sequence: Sequence,
    pub projects: Vec<Project>,
    pub threads: Vec<Thread>,
    pub updated_at: chrono::DateTime<Utc>,
}

/// Shell 快照（轻量版）
#[derive(Debug, Clone)]
pub struct OrchestrationShellSnapshot {
    pub snapshot_sequence: Sequence,
    pub projects: Vec<ShellProject>,
    pub threads: Vec<ShellThread>,
    pub updated_at: chrono::DateTime<Utc>,
}

/// Shell 项目
#[derive(Debug, Clone)]
pub struct ShellProject {
    pub id: ProjectId,
    pub title: String,
    pub workspace_root: String,
}

/// Shell 线程
#[derive(Debug, Clone)]
pub struct ShellThread {
    pub id: ThreadId,
    pub project_id: ProjectId,
    pub title: String,
    pub runtime_mode: remi_core::models::RuntimeMode,
    pub has_pending_approvals: bool,
    pub has_pending_user_input: bool,
}
