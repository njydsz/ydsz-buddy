//! # 投影器模块
//!
//! 本模块实现了异步投影器（Projector），负责从事件存储中持续消费领域事件，
//! 并将事件应用到投影仓库以维护读模型（物化视图）。
//!
//! ## 工作原理
//!
//! 投影器采用轮询模式，定期从事件存储中读取新事件：
//! 1. 启动时从投影仓库中恢复上次处理的序列号（断点续传）
//! 2. 每隔 100ms 轮询一次事件存储，批量读取新事件
//! 3. 逐个应用事件到投影仓库，更新读模型
//! 4. 更新投影器的处理进度（序列号），支持断点续传
//! 5. 收到关闭信号后优雅退出
//!
//! ## 架构位置
//!
//! ```text
//! ┌─────────────────┐
//! │  EventStore     │
//! │  (事件存储)     │
//! └────────┬────────┘
//!          │ read_events()
//!          ↓
//! ┌─────────────────┐
//! │   Projector     │
//! │  ┌───────────┐  │
//! │  │ 轮询循环  │  │
//! │  │ (100ms)   │  │
//! │  └─────┬─────┘  │
//! │        ↓        │
//! │  ┌───────────┐  │
//! │  │apply_event│  │
//! │  └─────┬─────┘  │
//! └────────┼────────┘
//!          │
//!          ↓
//! ┌─────────────────┐
//! │ ProjectionRepo  │
//! │ (投影仓库)      │
//! └─────────────────┘
//! ```
//!
//! ## 断点续传机制
//!
//! 投影器通过以下机制实现断点续传：
//!
//! 1. **状态持久化**：每次处理完一批事件后，将当前序列号写入投影仓库
//! 2. **启动恢复**：启动时从投影仓库读取上次处理的序列号
//! 3. **增量处理**：从恢复的序列号开始读取新事件，避免重复处理
//!
//! ```text
//! 启动 → get_projection_state() → last_sequence
//!   ↓
//! 循环 → read_events(last_sequence, 100) → events
//!   ↓
//! 处理 → apply_event() for each event
//!   ↓
//! 更新 → last_sequence = max(event.sequence)
//!   ↓
//! 持久化 → update_projection_state(last_sequence)
//! ```
//!
//! ## 性能参数
//!
//! | 参数 | 值 | 说明 |
//! |------|-----|------|
//! | 轮询间隔 | 100ms | 事件存储检查频率 |
//! | 批量大小 | 100 条 | 单次最大读取事件数 |
//! | 处理模式 | 串行 | 逐个应用事件，保证顺序 |
//!
//! ## 与引擎内投影的区别
//!
//! | 特性 | 引擎内投影 | 本投影器 |
//! |------|-----------|---------|
//! | 执行时机 | 命令处理时同步执行 | 异步轮询执行 |
//! | 数据源 | 内存中的事件 | 事件存储 |
//! | 用途 | 维护主读模型 | 构建独立读模型、外部集成 |
//! | 一致性 | 强一致（同事务） | 最终一致（异步） |
//!
//! ## 使用示例
//!
//! ```rust,ignore
//! use std::sync::Arc;
//! use remi_orchestration::Projector;
//! use remi_persistence::{SqliteEventStore, SqliteProjectionRepository};
//! use tokio::sync::broadcast;
//!
//! // 创建投影器
//! let projector = Projector::new(
//!     Arc::new(event_store),
//!     Arc::new(projection_repo),
//!     "main_projector",
//! );
//!
//! // 创建关闭信号通道
//! let (shutdown_tx, _) = broadcast::channel(1);
//! let shutdown_rx = shutdown_tx.subscribe();
//!
//! // 启动投影器（通常在独立任务中运行）
//! tokio::spawn(async move {
//!     projector.run(shutdown_rx).await.unwrap();
//! });
//!
//! // 需要关闭时发送信号
//! shutdown_tx.send(()).ok();
//! ```
//!
//! ## 扩展指南
//!
//! 如需实现自定义投影逻辑：
//!
//! 1. 继承或修改 `apply_event` 方法
//! 2. 根据事件类型执行相应的投影操作
//! 3. 确保投影操作的幂等性（支持重试）
//! 4. 考虑使用事务保证原子性
//!
//! ## 错误处理策略
//!
//! - **轮询错误**：记录警告日志，继续下次轮询
//! - **处理错误**：记录警告日志，当前批次中断，下次重试
//! - **关闭信号**：完成当前处理后优雅退出

