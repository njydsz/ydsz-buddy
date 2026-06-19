//! Provider 会话清理

use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use remi_core::provider::ProviderKind;
use tokio::sync::RwLock;
use tracing::{info, warn};

use crate::error::ProviderResult;
use crate::service::ProviderService;

/// 会话清理服务
pub struct ProviderSessionReaper {
    provider_service: Arc<ProviderService>,
    max_age: Duration,
}

impl ProviderSessionReaper {
    /// 创建新的会话清理服务
    pub fn new(provider_service: Arc<ProviderService>, max_age: Duration) -> Self {
        Self {
            provider_service,
            max_age,
        }
    }

    /// 运行清理循环
    pub async fn run(&self, mut shutdown: tokio::sync::broadcast::Receiver<()>) -> ProviderResult<()> {
        info!("ProviderSessionReaper 启动，最大会话年龄: {:?}", self.max_age);

        let mut interval = tokio::time::interval(Duration::from_secs(300)); // 每 5 分钟清理一次

        loop {
            tokio::select! {
                _ = shutdown.recv() => {
                    info!("ProviderSessionReaper 收到关闭信号");
                    break;
                }
                _ = interval.tick() => {
                    if let Err(e) = self.reap_sessions().await {
                        warn!("清理会话失败: {}", e);
                    }
                }
            }
        }

        info!("ProviderSessionReaper 已停止");
        Ok(())
    }

    /// 清理过期会话
    async fn reap_sessions(&self) -> ProviderResult<()> {
        let sessions = self.provider_service.list_sessions().await?;
        let now = Utc::now();
        let mut reaped_count = 0;

        for session in sessions {
            let age = now.signed_duration_since(session.created_at);
            if age.to_std().unwrap_or(Duration::ZERO) > self.max_age {
                info!(
                    "清理过期会话: thread_id={}, provider={:?}, age={:?}",
                    session.thread_id, session.provider, age
                );

                if let Err(e) = self
                    .provider_service
                    .stop_session(&session.thread_id, session.provider)
                    .await
                {
                    warn!("停止过期会话失败: {}", e);
                } else {
                    reaped_count += 1;
                }
            }
        }

        if reaped_count > 0 {
            info!("清理了 {} 个过期会话", reaped_count);
        }

        Ok(())
    }
}
