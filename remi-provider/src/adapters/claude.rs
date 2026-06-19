//! Claude Provider 适配器实现
//!
//! 本模块实现了 Claude Provider 的适配器，通过 Claude Agent SDK
//! 与 Claude AI 服务进行交互。
//!
//! # 功能特性
//!
//! - **会话管理**：支持创建、停止、列出会话
//! - **消息发送**：支持发送 Turn、转向 Turn 和中断 Turn
//! - **事件流**：支持订阅运行时事件
//! - **高级特性**：支持技能提及、技能发现、运行时模型列表、Turn 转向
//!
//! # 能力支持
//!
//! | 特性 | 支持状态 | 说明 |
//! |------|---------|------|
//! | 技能提及 | ✅ 支持 | 用户可通过 @mention 调用技能 |
//! | 技能发现 | ✅ 支持 | 自动发现可用技能 |
//! | 运行时模型列表 | ✅ 支持 | 动态获取可用模型 |
//! | Turn 转向 | ✅ 支持 | 在运行中重定向对话 |
//! | 会话内模型切换 | ⚠️ 需重启 | 切换模型需要重启会话 |
//! | 原生命令发现 | ❌ 不支持 | - |
//!
//! # 当前状态
//!
//! 当前实现为占位逻辑，核心功能（如实际的 Claude SDK 集成）尚未实现。
//! 需要后续集成 Claude Agent SDK。
//!
//! # 模块依赖
//!
//! - 依赖 `remi_core::provider` 中的核心类型定义
//! - 依赖 `tokio` 异步运行时
//! - 实现 [`crate::adapter::ProviderAdapter`] trait
//!
//! # 使用示例
//!
//! ```rust,ignore
//! use remi_provider::adapters::ClaudeAdapter;
//! use remi_provider::service::ProviderService;
//! use std::sync::Arc;
//!
//! let adapter = Arc::new(ClaudeAdapter::new());
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

/// Claude 适配器
///
/// 实现 `ProviderAdapter` trait，提供与 Claude AI 服务的交互能力。
/// 内部维护会话列表和事件广播通道。
///
/// # 线程安全
///
/// 使用 `Arc<RwLock<...>>` 管理内部状态，支持多线程并发访问。
///
/// # 支持的特性
///
/// - ✅ 技能提及（Skill Mentions）
/// - ✅ 技能发现（Skill Discovery）
/// - ✅ 运行时模型列表（Runtime Model List）
/// - ✅ Turn 转向（Turn Steering）
/// - ⚠️ 会话内模型切换（需要重启会话）
///
/// # TODO
///
/// 需要实现的核心功能：
/// - Claude Agent SDK 集成
/// - 会话状态持久化
/// - 事件流处理
pub struct ClaudeAdapter {
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

impl ClaudeAdapter {
    /// 创建新的 Claude 适配器实例
    ///
    /// 初始化空的会话列表和事件广播通道。
    ///
    /// # 返回值
    ///
    /// 返回新创建的 `ClaudeAdapter` 实例
    ///
    /// # 示例
    ///
    /// ```rust,ignore
    /// let adapter = ClaudeAdapter::new();
    /// ```
    pub fn new() -> Self {
        let (event_tx, _) = broadcast::channel(10000);

        Self {
            sessions: Arc::new(RwLock::new(Vec::new())),
            event_tx,
        }
    }
}

impl Default for ClaudeAdapter {
    /// 默认实现，等同于 `new()`
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ProviderAdapter for ClaudeAdapter {
    /// 获取 Provider 类型标识
    ///
    /// 返回 `ProviderKind::ClaudeAgent`，标识此适配器对应的 Provider 类型。
    fn provider_kind(&self) -> ProviderKind {
        ProviderKind::ClaudeAgent
    }

    /// 获取适配器能力声明
    ///
    /// Claude 适配器支持多种高级特性：
    /// - 技能提及：允许用户通过 @mention 调用技能
    /// - 技能发现：自动发现可用技能
    /// - 运行时模型列表：动态获取可用模型
    /// - Turn 转向：在运行中重定向对话
    /// - 会话模型切换：需要重启会话
    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            session_model_switch: SessionModelSwitchMode::RestartSession,
            supports_skill_mentions: true,
            supports_skill_discovery: true,
            supports_native_slash_command_discovery: false,
            supports_runtime_model_list: true,
            supports_turn_steering: true,
        }
    }

    /// 启动新的会话
    ///
    /// 创建并初始化一个新的 Claude 会话。当前实现为占位逻辑，
    /// 需要后续集成 Claude Agent SDK 实现实际的会话启动。
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
    /// 需要实现 Claude 会话启动逻辑（Claude Agent SDK）
    async fn start_session(&self, input: ProviderSessionStartInput) -> ProviderResult<ProviderSession> {
        info!("ClaudeAdapter: 启动会话 thread_id={}", input.thread_id);

        // TODO: 实现 Claude 会话启动逻辑（Claude Agent SDK）
        // 当前为占位实现，生成模拟的会话信息
        let session = ProviderSession {
            session_id: uuid::Uuid::new_v4().to_string(),
            thread_id: input.thread_id.clone(),
            provider: ProviderKind::ClaudeAgent,
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
    /// 将用户消息发送到 Claude Provider，启动一个新的对话轮次。
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
    /// 需要实现 Claude Turn 发送逻辑
    async fn send_turn(&self, input: TurnInput) -> ProviderResult<ProviderTurnStartResult> {
        info!("ClaudeAdapter: 发送 Turn thread_id={}", input.thread_id);

        // TODO: 实现 Claude Turn 发送逻辑
        Ok(ProviderTurnStartResult {
            turn_id: input.turn_id,
            thread_id: input.thread_id,
        })
    }

    /// 转向 Turn（重定向运行中的对话）
    ///
    /// 在 Turn 执行过程中重定向对话方向。当前实现为占位逻辑，
    /// 直接调用 `send_turn`。
    ///
    /// # 参数
    ///
    /// - `input`: Turn 输入参数，包含新的对话方向信息
    ///
    /// # 返回值
    ///
    /// - `Ok(ProviderTurnStartResult)`: 转向成功
    /// - `Err(ProviderError)`: 转向失败
    ///
    /// # TODO
    ///
    /// 需要实现 Claude Turn 转向逻辑
    async fn steer_turn(&self, input: TurnInput) -> ProviderResult<ProviderTurnStartResult> {
        info!("ClaudeAdapter: 转向 Turn thread_id={}", input.thread_id);

        // TODO: 实现 Claude Turn 转向逻辑
        self.send_turn(input).await
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
    /// 需要实现 Claude Turn 中断逻辑
    async fn interrupt_turn(&self, thread_id: &str, turn_id: Option<&str>) -> ProviderResult<()> {
        info!("ClaudeAdapter: 中断 Turn thread_id={}, turn_id={:?}", thread_id, turn_id);

        // TODO: 实现 Claude Turn 中断逻辑
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
        info!("ClaudeAdapter: 停止会话 thread_id={}", thread_id);

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
        info!("ClaudeAdapter: 停止所有会话");

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
