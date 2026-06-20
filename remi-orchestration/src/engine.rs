//! # 编排引擎核心模块
//!
//! 本模块实现了基于 CQRS + Event Sourcing 模式的编排引擎，是 Remi 编排层的核心组件。
//!
//! ## 核心职责
//!
//! - 接收并串行化处理编排命令（通过内部 MPSC 通道）
//! - 将命令转换为领域事件并持久化到事件存储
//! - 将事件应用到投影仓库以维护读模型
//! - 通过广播通道发布领域事件供 Reactor 消费
//! - 提供完整快照和轻量 Shell 快照查询接口
//!
//! ## 架构设计
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────────┐
//! │                    OrchestrationEngine                       │
//! ├─────────────────────────────────────────────────────────────┤
//! │                                                              │
//! │  ┌──────────────┐    ┌──────────────────────────────────┐  │
//! │  │ command_tx   │───→│  process_commands (后台任务)      │  │
//! │  │ (MPSC 发送端)│    │  ┌────────────────────────────┐  │  │
//! │  └──────────────┘    │  │ handle_command             │  │  │
//! │                      │  │  1. command_to_event       │  │  │
//! │  ┌──────────────┐    │  │  2. event_store.append    │  │  │
//! │  │ current_seq  │    │  │  3. apply_projection     │  │  │
//! │  │ (RwLock)     │    │  │  4. broadcast.send       │  │  │
//! │  └──────────────┘    │  └────────────────────────────┘  │  │
//! │                      │  └────────────────────────────────┘  │
//! │  ┌──────────────┐    └──────────────────────────────────────┘
//! │  │ event_tx     │───→ broadcast 通道（供 Reactor 订阅）
//! │  │ (broadcast)  │
//! │  └──────────────┘
//! │                                                              │
//! │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
//! │  │ event_store  │    │ projection_  │    │  对外接口    │  │
//! │  │ (Arc)        │    │ repo (Arc)   │    │ - dispatch   │  │
//! │  └──────────────┘    └──────────────┘    │ - snapshot   │  │
//! │                                           │ - stream     │  │
//! │                                           └──────────────┘  │
//! └─────────────────────────────────────────────────────────────┘
//! ```
//!
//! ## 命令处理流程
//!
//! ```text
//! dispatch(command)
//!     │
//!     ↓
//! ┌─────────────────┐
//! │ 创建 oneshot 通道│
//! │ 封装 CommandMessage│
//! └────────┬────────┘
//!          │
//!          ↓
//! ┌─────────────────┐
//! │ 发送到 MPSC 队列 │
//! │ command_tx.send()│
//! └────────┬────────┘
//!          │
//!          ↓ (后台任务)
//! ┌─────────────────┐
//! │ handle_command  │
//! │  ├─ command_to_event (命令→事件)
//! │  ├─ event_store.append (持久化)
//! │  ├─ update_sequence (更新序列号)
//! │  ├─ apply_projection (更新读模型)
//! │  └─ event_tx.send (广播事件)
//! └────────┬────────┘
//!          │
//!          ↓
//! ┌─────────────────┐
//! │ oneshot.send()  │
//! │ 返回结果给调用方 │
//! └─────────────────┘
//! ```
//!
//! ## 命令类型索引
//!
//! | 分类 | 命令 | 说明 |
//! |------|------|------|
//! | 项目 | `ProjectCreate` | 创建项目 |
//! | 项目 | `ProjectMetaUpdate` | 更新项目元数据 |
//! | 项目 | `ProjectDelete` | 删除项目 |
//! | 线程 | `ThreadCreate` | 创建线程 |
//! | 线程 | `ThreadDelete` | 删除线程 |
//! | 线程 | `ThreadArchive` | 归档线程 |
//! | 线程 | `ThreadUnarchive` | 取消归档 |
//! | 线程 | `ThreadMetaUpdate` | 更新线程元数据 |
//! | 线程 | `ThreadRuntimeModeSet` | 设置运行模式 |
//! | 线程 | `ThreadInteractionModeSet` | 设置交互模式 |
//! | Turn | `ThreadTurnStart` | 启动 Turn |
//! | Turn | `ThreadTurnInterrupt` | 中断 Turn |
//! | Turn | `ThreadTurnDispatchQueued` | 分发排队中的 Turn |
//! | 审批 | `ThreadApprovalRespond` | 审批响应 |
//! | 审批 | `ThreadUserInputRespond` | 用户输入响应 |
//! | 检查点 | `ThreadCheckpointRevert` | 检查点回滚 |
//! | 检查点 | `ThreadConversationRollback` | 对话回滚 |
//! | 消息 | `ThreadMessageEditAndResend` | 编辑并重发消息 |
//! | 消息 | `ThreadSessionStop` | 停止会话 |
//! | 活动 | `ThreadActivityAppend` | 追加活动记录 |
//! | 内部 | `ThreadSessionSet` | 设置会话状态 |
//! | 内部 | `ThreadMessagesImport` | 导入消息 |
//! | 内部 | `ThreadMessageAssistantDelta` | 助手消息增量更新 |
//! | 内部 | `ThreadMessageAssistantComplete` | 助手消息完成 |
//! | 内部 | `ThreadProposedPlanUpsert` | 更新/插入提议计划 |
//! | 内部 | `ThreadTurnDiffComplete` | Turn 差异完成 |
//! | 内部 | `ThreadRevertComplete` | 回滚完成 |
//! | 内部 | `ThreadConversationRollbackComplete` | 对话回滚完成 |
//!
//! ## 线程安全模型
//!
//! - **命令处理**：通过 MPSC 通道串行化，保证顺序一致性
//! - **序列号**：使用 `RwLock<Sequence>` 保护，支持并发读取、独占写入
//! - **共享状态**：使用 `Arc` 管理，支持多线程安全共享
//! - **事件广播**：使用 `broadcast` 通道，支持多订阅者并发消费
//!
//! ## 通道容量配置
//!
//! | 通道类型 | 容量 | 说明 |
//! |---------|------|------|
//! | 命令队列 (MPSC) | 1000 | 命令处理队列，背压保护 |
//! | 事件广播 (broadcast) | 10000 | 事件发布通道，支持多订阅者 |
//!
//! ## 使用示例
//!
//! ```rust,ignore
//! use std::sync::Arc;
//! use remi_orchestration::OrchestrationEngine;
//! use remi_persistence::{SqliteEventStore, SqliteProjectionRepository};
//!
//! // 创建引擎（自动启动后台命令处理任务）
//! let engine = OrchestrationEngine::new(
//!     Arc::new(event_store),
//!     Arc::new(projection_repo),
//! );
//!
//! // 分发命令
//! let sequence = engine.dispatch(command).await?;
//!
//! // 查询快照
//! let snapshot = engine.get_shell_snapshot().await?;
//!
//! // 订阅事件流
//! let mut event_rx = engine.stream_domain_events();
//! tokio::spawn(async move {
//!     while let Ok(event) = event_rx.recv().await {
//!         // 处理事件...
//!     }
//! });
//! ```

