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
//! - **实时监控**：及时发现 Provider 不可用情况，快速响应故障
//! - **性能优化**：通过缓存减少重复检查开销，提高查询效率
//! - **容错处理**：检查失败时返回降级状态而非错误，保证系统稳定性
//! - **并发安全**：使用 `RwLock` 保证多线程环境下的数据一致性
//!
//! # 核心组件
//!
//! - **[`ProviderHealthStatus`]**: 健康状态信息结构体，记录单个 Provider 的状态
//! - **[`ProviderHealth`]**: 健康检查服务，提供检查和查询接口
//!
//! # 使用场景
//!
//! - **启动检查**：应用启动时检查所有 Provider 可用性
//! - **定期轮询**：定时任务监控 Provider 状态变化
//! - **请求前检查**：快速查询缓存状态，避免重复检查
//! - **故障诊断**：通过状态消息定位问题原因
//!
//! # 性能特性
//!
//! - 缓存读取使用读锁，不阻塞其他读操作
//! - 缓存写入使用写锁，保证数据一致性
//! - 批量检查支持部分失败，不影响整体流程
//!
//! # 模块依赖
//!
//! - 依赖 `remi_core::provider::ProviderKind` 标识 Provider 类型
//! - 依赖 `chrono` 库处理时间戳
//! - 被 [`crate::service`] 可选集成，用于服务级别的健康监控
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
//!     println!('Provider 可用');
//! }
//!
//! // 批量检查
//! let providers = vec![ProviderKind::ClaudeAgent, ProviderKind::Codex];
//! let statuses = health.check_all_health(&providers).await;
//!
//! // 查询缓存状态（不执行实际检查）
//! if let Some(cached) = health.get_cached_status(ProviderKind::ClaudeAgent).await {
//!     println!('上次检查时间: {}', cached.last_checked);
//! }
//! ```

use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use remi_core::provider::ProviderKind;
use serde::{Deserialize, Serialize};
use tokio::process::Command;
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
#[derive(Debug, Clone, Serialize, Deserialize)]
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
    /// 通过尝试运行 Provider CLI 的 `--version` 命令验证其可用性。
    /// 检查结果会写入缓存，后续可通过 `get_cached_status` 快速查询。
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
    /// # 检查策略
    ///
    /// 1. 根据 ProviderKind 获取对应的 CLI 二进制名称
    /// 2. 使用 `tokio::time::timeout` 运行 `<binary> --version`（5 秒超时）
    /// 3. 命令成功执行则标记为可用，并记录版本号
    /// 4. 命令失败（二进制不存在、超时、非零退出码）则标记为不可用
    pub async fn check_health(&self, provider: ProviderKind) -> ProviderResult<ProviderHealthStatus> {
        info!("检查 Provider 健康状态: {:?}", provider);

        let binary = provider_cli_binary(provider);
        let status = probe_provider_cli(binary, provider).await;

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

/// 返回 ProviderKind 对应的 CLI 二进制名称
///
/// 此映射与各适配器 `spawn_*_process` 中使用的程序名保持一致。
/// 若新增 Provider 适配器，需同步更新此映射。
fn provider_cli_binary(provider: ProviderKind) -> &'static str {
    match provider {
        ProviderKind::ClaudeAgent => "claude",
        ProviderKind::Codex => "codex",
        ProviderKind::Cursor => "cursor",
        ProviderKind::Gemini => "gemini",
        ProviderKind::Grok => "grok",
        ProviderKind::Kilo => "kilo",
        ProviderKind::OpenCode => "opencode",
        ProviderKind::Pi => "pi",
    }
}

/// 探测 Provider CLI 可用性
///
/// 通过运行 `<binary> --version` 验证 CLI 是否安装且可执行。
/// 使用 5 秒超时防止长时间阻塞。
///
/// # 参数
///
/// - `binary`: CLI 二进制名称
/// - `provider`: Provider 类型（用于构造返回的状态）
///
/// # 返回值
///
/// 返回 `ProviderHealthStatus`，`available` 字段反映 CLI 是否可用。
/// 当 CLI 不可用时，`message` 字段包含具体的失败原因。
async fn probe_provider_cli(binary: &str, provider: ProviderKind) -> ProviderHealthStatus {
    let probe = async {
        let output = Command::new(binary)
            .arg("--version")
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output()
            .await?;
        Ok::<std::process::Output, std::io::Error>(output)
    };

    match tokio::time::timeout(std::time::Duration::from_secs(5), probe).await {
        Ok(Ok(output)) => {
            if output.status.success() {
                let version = String::from_utf8_lossy(&output.stdout)
                    .trim()
                    .lines()
                    .next()
                    .unwrap_or("")
                    .to_string();
                let message = if version.is_empty() {
                    None
                } else {
                    Some(format!("版本: {}", version))
                };
                ProviderHealthStatus {
                    provider,
                    available: true,
                    last_checked: Utc::now(),
                    message,
                }
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                let msg = if stderr.is_empty() {
                    format!("{} 退出码 {}", binary, output.status.code().unwrap_or(-1))
                } else {
                    format!("{}: {}", binary, stderr)
                };
                warn!("Provider {} 健康检查失败: {}", binary, msg);
                ProviderHealthStatus {
                    provider,
                    available: false,
                    last_checked: Utc::now(),
                    message: Some(msg),
                }
            }
        }
        Ok(Err(e)) => {
            let msg = if e.kind() == std::io::ErrorKind::NotFound {
                format!("未找到 {} CLI，请确认已安装并加入 PATH", binary)
            } else {
                format!("执行 {} 失败: {}", binary, e)
            };
            warn!("Provider {} 健康检查失败: {}", binary, msg);
            ProviderHealthStatus {
                provider,
                available: false,
                last_checked: Utc::now(),
                message: Some(msg),
            }
        }
        Err(_) => {
            let msg = format!("{} --version 执行超时（5 秒）", binary);
            warn!("Provider {} 健康检查超时", binary);
            ProviderHealthStatus {
                provider,
                available: false,
                last_checked: Utc::now(),
                message: Some(msg),
            }
        }
    }
}

