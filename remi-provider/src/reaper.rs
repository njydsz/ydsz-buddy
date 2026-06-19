//! Provider 会话清理模块
//!
//! 本模块提供自动清理过期会话的功能，防止会话资源泄漏。
//! 通过后台定时任务扫描并清理超过最大存活时间的会话。
//!
//! # 设计目标
//!
//! - **自动清理**：无需人工干预，定期扫描并清理过期会话
//! - **优雅关闭**：支持接收关闭信号，安全停止清理任务
//! - **容错处理**：单个会话清理失败不影响其他会话的处理
//!
//! # 使用示例
//!
//! ```rust,ignore
//! use remi_provider::reaper::ProviderSessionReaper;
//! use remi_provider::service::ProviderService;
//! use std::sync::Arc;
//! use std::time::Duration;
//!
//! let service = Arc::new(ProviderService::new());
//! let reaper = ProviderSessionReaper::new(service, Duration::from_secs(3600));
//!
//! // 启动清理任务
//! let (shutdown_tx, shutdown_rx) = tokio::sync::broadcast::channel(1);
//! tokio::spawn(async move {
//!     reaper.run(shutdown_rx).await.unwrap();
//! });
//!
//! // 需要关闭时
//! shutdown_tx.send(()).unwrap();
//! ```

use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use tracing::{info, warn};

use crate::error::ProviderResult;
use crate::service::ProviderService;

/// Provider 会话清理服务
///
/// 负责定期扫描并清理过期的 Provider 会话，防止资源泄漏。
/// 内部维护一个后台定时任务，按照固定间隔执行清理操作。
///
/// # 清理策略
///
/// - **扫描间隔**：每 5 分钟执行一次清理扫描
/// - **过期判断**：会话创建时间超过 `max_age` 即视为过期
/// - **清理动作**：调用 `ProviderService::stop_session` 停止过期会话
///
/// # 线程安全
///
/// 本结构体持有 `ProviderService` 的 `Arc` 引用，支持多线程并发访问。
pub struct ProviderSessionReaper {
    /// Provider 服务引用
    ///
    /// 用于查询会话列表和停止会话，使用 `Arc` 共享所有权
    provider_service: Arc<ProviderService>,

    /// 会话最大存活时间
    ///
    /// 超过此时间的会话将被视为过期并清理。
    /// 建议设置为 1 小时或根据业务需求调整。
    max_age: Duration,
}

impl ProviderSessionReaper {
    /// 创建新的会话清理服务实例
    ///
    /// # 参数
    ///
    /// - `provider_service`: Provider 服务的 `Arc` 引用，用于查询和停止会话
    /// - `max_age`: 会话最大存活时间，超过此时间的会话将被清理
    ///
    /// # 返回值
    ///
    /// 返回新创建的 `ProviderSessionReaper` 实例
    ///
    /// # 示例
    ///
    /// ```rust,ignore
    /// let service = Arc::new(ProviderService::new());
    /// let reaper = ProviderSessionReaper::new(service, Duration::from_secs(3600));
    /// ```
    pub fn new(provider_service: Arc<ProviderService>, max_age: Duration) -> Self {
        Self {
            provider_service,
            max_age,
        }
    }

    /// 运行清理循环
    ///
    /// 启动后台清理任务，定期扫描并清理过期会话。
    /// 任务会持续运行直到收到关闭信号。
    ///
    /// # 参数
    ///
    /// - `shutdown`: 关闭信号接收器，当收到信号时优雅退出清理循环
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 正常退出
    /// - `Err(ProviderError)`: 清理过程发生严重错误（当前实现不会返回错误）
    ///
    /// # 清理间隔
    ///
    /// 当前固定为每 5 分钟执行一次清理扫描
    ///
    /// # 优雅关闭
    ///
    /// 使用 `tokio::select!` 同时监听关闭信号和定时器，
    /// 收到关闭信号后立即退出循环，不会等待当前间隔结束。
    pub async fn run(&self, mut shutdown: tokio::sync::broadcast::Receiver<()>) -> ProviderResult<()> {
        info!("ProviderSessionReaper 启动，最大会话年龄: {:?}", self.max_age);

        // 创建 5 分钟间隔的定时器
        let mut interval = tokio::time::interval(Duration::from_secs(300));

        loop {
            tokio::select! {
                // 监听关闭信号
                _ = shutdown.recv() => {
                    info!("ProviderSessionReaper 收到关闭信号");
                    break;
                }
                // 定时器触发，执行清理
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

    /// 执行会话清理
    ///
    /// 扫描所有活跃会话，清理超过最大存活时间的过期会话。
    /// 即使某个会话清理失败，也会继续处理其他会话。
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 清理完成（可能部分会话清理失败）
    /// - `Err(ProviderError)`: 获取会话列表失败
    ///
    /// # 清理流程
    ///
    /// 1. 从 `ProviderService` 获取所有活跃会话列表
    /// 2. 遍历会话，计算每个会话的存活时间
    /// 3. 对超过 `max_age` 的会话调用 `stop_session` 停止
    /// 4. 记录清理统计信息
    ///
    /// # 错误处理
    ///
    /// - 获取会话列表失败：直接返回错误
    /// - 单个会话停止失败：记录警告日志，继续处理其他会话
    async fn reap_sessions(&self) -> ProviderResult<()> {
        // 获取所有活跃会话
        let sessions = self.provider_service.list_sessions().await?;
        let now = Utc::now();
        let mut reaped_count = 0;

        // 遍历所有会话，检查是否过期
        for session in sessions {
            // 计算会话存活时间
            let age = now.signed_duration_since(session.created_at);
            if age.to_std().unwrap_or(Duration::ZERO) > self.max_age {
                info!(
                    "清理过期会话: thread_id={}, provider={:?}, age={:?}",
                    session.thread_id, session.provider, age
                );

                // 尝试停止过期会话
                if let Err(e) = self
                    .provider_service
                    .stop_session(&session.thread_id, session.provider)
                    .await
                {
                    // 单个会话清理失败不影响其他会话
                    warn!("停止过期会话失败: {}", e);
                } else {
                    reaped_count += 1;
                }
            }
        }

        // 记录清理统计
        if reaped_count > 0 {
            info!("清理了 {} 个过期会话", reaped_count);
        }

        Ok(())
    }
}
