//! Provider registry.

use crate::traits::ProviderAdapter;
use dashmap::DashMap;
use remi_contracts::{ProviderHealth, ProviderInfo, ProviderName};
use std::sync::Arc;
use tracing::{error, info};

/// Registry of provider adapters.
#[derive(Clone)]
pub struct ProviderRegistry {
    adapters: Arc<DashMap<ProviderName, Arc<dyn ProviderAdapter>>>,
}

impl ProviderRegistry {
    /// Create a new empty provider registry.
    pub fn new() -> Self {
        Self {
            adapters: Arc::new(DashMap::new()),
        }
    }

    /// Register a provider adapter.
    pub fn register(&self, adapter: Arc<dyn ProviderAdapter>) {
        let info = adapter.info();
        let name = info.name.clone();
        self.adapters.insert(name.clone(), adapter);
        info!(provider = %name, "Registered provider adapter");
    }

    /// Get a provider adapter by name.
    pub fn get(&self, name: &ProviderName) -> Option<Arc<dyn ProviderAdapter>> {
        self.adapters.get(name).map(|a| a.clone())
    }

    /// List all registered providers.
    pub fn list(&self) -> Vec<ProviderInfo> {
        self.adapters.iter().map(|a| a.value().info()).collect()
    }

    /// Check health of all registered providers.
    pub async fn health_check_all(&self) -> Vec<ProviderHealth> {
        let mut results = Vec::with_capacity(self.adapters.len());
        for adapter in self.adapters.iter() {
            match adapter.value().health().await {
                Ok(health) => results.push(health),
                Err(e) => {
                    error!(provider = %adapter.key(), error = %e, "Health check failed");
                }
            }
        }
        results
    }

    /// Returns true if the registry contains an adapter for the given provider.
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
