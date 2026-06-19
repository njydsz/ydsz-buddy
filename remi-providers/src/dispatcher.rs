//! Provider 调度器（Dispatcher）。
//!
//! 大厂标准：在多个 Provider 之间做 **负载均衡** + **故障转移**。
//! 支持以下策略：
//!
//! - `Failover` — 顺序尝试每个 Provider，直到一个成功
//! - `RoundRobin` — 轮询
//! - `Priority` — 按优先级尝试
//!
//! # 用法
//!
//! ```no_run
//! use remi_providers::{ProviderRegistry, dispatcher::{ProviderDispatcher, DispatchStrategy}};
//! use std::sync::Arc;
//!
//! # async fn run() {
//! let registry = Arc::new(ProviderRegistry::new());
//! // 注册多个 Provider...
//! let dispatcher = ProviderDispatcher::new(registry)
//!     .with_strategy(DispatchStrategy::Failover);
//! # }
//! ```

use crate::traits::ProviderAdapter;
use crate::ProviderRegistry;
use dashmap::DashMap;
use remi_contracts::{ProviderHealth, ProviderHealthStatus, ProviderInfo, ProviderName};
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{info, warn};

/// 调度策略。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DispatchStrategy {
    /// 顺序尝试每个 Provider，直到一个成功。
    Failover,
    /// 轮询：在每次请求后切换到下一个 Provider。
    RoundRobin,
    /// 按优先级排序：列表中靠前的优先。
    Priority,
}

impl Default for DispatchStrategy {
    fn default() -> Self {
        Self::Failover
    }
}

/// Provider 调度器。
///
/// 维护一个可选的 Provider 列表（按优先级排序），
/// 决定每个请求应该路由到哪个 Provider。
pub struct ProviderDispatcher {
    registry: Arc<ProviderRegistry>,
    /// Provider 优先级（按降序排列）。
    priority: Mutex<Vec<ProviderName>>,
    /// 轮询游标。
    rr_cursor: Mutex<usize>,
    /// 当前使用的策略。
    strategy: std::sync::RwLock<DispatchStrategy>,
    /// 健康状态缓存（避免每次请求都查询）。
    health_cache: DashMap<ProviderName, CachedHealth>,
}

/// 缓存的健康状态。
#[derive(Debug, Clone)]
struct CachedHealth {
    status: ProviderHealthStatus,
    last_checked: chrono::DateTime<chrono::Utc>,
}

impl CachedHealth {
    fn is_healthy(&self) -> bool {
        matches!(
            self.status,
            ProviderHealthStatus::Healthy | ProviderHealthStatus::Degraded
        )
    }
}

impl ProviderDispatcher {
    /// 创建一个新的 Provider 调度器。
    pub fn new(registry: Arc<ProviderRegistry>) -> Self {
        Self {
            registry,
            priority: Mutex::new(Vec::new()),
            rr_cursor: Mutex::new(0),
            strategy: std::sync::RwLock::new(DispatchStrategy::default()),
            health_cache: DashMap::new(),
        }
    }

    /// 设置调度策略。
    pub fn with_strategy(mut self, strategy: DispatchStrategy) -> Self {
        *self.strategy.write().unwrap() = strategy;
        self
    }

    /// 添加 Provider 到优先级列表。
    pub async fn add_priority(&self, name: ProviderName) {
        let mut p = self.priority.lock().await;
        if !p.contains(&name) {
            p.push(name);
        }
    }

    /// 清除所有优先级。
    pub async fn clear_priority(&self) {
        self.priority.lock().await.clear();
    }

    /// 选择下一个可用的 Provider。
    ///
    /// 返回 `None` 如果没有任何 Provider 可用。
    pub async fn select(&self) -> Option<Arc<dyn ProviderAdapter>> {
        let strategy = self.strategy.read().unwrap().clone();
        match strategy {
            DispatchStrategy::Failover => self.select_failover().await,
            DispatchStrategy::RoundRobin => self.select_round_robin().await,
            DispatchStrategy::Priority => self.select_priority().await,
        }
    }

    /// 强制刷新健康状态缓存。
    pub async fn refresh_health(&self) {
        let providers = self.registry.list();
        for info in providers {
            if let Some(adapter) = self.registry.get(&info.name) {
                if let Ok(health) = adapter.health().await {
                    self.health_cache.insert(
                        info.name.clone(),
                        CachedHealth {
                            status: health.status.clone(),
                            last_checked: chrono::Utc::now(),
                        },
                    );
                }
            }
        }
    }

