//! 反应器（Reactor）模块
//!
//! 本模块实现了基于 Reactor 模式的事件驱动组件，负责监听编排引擎发布的领域事件，
//! 并触发相应的异步副作用（如调用外部 Provider、清理资源等）。
//!
//! # Reactor 模式
//!
//! Reactor 模式是一种事件驱动架构模式，核心思想是：
//! - 监听事件流（通过 broadcast 通道）
//! - 根据事件类型执行相应的处理逻辑
//! - 支持优雅关闭（通过 shutdown 信号）
//!
//! # 架构位置
//!
//! ```text
//! ┌─────────────────┐
//! │ OrchestrationEngine │
//! │  (事件发布源)       │
//! └────────┬────────┘
//!          │ broadcast
//!          ↓
//! ┌─────────────────┐
//! │   Reactor 层    │
//! ├─────────────────┤
//! │ ProviderCommand │ ← 处理 Turn 启动/中断/会话停止
//! │ Checkpoint      │ ← 处理检查点回滚
//! │ ThreadDeletion  │ ← 处理线程删除清理
//! └─────────────────┘
//!          │
//!          ↓
//! ┌─────────────────┐
//! │  外部系统调用   │
//! │ (Provider/API)  │
//! └─────────────────┘
//! ```
//!
//! # 内置反应器
//!
//! 本模块提供以下反应器实现：
//!
//! | 反应器名称 | 职责 | 监听事件 |
//! |-----------|------|---------|
//! | [`ProviderCommandReactor`] | Provider 命令反应器 | Turn 启动/中断、会话停止 |
//! | [`CheckpointReactor`] | 检查点反应器 | 检查点回滚请求 |
//! | [`ThreadDeletionReactor`] | 线程删除反应器 | 线程删除事件 |
//!
//! # 使用示例
//!
//! ```rust,ignore
//! use std::sync::Arc;
//! use remi_orchestration::{OrchestrationEngine, ProviderCommandReactor};
//! use tokio::sync::broadcast;
//!
//! // 创建编排引擎
//! let engine = Arc::new(OrchestrationEngine::new(event_store, projection_repo));
//!
//! // 创建关闭信号通道
//! let (shutdown_tx, _) = broadcast::channel(1);
//!
//! // 创建并启动反应器
//! let reactor = ProviderCommandReactor::new(engine.clone());
//! let shutdown_rx = shutdown_tx.subscribe();
//!
//! tokio::spawn(async move {
//!     reactor.run(shutdown_rx).await.unwrap();
//! });
//!
//! // 需要关闭时发送信号
//! shutdown_tx.send(()).ok();
//! ```
//!
//! # 扩展指南
//!
//! 可根据业务需求新增自定义反应器，步骤如下：
//!
//! 1. **定义反应器结构体**：包含必要的依赖（通常是 `Arc<OrchestrationEngine>`）
//! 2. **实现 `new` 方法**：初始化反应器实例
//! 3. **实现 `run` 方法**：
//!    - 订阅事件流：`engine.stream_domain_events()`
//!    - 使用 `tokio::select!` 同时监听关闭信号和事件
//!    - 在 `handle_event` 中实现具体逻辑
//! 4. **实现 `handle_event` 方法**：
//!    - 使用 `match` 匹配感兴趣的事件类型
//!    - 对不关心的事件直接忽略（`_ => {}`）
//!    - 错误处理：记录日志但不中断反应器运行
//!
//! # 错误处理策略
//!
//! - **事件处理错误**：记录警告日志，继续处理后续事件
//! - **事件接收错误**：记录警告日志，通常表示通道已关闭
//! - **关闭信号**：优雅退出，完成当前处理后返回
//!
//! # 性能考虑
//!
//! - 每个反应器独立订阅事件流，互不干扰
//! - 事件处理应尽量异步化，避免阻塞反应器循环
//! - 对于耗时操作，建议 spawn 新的异步任务

use std::sync::Arc;

use remi_core::events::OrchestrationEvent;
use tokio::sync::broadcast;
use tracing::{info, warn};

use crate::engine::OrchestrationEngine;
use crate::error::OrchestrationResult;

/// Provider 命令反应器
///
/// 监听编排事件流，当收到与 Provider 相关的事件时触发相应的调用：
/// - `ThreadTurnStartRequested`: 启动 Turn（调用 Provider 开始处理）
/// - `ThreadTurnInterruptRequested`: 中断 Turn（调用 Provider 停止处理）
/// - `ThreadSessionStopRequested`: 停止会话（调用 Provider 清理会话）
///
/// # 使用场景
///
/// 当用户发起对话、中断生成或停止会话时，本反应器负责将事件转换为
/// 对底层 Provider（如 Codex、OpenAI 等）的实际调用。
pub struct ProviderCommandReactor {
    /// 编排引擎实例，用于订阅领域事件流
    engine: Arc<OrchestrationEngine>,
}

