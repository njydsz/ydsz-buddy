//! 投影器

use std::sync::Arc;

use remi_core::events::OrchestrationEvent;
use remi_persistence::{EventStore, ProjectionRepository, SqliteEventStore, SqliteProjectionRepository};
use tokio::sync::broadcast;
use tracing::{info, warn};

use crate::error::{OrchestrationError, OrchestrationResult};

/// 投影器
pub struct Projector {
    event_store: Arc<SqliteEventStore>,
    projection_repo: Arc<SqliteProjectionRepository>,
    projector_name: String,
}

impl Projector {
    /// 创建新的投影器
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

    /// 运行投影器
    pub async fn run(&self, mut shutdown: broadcast::Receiver<()>) -> OrchestrationResult<()> {
        info!("投影器启动: {}", self.projector_name);

        // 获取上次处理的序列号
        let mut last_sequence = self.projection_repo.get_projection_state(&self.projector_name)?;
        info!("从序列号 {} 开始投影", last_sequence);

        loop {
            tokio::select! {
                _ = shutdown.recv() => {
                    info!("投影器收到关闭信号");
                    break;
                }
                _ = tokio::time::sleep(tokio::time::Duration::from_millis(100)) => {
                    // 轮询新事件
                    if let Err(e) = self.process_events(&mut last_sequence).await {
                        warn!("投影处理错误: {}", e);
                    }
                }
            }
        }

        info!("投影器已停止: {}", self.projector_name);
        Ok(())
    }

    /// 处理新事件
    async fn process_events(&self, last_sequence: &mut u64) -> OrchestrationResult<()> {
        let events = self.event_store.read_events(*last_sequence, 100)?;

        if events.is_empty() {
            return Ok(());
        }

        for stored_event in events {
            let event: OrchestrationEvent = serde_json::from_str(&stored_event.payload)?;
            self.apply_event(&event).await?;
            *last_sequence = stored_event.sequence;
        }

        // 更新投影器状态
        self.projection_repo.update_projection_state(&self.projector_name, *last_sequence)?;

        Ok(())
    }

    /// 应用单个事件
    async fn apply_event(&self, event: &OrchestrationEvent) -> OrchestrationResult<()> {
        // 这里可以实现具体的投影逻辑
        // 目前由 OrchestrationEngine 直接处理，投影器主要用于异步消费
        Ok(())
    }
}
