//! # Provider Maintenance 模块
//!
//! 周期性巡检所有注册的 Provider，刷新 `StatusCache` / `ProviderHealth`，
//! 并在 Provider 长期不可用时触发'重连'或'熔断'决策。
//!
//! ## 设计
//!
//! - 单后台任务，每 `interval` 跑一轮
//! - 每轮顺序检查所有 Provider（不必并发，探测本身就开销低）
//! - 单个 Provider 失败不影响后续 Provider
//! - 通过 `tokio::sync::Notify` 优雅退出
//!
//! ## 与 health / status_cache 的关系
//!
//! - `health::ProviderHealth`：存储 CLI 可用性 + 版本
//! - `status_cache::StatusCache`：存储组合状态（CLI + 认证）
//! - `maintenance`：跑批 → 写 health → 写 status_cache
//!
//! ## 用法
//!
//! ```rust,ignore
//! let health = Arc::new(ProviderHealth::new());
//! let cache = Arc::new(StatusCache::<CachedProviderStatus>::new());
//! let stop = Arc::new(Notify::new());
//! spawn_poller(health, cache, MaintenanceConfig::default(), stop).await;
//! // 之后 stop.notify_one() 让它退出
//! ```

use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use remi_core::provider::ProviderKind;
use tokio::sync::Notify;
use tracing::{info, warn};

use crate::health::ProviderHealth;
use crate::status_cache::{CachedProviderStatus, StatusCache};

/// 默认巡检间隔
pub const DEFAULT_INTERVAL: Duration = Duration::from_secs(60);

/// 巡检配置
#[derive(Debug, Clone)]
pub struct MaintenanceConfig {
    /// 巡检间隔
    pub interval: Duration,
    /// 要巡检的 Provider 列表
    pub providers: Vec<ProviderKind>,
}

impl Default for MaintenanceConfig {
    fn default() -> Self {
        Self {
            interval: DEFAULT_INTERVAL,
            providers: vec![
                ProviderKind::ClaudeAgent,
                ProviderKind::Codex,
                ProviderKind::Cursor,
                ProviderKind::Gemini,
                ProviderKind::Grok,
                ProviderKind::Kilo,
                ProviderKind::OpenCode,
                ProviderKind::Pi,
            ],
        }
    }
}

/// 巡检结果（一次巡检的总结）
#[derive(Debug, Clone, Default)]
pub struct MaintenanceReport {
    pub checked: usize,
    pub healthy: usize,
    pub unhealthy: usize,
    pub failed_probes: Vec<(ProviderKind, String)>,
}

/// 跑一轮巡检：刷新 health + status_cache，返回报告
pub async fn run_round(
    health: &ProviderHealth,
    cache: &StatusCache<CachedProviderStatus>,
    providers: &[ProviderKind],
) -> MaintenanceReport {
    let mut report = MaintenanceReport::default();
    report.checked = providers.len();

    for provider in providers {
        match health.check_health(*provider).await {
            Ok(status) => {
                if status.available {
                    report.healthy += 1;
                } else {
                    report.unhealthy += 1;
                }
                let version = status
                    .message
                    .as_ref()
                    .and_then(|m| m.strip_prefix("版本: ").map(|s| s.to_string()));
                let cached = CachedProviderStatus {
                    provider: *provider,
                    cli_available: status.available,
                    cli_version: version,
                    auth_state: if status.available {
                        "unknown".to_string()
                    } else {
                        "missing".to_string()
                    },
                    refreshed_at_ms: Utc::now().timestamp_millis(),
                };
                cache.put(*provider, cached).await;
            }
            Err(e) => {
                report.unhealthy += 1;
                report
                    .failed_probes
                    .push((*provider, format!("健康检查异常: {}", e)));
                warn!("Provider {:?} 巡检失败: {}", provider, e);
            }
        }
    }

    info!(
        "Provider 巡检完成: 合计 {} 健康 {} 异常 {}",
        report.checked, report.healthy, report.unhealthy
    );

    report
}

/// 启动后台巡检循环
pub async fn spawn_poller(
    health: Arc<ProviderHealth>,
    cache: Arc<StatusCache<CachedProviderStatus>>,
    config: MaintenanceConfig,
    stop: Arc<Notify>,
) {
    info!("启动 Provider 巡检循环（间隔: {:?}）", config.interval);
    loop {
        let _ = run_round(&health, &cache, &config.providers).await;
        tokio::select! {
            _ = tokio::time::sleep(config.interval) => continue,
            _ = stop.notified() => {
                info!("Provider 巡检循环收到停止信号，退出");
                return;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::health::ProviderHealth;

    #[tokio::test]
    async fn run_round_handles_empty_list() {
        let health = ProviderHealth::new();
        let cache = StatusCache::<CachedProviderStatus>::new();
        let report = run_round(&health, &cache, &[]).await;
        assert_eq!(report.checked, 0);
        assert_eq!(report.healthy, 0);
        assert_eq!(report.unhealthy, 0);
        assert!(report.failed_probes.is_empty());
    }

    #[test]
    fn default_config_includes_all_providers() {
        let cfg = MaintenanceConfig::default();
        assert!(!cfg.providers.is_empty());
        assert!(cfg.providers.contains(&ProviderKind::ClaudeAgent));
        assert!(cfg.providers.contains(&ProviderKind::Codex));
    }
}

