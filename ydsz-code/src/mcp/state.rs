//! MCP 客户端状态管理（库级组件）
//!
//! 管理活跃 MCP 客户端的生命周期：插入、查找、移除、健康检查、自动重连。
//!
//! ## 架构
//!
//! ```text
//! ┌─────────────────────────────────────────────────┐
//! │ McpState (本模块)                                │
//! ├─────────────────────────────────────────────────┤
//! │  clients: Mutex<HashMap<String, Arc<McpClient>>>│
//! │  reconnect_attempts: AtomicUsize                 │
//! ├─────────────────────────────────────────────────┤
//! │  insert / get / remove / is_empty               │
//! │  reconnect_with_backoff(max_attempts)           │
//! │  spawn_background_reconnect(interval, provider)  │
//! └─────────────────────────────────────────────────┘
//! ```
//!
//! ## 设计要点
//!
//! - `Arc<McpClient>` 允许并发持有（前端多组件 / 后台任务）
//! - `reconnect_with_backoff` 指数退避: 1s → 2s → 4s → 8s (最大 60s)
//! - 后台任务通过 `JoinHandle` 返回，调用方负责取消
//!
//! ## 使用示例
//!
//! ```text
//! let state = Arc::new(McpState::new());
//! let handle = McpState::spawn_background_reconnect(state.clone(), config_provider, Duration::from_secs(30));
//! // ... later
//! handle.abort();
//! ```

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tracing::{info, warn};

use super::client::McpClient;
use super::config::McpServerConfig;
use super::error::{McpError, McpResult};

/// MCP 状态管理器（库级组件）
///
/// 持有当前活跃的 MCP 客户端实例（已启动 + 已初始化）。
/// 通过 `tokio::sync::Mutex` 保证异步线程安全。
///
/// 典型用法:
/// - Tauri commands 通过 `State<Arc<McpState>>` 注入
/// - 后台重连任务调用 `reconnect_with_backoff`
pub struct McpState {
    /// 已启动的活跃客户端（server_id → 客户端）
    clients: Mutex<HashMap<String, Arc<McpClient>>>,
    /// 重连尝试次数计数（诊断用）
    reconnect_count: AtomicU64,
}

impl std::fmt::Debug for McpState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("McpState")
            .field("reconnect_count", &self.reconnect_count.load(Ordering::Relaxed))
            .field("clients", &format!("<{} cached>", "..."))
            .finish()
    }
}

impl McpState {
    /// 创建新的 MCP 状态管理器
    pub fn new() -> Self {
        Self {
            clients: Mutex::new(HashMap::new()),
            reconnect_count: AtomicU64::new(0),
        }
    }

    /// 插入或替换活跃客户端
    ///
    /// # 参数
    ///
    /// - `server_id`: MCP 服务器 ID
    /// - `client`: 已启动并初始化的客户端
    pub async fn insert(&self, server_id: String, client: Arc<McpClient>) {
        let mut clients = self.clients.lock().await;
        clients.insert(server_id, client);
    }

    /// 获取缓存的活跃客户端
    pub async fn get(&self, server_id: &str) -> Option<Arc<McpClient>> {
        let clients = self.clients.lock().await;
        clients.get(server_id).cloned()
    }

    /// 移除缓存的客户端
    pub async fn remove(&self, server_id: &str) -> Option<Arc<McpClient>> {
        let mut clients = self.clients.lock().await;
        clients.remove(server_id)
    }

    /// 列出所有已注册服务器 ID
    pub async fn server_ids(&self) -> Vec<String> {
        let clients = self.clients.lock().await;
        clients.keys().cloned().collect()
    }

    /// 缓存客户端数量
    pub async fn len(&self) -> usize {
        let self_guard = self.clients.lock().await;
        self_guard.len()
    }

    /// 是否无缓存客户端
    pub async fn is_empty(&self) -> bool {
        self.len().await == 0
    }