    /// 获取所有 Provider 的健康状态。
    pub async fn health_all(&self) -> Vec<ProviderHealth> {
        self.refresh_health().await;
        let mut out = Vec::new();
        for entry in self.health_cache.iter() {
            let info = self
                .registry
                .get(entry.key())
                .map(|a| a.info())
                .unwrap_or_else(|| ProviderInfo {
                    name: entry.key().clone(),
                    display_name: String::new(),
                    models: vec![],
                    available: false,
                });
            out.push(ProviderHealth {
                provider: entry.key().clone(),
                status: entry.value().status.clone(),
                last_checked: entry.value().last_checked.to_rfc3339(),
                error: None,
            });
            let _ = info; // suppress unused
        }
        out
    }

    /// Failover 策略：返回第一个健康的 Provider。
    async fn select_failover(&self) -> Option<Arc<dyn ProviderAdapter>> {
        for info in self.registry.list() {
            if let Some(adapter) = self.registry.get(&info.name) {
                if self.is_healthy(&info.name).await {
                    return Some(adapter);
                }
            }
        }
        // 兜底：返回第一个可用的
        self.registry
            .list()
            .into_iter()
            .find(|p| p.available)
            .and_then(|p| self.registry.get(&p.name))
    }

    /// RoundRobin 策略。
    async fn select_round_robin(&self) -> Option<Arc<dyn ProviderAdapter>> {
        let providers = self.registry.list();
        if providers.is_empty() {
            return None;
        }
        let mut cursor = self.rr_cursor.lock().await;
        let start = *cursor;
        for offset in 0..providers.len() {
            let idx = (start + offset) % providers.len();
            let p = &providers[idx];
            if let Some(adapter) = self.registry.get(&p.name) {
                if self.is_healthy(&p.name).await {
                    *cursor = (idx + 1) % providers.len();
                    return Some(adapter);
                }
            }
        }
        None
    }

    /// Priority 策略。
    async fn select_priority(&self) -> Option<Arc<dyn ProviderAdapter>> {
        let priority = self.priority.lock().await.clone();
        for name in priority {
            if let Some(adapter) = self.registry.get(&name) {
                if self.is_healthy(&name).await {
                    return Some(adapter);
                }
            }
        }
        // 兜底：failover
        self.select_failover().await
    }

    /// 检查 Provider 是否健康。
    async fn is_healthy(&self, name: &ProviderName) -> bool {
        if let Some(cached) = self.health_cache.get(name) {
            return cached.is_healthy();
        }
        if let Some(adapter) = self.registry.get(name) {
            if let Ok(health) = adapter.health().await {
                let is_healthy = matches!(
                    health.status,
                    ProviderHealthStatus::Healthy | ProviderHealthStatus::Degraded
                );
                self.health_cache.insert(
                    name.clone(),
                    CachedHealth {
                        status: health.status,
                        last_checked: chrono::Utc::now(),
                    },
                );
                return is_healthy;
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::claude::ClaudeAdapter;
    use remi_contracts::ProviderName;

    #[test]
    fn test_dispatch_strategy_default() {
        assert_eq!(DispatchStrategy::default(), DispatchStrategy::Failover);
    }

    #[tokio::test]
    async fn test_dispatcher_creation() {
        let registry = Arc::new(ProviderRegistry::new());
        let dispatcher = ProviderDispatcher::new(registry);
        assert_eq!(
            *dispatcher.strategy.read().unwrap(),
            DispatchStrategy::Failover
        );
    }

    #[tokio::test]
    async fn test_select_without_providers() {
        let registry = Arc::new(ProviderRegistry::new());
        let dispatcher = ProviderDispatcher::new(registry);
        assert!(dispatcher.select().await.is_none());
    }

    #[tokio::test]
    async fn test_add_priority() {
        let registry = Arc::new(ProviderRegistry::new());
        let dispatcher = ProviderDispatcher::new(registry);
        dispatcher.add_priority(ProviderName::Claude).await;
        dispatcher.add_priority(ProviderName::Codex).await;
        dispatcher.add_priority(ProviderName::Claude).await; // dedupe
        let p = dispatcher.priority.lock().await;
        assert_eq!(p.len(), 2);
    }
}