use std::sync::Arc;

use remi_core::events::OrchestrationEvent;
use remi_persistence::{EventStore, ProjectionRepository, SqliteEventStore, SqliteProjectionRepository};
use tokio::sync::broadcast;
use tracing::{info, warn};

use crate::error::OrchestrationResult;

/// 异步投影器
///
/// 从事件存储中持续消费领域事件，并将事件应用到投影仓库以维护读模型。
/// 支持断点续传，重启后自动从上次处理的序列号继续。
///
/// # 使用场景
///
/// - 构建独立的读模型（与引擎内投影解耦）
/// - 异步消费事件流用于外部系统集成
/// - 事件审计和日志记录
///
/// # 生命周期
///
/// 通过 [`Projector::run`] 启动，持续运行直到收到关闭信号。
pub struct Projector {
    /// 事件存储，用于读取领域事件
    event_store: Arc<SqliteEventStore>,
    /// 投影仓库，用于维护读模型和投影器状态
    projection_repo: Arc<SqliteProjectionRepository>,
    /// 投影器名称，用于标识和区分不同的投影器实例
    projector_name: String,
}

impl Projector {
    /// 创建新的投影器实例
    ///
    /// # 参数
    ///
    /// - `event_store`: 事件存储实例，提供事件读取能力
    /// - `projection_repo`: 投影仓库实例，提供读模型更新和状态持久化能力
    /// - `projector_name`: 投影器名称，用于标识投影器实例（如 "main_projector"）
    ///
    /// # 返回值
    ///
    /// 返回配置完成的投影器实例，需调用 [`Projector::run`] 启动运行。
    pub fn new(
        event_store: Arc<SqliteEventStore>,
        projection_repo: Arc<SqliteProjectionRepository>,
        projector_name: &str,
    ) -> Self {
        Self {
            event_store,
            projection_repo,
            projector_name: projector_name.to_string(),
        }
    }

    /// 启动投影器主循环
    ///
    /// 投影器启动后持续轮询事件存储，消费新事件并更新读模型。
    /// 支持优雅关闭：收到关闭信号后完成当前批次处理后退出。
    ///
    /// # 参数
    ///
    /// - `shutdown`: 关闭信号接收器，当收到信号时投影器将优雅退出
    ///
    /// # 返回值
    ///
    /// 正常关闭时返回 `Ok(())`，发生不可恢复错误时返回相应错误。
    ///
    /// # 运行流程
    ///
    /// 1. 从投影仓库恢复上次处理的序列号（断点续传）
    /// 2. 进入主循环，每 100ms 轮询一次事件存储
    /// 3. 批量读取新事件（每次最多 100 条）
    /// 4. 逐个应用事件到投影仓库
    /// 5. 更新投影器处理进度
    /// 6. 收到关闭信号后退出循环
    pub async fn run(&self, mut shutdown: broadcast::Receiver<()>) -> OrchestrationResult<()> {
        info!("投影器启动: {}", self.projector_name);

        // 从投影仓库恢复上次处理的序列号，实现断点续传
        let mut last_sequence = self.projection_repo.get_projection_state(&self.projector_name)?;
        info!("从序列号 {} 开始投影", last_sequence);

        loop {
            tokio::select! {
                // 监听关闭信号，收到信号后优雅退出
                _ = shutdown.recv() => {
                    info!("投影器收到关闭信号");
                    break;
                }
                // 定时轮询事件存储，每 100ms 检查一次新事件
                _ = tokio::time::sleep(tokio::time::Duration::from_millis(100)) => {
                    if let Err(e) = self.process_events(&mut last_sequence).await {
                        warn!("投影处理错误: {}", e);
                    }
                }
            }
        }

        info!("投影器已停止: {}", self.projector_name);
        Ok(())
    }

