//! 反应器（Reactor）

use std::sync::Arc;

use remi_core::events::OrchestrationEvent;
use tokio::sync::broadcast;
use tracing::{info, warn};

use crate::engine::OrchestrationEngine;
use crate::error::OrchestrationResult;

/// Provider 命令反应器
/// 监听编排事件，触发 Provider 调用
pub struct ProviderCommandReactor {
    engine: Arc<OrchestrationEngine>,
}

impl ProviderCommandReactor {
    /// 创建新的反应器
    pub fn new(engine: Arc<OrchestrationEngine>) -> Self {
        Self { engine }
    }

    /// 运行反应器
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

    /// 处理单个事件
    async fn handle_event(&self, event: OrchestrationEvent) -> OrchestrationResult<()> {
        match event {
            OrchestrationEvent::ThreadTurnStartRequested(e) => {
                info!("处理 Turn 启动请求: thread_id={}, turn_id={}", e.thread_id, e.turn_id);
                // TODO: 调用 Provider 启动 Turn
            }
            OrchestrationEvent::ThreadTurnInterruptRequested(e) => {
                info!("处理 Turn 中断请求: thread_id={}, turn_id={}", e.thread_id, e.turn_id);
                // TODO: 调用 Provider 中断 Turn
            }
            OrchestrationEvent::ThreadSessionStopRequested(e) => {
                info!("处理会话停止请求: thread_id={}", e.thread_id);
                // TODO: 调用 Provider 停止会话
            }
            _ => {
                // 忽略其他事件
            }
        }

        Ok(())
    }
}

/// 检查点反应器
/// 监听检查点相关事件
pub struct CheckpointReactor {
    engine: Arc<OrchestrationEngine>,
}

impl CheckpointReactor {
    /// 创建新的反应器
    pub fn new(engine: Arc<OrchestrationEngine>) -> Self {
        Self { engine }
    }

    /// 运行反应器
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

    /// 处理单个事件
    async fn handle_event(&self, event: OrchestrationEvent) -> OrchestrationResult<()> {
        match event {
            OrchestrationEvent::ThreadCheckpointRevertRequested(e) => {
                info!("处理检查点回滚请求: thread_id={}, checkpoint_id={}", e.thread_id, e.checkpoint_id);
                // TODO: 执行检查点回滚
            }
            _ => {
                // 忽略其他事件
            }
        }

        Ok(())
    }
}

/// 线程删除反应器
/// 监听线程删除事件，清理相关资源
pub struct ThreadDeletionReactor {
    engine: Arc<OrchestrationEngine>,
}

impl ThreadDeletionReactor {
    /// 创建新的反应器
    pub fn new(engine: Arc<OrchestrationEngine>) -> Self {
        Self { engine }
    }

    /// 运行反应器
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

    /// 处理单个事件
    async fn handle_event(&self, event: OrchestrationEvent) -> OrchestrationResult<()> {
        match event {
            OrchestrationEvent::ThreadDeleted(e) => {
                info!("处理线程删除: thread_id={}", e.thread_id);
                // TODO: 清理线程相关资源（Provider 会话、检查点等）
            }
            _ => {
                // 忽略其他事件
            }
        }

        Ok(())
    }
}
