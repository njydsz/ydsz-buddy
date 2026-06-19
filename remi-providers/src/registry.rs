//! Provider 注册中心。

use crate::traits::ProviderAdapter;
use dashmap::DashMap;
use remi_contracts::{ProviderHealth, ProviderInfo, ProviderName};
use std::sync::Arc;
use tracing::{error, info};

/// Provider 适配器注册中心。
#[derive(Clone)]
pub struct ProviderRegistry {
    adapters: Arc<DashMap<ProviderName, Arc<dyn ProviderAdapter>>>,
}

impl ProviderRegistry {
    /// 创建新的空 Provider 注册中心。
    pub fn new() -> Self {
        Self {
            adapters: Arc::new(DashMap::new()),
        }
    }

    /// 注册 Provider 适配器。
    pub fn register(&self, adapter: Arc<dyn ProviderAdapter>) {
        let info = adapter.info();
        let name = info.name.clone();
        self.adapters.insert(name.clone(), adapter);
        info!(provider = %name, "已注册 Provider 适配器");
    }

    /// 根据名称获取 Provider 适配器。
    pub fn get(&self, name: &ProviderName) -> Option<Arc<dyn ProviderAdapter>> {
        self.adapters.get(name).map(|a| a.clone())
    }

    /// 列出所有已注册的 Provider。
    pub fn list(&self) -> Vec<ProviderInfo> {
        self.adapters.iter().map(|a| a.value().info()).collect()
    }

    /// 检查所有已注册 Provider 的健康状态。
    pub async fn health_check_all(&self) -> Vec<ProviderHealth> {
        let mut results = Vec::with_capacity(self.adapters.len());
        for adapter in self.adapters.iter() {
            match adapter.value().health().await {
                Ok(health) => results.push(health),
                Err(e) => {
                    error!(provider = %adapter.key(), error = %e, "健康检查失败");
                }
            }
        }
        results
    }

    /// 如果注册中心包含指定 Provider 的适配器，则返回 true。
    pub fn contains(&self, name: &ProviderName) -> bool {
        self.adapters.contains_key(name)
    }
}

impl Default for ProviderRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::claude::ClaudeAdapter;

    #[tokio::test]
    async fn test_provider_registry() {
        let registry = ProviderRegistry::new();
        let adapter = Arc::new(ClaudeAdapter::new());
        registry.register(adapter);

        let providers = registry.list();
        assert_eq!(providers.len(), 1);
        assert_eq!(providers[0].name, ProviderName::Claude);
        assert!(registry.contains(&ProviderName::Claude));
        assert!(!registry.contains(&ProviderName::Codex));
    }
}