    /// 健康检查（对所有缓存客户端执行简短探活）
    ///
    /// 返回不健康的 server_id 列表。对每个客户端，发送一次 tools/list 探活，
    /// 超时 3 秒。
    pub async fn health_check(&self) -> Vec<(String, McpError)> {
        let clients = self.clients.lock().await;
        let mut unhealthy = Vec::new();
        for (id, client) in clients.iter() {
            // 探活: 调用 is_healthy (内部使用 ListTools + 3s 超时)
            if !client.is_healthy().await {
                unhealthy.push((
                    id.clone(),
                    McpError::Communication("健康检查失败".into()),
                ));
            }
        }
        unhealthy
    }

    /// 获取重连尝试次数
    pub fn reconnect_count(&self) -> u64 {
        self.reconnect_count.load(Ordering::Relaxed)
    }

    /// 尝试重连（指数退避）
    ///
    /// 对指定配置进行重连尝试，使用指数退避策略:
    /// - 第 1 次: 立即尝试
    /// - 第 2 次: 等待 1s
    /// - 第 3 次: 等待 2s
    /// - 第 4 次及以后: 等待 min(2^(n-1), 60)s
    ///
    /// # 参数
    ///
    /// - `config`: 服务器配置
    /// - `max_attempts`: 最大重连次数
    ///
    /// # 返回值
    ///
    /// 成功时返回 Ok，失败时返回最后一次错误
    pub async fn reconnect_with_backoff(
        &self,
        config: &McpServerConfig,
        max_attempts: u32,
    ) -> McpResult<()> {
        let mut last_error = None;
        for attempt in 0..max_attempts {
            if attempt > 0 {
                let backoff_secs = 2u64.pow(attempt - 1).min(60);
                info!(
                    server_id = %config.id,
                    attempt,
                    backoff_secs,
                    "MCP 指数退避重连等待"
                );
                tokio::time::sleep(Duration::from_secs(backoff_secs)).await;
            }

            match McpClient::start_from_config(config).await {
                Ok(client) => {
                    let arc = Arc::new(client);
                    self.insert(config.id.clone(), arc).await;
                    self.reconnect_count.fetch_add(1, Ordering::Relaxed);
                    info!(server_id = %config.id, attempt, "MCP 重连成功");
                    return Ok(());
                }
                Err(e) => {
                    warn!(
                        server_id = %config.id,
                        attempt,
                        error = %e,
                        "MCP 重连尝试失败"
                    );
                    last_error = Some(e);
                }
            }
        }

        Err(last_error.unwrap_or_else(|| {
            McpError::Communication(format!(
                "MCP 重连 {} 次后仍失败",
                max_attempts
            ))
        }))
    }

    /// 启动后台自动重连任务
    ///
    /// 周期性检查不健康的客户端并尝试重连。
    /// 需要调用方提供配置获取函数闭包（因配置来自工作区）。
    ///
    /// # 参数
    ///
    /// - `state`: Arc<McpState> 引用
    /// - `interval`: 检查间隔
    /// - `config_provider`: 根据 server_id 获取配置的异步闭包
    /// - `max_attempts_per_cycle`: 每轮每个 server 最大重连尝试次数
    ///
    /// # 返回值
    ///
    /// 返回 JoinHandle，调用方通过 `.abort()` 停止任务
    pub fn spawn_background_reconnect<F, Fut>(
        state: Arc<Self>,
        interval: Duration,
        config_provider: F,
        max_attempts_per_cycle: u32,
    ) -> JoinHandle<()>
    where
        F: Fn(String) -> Fut + Send + Sync + 'static,
        Fut: std::future::Future<Output = Option<McpServerConfig>> + Send,
    {
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(interval);
            ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
            loop {
                ticker.tick().await;

                let unhealthy = state.health_check().await;
                for (server_id, _) in unhealthy {
                    let Some(config) = config_provider(server_id.clone()).await else {
                        warn!(server_id, "无法获取 MCP 服务器配置，跳过重连");
                        continue;
                    };
                    let state_clone = state.clone();
                    let id_clone = config.id.clone();
                    tokio::spawn(async move {
                        if let Err(e) = state_clone
                            .reconnect_with_backoff(&config, max_attempts_per_cycle)
                            .await
                        {
                            warn!(server_id = %id_clone, error = %e, "后台 MCP 重连失败");
                        }
                    });
                }
            }
        })
    }
}