impl ProviderCommandReactor {
    /// 创建新的 Provider 命令反应器
    ///
    /// # 参数
    ///
    /// - `engine`: 编排引擎实例，用于获取事件流
    ///
    /// # 返回值
    ///
    /// 返回配置完成的反应器实例，需调用 [`ProviderCommandReactor::run`] 启动运行。
    pub fn new(engine: Arc<OrchestrationEngine>) -> Self {
        Self { engine }
    }

    /// 启动反应器主循环
    ///
    /// 持续监听领域事件流，根据事件类型执行相应的 Provider 调用。
    /// 支持优雅关闭：收到关闭信号后退出循环。
    ///
    /// # 参数
    ///
    /// - `shutdown`: 关闭信号接收器，当收到信号时反应器将优雅退出
    ///
    /// # 返回值
    ///
    /// 正常关闭时返回 `Ok(())`，发生错误时返回相应错误。
    ///
    /// # 运行流程
    ///
    /// 1. 订阅编排引擎的领域事件流
    /// 2. 进入主循环，同时监听关闭信号和新事件
    /// 3. 收到事件后调用 `handle_event` 处理
    /// 4. 处理错误时记录警告日志，不中断反应器运行
    /// 5. 收到关闭信号后退出循环
    pub async fn run(&self, mut shutdown: broadcast::Receiver<()>) -> OrchestrationResult<()> {
        info!("ProviderCommandReactor 启动");

        // 订阅编排引擎的领域事件流
        let mut event_rx = self.engine.stream_domain_events();

        loop {
            tokio::select! {
                // 监听关闭信号
                _ = shutdown.recv() => {
                    info!("ProviderCommandReactor 收到关闭信号");
                    break;
                }
                // 监听领域事件
                event = event_rx.recv() => {
                    match event {
                        Ok(event) => {
                            // 处理事件，错误时记录警告但不中断反应器
                            if let Err(e) = self.handle_event(event).await {
                                warn!("ProviderCommandReactor 处理事件错误: {}", e);
                            }
                        }
                        Err(e) => {
                            // 事件接收错误（如通道关闭），记录警告
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
    /// 根据事件类型执行相应的 Provider 调用逻辑。
    ///
    /// # 参数
    ///
    /// - `event`: 待处理的领域事件
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Ok(())`，发生错误时返回相应错误。
    ///
    /// # 事件处理
    ///
    /// - `ThreadTurnStartRequested`: 调用 Provider 启动 Turn
    /// - `ThreadTurnInterruptRequested`: 调用 Provider 中断 Turn
    /// - `ThreadSessionStopRequested`: 调用 Provider 停止会话
    /// - 其他事件：忽略
    async fn handle_event(&self, event: OrchestrationEvent) -> OrchestrationResult<()> {
        match event {
            OrchestrationEvent::ThreadTurnStartRequested(e) => {
                info!("处理 Turn 启动请求: thread_id={}, turn_id={}", e.thread_id, e.turn_id);
                // TODO: 从引擎获取 Provider 服务，调用 send_turn
                // let provider_service = self.engine.provider_service();
                // let input = TurnInput { thread_id: e.thread_id, turn_id: e.turn_id, ... };
                // provider_service.send_turn(input).await?;
            }
            OrchestrationEvent::ThreadTurnInterruptRequested(e) => {
                info!("处理 Turn 中断请求: thread_id={}, turn_id={}", e.thread_id, e.turn_id);
                // TODO: 调用 Provider 中断 Turn
                // let provider_service = self.engine.provider_service();
                // provider_service.interrupt_turn(&e.thread_id, Some(&e.turn_id), provider).await?;
            }
            OrchestrationEvent::ThreadSessionStopRequested(e) => {
                info!("处理会话停止请求: thread_id={}", e.thread_id);
                // TODO: 调用 Provider 停止会话
                // let provider_service = self.engine.provider_service();
                // provider_service.stop_session(&e.thread_id, provider).await?;
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
///
/// # 使用场景
///
/// 当用户请求回滚到某个检查点时，本反应器负责：
/// - 恢复线程状态到检查点时刻
/// - 清理检查点之后的事件和投影数据
/// - 通知相关组件状态变更
pub struct CheckpointReactor {
    /// 编排引擎实例，用于订阅领域事件流
    engine: Arc<OrchestrationEngine>,
}

impl CheckpointReactor {
    /// 创建新的检查点反应器
    ///
    /// # 参数
    ///
    /// - `engine`: 编排引擎实例，用于获取事件流
    ///
    /// # 返回值
    ///
    /// 返回配置完成的反应器实例，需调用 [`CheckpointReactor::run`] 启动运行。
    pub fn new(engine: Arc<OrchestrationEngine>) -> Self {
        Self { engine }
    }

    /// 启动反应器主循环
    ///
    /// 持续监听领域事件流，处理检查点相关事件。
    /// 支持优雅关闭：收到关闭信号后退出循环。
    ///
    /// # 参数
    ///
    /// - `shutdown`: 关闭信号接收器，当收到信号时反应器将优雅退出
    ///
    /// # 返回值
    ///
    /// 正常关闭时返回 `Ok(())`，发生错误时返回相应错误。
    pub async fn run(&self, mut shutdown: broadcast::Receiver<()>) -> OrchestrationResult<()> {
        info!("CheckpointReactor 启动");

        // 订阅编排引擎的领域事件流
        let mut event_rx = self.engine.stream_domain_events();

        loop {
            tokio::select! {
                // 监听关闭信号
                _ = shutdown.recv() => {
                    info!("CheckpointReactor 收到关闭信号");
                    break;
                }
                // 监听领域事件
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
    /// 根据事件类型执行相应的检查点操作。
    ///
    /// # 参数
    ///
    /// - `event`: 待处理的领域事件
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Ok(())`，发生错误时返回相应错误。
    ///
    /// # 事件处理
    ///
    /// - `ThreadCheckpointRevertRequested`: 执行检查点回滚
    /// - 其他事件：忽略
    async fn handle_event(&self, event: OrchestrationEvent) -> OrchestrationResult<()> {
        match event {
            OrchestrationEvent::ThreadCheckpointRevertRequested(e) => {
                info!("处理检查点回滚请求: thread_id={}, checkpoint_id={}", e.thread_id, e.checkpoint_id);
                // TODO: 从引擎获取 checkpoint 服务，执行回滚
                // let checkpoint_service = self.engine.checkpoint_service();
                // checkpoint_service.revert_to_checkpoint(&e.thread_id, &e.checkpoint_id).await?;
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
///
/// # 使用场景
///
/// 当线程被删除时，本反应器负责清理以下资源：
/// - Provider 会话（如正在运行的 Turn）
/// - 检查点数据
/// - 其他与线程关联的外部资源
pub struct ThreadDeletionReactor {
    /// 编排引擎实例，用于订阅领域事件流
    engine: Arc<OrchestrationEngine>,
}

impl ThreadDeletionReactor {
    /// 创建新的线程删除反应器
    ///
    /// # 参数
    ///
    /// - `engine`: 编排引擎实例，用于获取事件流
    ///
    /// # 返回值
    ///
    /// 返回配置完成的反应器实例，需调用 [`ThreadDeletionReactor::run`] 启动运行。
    pub fn new(engine: Arc<OrchestrationEngine>) -> Self {
        Self { engine }
    }

    /// 启动反应器主循环
    ///
    /// 持续监听领域事件流，处理线程删除事件。
    /// 支持优雅关闭：收到关闭信号后退出循环。
    ///
    /// # 参数
    ///
    /// - `shutdown`: 关闭信号接收器，当收到信号时反应器将优雅退出
    ///
    /// # 返回值
    ///
    /// 正常关闭时返回 `Ok(())`，发生错误时返回相应错误。
    pub async fn run(&self, mut shutdown: broadcast::Receiver<()>) -> OrchestrationResult<()> {
        info!("ThreadDeletionReactor 启动");

        // 订阅编排引擎的领域事件流
        let mut event_rx = self.engine.stream_domain_events();

        loop {
            tokio::select! {
                // 监听关闭信号
                _ = shutdown.recv() => {
                    info!("ThreadDeletionReactor 收到关闭信号");
                    break;
                }
                // 监听领域事件
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
    /// 根据事件类型执行相应的资源清理操作。
    ///
    /// # 参数
    ///
    /// - `event`: 待处理的领域事件
    ///
    /// # 返回值
    ///
    /// 成功时返回 `Ok(())`，发生错误时返回相应错误。
    ///
    /// # 事件处理
    ///
    /// - `ThreadDeleted`: 清理线程相关资源（Provider 会话、检查点等）
    /// - 其他事件：忽略
    async fn handle_event(&self, event: OrchestrationEvent) -> OrchestrationResult<()> {
        match event {
            OrchestrationEvent::ThreadDeleted(e) => {
                info!("处理线程删除: thread_id={}", e.thread_id);
                // TODO: 从引擎获取 provider 和 checkpoint 服务，清理资源
                // let provider_service = self.engine.provider_service();
                // provider_service.stop_session(&e.thread_id, provider).await?;
                // let checkpoint_service = self.engine.checkpoint_service();
                // checkpoint_service.delete_thread_checkpoints(&e.thread_id).await?;
            }
            _ => {
                // 忽略其他事件类型
            }
        }

        Ok(())
    }
}