use std::sync::Arc;

use chrono::Utc;
use remi_core::commands::OrchestrationCommand;
use remi_core::events::OrchestrationEvent;
use remi_core::models::{Project, ProjectId, ProjectKind, Sequence, Thread, ThreadId};
use remi_persistence::{EventStore, ProjectionRepository, SqliteEventStore, SqliteProjectionRepository};
use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, mpsc, RwLock};
use tracing::info;

use crate::error::{OrchestrationError, OrchestrationResult};

/// 编排引擎服务
///
/// 编排引擎是整个编排层的核心组件，采用 Actor 模型思想：
/// - 内部通过 MPSC 通道串行处理命令，避免并发冲突
/// - 命令处理流程：命令 → 事件转换 → 事件持久化 → 投影应用 → 事件广播
/// - 对外提供命令分发、事件读取、快照查询、事件订阅等接口
///
/// # 线程安全
///
/// 引擎内部使用 `Arc` 管理共享状态，`RwLock` 保护当前序列号，
/// 支持在多线程环境中安全共享。
pub struct OrchestrationEngine {
    /// 事件存储，用于持久化和读取领域事件
    event_store: Arc<SqliteEventStore>,
    /// 投影仓库，用于维护读模型（物化视图）
    projection_repo: Arc<SqliteProjectionRepository>,
    /// 命令发送端，用于向内部命令处理循环发送命令
    command_tx: mpsc::Sender<CommandMessage>,
    /// 事件广播发送端，用于向所有订阅者发布领域事件
    event_tx: broadcast::Sender<OrchestrationEvent>,
    /// 当前最新的序列号，用于快照版本控制
    current_sequence: Arc<RwLock<Sequence>>,
}

/// 命令消息
///
/// 封装命令及其对应的 oneshot 响应通道，
/// 用于在命令发送方和命令处理循环之间传递。
struct CommandMessage {
    /// 待处理的编排命令
    command: OrchestrationCommand,
    /// 用于将处理结果（序列号或错误）回传给调用方的 oneshot 通道
    response_tx: tokio::sync::oneshot::Sender<OrchestrationResult<Sequence>>,
}

impl OrchestrationEngine {
    /// 创建并启动编排引擎
    ///
    /// 初始化引擎内部状态，创建命令通道（容量 1000）和事件广播通道（容量 10000），
    /// 并启动后台异步任务处理命令队列。
    ///
    /// # 参数
    ///
    /// - `event_store`: 事件存储实例，用于事件的持久化与读取
    /// - `projection_repo`: 投影仓库实例，用于读模型的维护与查询
    ///
    /// # 返回值
    ///
    /// 返回已启动的引擎实例。引擎创建后立即开始处理命令队列中的消息。
    pub fn new(
        event_store: Arc<SqliteEventStore>,
        projection_repo: Arc<SqliteProjectionRepository>,
    ) -> Self {
        // 创建命令通道（MPSC），容量 1000 条消息
        let (command_tx, command_rx) = mpsc::channel(1000);
        // 创建事件广播通道，容量 10000 条事件
        let (event_tx, _) = broadcast::channel(10000);

        let engine = Self {
            event_store: event_store.clone(),
            projection_repo: projection_repo.clone(),
            command_tx: command_tx.clone(),
            event_tx: event_tx.clone(),
            current_sequence: Arc::new(RwLock::new(0)),
        };

        // 克隆引擎引用用于后台命令处理任务
        let engine_clone = OrchestrationEngine {
            event_store,
            projection_repo,
            command_tx,
            event_tx,
            current_sequence: engine.current_sequence.clone(),
        };
        // 启动后台异步任务，持续从命令队列中消费并处理命令
        tokio::spawn(async move {
            engine_clone.process_commands(command_rx).await;
        });

        engine
    }

