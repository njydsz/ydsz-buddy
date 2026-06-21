//! Provider 服务门面模块
//!
//! 本模块提供跨 Provider 的统一操作接口，是上层业务与 Provider 交互的主要入口。
//! 采用门面模式（Facade Pattern），封装了多个 Provider 适配器的管理逻辑。
//!
//! # 核心功能
//!
//! - **适配器管理**：注册、获取 Provider 适配器
//! - **会话管理**：启动、停止、列出会话
//! - **消息发送**：发送 Turn、转向 Turn、中断 Turn
//! - **事件广播**：订阅和广播 Provider 运行时事件
//! - **能力查询**：获取适配器的功能特性声明
//!
//! # 设计特点
//!
//! - **统一接口**：屏蔽不同 Provider 的实现差异，提供一致的调用方式
//! - **并发安全**：使用 `RwLock` 保证多线程环境下的安全性
//! - **事件驱动**：通过 `broadcast` 通道实现事件订阅和广播
//! - **容错处理**：部分操作失败不影响整体服务可用性
//! - **路由透明**：根据 Provider 类型自动路由到对应适配器
//!
//! # 架构设计
//!
//! ```text
//! ┌─────────────────────────────────────┐
//! │      ProviderService (门面)          │
//! ├─────────────────────────────────────┤
//! │  - adapters: HashMap<ProviderKind>  │
//! │  - event_tx: broadcast::Sender      │
//! └─────────────────────────────────────┘
//!           ↓           ↓           ↓
//!    ┌──────────┐ ┌──────────┐ ┌──────────┐
//!    │  Claude  │ │  Codex   │ │  Cursor  │
//!    │ Adapter  │ │ Adapter  │ │ Adapter  │
//!    └──────────┘ └──────────┘ └──────────┘
//! ```
//!
//! # 使用场景
//!
//! - **多模型应用**：同时支持多种 AI Provider 的应用
//! - **模型切换**：在运行时动态切换不同的 Provider
//! - **事件监控**：订阅 Provider 事件流，实现实时监控和日志
//! - **能力查询**：根据 Provider 能力动态调整业务逻辑
//!
//! # 模块依赖
//!
//! - 依赖 [`crate::adapter::ProviderAdapter`] trait 定义适配器接口
//! - 依赖 [`crate::error`] 模块定义错误类型
//! - 被上层业务模块依赖，作为 Provider 操作的统一入口
//!
//! # 使用示例
//!
//! ```rust,ignore
//! use remi_provider::service::ProviderService;
//! use remi_provider::adapters::ClaudeAdapter;
//! use remi_core::provider::ProviderKind;
//! use std::sync::Arc;
//!
//! let service = ProviderService::new();
//!
//! // 注册适配器
//! let claude = Arc::new(ClaudeAdapter::new());
//! service.register_adapter(claude).await;
//!
//! // 启动会话
//! let input = ProviderSessionStartInput {
//!     thread_id: 'thread-1'.to_string(),
//!     provider: ProviderKind::ClaudeAgent,
//!     model: 'claude-3-opus'.to_string(),
//! };
//! let session = service.start_session('thread-1', input).await?;
//!
//! // 发送消息
//! let turn_input = TurnInput { /* ... */ };
//! let result = service.send_turn(turn_input).await?;
//!
//! // 订阅事件
//! let mut rx = service.stream_events();
//! tokio::spawn(async move {
//!
while let Ok(event) = rx.recv().await {
//!         println!('收到事件: {:?}', event);
//!
}
//! });
//! ```

use std::collections::HashMap;
use std::sync::Arc;

use remi_core::provider::{
    ProviderKind, ProviderRuntimeEvent, ProviderSession, ProviderSessionStartInput,
    ProviderTurnStartResult, ServerProviderAuthStatus, ServerProviderStatus,
    ServerProviderStatusState, TurnInput,
};
use chrono::Utc;
use serde_json::Value;
use tokio::sync::{broadcast, RwLock};
use tracing::{info, warn};

use crate::adapter::ProviderAdapter;
use crate::error::{ProviderError, ProviderResult};
use crate::health::ProviderHealth;

