//! 反应器（Reactor）模块
//!
//! 本模块实现了基于 Reactor 模式的事件驱动组件，负责监听编排引擎发布的领域事件，
//! 并触发相应的异步副作用（如调用外部 Provider、清理资源等）。
//!
//! # 内置反应器
//!
//! | 反应器名称 | 职责 | 监听事件 |
//! |-----------|------|---------|
//! | [`ProviderCommandReactor`] | Provider 命令反应器 | Turn 启动/中断、会话停止 |
//! | [`CheckpointReactor`] | 检查点反应器 | 检查点回滚请求 |
//! | [`ThreadDeletionReactor`] | 线程删除反应器 | 线程删除事件 |
//!
//! # 架构设计
//!
//! ```text
//! ┌──────────────────────────────────────────────────────────────┐
//! │                   OrchestrationEngine                         │
//! │                                                               │
//! │  ┌──────────────────┐                                        │
//! │  │  broadcast::Sender │ ← 事件广播发送端                      │
//! │  └────────┬─────────┘                                        │
//! └───────────┼──────────────────────────────────────────────────┘
//!              │
//!              │ 事件广播
//!              ↓
//! ┌──────────────────────────────────────────────────────────────┐
//! │                    Reactor 层                                 │
//! │                                                               │
//! │  ┌────────────────────┐  ┌──────────────┐  ┌──────────────┐ │
//! │  │ ProviderCommand    │  │ Checkpoint   │  │ ThreadDeletion│ │
//! │  │ Reactor            │  │ Reactor      │  │ Reactor      │ │
//! │  ├────────────────────┤  ├──────────────┤  ├──────────────┤ │
//! │  │ TurnStart → 调用   │  │ Revert →     │  │ Delete →     │ │
//! │  │   Provider         │  │   回滚检查点  │  │   清理资源   │ │
//! │  │ TurnInterrupt →    │  │              │  │              │ │
//! │  │   中断 Provider    │  │              │  │              │ │
//! │  │ SessionStop →      │  │              │  │              │ │
//! │  │   停止会话         │  │              │  │              │ │
//! │  └────────────────────┘  └──────────────┘  └──────────────┘ │
//! └──────────────────────────────────────────────────────────────┘
//! ```
//!
//! # 错误处理策略
//!
//! - 反应器处理单个事件失败时仅记录警告日志，不影响后续事件的处理
//! - 事件接收错误（如通道 lagged）仅记录警告，反应器继续运行
//! - 收到关闭信号后优雅退出当前循环

use std::sync::Arc;

use remi_checkpoint::CheckpointStore;
use remi_core::events::OrchestrationEvent;
use remi_core::provider::TurnInput;
use remi_provider::ProviderService;
use tokio::sync::broadcast;
use tracing::{info, warn};

use crate::engine::OrchestrationEngine;
use crate::error::OrchestrationResult;
use crate::query::ProjectionSnapshotQuery;

/// Provider 命令反应器
///
/// 监听编排事件流，当收到与 Provider 相关的事件时触发相应的调用：
/// - `ThreadTurnStartRequested`: 启动 Turn（调用 Provider 开始处理）
/// - `ThreadTurnInterruptRequested`: 中断 Turn（调用 Provider 停止处理）
/// - `ThreadSessionStopRequested`: 停止会话（调用 Provider 清理会话）
pub struct ProviderCommandReactor {
    /// 编排引擎实例，用于订阅领域事件流
    engine: Arc<OrchestrationEngine>,
    /// Provider 服务，用于调用 AI 模型
    provider_service: Arc<ProviderService>,
    /// 投影查询服务，用于获取线程的 provider 配置
    projection_query: Arc<ProjectionSnapshotQuery>,
}

impl ProviderCommandReactor {
    /// 创建新的 Provider 命令反应器
    ///
    /// # 参数
    ///
    /// - `engine`: 编排引擎实例，用于订阅领域事件流
    /// - `provider_service`: Provider 服务实例，用于调用 AI 模型
    /// - `projection_query`: 投影查询服务，用于获取线程的 provider 配置
    ///
    /// # 返回值
    ///
    /// 返回配置完成的反应器实例，需调用 [`ProviderCommandReactor::run`] 启动运行。
    pub fn new(
        engine: Arc<OrchestrationEngine>,
        provider_service: Arc<ProviderService>,
        projection_query: Arc<ProjectionSnapshotQuery>,
    ) -> Self {
        Self {
            engine,
            provider_service,
            projection_query,
        }
    }