    /// 分发命令到编排引擎
    ///
    /// 将命令放入内部消息队列，由后台处理任务串行执行。
    /// 调用方通过 oneshot 通道同步等待处理结果。
    ///
    /// # 参数
    ///
    /// - `command`: 待分发的编排命令
    ///
    /// # 返回值
    ///
    /// 成功时返回事件在存储中的序列号（`Sequence`），
    /// 失败时返回 [`OrchestrationError`]。
    ///
    /// # 错误
    ///
    /// - 当命令队列已关闭时，返回 `InternalError`
    /// - 当响应通道已关闭时，返回 `InternalError`
    /// - 命令处理过程中的其他错误由具体处理逻辑决定
    pub async fn dispatch(&self, command: OrchestrationCommand) -> OrchestrationResult<Sequence> {
        // 创建 oneshot 通道用于接收命令处理结果
        let (response_tx, response_rx) = tokio::sync::oneshot::channel();
        
        // 将命令和响应通道封装为消息发送到内部队列
        self.command_tx
            .send(CommandMessage { command, response_tx })
            .await
            .map_err(|_| OrchestrationError::InternalError("命令队列已关闭".to_string()))?;

        // 等待命令处理完成并返回结果
        response_rx
            .await
            .map_err(|_| OrchestrationError::InternalError("响应通道已关闭".to_string()))?
    }

    /// 从事件存储中读取领域事件
    ///
    /// 支持从指定序列号开始分页读取事件，适用于事件回放和审计场景。
    ///
    /// # 参数
    ///
    /// - `from_sequence`: 起始序列号（含），从此位置开始读取
    /// - `limit`: 最大读取数量
    ///
    /// # 返回值
    ///
    /// 成功时返回存储的事件列表，失败时返回持久化层错误。
    pub async fn read_events(
        &self,
        from_sequence: Sequence,
        limit: usize,
    ) -> OrchestrationResult<Vec<remi_persistence::StoredEvent>> {
        let events = self.event_store.read_events(from_sequence, limit)?;
        Ok(events)
    }

    /// 获取完整的编排读模型快照
    ///
    /// 返回包含所有项目和线程完整信息的读模型，适用于需要完整数据的场景。
    ///
    /// # 返回值
    ///
    /// 成功时返回 [`OrchestrationReadModel`]，包含：
    /// - 当前快照序列号（版本号）
    /// - 所有项目列表（含完整字段）
    /// - 所有线程列表（含完整字段）
    /// - 快照生成时间戳
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