/// Provider 服务
///
/// 跨 Provider 的统一操作入口，管理多个 Provider 适配器的生命周期和调用。
/// 内部维护适配器注册表和事件广播通道。
///
/// # 架构设计
///
/// ```text
/// ┌─────────────────────────────────────┐
/// │      ProviderService (门面)          │
/// ├─────────────────────────────────────┤
/// │  - adapters: HashMap<ProviderKind>  │
/// │  - event_tx: broadcast::Sender      │
/// └─────────────────────────────────────┘
///           ↓           ↓           ↓
///    ┌──────────┐ ┌──────────┐ ┌──────────┐
///    │  Claude  │ │  Codex   │ │  Cursor  │
///    │ Adapter  │ │ Adapter  │ │ Adapter  │
///    └──────────┘ └──────────┘ └──────────┘
/// ```
///
/// # 线程安全
///
/// 本结构体内部使用 `Arc<RwLock<...>>` 管理适配器和事件通道，
/// 支持多线程并发访问，可在异步环境中安全使用。
///
/// # 使用场景
///
/// - 应用启动时注册所有需要的 Provider 适配器
/// - 运行时根据 Provider 类型路由到对应的适配器
/// - 订阅 Provider 事件流，实现实时监控和日志记录
pub struct ProviderService {
    /// 适配器注册表
    ///
    /// 以 Provider 类型为键，适配器实例为值的哈希表。
    /// 使用 `RwLock` 保证并发读写安全，`Arc` 实现共享所有权。
    adapters: Arc<RwLock<HashMap<ProviderKind, Arc<dyn ProviderAdapter>>>>,

    /// 事件广播发送器
    ///
    /// 用于广播 Provider 运行时事件，支持多个订阅者。
    /// 通道容量为 10000，足以应对高并发场景。
    event_tx: broadcast::Sender<ProviderRuntimeEvent>,

    /// 健康检查服务
    ///
    /// 用于检查和缓存 Provider 的健康状态，支持批量检查和缓存查询。
    health: ProviderHealth,

    /// Provider API Key 存储
    ///
    /// 运行时内存中保存各 Provider 的 API Key，后续可接入持久化存储。
    api_keys: Arc<RwLock<HashMap<ProviderKind, String>>>,
}