    /// 启动反应器主循环
    ///
    /// 订阅编排引擎的领域事件流，持续监听并处理与 Provider 相关的事件。
    /// 收到关闭信号后优雅退出。
    ///
    /// # 参数
    ///
    /// - `shutdown`: 关闭信号接收器，当收到信号时反应器将优雅退出
    ///
    /// # 返回值
    ///
    /// 正常关闭时返回 `Ok(())`，发生不可恢复错误时返回相应错误。
    ///
    /// # 事件处理
    ///
    /// - `ThreadTurnStartRequested`: 查询线程信息，构建 TurnInput 并调用 Provider 启动 Turn
    /// - `ThreadTurnInterruptRequested`: 查询线程信息，调用 Provider 中断指定 Turn
    /// - `ThreadSessionStopRequested`: 查询线程信息，调用 Provider 停止会话
    pub async fn run(&self, mut shutdown: broadcast::Receiver<()>) -> OrchestrationResult<()> {
        info!("ProviderCommandReactor 启动");

        let mut event_rx = self.engine.stream_domain_events();

        loop {
            tokio::select! {
                _ = shutdown.recv() => {
                    info!("ProviderCommandReactor 收到关闭信号");
                    break;
                }
                event = event_rx.recv() => {
                    match event {
                        Ok(event) => {
                            if let Err(e) = self.handle_event(event).await {
                                warn!("ProviderCommandReactor 处理事件错误: {}", e);
                            }
                        }
                        Err(e) => {
                            warn!("事件接收错误: {}", e);
                        }
                    }
                }
            }
        }

        info!("ProviderCommandReactor 已停止");
        Ok(())
    }

