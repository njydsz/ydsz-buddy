//! # Provider Status Cache 模块
//!
//! Provider 状态缓存层，缓存 `ProviderStatus` / `ProviderAuthStatus` / `ProviderHealthStatus`，
//! 避免每次前端请求都穿透到底层 CLI 探测。
//!
//! ## 设计
//!
//! - 每次写入带 TTL（默认 30 秒），过期后下次读取触发刷新
//! - 支持强制刷新
//! - 集中存储（不分散在各个适配器里）
//! - 线程安全（`RwLock`）
//!
//! ## 与 `health` 模块的关系
//!
//! - `health` 模块关注'能不能跑 CLI'（粗粒度可用性）
//! - 本模块关注'Provider 当前状态/认证/版本'（细粒度）
//!
//! 两者互补：health 用于熔断与告警；status_cache 用于前端展示。

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use remi_core::provider::ProviderKind;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

/// 默认 TTL
pub const STATUS_CACHE_DEFAULT_TTL: Duration = Duration::from_secs(30);

/// 缓存条目
#[derive(Debug, Clone)]
struct CacheEntry<T: Clone> {
    value: T,
    inserted_at: Instant,
}

impl<T: Clone> CacheEntry<T> {
    fn new(value: T) -> Self {
        Self {
            value,
            inserted_at: Instant::now(),
        }
    }

    fn is_fresh(&self, ttl: Duration) -> bool {
        self.inserted_at.elapsed() < ttl
    }
}

/// 通用状态缓存
#[derive(Debug)]
pub struct StatusCache<T: Clone + Send + Sync + 'static> {
    ttl: Duration,
    inner: Arc<RwLock<HashMap<ProviderKind, CacheEntry<T>>>>,
}

impl<T: Clone + Send + Sync + 'static> StatusCache<T> {
    /// 创建带默认 TTL（30s）的缓存
    pub fn new() -> Self {
        Self::with_ttl(STATUS_CACHE_DEFAULT_TTL)
    }

    /// 创建带自定义 TTL 的缓存
    pub fn with_ttl(ttl: Duration) -> Self {
        Self {
            ttl,
            inner: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// 读取（未命中或已过期返回 None，由调用方决定是否刷新）
    pub async fn get_fresh(&self, provider: ProviderKind) -> Option<T> {
        let cache = self.inner.read().await;
        cache
            .get(&provider)
            .filter(|e| e.is_fresh(self.ttl))
            .map(|e| e.value.clone())
    }

    /// 读取（不过滤过期；用于调试 / 强制覆盖）
    pub async fn get_any(&self, provider: ProviderKind) -> Option<T> {
        let cache = self.inner.read().await;
        cache.get(&provider).map(|e| e.value.clone())
    }

    /// 写入
    pub async fn put(&self, provider: ProviderKind, value: T) {
        let mut cache = self.inner.write().await;
        cache.insert(provider, CacheEntry::new(value));
    }

    /// 清除单个 provider 的缓存
    pub async fn invalidate(&self, provider: ProviderKind) {
        let mut cache = self.inner.write().await;
        cache.remove(&provider);
    }

    /// 清除全部
    pub async fn clear(&self) {
        let mut cache = self.inner.write().await;
        cache.clear();
    }

    /// TTL
    pub fn ttl(&self) -> Duration {
        self.ttl
    }
}

impl<T: Clone + Send + Sync + 'static> Default for StatusCache<T> {
    fn default() -> Self {
        Self::new()
    }
}

/// 缓存中的 Provider 状态（前端展示）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedProviderStatus {
    /// Provider 类型
    pub provider: ProviderKind,
    /// 是否已安装 CLI
    pub cli_available: bool,
    /// CLI 版本（若可读出）
    pub cli_version: Option<String>,
    /// 认证状态字符串（如 'authenticated' / 'expired' / 'missing'）
    pub auth_state: String,
    /// 最近一次刷新时间（毫秒时间戳）
    pub refreshed_at_ms: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_ttl_is_thirty_seconds() {
        assert_eq!(StatusCache::<u8>::new().ttl(), Duration::from_secs(30));
    }

    #[tokio::test]
    async fn put_and_get_fresh() {
        let cache = StatusCache::<u8>::new();
        cache.put(ProviderKind::ClaudeAgent, 42).await;
        assert_eq!(cache.get_fresh(ProviderKind::ClaudeAgent).await, Some(42));
    }

    #[tokio::test]
    async fn get_fresh_expires() {
        let cache = StatusCache::<u8>::with_ttl(Duration::from_millis(50));
        cache.put(ProviderKind::ClaudeAgent, 1).await;
        assert_eq!(cache.get_fresh(ProviderKind::ClaudeAgent).await, Some(1));
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert_eq!(cache.get_fresh(ProviderKind::ClaudeAgent).await, None);
        // get_any 仍能拿到（不过滤）
        assert_eq!(cache.get_any(ProviderKind::ClaudeAgent).await, Some(1));
    }

    #[tokio::test]
    async fn invalidate_removes_entry() {
        let cache = StatusCache::<u8>::new();
        cache.put(ProviderKind::ClaudeAgent, 1).await;
        cache.invalidate(ProviderKind::ClaudeAgent).await;
        assert_eq!(cache.get_fresh(ProviderKind::ClaudeAgent).await, None);
    }

    #[tokio::test]
    async fn clear_removes_all() {
        let cache = StatusCache::<u8>::new();
        cache.put(ProviderKind::ClaudeAgent, 1).await;
        cache.put(ProviderKind::Codex, 2).await;
        cache.clear().await;
        assert_eq!(cache.get_fresh(ProviderKind::ClaudeAgent).await, None);
        assert_eq!(cache.get_fresh(ProviderKind::Codex).await, None);
    }
}

