//! Provider 会话清理模块
//!
//! 本模块提供自动清理过期会话的功能，防止会话资源泄漏。
//! 通过后台定时任务扫描并清理超过 TTL 的会话。
//!
//! # 清理策略
//!
//! - **默认 TTL**：24 小时
//! - **默认检查间隔**：30 分钟
//! - **过期判断**：会话创建时间超过 TTL 即视为过期
//! - **清理动作**：调用 `ProviderService::stop_session` 停止过期会话
//!
//! # 使用示例
//!
//! ```rust,ignore
//! use remi_provider::reaper::SessionReaper;
//! use remi_provider::ProviderService;
//! use std::sync::Arc;
//! use std::time::Duration;
//!
//! let service = Arc::new(ProviderService::new());
//! let reaper = Arc::new(SessionReaper::new(
//!     service,
//!     Duration::from_secs(86400),
//!     Duration::from_secs(1800),
//! ));
//! reaper.start();
//! // 需要关闭时
//! reaper.stop();
//! ```

use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use tokio::sync::watch;
use tracing::{info, warn};

use crate::error::ProviderResult;
use crate::service::ProviderService;

/// 默认 TTL：24 小时
pub const DEFAULT_TTL: Duration = Duration::from_secs(86400);

/// 默认检查间隔：30 分钟
pub const DEFAULT_CHECK_INTERVAL: Duration = Duration::from_secs(1800);

/// Provider 会话清理服务
///
/// 负责定期扫描并清理过期的 Provider 会话，防止资源泄漏。
/// 内部维护一个后台定时任务，按照固定间隔执行清理操作。
///
/// # 清理策略
///
/// - **扫描间隔**：默认 30 分钟
/// - **过期判断**：会话创建时间超过 TTL 即视为过期
/// - **清理动作**：调用 `ProviderService::stop_session` 停止过期会话
///
/// # 线程安全
///
/// 本结构体持有 `ProviderService` 的 `Arc` 引用，支持多线程并发访问。
/// 使用 `tokio::sync::watch` 实现优雅停止。
pub struct SessionReaper {
    /// Provider 服务引用
    provider_service: Arc<ProviderService>,

    /// 会话 TTL（最大存活时间）
    ttl: Duration,

    /// 检查间隔
    check_interval: Duration,

    /// 停止信号发送端
    stop_tx: watch::Sender<bool>,

    /// 停止信号接收端
    stop_rx: watch::Receiver<bool>,
}

impl SessionReaper {
    /// 创建新的会话清理服务实例
    ///
    /// # 参数
    ///
    /// - `provider_service`: Provider 服务的 `Arc` 引用
    /// - `ttl`: 会话最大存活时间，超过此时间的会话将被清理
    /// - `check_interval`: 清理检查间隔
    pub fn new(
        provider_service: Arc<ProviderService>,
        ttl: Duration,
        check_interval: Duration,
    ) -> Self {
        let (stop_tx, stop_rx) = watch::channel(false);
        Self {
            provider_service,
            ttl,
            check_interval,
            stop_tx,
            stop_rx,
        }
    }

    /// 启动后台清理任务
    ///
    /// 创建一个 tokio 后台任务，按 `check_interval` 的间隔定期扫描
    /// 并清理过期会话。可通过 `stop()` 方法优雅停止。
    pub fn start(&self) {
        let provider_service = self.provider_service.clone();
        let ttl = self.ttl;
        let check_interval = self.check_interval;
        let mut stop_rx = self.stop_rx.clone();

        tokio::spawn(async move {
            info!(
                "SessionReaper 启动，TTL: {:?}, 检查间隔: {:?}",
                ttl, check_interval
            );

            let mut interval = tokio::time::interval(check_interval);
            // 跳过首次立即触发，等待一个完整间隔后再开始
            interval.tick().await;

            loop {
                tokio::select! {
                    _ = stop_rx.changed() => {
                        info!("SessionReaper 收到停止信号");
                        break;
                    }
                    _ = interval.tick() => {
                        match reap_expired_sessions(&provider_service, ttl).await {
                            Ok(count) => {
                                if count > 0 {
                                    info!("SessionReaper 清理了 {} 个过期会话", count);
                                }
                            }
                            Err(e) => {
                                warn!("SessionReaper 清理会话失败: {}", e);
                            }
                        }
                    }
                }
            }

            info!("SessionReaper 已停止");
        });
    }

    /// 停止后台清理任务
    ///
    /// 发送停止信号，后台任务会在下一个检查周期退出。
    pub fn stop(&self) {
        let _ = self.stop_tx.send(true);
    }
}

/// 扫描并清理过期会话
///
/// 从 `ProviderService` 获取所有活跃会话，检查每个会话的 `created_at`，
/// 对超过 TTL 的会话调用 `stop_session` 进行清理。
async fn reap_expired_sessions(
    provider_service: &ProviderService,
    ttl: Duration,
) -> ProviderResult<usize> {
    let sessions = provider_service.list_sessions().await?;
    let now = Utc::now();
    let mut reaped_count = 0;

    for session in sessions {
        let age = now.signed_duration_since(session.created_at);
        if let Ok(age_duration) = age.to_std() {
            if age_duration > ttl {
                info!(
                    "清理过期会话: thread_id={}, provider={:?}, age={:?}",
                    session.thread_id, session.provider, age
                );

                if let Err(e) = provider_service
                    .stop_session(&session.thread_id, session.provider)
                    .await
                {
                    warn!("停止过期会话失败: {}", e);
                } else {
                    reaped_count += 1;
                }
            }
        }
    }

    Ok(reaped_count)
}