    /// 处理单个领域事件（内部方法）
    ///
    /// 根据事件类型执行相应的 Provider 调用：
    /// - `ThreadTurnStartRequested`: 查询线程的 Provider 配置，构建 TurnInput 并发送
    /// - `ThreadTurnInterruptRequested`: 查询线程的 Provider 配置，发送中断请求
    /// - `ThreadSessionStopRequested`: 查询线程的 Provider 配置，发送停止会话请求
    /// - 其他事件类型：忽略
    ///
    /// # 参数
    ///
    /// - `event`: 待处理的领域事件
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Ok(())`。Provider 调用失败时仅记录警告日志，不返回错误。
    async fn handle_event(&self, event: OrchestrationEvent) -> OrchestrationResult<()> {
        match event {
            OrchestrationEvent::ThreadTurnStartRequested(e) => {
                info!(
                    "处理 Turn 启动请求: thread_id={}, turn_id={}",
                    e.thread_id, e.turn_id
                );

                // 从投影查询线程信息，获取 provider 配置
                let thread = self.projection_query.get_thread_detail(e.thread_id).await?;

                if let Some(thread) = thread {
                    let provider = thread.model_selection.provider;
                    let thread_id_str = e.thread_id.to_string();

                    // 从线程消息中获取最近的用户消息
                    let message = thread
                        .messages
                        .iter()
                        .rev()
                        .find(|m| m.role == remi_core::models::MessageRole::User)
                        .map(|m| m.text.clone())
                        .unwrap_or_default();

                    // 构建 TurnInput 并调用 Provider
                    let input = TurnInput {
                        thread_id: thread_id_str,
                        turn_id: e.turn_id,
                        provider,
                        message,
                    };

                    match self.provider_service.send_turn(input).await {
                        Ok(result) => {
                            info!(
                                "Turn 启动成功: thread_id={}, turn_id={}",
                                result.thread_id, result.turn_id
                            );
                        }
                        Err(err) => {
                            warn!("Turn 启动失败: thread_id={}, error={}", e.thread_id, err);
                        }
                    }
                } else {
                    warn!("线程不存在，无法启动 Turn: thread_id={}", e.thread_id);
                }
            }
            OrchestrationEvent::ThreadTurnInterruptRequested(e) => {
                info!(
                    "处理 Turn 中断请求: thread_id={}, turn_id={}",
                    e.thread_id, e.turn_id
                );

                let thread = self.projection_query.get_thread_detail(e.thread_id).await?;

                if let Some(thread) = thread {
                    let provider = thread.model_selection.provider;
                    let thread_id_str = e.thread_id.to_string();
                    let turn_id_str = e.turn_id;

                    match self
                        .provider_service
                        .interrupt_turn(&thread_id_str, Some(&turn_id_str), provider)
                        .await
                    {
                        Ok(()) => {
                            info!("Turn 中断成功: thread_id={}", thread_id_str);
                        }
                        Err(err) => {
                            warn!("Turn 中断失败: thread_id={}, error={}", thread_id_str, err);
                        }
                    }
                } else {
                    warn!("线程不存在，无法中断 Turn: thread_id={}", e.thread_id);
                }
            }
            OrchestrationEvent::ThreadSessionStopRequested(e) => {
                info!("处理会话停止请求: thread_id={}", e.thread_id);

                let thread = self.projection_query.get_thread_detail(e.thread_id).await?;

                if let Some(thread) = thread {
                    let provider = thread.model_selection.provider;
                    let thread_id_str = e.thread_id.to_string();

                    match self
                        .provider_service
                        .stop_session(&thread_id_str, provider)
                        .await
                    {
                        Ok(()) => {
                            info!("会话停止成功: thread_id={}", thread_id_str);
                        }
                        Err(err) => {
                            warn!("会话停止失败: thread_id={}, error={}", thread_id_str, err);
                        }
                    }
                } else {
                    warn!("线程不存在，无法停止会话: thread_id={}", e.thread_id);
                }
            }
            _ => {
                // 忽略其他事件类型
            }
        }

        Ok(())
    }
}

/// 检查点反应器
///
/// 监听检查点相关事件，当收到检查点回滚请求时执行相应的回滚操作。
pub struct CheckpointReactor {
    /// 编排引擎实例，用于订阅领域事件流
    engine: Arc<OrchestrationEngine>,
    /// 检查点存储服务，用于执行回滚操作
    checkpoint_store: Arc<CheckpointStore>,
}

impl CheckpointReactor {
    /// 创建新的检查点反应器
    ///
    /// # 参数
    ///
    /// - `engine`: 编排引擎实例，用于订阅领域事件流
    /// - `checkpoint_store`: 检查点存储服务，用于执行回滚操作
    ///
    /// # 返回值
    ///
    /// 返回配置完成的反应器实例，需调用 [`CheckpointReactor::run`] 启动运行。
    pub fn new(engine: Arc<OrchestrationEngine>, checkpoint_store: Arc<CheckpointStore>) -> Self {
        Self {
            engine,
            checkpoint_store,
        }
    }

    /// 启动反应器主循环
    ///
    /// 订阅编排引擎的领域事件流，持续监听并处理检查点相关的事件。
    /// 收到关闭信号后优雅退出。
    ///
    /// # 参数
    ///
    /// - `shutdown`: 关闭信号接收器，当收到信号时反应器将优雅退出
    ///
    /// # 返回值
    ///
    /// 正常关闭时返回 `Ok(())`，发生不可恢复错误时返回相应错误。
    pub async fn run(&self, mut shutdown: broadcast::Receiver<()>) -> OrchestrationResult<()> {
        info!("CheckpointReactor 启动");

        let mut event_rx = self.engine.stream_domain_events();

        loop {
            tokio::select! {
                _ = shutdown.recv() => {
                    info!("CheckpointReactor 收到关闭信号");
                    break;
                }
                event = event_rx.recv() => {
                    match event {
                        Ok(event) => {
                            if let Err(e) = self.handle_event(event).await {
                                warn!("CheckpointReactor 处理事件错误: {}", e);
                            }
                        }
                        Err(e) => {
                            warn!("事件接收错误: {}", e);
                        }
                    }
                }
            }
        }

        info!("CheckpointReactor 已停止");
        Ok(())
    }

    /// 处理单个领域事件（内部方法）
    ///
    /// 根据事件类型执行相应的检查点操作：
    /// - `ThreadCheckpointRevertRequested`: 调用检查点存储执行回滚操作
    /// - 其他事件类型：忽略
    ///
    /// # 参数
    ///
    /// - `event`: 待处理的领域事件
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Ok(())`。检查点回滚失败时仅记录警告日志，不返回错误。
    async fn handle_event(&self, event: OrchestrationEvent) -> OrchestrationResult<()> {
        match event {
            OrchestrationEvent::ThreadCheckpointRevertRequested(e) => {
                info!(
                    "处理检查点回滚请求: thread_id={}, checkpoint_id={}",
                    e.thread_id, e.checkpoint_id
                );

                match self
                    .checkpoint_store
                    .revert_to_checkpoint(".", e.thread_id, e.checkpoint_id)
                    .await
                {
                    Ok(commit_sha) => {
                        info!("检查点回滚成功: commit={}", commit_sha);
                    }
                    Err(err) => {
                        warn!("检查点回滚失败: {}", err);
                    }
                }
            }
            _ => {
                // 忽略其他事件类型
            }
        }

        Ok(())
    }
}

/// 线程删除反应器
///
/// 监听线程删除事件，当线程被删除时清理相关资源。
pub struct ThreadDeletionReactor {
    /// 编排引擎实例，用于订阅领域事件流
    engine: Arc<OrchestrationEngine>,
    /// Provider 服务，用于停止已删除线程的会话
    provider_service: Arc<ProviderService>,
    /// 检查点存储服务，用于清理已删除线程的检查点
    checkpoint_store: Arc<CheckpointStore>,
    /// 投影查询服务，用于获取线程的 provider 配置
    projection_query: Arc<ProjectionSnapshotQuery>,
}

