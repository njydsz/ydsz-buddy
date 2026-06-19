//! Codex Provider 适配器实现
//!
//! 本模块实现了 Codex Provider 的适配器，通过 JSON-RPC over stdio 协议
//! 与 Codex AI 服务进行交互。
//!
//! # 功能特性
//!
//! - **会话管理**：支持创建、停止、列出会话
//! - **消息发送**：支持发送 Turn 和中断 Turn
//! - **事件流**：支持订阅运行时事件
//!
//! # 当前状态
//!
//! 当前实现为占位逻辑，核心功能（如实际的 JSON-RPC 通信）尚未实现。
//! 需要后续集成 Codex SDK 或实现自定义的 JSON-RPC 客户端。
//!
//! # 使用示例
//!
//! ```rust,ignore
//! use remi_provider::adapters::CodexAdapter;
//! use remi_provider::service::ProviderService;
//! use std::sync::Arc;
//!
//! let adapter = Arc::new(CodexAdapter::new());
//! let service = ProviderService::new();
//! service.register_adapter(adapter).await;
//! ```

use std::sync::Arc;

use async_trait::async_trait;
use remi_core::provider::{
    ProviderKind, ProviderRuntimeEvent, ProviderSession, ProviderSessionStartInput,
    ProviderTurnStartResult, TurnInput,
};
use tokio::sync::{broadcast, RwLock};
use tracing::info;

use crate::adapter::{ProviderAdapter, ProviderCapabilities, SessionModelSwitchMode};
use crate::error::ProviderResult;

/// Codex 适配器
///
/// 实现 `ProviderAdapter` trait，提供与 Codex AI 服务的交互能力。
/// 内部维护会话列表和事件广播通道。
///
/// # 线程安全
///
/// 使用 `Arc<RwLock<...>>` 管理内部状态，支持多线程并发访问。
///
/// # TODO
///
/// 需要实现的核心功能：
/// - JSON-RPC over stdio 通信
/// - 会话状态持久化
/// - 事件流处理
pub struct CodexAdapter {
    /// 活跃会话列表
    ///
    /// 存储当前所有由该适配器管理的会话信息。
    /// 使用 `RwLock` 保证并发读写安全。
    sessions: Arc<RwLock<Vec<ProviderSession>>>,

    /// 事件广播发送器
    ///
    /// 用于广播 Provider 运行时事件，支持多个订阅者。
    /// 通道容量为 10000。
    event_tx: broadcast::Sender<ProviderRuntimeEvent>,
}

impl CodexAdapter {
    /// 创建新的 Codex 适配器实例
    ///
    /// 初始化空的会话列表和事件广播通道。
    ///
    /// # 返回值
    ///
    /// 返回新创建的 `CodexAdapter` 实例
    ///
    /// # 示例
    ///
    /// ```rust,ignore
    /// let adapter = CodexAdapter::new();
    /// ```
    pub fn new() -> Self {
        let (event_tx, _) = broadcast::channel(10000);

        Self {
            sessions: Arc::new(RwLock::new(Vec::new())),
            event_tx,
        }
    }
}