    /// 处理新事件（内部方法）
    ///
    /// 从事件存储中批量读取新事件，逐个应用并更新投影器进度。
    /// 每次最多处理 100 条事件，避免单次处理量过大。
    ///
    /// # 参数
    ///
    /// - `last_sequence`: 上次处理的序列号（可变引用），处理完成后更新为最新序列号
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Ok(())`，发生错误时返回相应错误。
    ///
    /// # 处理流程
    ///
    /// 1. 从事件存储读取新事件（从 `last_sequence` 开始，最多 100 条）
    /// 2. 如果没有新事件，直接返回
    /// 3. 遍历事件列表，逐个反序列化并应用
    /// 4. 更新 `last_sequence` 为最新处理的序列号
    /// 5. 将投影器进度持久化到投影仓库
    async fn process_events(&self, last_sequence: &mut u64) -> OrchestrationResult<()> {
        // 从事件存储读取新事件
        let events = self.event_store.read_events(*last_sequence, 100)?;

        // 没有新事件时直接返回，避免不必要的处理
        if events.is_empty() {
            return Ok(());
        }

        // 逐个处理事件
        for stored_event in events {
            // 将事件 payload 从 JSON 反序列化为领域事件
            let event: OrchestrationEvent = serde_json::from_str(&stored_event.payload)?;
            // 应用事件到投影仓库
            self.apply_event(&event).await?;
            // 更新已处理的序列号
            *last_sequence = stored_event.sequence;
        }

        // 将投影器处理进度持久化，支持断点续传
        self.projection_repo.update_projection_state(&self.projector_name, *last_sequence)?;

        Ok(())
    }

    /// 应用单个事件到投影仓库
    ///
    /// 根据事件类型执行相应的投影操作，更新投影仓库中的项目和线程数据。
    /// 对齐 PeakCode projector.ts 的 projectEvent 函数逻辑。
    ///
    /// # 参数
    ///
    /// - `event`: 待应用的领域事件
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Ok(())`，发生错误时返回相应错误。
    async fn apply_event(&self, event: &OrchestrationEvent) -> OrchestrationResult<()> {
        use remi_core::events::OrchestrationEvent::*;

        match event {
            // 项目事件
            ProjectCreated(e) => {
                let project = remi_core::models::Project {
                    id: e.project_id,
                    kind: remi_core::models::ProjectKind::Local,
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
            ProjectMetaUpdated(e) => {
                if let Some(mut project) = self.projection_repo.get_project(e.project_id)? {
                    if let Some(title) = &e.title {
                        project.title = title.clone();
                    }
                    project.updated_at = e.occurred_at;
                    self.projection_repo.save_project(&project)?;
                }
            }
            ProjectDeleted(e) => {
                self.projection_repo.delete_project(e.project_id)?;
            }

            // 线程事件
            ThreadCreated(e) => {
                let thread = remi_core::models::Thread {
                    id: e.thread_id,
                    project_id: e.project_id,
                    title: e.title.clone(),
                    model_selection: remi_core::models::ModelSelection::default(),
                    runtime_mode: remi_core::models::RuntimeMode::Agent,
                    interaction_mode: remi_core::models::InteractionMode::Chat,
                    env_mode: remi_core::models::EnvMode::Sandboxed,
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
            ThreadDeleted(e) => {
                self.projection_repo.delete_thread(e.thread_id)?;
            }
            ThreadArchived(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    thread.archived_at = Some(e.occurred_at);
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }
            ThreadUnarchived(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    thread.archived_at = None;
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }
            ThreadMetaUpdated(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    if let Some(title) = &e.title {
                        thread.title = title.clone();
                    }
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }
            ThreadRuntimeModeSet(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    thread.runtime_mode = e.runtime_mode;
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }
            ThreadInteractionModeSet(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    thread.interaction_mode = e.interaction_mode;
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }
            ThreadMessageSent(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    // 检查消息是否已存在（流式更新场景）
                    if let Some(existing) = thread.messages.iter_mut().find(|m| m.id == e.message.id) {
                        if e.message.streaming {
                            existing.text.push_str(&e.message.text);
                        } else if !e.message.text.is_empty() {
                            existing.text = e.message.text.clone();
                        }
                        existing.streaming = e.message.streaming;
                        existing.updated_at = e.message.updated_at;
                    } else {
                        thread.messages.push(e.message.clone());
                        // 限制消息数量
                        if thread.messages.len() > 2000 {
                            thread.messages = thread.messages.split_off(thread.messages.len() - 2000);
                        }
                    }
                    thread.latest_user_message_at = if e.message.role == remi_core::models::MessageRole::User {
                        Some(e.occurred_at)
                    } else {
                        thread.latest_user_message_at
                    };
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }
            ThreadTurnStartRequested(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    thread.runtime_mode = remi_core::models::RuntimeMode::Agent;
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }
            ThreadSessionSet(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    thread.session = e.session.clone();
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }
            ThreadProposedPlanUpserted(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    // 移除同 ID 的旧计划，添加新计划
                    thread.proposed_plans.retain(|p| p.id != e.plan.id);
                    thread.proposed_plans.push(e.plan.clone());
                    // 限制计划数量
                    if thread.proposed_plans.len() > 200 {
                        thread.proposed_plans = thread.proposed_plans.split_off(thread.proposed_plans.len() - 200);
                    }
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }
            ThreadActivityAppended(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    // 移除同 ID 的旧活动，添加新活动
                    thread.activities.retain(|a| a.id != e.activity.id);
                    thread.activities.push(e.activity.clone());
                    // 限制活动数量
                    if thread.activities.len() > 500 {
                        thread.activities = thread.activities.split_off(thread.activities.len() - 500);
                    }
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }
            ThreadTurnDiffCompleted(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    // 更新或添加检查点
                    let checkpoint = remi_core::models::CheckpointSummary {
                        turn_id: e.turn_id.clone(),
                        checkpoint_turn_count: 0,
                        checkpoint_ref: String::new(),
                        status: "ready".to_string(),
                        files: vec![],
                        assistant_message_id: None,
                        completed_at: e.occurred_at,
                    };
                    thread.checkpoints.retain(|c| c.turn_id != e.turn_id);
                    thread.checkpoints.push(checkpoint);
                    // 限制检查点数量
                    if thread.checkpoints.len() > 500 {
                        thread.checkpoints = thread.checkpoints.split_off(thread.checkpoints.len() - 500);
                    }
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }
            ThreadReverted(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    // 回滚时清空消息、计划、活动、检查点
                    thread.messages.clear();
                    thread.proposed_plans.clear();
                    thread.activities.clear();
                    thread.checkpoints.clear();
                    thread.latest_turn = None;
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }
            ThreadConversationRolledBack(e) => {
                if let Some(mut thread) = self.projection_repo.get_thread(e.thread_id)? {
                    // 找到目标消息索引，截断之后的消息
                    if let Some(idx) = thread.messages.iter().position(|m| m.id == e.message_id) {
                        thread.messages.truncate(idx + 1);
                    }
                    thread.updated_at = e.occurred_at;
                    self.projection_repo.save_thread(&thread)?;
                }
            }
            // 其他事件暂不处理投影
            _ => {}
        }

        Ok(())
    }
}
