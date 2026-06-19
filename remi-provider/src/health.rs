//! Provider 健康检查

use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use remi_core::provider::ProviderKind;
use tokio::sync::RwLock;
use tracing::{info, warn};

use crate::error::ProviderResult;

/// Provider 健康状态
#[derive(Debug, Clone)]
pub struct ProviderHealthStatus {
    /// Provider 类型
    pub provider: ProviderKind,
    /// 是否可用
    pub available: bool,
    /// 最后检查时间
    pub last_checked: DateTime<Utc>,
    /// 状态消息
    pub message: Option<String>,
}

/// Provider 健康检查服务
pub struct ProviderHealth {
    status_cache: Arc<RwLock<HashMap<ProviderKind, ProviderHealthStatus>>>,
}

impl ProviderHealth {
    /// 创建新的健康检查服务
    pub fn new() -> Self {
        Self {
            status_cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// 检查 Provider 健康状态
    pub async fn check_health(&self, provider: ProviderKind) -> ProviderResult<ProviderHealthStatus> {
        info!("检查 Provider 健康状态: {:?}", provider);

        // TODO: 实现具体的健康检查逻辑
        // 目前返回默认可用状态
        let status = ProviderHealthStatus {
            provider,
            available: true,
            last_checked: Utc::now(),
            message: Some("健康检查未实现".to_string()),
        };

        // 缓存状态
        let mut cache = self.status_cache.write().await;
        cache.insert(provider, status.clone());

        Ok(status)
    }

    /// 获取缓存的健康状态
    pub async fn get_cached_status(
        &self,
        provider: ProviderKind,
    ) -> Option<ProviderHealthStatus> {
        let cache = self.status_cache.read().await;
        cache.get(&provider).cloned()
    }

    /// 检查所有 Provider 健康状态
    pub async fn check_all_health(&self, providers: &[ProviderKind]) -> Vec<ProviderHealthStatus> {
        let mut statuses = Vec::new();

        for provider in providers {
            match self.check_health(*provider).await {
                Ok(status) => statuses.push(status),
                Err(e) => {
                    warn!("检查 Provider {:?} 健康状态失败: {}", provider, e);
                    statuses.push(ProviderHealthStatus {
                        provider: *provider,
                        available: false,
                        last_checked: Utc::now(),
                        message: Some(format!("检查失败: {}", e)),
                    });
                }
            }
        }

        statuses
    }
}

impl Default for ProviderHealth {
    fn default() -> Self {
        Self::new()
    }
}