impl ThreadDeletionReactor {
    /// 创建新的线程删除反应器
    ///
    /// # 参数
    ///
    /// - `engine`: 编排引擎实例，用于订阅领域事件流
    /// - `provider_service`: Provider 服务实例，用于停止已删除线程的会话
    /// - `checkpoint_store`: 检查点存储服务，用于清理已删除线程的检查点
    /// - `projection_query`: 投影查询服务，用于获取线程的 provider 配置
    ///
    /// # 返回值
    ///
    /// 返回配置完成的反应器实例，需调用 [`ThreadDeletionReactor::run`] 启动运行。
    pub fn new(
        engine: Arc<OrchestrationEngine>,
        provider_service: Arc<ProviderService>,
        checkpoint_store: Arc<CheckpointStore>,
        projection_query: Arc<ProjectionSnapshotQuery>,
    ) -> Self {
        Self {
            engine,
            provider_service,
            checkpoint_store,
            projection_query,
        }
    }

    /// 启动反应器主循环
    ///
    /// 订阅编排引擎的领域事件流，持续监听并处理线程删除相关的事件。
    /// 收到关闭信号后优雅退出。
    ///
    /// # 参数
    ///
    /// - `shutdown`: 关闭信号接收器，当收到信号时反应器将优雅退出
    ///
    /// # 返回值
    ///
    /// 正常关闭时返回 `Ok(())`，发生不可恢复错误时返回相应错误。
    pub async fn run(&self, mut shutdown: broadcast::Receiver<()>) -> OrchestrationResult<()> {
        info!("ThreadDeletionReactor 启动");

        let mut event_rx = self.engine.stream_domain_events();

        loop {
            tokio::select! {
                _ = shutdown.recv() => {
                    info!("ThreadDeletionReactor 收到关闭信号");
                    break;
                }
                event = event_rx.recv() => {
                    match event {
                        Ok(event) => {
                            if let Err(e) = self.handle_event(event).await {
                                warn!("ThreadDeletionReactor 处理事件错误: {}", e);
                            }
                        }
                        Err(e) => {
                            warn!("事件接收错误: {}", e);
                        }
                    }
                }
            }
        }

        info!("ThreadDeletionReactor 已停止");
        Ok(())
    }

    /// 处理单个领域事件（内部方法）
    ///
    /// 根据事件类型执行相应的资源清理操作：
    /// - `ThreadDeleted`: 停止已删除线程的 Provider 会话，清理关联的检查点数据
    /// - 其他事件类型：忽略
    ///
    /// # 参数
    ///
    /// - `event`: 待处理的领域事件
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Ok(())`。资源清理失败时仅记录警告日志，不返回错误。
    ///
    /// # 清理步骤
    ///
    /// 1. 尝试停止已删除线程的 Provider 会话（容错处理，线程可能已被投影删除）
    /// 2. 列出并删除该线程的所有检查点数据
    async fn handle_event(&self, event: OrchestrationEvent) -> OrchestrationResult<()> {
        match event {
            OrchestrationEvent::ThreadDeleted(e) => {
                info!("处理线程删除: thread_id={}", e.thread_id);

                let thread_id = e.thread_id;
                let thread_id_str = thread_id.to_string();

                // 1. 停止 Provider 会话（如果存在）
                // 注意：线程已被删除，投影中可能已无记录，尝试查询但容错处理
                if let Ok(Some(thread)) = self.projection_query.get_thread_detail(thread_id).await
                {
                    let provider = thread.model_selection.provider;
                    if let Err(err) = self
                        .provider_service
                        .stop_session(&thread_id_str, provider)
                        .await
                    {
                        warn!("停止已删除线程的 Provider 会话失败: {}", err);
                    }
                }

                // 2. 清理检查点数据
                match self.checkpoint_store.list_checkpoints(thread_id).await {
                    Ok(checkpoints) => {
                        let total = checkpoints.len();
                        for checkpoint in &checkpoints {
                            if let Err(err) = self
                                .checkpoint_store
                                .delete_checkpoint(checkpoint.id.clone())
                                .await
                            {
                                warn!("删除检查点失败: checkpoint_id={}, error={}", checkpoint.id, err);
                            }
                        }
                        if total > 0 {
                            info!("已清理 {} 个检查点", total);
                        }
                    }
                    Err(err) => {
                        warn!("列出检查点失败: thread_id={}, error={}", thread_id_str, err);
                    }
                }
            }
            _ => {
                // 忽略其他事件类型
            }
        }

        Ok(())
    }
}