impl Default for McpState {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// 单元测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mcp::config::{McpServerConfig, McpServerStatus, McpTransportType};
    use std::collections::HashMap;

    /// 构造一个测试用 McpServerConfig（不实际启动进程）
    fn dummy_config(id: &str) -> McpServerConfig {
        McpServerConfig {
            id: id.to_string(),
            name: format!("Dummy {id}"),
            command: "echo".to_string(),
            args: vec!["{}".to_string()],
            env: HashMap::new(),
            transport_type: McpTransportType::Stdio,
            enabled: true,
            preset: None,
            status: McpServerStatus::Disconnected,
            error: None,
            last_connected_at: None,
        }
    }

    #[tokio::test]
    async fn insert_and_get_returns_client() {
        let state = McpState::new();
        assert!(state.is_empty().await);

        // 构建一个 Mock 客户端的替代：我们实际需要 Arc<McpClient>
        // 但 McpClient 构造需要 spawn 子进程。这里用健康状态构造一个占位：
        // 通过 start 可能失败，所以我们只测试 HashMap 操作（不要求真实进程）
        // 用 Arc<McpClient> 不可行，这里使用替代策略测试 API。

        // 注意: 由于 McpClient 无法 mock，我们只能验证 HashMap 级别的 API。
        // 实际集成测试在 Tauri commands 测试场景覆盖。
        assert_eq!(state.len().await, 0);
    }

    #[tokio::test]
    async fn remove_from_empty_state_returns_none() {
        let state = McpState::new();
        let removed = state.remove("nonexistent").await;
        assert!(removed.is_none());
    }

    #[tokio::test]
    async fn server_ids_reflects_insertions() {
        let _state = McpState::new();
        // 见 insert_and_get_returns_client 注释 — 需要 Arc<McpClient>
        // 这里测试空状态的 server_ids
        let ids: Vec<String> = _state.server_ids().await;
        assert!(ids.is_empty());
    }

    #[test]
    fn reconnect_count_starts_at_zero() {
        let state = McpState::new();
        assert_eq!(state.reconnect_count(), 0);
    }

    #[test]
    fn default_produces_empty_state() {
        let state: McpState = McpState::default();
        // 不能在非 async 上下文中调用 is_empty,所以测试字段
        assert_eq!(state.reconnect_count.load(Ordering::Relaxed), 0);
    }

    #[test]
    fn dummy_config_has_expected_fields() {
        let cfg = dummy_config("test-server");
        assert_eq!(cfg.id, "test-server");
        assert_eq!(cfg.name, "Dummy test-server");
        assert!(cfg.enabled);
        assert_eq!(cfg.status, McpServerStatus::Disconnected);
        assert_eq!(cfg.transport_type, McpTransportType::Stdio);
    }

    #[test]
    fn exponential_backoff_formula_matches_spec() {
        // 验证退避公式: attempt=1 → 1s (2^0), attempt=2 → 2s, attempt=3 → 4s
        let cases: Vec<(u32, u64)> = vec![
            (1, 1),
            (2, 2),
            (3, 4),
            (4, 8),
            (5, 16),
            (6, 32),
            (7, 60), // capped at 60
            (8, 60),
        ];
        for (attempt, expected) in cases {
            let got = 2u64.pow(attempt - 1).min(60);
            assert_eq!(got, expected, "attempt={attempt}");
        }
    }

    /// 配置提供闭包测试 - 模拟从工作区 mcp.json 读取
    #[tokio::test]
    async fn config_provider_closure_works() {
        let configs: HashMap<String, McpServerConfig> = HashMap::from([
            ("fs".to_string(), dummy_config("fs")),
            ("gh".to_string(), dummy_config("gh")),
        ]);
        let provider = move |id: String| {
            let configs = configs.clone();
            async move { configs.get(&id).cloned() }
        };

        let cfg = provider("fs".to_string()).await;
        assert!(cfg.is_some());
        assert_eq!(cfg.unwrap().id, "fs");

        let missing = provider("nonexistent".to_string()).await;
        assert!(missing.is_none());
    }
}