impl ProviderService {
    /// 创建新的 Provider 服务实例
    ///
    /// 初始化空的适配器注册表和事件广播通道。
    ///
    /// # 返回值
    ///
    /// 返回新创建的 `ProviderService` 实例
    ///
    /// # 示例
    ///
    /// ```rust,ignore
    /// let service = ProviderService::new();
    /// ```
    pub fn new() -> Self {
        // 创建容量为 10000 的广播通道
        let (event_tx, _) = broadcast::channel(10000);

        Self {
            adapters: Arc::new(RwLock::new(HashMap::new())),
            event_tx,
            health: ProviderHealth::new(),
            api_keys: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// 注册 Provider 适配器
    ///
    /// 将适配器实例注册到服务中，后续可通过 Provider 类型获取。
    /// 如果同一 Provider 类型已注册，新适配器会覆盖旧适配器。
    ///
    /// # 参数
    ///
    /// - `adapter`: 适配器的 `Arc` 引用，支持共享所有权
    ///
    /// # 示例
    ///
    /// ```rust,ignore
    /// let claude = Arc::new(ClaudeAdapter::new());
    /// service.register_adapter(claude).await;
    /// ```
    pub async fn register_adapter(&self, adapter: Arc<dyn ProviderAdapter>) {
        let kind = adapter.provider_kind();
        info!("注册 Provider 适配器: {:?}", kind);

        // 获取写锁，插入适配器
        let mut adapters = self.adapters.write().await;
        adapters.insert(kind, adapter);
    }

    /// 获取指定 Provider 的适配器
    ///
    /// 根据 Provider 类型查找并返回对应的适配器实例。
    ///
    /// # 参数
    ///
    /// - `provider`: 要获取的 Provider 类型
    ///
    /// # 返回值
    ///
    /// - `Ok(Arc<dyn ProviderAdapter>)`: 找到的适配器实例
    /// - `Err(ProviderError::ProviderNotFound)`: 未找到对应的适配器
    ///
    /// # 错误
    ///
    /// 当请求的 Provider 未注册时，返回 `ProviderNotFound` 错误
    pub async fn get_adapter(&self, provider: ProviderKind) -> ProviderResult<Arc<dyn ProviderAdapter>> {
        let adapters = self.adapters.read().await;

        adapters
            .get(&provider)
            .cloned()
            .ok_or_else(|| ProviderError::ProviderNotFound(format!("{:?}", provider)))
    }

    /// 启动 Provider 会话
    ///
    /// 根据输入参数中的 Provider 类型，路由到对应的适配器并启动会话。
    ///
    /// # 参数
    ///
    /// - `thread_id`: 会话线程 ID，用于唯一标识会话
    /// - `input`: 会话启动输入参数，包含 Provider 类型、模型选择等
    ///
    /// # 返回值
    ///
    /// - `Ok(ProviderSession)`: 成功创建的会话信息
    /// - `Err(ProviderError)`: 启动失败，可能原因包括 Provider 未找到、适配器错误等
    ///
    /// # 示例
    ///
    /// ```rust,ignore
    /// let input = ProviderSessionStartInput {
    ///     thread_id: 'thread-1'.to_string(),
    ///     provider: ProviderKind::ClaudeAgent,
    ///     model: 'claude-3-opus'.to_string(),
    /// };
    /// let session = service.start_session('thread-1', input).await?;
    /// ```
    pub async fn start_session(
        &self,
        thread_id: &str,
        input: ProviderSessionStartInput,
    ) -> ProviderResult<ProviderSession> {
        let provider = input.provider;
        let adapter = self.get_adapter(provider).await?;

        info!("启动 Provider 会话: thread_id={}, provider={:?}", thread_id, provider);

        adapter.start_session(input).await
    }

    /// 发送 Turn（对话轮次）
    ///
    /// 将用户消息发送到指定 Provider，启动一个新的对话轮次。
    ///
    /// # 参数
    ///
    /// - `input`: Turn 输入参数，包含消息内容、上下文等信息
    ///
    /// # 返回值
    ///
    /// - `Ok(ProviderTurnStartResult)`: Turn 启动成功，返回 turn_id 等信息
    /// - `Err(ProviderError)`: 发送失败
    pub async fn send_turn(&self, input: TurnInput) -> ProviderResult<ProviderTurnStartResult> {
        let provider = input.provider;
        let adapter = self.get_adapter(provider).await?;

        adapter.send_turn(input).await
    }

    /// 转向 Turn（重定向运行中的对话）
    ///
    /// 在 Turn 执行过程中重定向对话方向，实现更灵活的交互控制。
    ///
    /// # 参数
    ///
    /// - `input`: Turn 输入参数，包含新的对话方向信息
    ///
    /// # 返回值
    ///
    /// - `Ok(ProviderTurnStartResult)`: 转向成功
    /// - `Err(ProviderError)`: 转向失败或不支持此操作
    pub async fn steer_turn(&self, input: TurnInput) -> ProviderResult<ProviderTurnStartResult> {
        let provider = input.provider;
        let adapter = self.get_adapter(provider).await?;

        adapter.steer_turn(input).await
    }

    /// 中断正在执行的 Turn
    ///
    /// 停止指定 Turn 的执行，释放相关资源。
    ///
    /// # 参数
    ///
    /// - `thread_id`: 会话线程 ID
    /// - `turn_id`: 可选的 Turn ID，为 None 时中断该会话所有正在执行的 Turn
    /// - `provider`: Provider 类型
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 中断成功
    /// - `Err(ProviderError)`: 中断失败
    pub async fn interrupt_turn(
        &self,
        thread_id: &str,
        turn_id: Option<&str>,
        provider: ProviderKind,
    ) -> ProviderResult<()> {
        let adapter = self.get_adapter(provider).await?;

        adapter.interrupt_turn(thread_id, turn_id).await
    }

    /// 停止指定会话
    ///
    /// 清理会话资源，终止所有相关的后台任务。
    ///
    /// # 参数
    ///
    /// - `thread_id`: 要停止的会话线程 ID
    /// - `provider`: Provider 类型
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 停止成功
    /// - `Err(ProviderError)`: 停止失败
    pub async fn stop_session(&self, thread_id: &str, provider: ProviderKind) -> ProviderResult<()> {
        let adapter = self.get_adapter(provider).await?;

        adapter.stop_session(thread_id).await
    }

    /// 列出所有 Provider 的所有会话
    ///
    /// 遍历所有注册的适配器，汇总它们的活跃会话。
    /// 即使某个适配器查询失败，也会继续查询其他适配器。
    ///
    /// # 返回值
    ///
    /// - `Ok(Vec<ProviderSession>)`: 所有会话的列表
    /// - `Err(ProviderError)`: 当前实现不会返回错误（内部错误被记录日志）
    ///
    /// # 容错设计
    ///
    /// 单个适配器查询失败不会影响其他适配器的查询，
    /// 失败的适配器会被记录警告日志，但不影响整体结果。
    pub async fn list_sessions(&self) -> ProviderResult<Vec<ProviderSession>> {
        let adapters = self.adapters.read().await;
        let mut all_sessions = Vec::new();

        for adapter in adapters.values() {
            match adapter.list_sessions().await {
                Ok(sessions) => all_sessions.extend(sessions),
                Err(e) => {
                    warn!("列出会话失败: {}", e);
                }
            }
        }

        Ok(all_sessions)
    }

    /// 获取指定 Provider 的适配器能力
    ///
    /// 查询适配器支持的功能特性，上层业务可根据此信息动态调整行为。
    ///
    /// # 参数
    ///
    /// - `provider`: Provider 类型
    ///
    /// # 返回值
    ///
    /// - `Ok(ProviderCapabilities)`: 适配器的能力声明
    /// - `Err(ProviderError)`: Provider 未找到
    pub async fn get_capabilities(
        &self,
        provider: ProviderKind,
    ) -> ProviderResult<crate::adapter::ProviderCapabilities> {
        let adapter = self.get_adapter(provider).await?;

        Ok(adapter.capabilities())
    }

    /// 回滚对话历史
    ///
    /// 将对话历史回滚指定的 Turn 数量，用于撤销操作或错误恢复。
    ///
    /// # 参数
    ///
    /// - `thread_id`: 会话线程 ID
    /// - `num_turns`: 要回滚的 Turn 数量
    /// - `provider`: Provider 类型
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 回滚成功
    /// - `Err(ProviderError)`: 回滚失败或不支持此操作
    pub async fn rollback_conversation(
        &self,
        thread_id: &str,
        num_turns: u32,
        provider: ProviderKind,
    ) -> ProviderResult<()> {
        let adapter = self.get_adapter(provider).await?;

        adapter.rollback_conversation(thread_id, num_turns).await
    }

    /// 压缩对话上下文
    ///
    /// 对长对话进行压缩，减少上下文长度以优化性能和成本。
    ///
    /// # 参数
    ///
    /// - `thread_id`: 会话线程 ID
    /// - `provider`: Provider 类型
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 压缩成功
    /// - `Err(ProviderError)`: 压缩失败或不支持此操作
    pub async fn compact_thread(&self, thread_id: &str, provider: ProviderKind) -> ProviderResult<()> {
        let adapter = self.get_adapter(provider).await?;

        adapter.compact_thread(thread_id).await
    }

    /// 设置 Provider 的 API Key
    ///
    /// 将 API Key 保存在服务内存中，供对应 Provider 的适配器启动会话时使用。
    /// 当前为内存存储，后续可接入持久化 Secret 存储。
    ///
    /// # 参数
    ///
    /// - `provider`: Provider 类型
    /// - `key`: API Key 字符串
    pub async fn set_api_key(&self, provider: ProviderKind, key: String) {
        let mut keys = self.api_keys.write().await;
        keys.insert(provider, key);
        info!("已设置 Provider API Key: {:?}", provider);
    }

    /// 获取所有已注册 Provider 的运行时状态
    ///
    /// 返回以 ProviderKind 为键的状态映射，包含可用性、认证状态、版本等。
    /// 该结构与前端 `ServerProviderStatus` 对齐。
    pub async fn get_provider_status(&self) -> ProviderResult<HashMap<ProviderKind, ServerProviderStatus>> {
        let adapters = self.adapters.read().await;
        let mut kinds: Vec<ProviderKind> = adapters.keys().copied().collect();
        kinds.sort_by_key(|k| format!("{}", k));
        drop(adapters);

        let keys = self.api_keys.read().await;
        let mut result = HashMap::with_capacity(kinds.len());

        for kind in kinds {
            let health = if let Some(cached) = self.health.get_cached_status(kind).await {
                cached
            } else {
                match self.health.check_health(kind).await {
                    Ok(status) => status,
                    Err(e) => {
                        warn!("健康检查失败 {:?}: {}", kind, e);
                        crate::health::ProviderHealthStatus {
                            provider: kind,
                            available: false,
                            last_checked: Utc::now(),
                            message: Some(e.to_string()),
                        }
                    }
                }
            };

            let has_key = keys.contains_key(&kind);
            let auth_status = if has_key {
                ServerProviderAuthStatus::Authenticated
            } else {
                ServerProviderAuthStatus::Unauthenticated
            };

            let checked_at = health.last_checked.to_rfc3339();
            result.insert(
                kind,
                ServerProviderStatus {
                    provider: kind,
                    status: if health.available {
                        ServerProviderStatusState::Ready
                    } else {
                        ServerProviderStatusState::Error
                    },
                    available: health.available && has_key,
                    auth_status,
                    auth_type: Some("apiKey".to_string()),
                    auth_label: if has_key {
                        Some("已配置".to_string())
                    } else {
                        Some("未配置".to_string())
                    },
                    voice_transcription_available: None,
                    version: None,
                    checked_at,
                    message: health.message,
                    version_advisory: None,
                    update_state: None,
                },
            );
        }
        Ok(result)
    }

    /// 列出所有已知的 Provider 状态
    ///
    /// 遍历所有已注册的 Provider 类型，返回它们的状态快照。
    /// 优先返回缓存的健康状态，若缓存不存在则触发一次健康检查。
    ///
    /// # 返回值
    ///
    /// - `Ok(Vec<ProviderHealthStatus>)`: Provider 状态列表
    /// - `Err(ProviderError)`: 查询失败
    pub async fn list_providers(&self) -> ProviderResult<Vec<crate::health::ProviderHealthStatus>> {
        let adapters = self.adapters.read().await;
        let mut kinds: Vec<ProviderKind> = adapters.keys().copied().collect();
        // 保证返回顺序稳定，便于前端渲染和测试
        kinds.sort_by_key(|k| format!("{}", k));
        drop(adapters);

        // 优先返回缓存状态，缺失的触发一次检查
        let mut statuses = Vec::with_capacity(kinds.len());
        for kind in kinds {
            if let Some(cached) = self.health.get_cached_status(kind).await {
                statuses.push(cached);
            } else {
                let status = self.health.check_health(kind).await?;
                statuses.push(status);
            }
        }
        Ok(statuses)
    }

    /// 列出指定 Provider 支持的模型
    ///
    /// 通过对应适配器查询模型列表；适配器未实现动态发现时，
    /// 返回内置静态模型目录作为降级。
    ///
    /// # 参数
    ///
    /// - `provider`: Provider 类型
    ///
    /// # 返回值
    ///
    /// - `Ok(Vec<serde_json::Value>)`: 模型列表
    /// - `Err(ProviderError)`: 查询失败
    pub async fn list_models(&self, provider: ProviderKind) -> ProviderResult<Vec<Value>> {
        let adapter = self.get_adapter(provider).await?;
        let input = remi_core::provider::ProviderListModelsInput {
            provider,
            binary_path: None,
            api_endpoint: None,
        };
        let result = adapter.list_models(input).await?;
        let models = result
            .models
            .into_iter()
            .map(|m| serde_json::to_value(m).unwrap_or(Value::Null))
            .collect();
        Ok(models)
    }

    /// 列出指定 Provider 支持的 Agent
    ///
    /// 通过对应适配器查询 Agent 列表；适配器未实现动态发现时，
    /// 返回内置静态 Agent 目录作为降级。
    ///
    /// # 参数
    ///
    /// - `provider`: Provider 类型
    ///
    /// # 返回值
    ///
    /// - `Ok(Vec<serde_json::Value>)`: Agent 列表
    /// - `Err(ProviderError)`: 查询失败
    pub async fn list_agents(&self, provider: ProviderKind) -> ProviderResult<Vec<Value>> {
        let adapter = self.get_adapter(provider).await?;
        let result = adapter.list_agents().await?;
        let agents = result
            .agents
            .into_iter()
            .map(|a| serde_json::to_value(a).unwrap_or(Value::Null))
            .collect();
        Ok(agents)
    }

    /// 获取 Provider 更新命令
    ///
    /// 返回指定 Provider 的更新命令和参数。如果 Provider 不支持更新，返回 None。
    ///
    /// # 参数
    ///
    /// - `provider_name`: Provider 名称（如 'codex', 'claude' 等）
    ///
    /// # 返回值
    ///
    /// - `Some((cmd, args))`: 更新命令和参数
    /// - `None`: Provider 不支持更新
    pub async fn get_provider_update_command(
        &self,
        provider_name: &str,
    ) -> Option<(String, Vec<String>)> {
        match provider_name {
            "codex" => Some((
                "npm".to_string(),
                vec![
                    "install".to_string(),
                    "-g".to_string(),
                    "@openai/codex@latest".to_string(),
                ],
            )),
            "claude" | "claudeAgent" => {
                if cfg!(target_os = "macos") {
                    Some((
                        "brew".to_string(),
                        vec!["upgrade".to_string(), "claude-code".to_string()],
                    ))
                } else {
                    Some((
                        "npm".to_string(),
                        vec![
                            "install".to_string(),
                            "-g".to_string(),
                            "@anthropic-ai/claude-code@latest".to_string(),
                        ],
                    ))
                }
            }
            "gemini" => Some((
                "npm".to_string(),
                vec![
                    "install".to_string(),
                    "-g".to_string(),
                    "@anthropic-ai/claude-code@latest".to_string(),
                ],
            )),
            _ => None,
        }
    }

    /// 获取 Provider 使用统计
    ///
    /// 查询指定 Provider 的 token 使用量统计信息。
    ///
    /// # 参数
    ///
    /// - `provider_name`: Provider 名称
    ///
    /// # 返回值
    ///
    /// - `Some(UsageSnapshot)`: 使用统计快照
    /// - `None`: Provider 不支持使用统计或无数据
    pub async fn get_usage_snapshot(&self, provider_name: &str) -> Option<Value> {
        // 获取用户的 home 目录
        let home_dir = dirs::home_dir()?;

        match provider_name {
            "codex" => {
                let sessions_dir = home_dir.join(".codex").join("sessions");
                if !sessions_dir.exists() {
                    return None;
                }
                // 扫描最近的 session 文件统计 token 使用量
                self.scan_codex_usage(&sessions_dir).await
            }
            "claude" | "claudeAgent" => {
                let projects_dir = home_dir.join(".claude").join("projects");
                if !projects_dir.exists() {
                    return None;
                }
                // 扫描 Claude 项目目录统计 token 使用量
                self.scan_claude_usage(&projects_dir).await
            }
            _ => None,
        }
    }

    /// 扫描 Codex session 目录统计使用量
    async fn scan_codex_usage(&self, sessions_dir: &std::path::Path) -> Option<Value> {
        use tokio::fs;
        use chrono::{Utc, Duration};

        let now = Utc::now();
        let _30_days_ago = now - Duration::days(30);

        let mut total_tokens: u64 = 0;
        let mut session_count: u64 = 0;

        // 遍历最近的 session 文件
        if let Ok(mut entries) = fs::read_dir(sessions_dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let path = entry.path();
                if path.extension().map(|e| e == "jsonl").unwrap_or(false) {
                    session_count += 1;
                    // 读取 JSONL 文件统计 token
                    if let Ok(content) = fs::read_to_string(&path).await {
                        for line in content.lines() {
                            if let Ok(json) = serde_json::from_str::<Value>(line) {
                                if let Some(tokens) = json
                                    .pointer("/payload/info/total_token_usage/total_tokens")
                                    .and_then(|v| v.as_u64())
                                {
                                    total_tokens += tokens;
                                }
                            }
                        }
                    }
                }
            }
        }

        Some(serde_json::json!({
            "provider": "codex",
            "updatedAt": now.to_rfc3339(),
            "totalTokens": total_tokens,
            "sessionCount": session_count,
            "source": "codex-session-archive"
        }))
    }

    /// 扫描 Claude 项目目录统计使用量
    async fn scan_claude_usage(&self, projects_dir: &std::path::Path) -> Option<Value> {
        use tokio::fs;
        use chrono::{Utc, Duration};

        let now = Utc::now();
        let _30_days_ago = now - Duration::days(30);

        let mut total_tokens: u64 = 0;
        let mut session_count: u64 = 0;

        // 遍历项目目录
        if let Ok(mut projects) = fs::read_dir(projects_dir).await {
            while let Ok(Some(project)) = projects.next_entry().await {
                let project_path = project.path();
                if project_path.is_dir() {
                    // 遍历项目内的 JSONL 文件
                    if let Ok(mut files) = fs::read_dir(&project_path).await {
                        while let Ok(Some(file)) = files.next_entry().await {
                            let file_path = file.path();
                            if file_path.extension().map(|e| e == "jsonl").unwrap_or(false) {
                                session_count += 1;
                                if let Ok(content) = fs::read_to_string(&file_path).await {
                                    for line in content.lines() {
                                        if let Ok(json) = serde_json::from_str::<Value>(line) {
                                            // 统计 token 使用量
                                            if let Some(usage) = json.get("usage") {
                                                let input = usage
                                                    .get("input_tokens")
                                                    .and_then(|v| v.as_u64())
                                                    .unwrap_or(0);
                                                let output = usage
                                                    .get("output_tokens")
                                                    .and_then(|v| v.as_u64())
                                                    .unwrap_or(0);
                                                total_tokens += input + output;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Some(serde_json::json!({
            "provider": "claudeAgent",
            "updatedAt": now.to_rfc3339(),
            "totalTokens": total_tokens,
            "sessionCount": session_count,
            "source": "claude-project-transcripts"
        }))
    }

    /// 刷新所有 Provider 的状态
    ///
    /// 对所有已注册的 Provider 执行健康检查并更新缓存。
    /// 单个 Provider 检查失败不会中断整体刷新流程。
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 刷新成功
    /// - `Err(ProviderError)`: 刷新失败
    pub async fn refresh_providers(&self) -> ProviderResult<()> {
        let adapters = self.adapters.read().await;
        let kinds: Vec<ProviderKind> = adapters.keys().copied().collect();
        drop(adapters);

        if kinds.is_empty() {
            info!("刷新 Provider 状态：当前无已注册适配器");
            return Ok(());
        }

        info!("刷新 {} 个 Provider 的健康状态", kinds.len());
        let statuses = self.health.check_all_health(&kinds).await;
        let available = statuses.iter().filter(|s| s.available).count();
        info!(
            "Provider 健康状态刷新完成：可用 {}/{}",
            available,
            statuses.len()
        );
        Ok(())
    }

    /// 订阅 Provider 事件流
    ///
    /// 创建一个新的接收器，用于接收 Provider 运行时事件。
    /// 多个订阅者可以同时接收相同的事件。
    ///
    /// # 返回值
    ///
    /// 返回 `broadcast::Receiver<ProviderRuntimeEvent>`，用于接收事件
    ///
    /// # 使用示例
    ///
    /// ```rust,ignore
    /// let mut rx = service.stream_events();
    /// tokio::spawn(async move {
    ///     while let Ok(event) = rx.recv().await {
    ///         println!("收到事件: {:?}", event);
    ///     }
    /// });
    /// ```
    pub fn stream_events(&self) -> broadcast::Receiver<ProviderRuntimeEvent> {
        self.event_tx.subscribe()
    }

    /// 广播 Provider 事件
    ///
    /// 向所有订阅者发送事件。如果没有订阅者，事件会被丢弃。
    ///
    /// # 参数
    ///
    /// - `event`: 要广播的事件
    ///
    /// # 注意事项
    ///
    /// - 即使没有订阅者，此方法也不会返回错误
    /// - 事件会被发送到所有当前活跃的订阅者
    pub fn broadcast_event(&self, event: ProviderRuntimeEvent) {
        // 忽略发送错误（通常是因为没有订阅者）
        let _ = self.event_tx.send(event);
    }
}

impl Default for ProviderService {
    /// 默认实现，等同于 `new()`
    fn default() -> Self {
        Self::new()
    }
}

// 旧的 static_models_for / static_agents_for 已迁移到 `crate::catalog`，
// 由 `ProviderAdapter` 默认实现统一提供，避免在 ProviderService 中重复维护。