impl Default for CodexAdapter {
    /// 默认实现，等同于 `new()`
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ProviderAdapter for CodexAdapter {
    /// 获取 Provider 类型标识
    ///
    /// 返回 `ProviderKind::Codex`，标识此适配器对应的 Provider 类型。
    fn provider_kind(&self) -> ProviderKind {
        ProviderKind::Codex
    }

    /// 获取适配器能力声明
    ///
    /// Codex 适配器当前不支持高级特性（如模型切换、技能发现等）。
    /// 所有能力标志均设置为 `false` 或 `Unsupported`。
    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            session_model_switch: SessionModelSwitchMode::Unsupported,
            supports_skill_mentions: false,
            supports_skill_discovery: false,
            supports_native_slash_command_discovery: false,
            supports_runtime_model_list: false,
            supports_turn_steering: false,
        }
    }

    /// 启动新的会话
    ///
    /// 创建并初始化一个新的 Codex 会话。当前实现为占位逻辑，
    /// 需要后续集成 Codex SDK 实现实际的会话启动。
    ///
    /// # 参数
    ///
    /// - `input`: 会话启动输入参数，包含 thread_id、模型选择等
    ///
    /// # 返回值
    ///
    /// - `Ok(ProviderSession)`: 成功创建的会话信息
    /// - `Err(ProviderError)`: 启动失败
    ///
    /// # TODO
    ///
    /// 需要实现 Codex 会话启动逻辑（JSON-RPC over stdio）
    async fn start_session(&self, input: ProviderSessionStartInput) -> ProviderResult<ProviderSession> {
        info!("CodexAdapter: 启动会话 thread_id={}", input.thread_id);

        // TODO: 实现 Codex 会话启动逻辑（JSON-RPC over stdio）
        // 当前为占位实现，生成模拟的会话信息
        let session = ProviderSession {
            session_id: uuid::Uuid::new_v4().to_string(),
            thread_id: input.thread_id.clone(),
            provider: ProviderKind::Codex,
            model: input.model.clone(),
            status: remi_core::provider::ProviderSessionStatus::Running,
            created_at: chrono::Utc::now(),
        };

        // 将会话添加到活跃列表
        let mut sessions = self.sessions.write().await;
        sessions.push(session.clone());

        Ok(session)
    }

    /// 发送 Turn（对话轮次）
    ///
    /// 将用户消息发送到 Codex Provider，启动一个新的对话轮次。
    /// 当前实现为占位逻辑。
    ///
    /// # 参数
    ///
    /// - `input`: Turn 输入参数，包含消息内容、上下文等信息
    ///
    /// # 返回值
    ///
    /// - `Ok(ProviderTurnStartResult)`: Turn 启动成功
    /// - `Err(ProviderError)`: 发送失败
    ///
    /// # TODO
    ///
    /// 需要实现 Codex Turn 发送逻辑
    async fn send_turn(&self, input: TurnInput) -> ProviderResult<ProviderTurnStartResult> {
        info!("CodexAdapter: 发送 Turn thread_id={}", input.thread_id);

        // TODO: 实现 Codex Turn 发送逻辑
        Ok(ProviderTurnStartResult {
            turn_id: input.turn_id,
            thread_id: input.thread_id,
        })
    }

    /// 中断正在执行的 Turn
    ///
    /// 停止指定 Turn 的执行。当前实现为占位逻辑。
    ///
    /// # 参数
    ///
    /// - `thread_id`: 会话线程 ID
    /// - `turn_id`: 可选的 Turn ID
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 中断成功
    /// - `Err(ProviderError)`: 中断失败
    ///
    /// # TODO
    ///
    /// 需要实现 Codex Turn 中断逻辑
    async fn interrupt_turn(&self, thread_id: &str, turn_id: Option<&str>) -> ProviderResult<()> {
        info!("CodexAdapter: 中断 Turn thread_id={}, turn_id={:?}", thread_id, turn_id);

        // TODO: 实现 Codex Turn 中断逻辑
        Ok(())
    }

    /// 停止指定会话
    ///
    /// 清理会话资源，从活跃列表中移除会话。
    ///
    /// # 参数
    ///
    /// - `thread_id`: 要停止的会话线程 ID
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 停止成功
    /// - `Err(ProviderError)`: 停止失败
    async fn stop_session(&self, thread_id: &str) -> ProviderResult<()> {
        info!("CodexAdapter: 停止会话 thread_id={}", thread_id);

        // 从活跃列表中移除指定会话
        let mut sessions = self.sessions.write().await;
        sessions.retain(|s| s.thread_id != thread_id);

        Ok(())
    }

    /// 停止所有会话
    ///
    /// 清理所有会话资源，清空活跃列表。
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 停止成功
    /// - `Err(ProviderError)`: 停止失败
    async fn stop_all(&self) -> ProviderResult<()> {
        info!("CodexAdapter: 停止所有会话");

        // 清空活跃列表
        let mut sessions = self.sessions.write().await;
        sessions.clear();

        Ok(())
    }

    /// 列出所有活跃会话
    ///
    /// 返回当前所有活跃会话的列表。
    ///
    /// # 返回值
    ///
    /// - `Ok(Vec<ProviderSession>)`: 会话列表
    /// - `Err(ProviderError)`: 获取失败
    async fn list_sessions(&self) -> ProviderResult<Vec<ProviderSession>> {
        let sessions = self.sessions.read().await;
        Ok(sessions.clone())
    }

    /// 检查是否存在指定会话
    ///
    /// 快速检查指定 thread_id 的会话是否存在。
    ///
    /// # 参数
    ///
    /// - `thread_id`: 要检查的会话线程 ID
    ///
    /// # 返回值
    ///
    /// - `Ok(true)`: 会话存在
    /// - `Ok(false)`: 会话不存在
    /// - `Err(ProviderError)`: 检查失败
    async fn has_session(&self, thread_id: &str) -> ProviderResult<bool> {
        let sessions = self.sessions.read().await;
        Ok(sessions.iter().any(|s| s.thread_id == thread_id))
    }

    /// 获取运行时事件流接收器
    ///
    /// 订阅 Provider 运行时事件流。
    ///
    /// # 返回值
    ///
    /// - `Ok(broadcast::Receiver<ProviderRuntimeEvent>)`: 事件流接收器
    /// - `Err(ProviderError)`: 订阅失败
    async fn stream_events(&self) -> ProviderResult<broadcast::Receiver<ProviderRuntimeEvent>> {
        Ok(self.event_tx.subscribe())
    }
}
