//! Provider 健康检查模块
//!
//! 本模块提供 Provider 健康状态监控功能，支持：
//! - 单个 Provider 健康检查
//! - 批量 Provider 健康检查
//! - 健康状态缓存
//! - 状态查询
//!
//! # 设计目标
//!
//! - **实时监控**：及时发现 Provider 不可用情况
//! - **性能优化**：通过缓存减少重复检查开销
//! - **容错处理**：检查失败时返回降级状态而非错误
//!
//! # 使用示例
//!
//! ```rust,ignore
//! use remi_provider::health::ProviderHealth;
//! use remi_core::provider::ProviderKind;
//!
//! let health = ProviderHealth::new();
//!
//! // 检查单个 Provider
//! let status = health.check_health(ProviderKind::ClaudeAgent).await?;
//! if status.available {
//!     println!("Provider 可用");
//! }
//!
//! // 批量检查
//! let providers = vec![ProviderKind::ClaudeAgent, ProviderKind::Codex];
//! let statuses = health.check_all_health(&providers).await;
//! ```

use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use remi_core::provider::ProviderKind;
use tokio::sync::RwLock;
use tracing::{info, warn};

use crate::error::ProviderResult;

/// Provider 健康状态信息
///
/// 记录单个 Provider 的健康检查结果，包括可用性状态和检查时间。
///
/// # 字段说明
///
/// - `provider`: Provider 类型标识
/// - `available`: 是否可用，true 表示正常，false 表示异常
/// - `last_checked`: 最后一次检查的时间戳（UTC）
/// - `message`: 可选的状态消息，通常用于描述错误原因或诊断信息
#[derive(Debug, Clone)]
pub struct ProviderHealthStatus {
    /// Provider 类型标识
    pub provider: ProviderKind,

    /// 是否可用
    ///
    /// true 表示 Provider 当前可用，可以正常处理请求；
    /// false 表示 Provider 不可用，可能存在网络问题、服务宕机等情况
    pub available: bool,

    /// 最后检查时间（UTC）
    ///
    /// 记录最后一次健康检查执行的时间，用于判断状态新鲜度
    pub last_checked: DateTime<Utc>,

    /// 状态消息
    ///
    /// 可选的诊断信息，当检查失败或 Provider 不可用时，
    /// 通常包含错误详情或建议的修复措施
    pub message: Option<String>,
}

/// Provider 健康检查服务
///
/// 提供 Provider 健康状态检查和管理功能，内部维护状态缓存以提高性能。
/// 使用 `RwLock` 保证并发安全。
///
/// # 线程安全
///
/// 本结构体内部使用 `Arc<RwLock<...>>` 管理状态缓存，支持多线程并发访问。
///
/// # 使用场景
///
/// - 启动时检查所有 Provider 可用性
/// - 定期轮询监控 Provider 状态变化
/// - 请求前快速查询缓存状态（避免重复检查）
pub struct ProviderHealth {
    /// 健康状态缓存
    ///
    /// 以 Provider 类型为键，健康状态为值的哈希表。
    /// 使用 `RwLock` 保证读写操作的并发安全。
    status_cache: Arc<RwLock<HashMap<ProviderKind, ProviderHealthStatus>>>,
}

impl ProviderHealth {
    /// 创建新的健康检查服务实例
    ///
    /// 初始化空的状态缓存，后续检查时会逐步填充。
    ///
    /// # 返回值
    ///
    /// 返回新创建的 `ProviderHealth` 实例
    ///
    /// # 示例
    ///
    /// ```rust,ignore
    /// let health = ProviderHealth::new();
    /// ```
    pub fn new() -> Self {
        Self {
            status_cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// 检查指定 Provider 的健康状态
    ///
    /// 执行健康检查并将结果缓存。当前实现为占位逻辑，
    /// 默认返回可用状态，后续需要实现具体的检查逻辑。
    ///
    /// # 参数
    ///
    /// - `provider`: 要检查的 Provider 类型
    ///
    /// # 返回值
    ///
    /// - `Ok(ProviderHealthStatus)`: 健康状态信息
    /// - `Err(ProviderError)`: 检查过程发生错误
    ///
    /// # TODO
    ///
    /// 当前实现为占位逻辑，需要实现具体的健康检查策略：
    /// - HTTP Provider: 发送心跳请求
    /// - WebSocket Provider: 检查连接状态
    /// - SDK Provider: 验证 SDK 初始化状态
    pub async fn check_health(&self, provider: ProviderKind) -> ProviderResult<ProviderHealthStatus> {
        info!("检查 Provider 健康状态: {:?}", provider);

        // TODO: 实现具体的健康检查逻辑
        // 目前返回默认可用状态，实际应根据 Provider 类型执行不同的检查策略
        let status = ProviderHealthStatus {
            provider,
            available: true,
            last_checked: Utc::now(),
            message: Some("健康检查未实现".to_string()),
        };

        // 将检查结果写入缓存，使用写锁保证并发安全
        let mut cache = self.status_cache.write().await;
        cache.insert(provider, status.clone());

        Ok(status)
    }

    /// 获取缓存的健康状态
    ///
    /// 从缓存中读取指定 Provider 的健康状态，不执行实际检查。
    /// 适用于需要快速查询且可以接受稍旧状态的场景。
    ///
    /// # 参数
    ///
    /// - `provider`: 要查询的 Provider 类型
    ///
    /// # 返回值
    ///
    /// - `Some(ProviderHealthStatus)`: 缓存中存在该 Provider 的状态
    /// - `None`: 缓存中不存在该 Provider 的状态（从未检查过）
    ///
    /// # 性能
    ///
    /// 使用读锁，不会阻塞其他读操作，性能优于 `check_health`
    pub async fn get_cached_status(
        &self,
        provider: ProviderKind,
    ) -> Option<ProviderHealthStatus> {
        let cache = self.status_cache.read().await;
        cache.get(&provider).cloned()
    }

    /// 批量检查所有 Provider 的健康状态
    ///
    /// 对提供的 Provider 列表逐一执行健康检查，即使某个检查失败也会继续检查其他 Provider。
    /// 失败的 Provider 会返回不可用状态而非错误。
    ///
    /// # 参数
    ///
    /// - `providers`: 要检查的 Provider 类型切片
    ///
    /// # 返回值
    ///
    /// 返回与输入顺序对应的健康状态列表，长度与输入相同。
    /// 检查失败的 Provider 会包含错误信息在 `message` 字段中。
    ///
    /// # 容错设计
    ///
    /// 单个 Provider 检查失败不会影响其他 Provider 的检查，
    /// 失败的 Provider 会被标记为不可用并记录错误信息。
    pub async fn check_all_health(&self, providers: &[ProviderKind]) -> Vec<ProviderHealthStatus> {
        let mut statuses = Vec::new();

        for provider in providers {
            match self.check_health(*provider).await {
                Ok(status) => statuses.push(status),
                Err(e) => {
                    // 记录警告日志，但不中断批量检查
                    warn!("检查 Provider {:?} 健康状态失败: {}", provider, e);
                    // 检查失败时返回不可用状态，携带错误信息
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
    /// 默认实现，等同于 `new()`
    fn default() -> Self {
        Self::new()
    }
}