    /// 获取轻量级 Shell 快照
    ///
    /// 返回仅包含项目和线程基本信息的精简快照，不包含消息、活动、检查点等详细数据。
    /// 适用于前端列表展示、状态轮询等对数据量敏感的场景。
    ///
    /// # 返回值
    ///
    /// 成功时返回 [`OrchestrationShellSnapshot`]，包含：
    /// - 当前快照序列号
    /// - 项目精简信息（ID、标题、工作区路径）
    /// - 线程精简信息（ID、所属项目、标题、运行模式、待审批/待输入状态）
    /// - 快照生成时间戳
    pub async fn get_shell_snapshot(&self) -> OrchestrationResult<OrchestrationShellSnapshot> {
        let projects = self.projection_repo.list_projects()?;
        let threads = self.projection_repo.list_threads()?;
        let sequence = *self.current_sequence.read().await;

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
            snapshot_sequence: sequence,
            projects: shell_projects,
            threads: shell_threads,
            updated_at: Utc::now(),
        })
    }

    /// 订阅领域事件流
    ///
    /// 返回一个广播接收器，用于接收引擎产生的所有领域事件。
    /// 多个 Reactor 可同时订阅，实现事件驱动的异步处理。
    ///
    /// # 返回值
    ///
    /// 返回 `broadcast::Receiver<OrchestrationEvent>`，
    /// 调用方可通过 `recv()` 异步接收事件。
    pub fn stream_domain_events(&self) -> broadcast::Receiver<OrchestrationEvent> {
        self.event_tx.subscribe()
    }

    /// 命令处理主循环（内部方法）
    ///
    /// 持续从命令队列中消费消息，逐个处理并通过 oneshot 通道返回结果。
    /// 当命令队列关闭时（所有发送端被 drop），循环自动退出。
    ///
    /// # 参数
    ///
    /// - `command_rx`: 命令接收端，用于从队列中获取待处理命令
    async fn process_commands(self, mut command_rx: mpsc::Receiver<CommandMessage>) {
        while let Some(msg) = command_rx.recv().await {
            // 处理单个命令，获取结果后通过 oneshot 通道回传
            let result = self.handle_command(msg.command).await;
            let _ = msg.response_tx.send(result);
        }
    }

    /// 处理单个编排命令（内部方法）
    ///
    /// 命令处理的完整流程：
    /// 1. 将命令转换为领域事件（支持单命令产生多事件）
    /// 2. 将所有事件持久化到事件存储
    /// 3. 更新当前序列号
    /// 4. 将所有事件应用到投影仓库（更新读模型）
    /// 5. 通过广播通道发布所有事件
    ///
    /// # 参数
    ///
    /// - `command`: 待处理的编排命令
    ///
    /// # 返回值
    ///
    /// 成功时返回最后一个事件的序列号，失败时返回相应错误。
    async fn handle_command(&self, command: OrchestrationCommand) -> OrchestrationResult<Sequence> {
        info!("处理命令: {:?}", std::mem::discriminant(&command));

        // 步骤 1：将命令转换为领域事件（支持多事件）
        let events = self.command_to_events(command)?;

        let mut last_sequence = 0;

        for event in events {
            // 步骤 2：将事件持久化到事件存储，获取分配的序列号
            let sequence = self.event_store.append_event(&event)?;

            // 步骤 3：更新引擎当前序列号（写锁保护）
            {
                let mut seq = self.current_sequence.write().await;
                *seq = sequence;
            }

            // 步骤 4：将事件应用到投影仓库，更新读模型
            self.apply_projection(&event).await?;

            // 步骤 5：通过广播通道发布事件，通知所有订阅的 Reactor
            let _ = self.event_tx.send(event);

            last_sequence = sequence;
        }

        Ok(last_sequence)
    }

    /// 将编排命令转换为领域事件（内部方法）
    ///
    /// 根据命令类型构造对应的领域事件，填充时间戳和命令 ID 等元数据。
    /// 事件的 `sequence` 字段初始为 0，将在持久化后由存储层分配实际值。
    ///
    /// # 参数
    ///
    /// - `command`: 待转换的编排命令
    ///
    /// # 返回值
    ///
    /// 成功时返回对应的领域事件列表（支持单命令产生多事件），失败时返回命令处理错误（如未实现的命令类型）。
    fn command_to_events(&self, command: OrchestrationCommand) -> OrchestrationResult<Vec<OrchestrationEvent>> {
        let now = Utc::now();
        let command_id = command.command_id().map(|s| s.to_string());

        match command {
            // ==================== 项目命令 ====================
            OrchestrationCommand::ProjectCreate(c) => {
                Ok(vec![OrchestrationEvent::ProjectCreated(remi_core::events::ProjectCreatedEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    project_id: c.project_id,
                    title: c.title,
                    workspace_root: c.workspace_root,
                })])
            }
            OrchestrationCommand::ProjectMetaUpdate(c) => {
                Ok(vec![OrchestrationEvent::ProjectMetaUpdated(remi_core::events::ProjectMetaUpdatedEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    project_id: c.project_id,
                    title: c.title,
                })])
            }
            OrchestrationCommand::ProjectDelete(c) => {
                Ok(vec![OrchestrationEvent::ProjectDeleted(remi_core::events::ProjectDeletedEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    project_id: c.project_id,
                })])
            }

            // ==================== 线程命令 ====================
            OrchestrationCommand::ThreadCreate(c) => {
                Ok(vec![OrchestrationEvent::ThreadCreated(remi_core::events::ThreadCreatedEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    thread_id: c.thread_id,
                    project_id: c.project_id,
                    title: c.title,
                    // 使用命令中的新字段
                    model_selection: c.model_selection,
                    runtime_mode: c.runtime_mode,
                    interaction_mode: c.interaction_mode,
                    env_mode: c.env_mode,
                    branch: c.branch,
                    worktree_path: c.worktree_path,
                    associated_worktree: c.associated_worktree_path.map(|path| {
                        remi_core::models::AssociatedWorktree {
                            path,
                            branch: c.associated_worktree_branch.unwrap_or_default(),
                            r#ref: c.associated_worktree_ref.unwrap_or_default(),
                        }
                    }),
                    is_pinned: c.is_pinned.unwrap_or(false),
                    parent_thread_id: c.parent_thread_id,
                    subagent: c.subagent_agent_id.map(|agent_id| {
                        remi_core::models::SubagentInfo {
                            agent_id,
                            nickname: c.subagent_nickname.unwrap_or_default(),
                            role: c.subagent_role.unwrap_or_default(),
                        }
                    }),
                    fork_source_thread_id: c.fork_source_thread_id,
                    sidechat_source_thread_id: c.sidechat_source_thread_id,
                    last_known_pr: c.last_known_pr,
                    handoff: c.handoff,
                })])
            }
            OrchestrationCommand::ThreadDelete(c) => {
                Ok(vec![OrchestrationEvent::ThreadDeleted(remi_core::events::ThreadDeletedEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    thread_id: c.thread_id,
                })])
            }
            OrchestrationCommand::ThreadArchive(c) => {
                Ok(vec![OrchestrationEvent::ThreadArchived(remi_core::events::ThreadArchivedEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    thread_id: c.thread_id,
                })])
            }
            OrchestrationCommand::ThreadUnarchive(c) => {
                Ok(vec![OrchestrationEvent::ThreadUnarchived(remi_core::events::ThreadUnarchivedEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    thread_id: c.thread_id,
                })])
            }
            OrchestrationCommand::ThreadMetaUpdate(c) => {
                Ok(vec![OrchestrationEvent::ThreadMetaUpdated(remi_core::events::ThreadMetaUpdatedEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    thread_id: c.thread_id,
                    title: c.title,
                })])
            }
            OrchestrationCommand::ThreadRuntimeModeSet(c) => {
                Ok(vec![OrchestrationEvent::ThreadRuntimeModeSet(remi_core::events::ThreadRuntimeModeSetEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    thread_id: c.thread_id,
                    runtime_mode: c.runtime_mode,
                })])
            }
            OrchestrationCommand::ThreadInteractionModeSet(c) => {
                Ok(vec![OrchestrationEvent::ThreadInteractionModeSet(remi_core::events::ThreadInteractionModeSetEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    thread_id: c.thread_id,
                    interaction_mode: c.interaction_mode,
                })])
            }

            // ==================== 交接/分叉命令 ====================
            OrchestrationCommand::ThreadHandoffCreate(c) => {
                // 创建交接线程，产生 thread.created 事件 + N 个 message-sent 事件
                let mut events = Vec::new();
                
                // 1. 创建线程事件（带 handoff 信息）
                let created_event = OrchestrationEvent::ThreadCreated(remi_core::events::ThreadCreatedEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id: command_id.clone(),
                    thread_id: c.thread_id,
                    project_id: c.project_id,
                    title: c.title,
                    model_selection: c.model_selection,
                    runtime_mode: c.runtime_mode,
                    interaction_mode: c.interaction_mode,
                    env_mode: c.env_mode,
                    branch: c.branch.clone(),
                    worktree_path: c.worktree_path,
                    associated_worktree: c.associated_worktree_path.map(|path| {
                        remi_core::models::AssociatedWorktree {
                            path,
                            branch: c.associated_worktree_branch.unwrap_or_default(),
                            r#ref: c.associated_worktree_ref.unwrap_or_default(),
                        }
                    }),
                    is_pinned: false,
                    parent_thread_id: None,
                    subagent: None,
                    fork_source_thread_id: None,
                    sidechat_source_thread_id: None,
                    last_known_pr: None,
                    handoff: Some(remi_core::models::HandoffInfo {
                        source_thread_id: c.source_thread_id,
                        target_branch: c.branch.clone().unwrap_or_default(),
                        created_at: now,
                    }),
                });
                events.push(created_event);
                
                // 2. 为每条导入的消息生成 message-sent 事件
                for msg in c.imported_messages {
                    let message_event = OrchestrationEvent::ThreadMessageSent(remi_core::events::ThreadMessageSentEvent {
                        sequence: 0,
                        occurred_at: now,
                        command_id: command_id.clone(),
                        thread_id: c.thread_id,
                        message: msg,
                    });
                    events.push(message_event);
                }
                
                Ok(events)
            }
            OrchestrationCommand::ThreadForkCreate(c) => {
                // 创建分叉线程，产生 thread.created 事件 + N 个 message-sent 事件
                let mut events = Vec::new();
                
                // 1. 创建线程事件（带 fork_source_thread_id）
                let created_event = OrchestrationEvent::ThreadCreated(remi_core::events::ThreadCreatedEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id: command_id.clone(),
                    thread_id: c.thread_id,
                    project_id: c.project_id,
                    title: c.title,
                    model_selection: c.model_selection,
                    runtime_mode: c.runtime_mode,
                    interaction_mode: c.interaction_mode,
                    env_mode: c.env_mode,
                    branch: c.branch,
                    worktree_path: c.worktree_path,
                    associated_worktree: c.associated_worktree_path.map(|path| {
                        remi_core::models::AssociatedWorktree {
                            path,
                            branch: c.associated_worktree_branch.unwrap_or_default(),
                            r#ref: c.associated_worktree_ref.unwrap_or_default(),
                        }
                    }),
                    is_pinned: false,
                    parent_thread_id: None,
                    subagent: None,
                    fork_source_thread_id: Some(c.source_thread_id),
                    sidechat_source_thread_id: c.sidechat_source_thread_id,
                    last_known_pr: None,
                    handoff: None,
                });
                events.push(created_event);
                
                // 2. 为每条导入的消息生成 message-sent 事件
                for msg in c.imported_messages {
                    let message_event = OrchestrationEvent::ThreadMessageSent(remi_core::events::ThreadMessageSentEvent {
                        sequence: 0,
                        occurred_at: now,
                        command_id: command_id.clone(),
                        thread_id: c.thread_id,
                        message: msg,
                    });
                    events.push(message_event);
                }
                
                Ok(events)
            }

            // ==================== Turn 命令 ====================
            OrchestrationCommand::ThreadTurnStart(c) => {
                // 1. 查询线程状态，判断是否需要排队
                let thread = self.projection_repo.get_thread(c.thread_id)?;
                let should_queue = if let Some(ref t) = thread {
                    // 如果当前有正在运行的 Turn，则需要排队
                    t.latest_turn.as_ref().map_or(false, |turn| {
                        turn.status == remi_core::models::TurnStatus::Running
                    })
                } else {
                    false
                };

                // 2. 生成用户消息事件
                let user_message = remi_core::models::Message {
                    id: c.message_id,
                    role: remi_core::models::MessageRole::User,
                    text: c.message_text,
                    attachments: c.attachments.unwrap_or_default(),
                    skills: vec![],
                    mentions: vec![],
                    dispatch_mode: Some(c.dispatch_mode.clone()),
                    turn_id: None,
                    streaming: false,
                    source: None,
                    created_at: now,
                    updated_at: now,
                };
                let user_event = OrchestrationEvent::ThreadMessageSent(remi_core::events::ThreadMessageSentEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id: command_id.clone(),
                    thread_id: c.thread_id,
                    message: user_message,
                });

                // 3. 根据排队状态生成 Turn 事件
                let turn_event = if should_queue {
                    OrchestrationEvent::ThreadTurnQueued(remi_core::events::ThreadTurnQueuedEvent {
                        sequence: 0,
                        occurred_at: now,
                        command_id: command_id.clone(),
                        thread_id: c.thread_id,
                        turn_id: c.turn_id.clone(),
                    })
                } else {
                    OrchestrationEvent::ThreadTurnStartRequested(remi_core::events::ThreadTurnStartRequestedEvent {
                        sequence: 0,
                        occurred_at: now,
                        command_id: command_id.clone(),
                        thread_id: c.thread_id,
                        turn_id: c.turn_id.clone(),
                    })
                };

                Ok(vec![user_event, turn_event])
            }
            OrchestrationCommand::ThreadTurnInterrupt(c) => {
                Ok(vec![OrchestrationEvent::ThreadTurnInterruptRequested(remi_core::events::ThreadTurnInterruptRequestedEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    thread_id: c.thread_id,
                    turn_id: c.turn_id,
                })])
            }
            OrchestrationCommand::ThreadTurnDispatchQueued(c) => {
                Ok(vec![OrchestrationEvent::ThreadTurnQueued(remi_core::events::ThreadTurnQueuedEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    thread_id: c.thread_id,
                    turn_id: c.turn_id,
                })])
            }

            // ==================== 审批命令 ====================
            OrchestrationCommand::ThreadApprovalRespond(c) => {
                Ok(vec![OrchestrationEvent::ThreadApprovalResponseRequested(remi_core::events::ThreadApprovalResponseRequestedEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    thread_id: c.thread_id,
                    turn_id: c.turn_id,
                    request_id: c.request_id,
                    approved: c.approved,
                })])
            }
            OrchestrationCommand::ThreadUserInputRespond(c) => {
                Ok(vec![OrchestrationEvent::ThreadUserInputResponseRequested(remi_core::events::ThreadUserInputResponseRequestedEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    thread_id: c.thread_id,
                    turn_id: c.turn_id,
                    request_id: c.request_id,
                    response: c.response,
                })])
            }

            // ==================== 检查点命令 ====================
            OrchestrationCommand::ThreadCheckpointRevert(c) => {
                Ok(vec![OrchestrationEvent::ThreadCheckpointRevertRequested(remi_core::events::ThreadCheckpointRevertRequestedEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    thread_id: c.thread_id,
                    checkpoint_id: c.checkpoint_id,
                })])
            }
            OrchestrationCommand::ThreadConversationRollback(c) => {
                Ok(vec![OrchestrationEvent::ThreadConversationRollbackRequested(remi_core::events::ThreadConversationRollbackRequestedEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    thread_id: c.thread_id,
                    message_id: c.message_id,
                })])
            }

            // ==================== 消息命令 ====================
            OrchestrationCommand::ThreadMessageEditAndResend(c) => {
                Ok(vec![OrchestrationEvent::ThreadMessageEditResendRequested(remi_core::events::ThreadMessageEditResendRequestedEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    thread_id: c.thread_id,
                    message_id: c.message_id,
                    new_text: c.new_text,
                })])
            }
            OrchestrationCommand::ThreadSessionStop(c) => {
                Ok(vec![OrchestrationEvent::ThreadSessionStopRequested(remi_core::events::ThreadSessionStopRequestedEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    thread_id: c.thread_id,
                })])
            }

            // ==================== 活动命令 ====================
            OrchestrationCommand::ThreadActivityAppend(c) => {
                Ok(vec![OrchestrationEvent::ThreadActivityAppended(remi_core::events::ThreadActivityAppendedEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    thread_id: c.thread_id,
                    activity: c.activity,
                })])
            }

            // ==================== 内部命令 ====================
            OrchestrationCommand::ThreadSessionSet(c) => {
                Ok(vec![OrchestrationEvent::ThreadSessionSet(remi_core::events::ThreadSessionSetEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    thread_id: c.thread_id,
                    session: c.session,
                })])
            }
            OrchestrationCommand::ThreadMessagesImport(c) => {
                // 为每条消息生成一个独立的事件
                let events: Vec<OrchestrationEvent> = c.messages.into_iter().map(|msg| {
                    OrchestrationEvent::ThreadMessageSent(remi_core::events::ThreadMessageSentEvent {
                        sequence: 0,
                        occurred_at: now,
                        command_id: command_id.clone(),
                        thread_id: c.thread_id,
                        message: msg,
                    })
                }).collect();
                Ok(events)
            }
            OrchestrationCommand::ThreadMessageAssistantDelta(c) => {
                // 助手消息增量更新，创建一个临时消息
                let message = remi_core::models::Message {
                    id: uuid::Uuid::new_v4(),
                    role: remi_core::models::MessageRole::Assistant,
                    text: c.delta,
                    attachments: vec![],
                    skills: vec![],
                    mentions: vec![],
                    dispatch_mode: None,
                    turn_id: Some(c.turn_id),
                    streaming: true,
                    source: None,
                    created_at: now,
                    updated_at: now,
                };
                Ok(vec![OrchestrationEvent::ThreadMessageSent(remi_core::events::ThreadMessageSentEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    thread_id: c.thread_id,
                    message,
                })])
            }
            OrchestrationCommand::ThreadMessageAssistantComplete(c) => {
                // 助手消息完成，创建一个完整的消息
                let message = remi_core::models::Message {
                    id: c.message_id,
                    role: remi_core::models::MessageRole::Assistant,
                    text: c.text,
                    attachments: vec![],
                    skills: vec![],
                    mentions: vec![],
                    dispatch_mode: None,
                    turn_id: Some(c.turn_id),
                    streaming: false,
                    source: None,
                    created_at: now,
                    updated_at: now,
                };
                Ok(vec![OrchestrationEvent::ThreadMessageSent(remi_core::events::ThreadMessageSentEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    thread_id: c.thread_id,
                    message,
                })])
            }
            OrchestrationCommand::ThreadProposedPlanUpsert(c) => {
                Ok(vec![OrchestrationEvent::ThreadProposedPlanUpserted(remi_core::events::ThreadProposedPlanUpsertedEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    thread_id: c.thread_id,
                    plan: c.plan,
                })])
            }
            OrchestrationCommand::ThreadTurnDiffComplete(c) => {
                Ok(vec![OrchestrationEvent::ThreadTurnDiffCompleted(remi_core::events::ThreadTurnDiffCompletedEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    thread_id: c.thread_id,
                    turn_id: c.turn_id,
                    diff: c.diff,
                })])
            }
            OrchestrationCommand::ThreadRevertComplete(c) => {
                Ok(vec![OrchestrationEvent::ThreadReverted(remi_core::events::ThreadRevertedEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    thread_id: c.thread_id,
                    checkpoint_id: c.checkpoint_id,
                })])
            }
            OrchestrationCommand::ThreadConversationRollbackComplete(c) => {
                Ok(vec![OrchestrationEvent::ThreadConversationRolledBack(remi_core::events::ThreadConversationRolledBackEvent {
                    sequence: 0,
                    occurred_at: now,
                    command_id,
                    thread_id: c.thread_id,
                    message_id: c.message_id,
                })])
            }
        }
    }

    /// 将领域事件应用到投影仓库（内部方法）
    ///
    /// 根据事件类型更新读模型：
    /// - `ProjectCreated`: 创建项目投影
    /// - `ProjectDeleted`: 删除项目投影
    /// - `ThreadCreated`: 创建线程投影（使用默认配置初始化）
    /// - `ThreadDeleted`: 删除线程投影
    ///
    /// # 参数
    ///
    /// - `event`: 待应用的领域事件
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Ok(())`，失败时返回投影相关错误。
    async fn apply_projection(&self, event: &OrchestrationEvent) -> OrchestrationResult<()> {
        match event {
            // ==================== 项目事件 ====================
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
            OrchestrationEvent::ProjectMetaUpdated(e) => {
                if let Some(mut project) = self.projection_repo.get_project(e.project_id)? {
                    if let Some(ref title) = e.title {
                        project.title = title.clone();
                    }
                    project.updated_at = e.occurred_at;
                    self.projection_repo.save_project(&project)?;
                }
            }
            OrchestrationEvent::ProjectDeleted(e) => {
                self.projection_repo.delete_project(e.project_id)?;
            }

            // ==================== 线程事件 ====================
            OrchestrationEvent::ThreadCreated(e) => {
                let thread = Thread {
                    id: e.thread_id,
                    project_id: e.project_id,
                    title: e.title.clone(),
                    model_selection: e.model_selection.clone(),
                    runtime_mode: e.runtime_mode.clone(),
                    interaction_mode: e.interaction_mode.clone(),
                    env_mode: e.env_mode.clone(),
                    branch: e.branch.clone(),
                    worktree_path: e.worktree_path.clone(),
                    associated_worktree: e.associated_worktree.clone(),
                    is_pinned: e.is_pinned,
                    parent_thread_id: e.parent_thread_id,
                    subagent: e.subagent.clone(),
                    fork_source_thread_id: e.fork_source_thread_id,
                    sidechat_source_thread_id: e.sidechat_source_thread_id,
                    last_known_pr: e.last_known_pr.clone(),
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
                    handoff: e.handoff.clone(),
                };
                self.projection_repo.save_thread(&thread)?;
            }
            OrchestrationEvent::ThreadDeleted(e) => {
                self.projection_repo.delete_thread(e.thread_id)?;
            }
            OrchestrationEvent::ThreadArchived(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    thread.archived_at = Some(e.occurred_at);
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }
            OrchestrationEvent::ThreadUnarchived(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    thread.archived_at = None;
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }
            OrchestrationEvent::ThreadMetaUpdated(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    if let Some(ref title) = e.title {
                        thread.title = title.clone();
                    }
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }
            OrchestrationEvent::ThreadRuntimeModeSet(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    thread.runtime_mode = e.runtime_mode.clone();
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }
            OrchestrationEvent::ThreadInteractionModeSet(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    thread.interaction_mode = e.interaction_mode.clone();
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }

            // ==================== 消息事件 ====================
            OrchestrationEvent::ThreadMessageSent(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    thread.messages.push(e.message.clone());
                    thread.latest_user_message_at = Some(e.occurred_at);
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }

            // ==================== Turn 事件 ====================
            OrchestrationEvent::ThreadTurnQueued(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    thread.latest_turn = Some(remi_core::models::LatestTurn {
                        id: e.turn_id.clone(),
                        status: remi_core::models::TurnStatus::Queued,
                        started_at: e.occurred_at,
                    });
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }
            OrchestrationEvent::ThreadTurnStartRequested(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    thread.latest_turn = Some(remi_core::models::LatestTurn {
                        id: e.turn_id.clone(),
                        status: remi_core::models::TurnStatus::Running,
                        started_at: e.occurred_at,
                    });
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }
            OrchestrationEvent::ThreadTurnInterruptRequested(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    if let Some(ref mut turn) = thread.latest_turn {
                        if turn.id == e.turn_id {
                            turn.status = remi_core::models::TurnStatus::Interrupted;
                        }
                    }
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }

            // ==================== 审批事件 ====================
            OrchestrationEvent::ThreadApprovalResponseRequested(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    thread.has_pending_approvals = !e.approved;
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }
            OrchestrationEvent::ThreadUserInputResponseRequested(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    thread.has_pending_user_input = false;
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }

            // ==================== 检查点事件 ====================
            OrchestrationEvent::ThreadCheckpointRevertRequested(_) => {
                // 检查点回退请求，实际回退由 ThreadReverted 事件处理
            }
            OrchestrationEvent::ThreadReverted(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    // 移除指定检查点之后的所有检查点
                    thread.checkpoints.retain(|cp| cp.id != e.checkpoint_id);
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }
            OrchestrationEvent::ThreadTurnDiffCompleted(_) => {
                // Turn 差异完成，暂不需要更新投影
            }

            // ==================== 回滚事件 ====================
            OrchestrationEvent::ThreadConversationRollbackRequested(_) => {
                // 对话回滚请求，实际回滚由 ThreadConversationRolledBack 事件处理
            }
            OrchestrationEvent::ThreadConversationRolledBack(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    // 移除指定消息之后的所有消息
                    if let Some(pos) = thread.messages.iter().position(|m| m.id == e.message_id) {
                        thread.messages.truncate(pos + 1);
                    }
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }

            // ==================== 其他事件 ====================
            OrchestrationEvent::ThreadMessageEditResendRequested(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    // 替换指定消息的内容
                    if let Some(msg) = thread.messages.iter_mut().find(|m| m.id == e.message_id) {
                        msg.text = e.new_text.clone();
                        msg.updated_at = e.occurred_at;
                    }
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }
            OrchestrationEvent::ThreadSessionStopRequested(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    if let Some(ref mut session) = thread.session {
                        session.status = remi_core::models::SessionStatus::Stopped;
                        session.updated_at = e.occurred_at;
                    }
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }
            OrchestrationEvent::ThreadSessionSet(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    thread.session = e.session.clone();
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }
            OrchestrationEvent::ThreadProposedPlanUpserted(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    // 更新或插入计划
                    if let Some(existing) = thread.proposed_plans.iter_mut().find(|p| p.id == e.plan.id) {
                        *existing = e.plan.clone();
                    } else {
                        thread.proposed_plans.push(e.plan.clone());
                    }
                    thread.has_actionable_proposed_plan = thread.proposed_plans.iter().any(|p| p.status == remi_core::models::ProposedPlanStatus::Pending);
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }
            OrchestrationEvent::ThreadActivityAppended(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    thread.activities.push(e.activity.clone());
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }
        }

        Ok(())
    }
}

/// 完整编排读模型
///
/// 包含所有项目和线程的完整信息，适用于需要全量数据的场景（如数据导出、完整状态恢复）。
///
/// # 字段说明
///
/// - `snapshot_sequence`: 快照对应的序列号，用于版本控制和增量同步
/// - `projects`: 所有项目的完整列表
/// - `threads`: 所有线程的完整列表
/// - `updated_at`: 快照生成时间
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestrationReadModel {
    /// 快照序列号，标识当前读模型的版本
    pub snapshot_sequence: Sequence,
    /// 所有项目的完整列表
    pub projects: Vec<Project>,
    /// 所有线程的完整列表
    pub threads: Vec<Thread>,
    /// 快照生成时间（UTC）
    pub updated_at: chrono::DateTime<Utc>,
}

/// Shell 快照（轻量版读模型）
///
/// 仅包含项目和线程的基本信息，不包含消息、活动、检查点等详细数据。
/// 适用于前端列表展示、状态轮询等对传输体积敏感的场景。
///
/// # 字段说明
///
/// - `snapshot_sequence`: 快照对应的序列号
/// - `projects`: 项目精简信息列表
/// - `threads`: 线程精简信息列表
/// - `updated_at`: 快照生成时间（UTC）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestrationShellSnapshot {
    /// 快照序列号
    pub snapshot_sequence: Sequence,
    /// 项目精简信息列表
    pub projects: Vec<ShellProject>,
    /// 线程精简信息列表
    pub threads: Vec<ShellThread>,
    /// 快照生成时间（UTC）
    pub updated_at: chrono::DateTime<Utc>,
}

/// Shell 项目（精简版项目信息）
///
/// 仅包含项目的基本标识和路径信息，用于 Shell 快照中的项目展示。
///
/// # 字段说明
///
/// - `id`: 项目唯一标识
/// - `title`: 项目标题
/// - `workspace_root`: 项目工作区根路径
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShellProject {
    /// 项目唯一标识
    pub id: ProjectId,
    /// 项目标题
    pub title: String,
    /// 项目工作区根路径
    pub workspace_root: String,
}

/// Shell 线程（精简版线程信息）
///
/// 仅包含线程的基本信息和状态标识，用于 Shell 快照中的线程列表展示。
///
/// # 字段说明
///
/// - `id`: 线程唯一标识
/// - `project_id`: 所属项目 ID
/// - `title`: 线程标题
/// - `runtime_mode`: 运行时模式（Agent / Plan 等）
/// - `has_pending_approvals`: 是否有待审批的操作
/// - `has_pending_user_input`: 是否有待用户输入的请求
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ShellThread {
    /// 线程唯一标识
    pub id: ThreadId,
    /// 所属项目 ID
    pub project_id: ProjectId,
    /// 线程标题
    pub title: String,
    /// 运行时模式
    pub runtime_mode: remi_core::models::RuntimeMode,
    /// 是否有待审批的操作
    pub has_pending_approvals: bool,
    /// 是否有待用户输入的请求
    pub has_pending_user_input: bool,
}
