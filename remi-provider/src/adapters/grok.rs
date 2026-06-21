//! Grok Provider 适配器实现
//!
//! 本模块实现了 Grok Provider 的适配器，通过 JSON-RPC over stdio 协议
//! 与 xAI Grok 进程进行交互。
//!
//! # 功能特性
//!
//! - **会话管理**：支持创建、停止、列出会话
//! - **消息发送**：支持发送 Turn、中断 Turn
//! - **事件流**：支持订阅运行时事件（SessionUpdate、TurnComplete、Error）
//!
//! # 能力支持
//!
//! | 特性 | 支持状态 | 说明 |
//! |------|---------|------|
//! | 技能提及 | ❌ 不支持 | - |
//! | 技能发现 | ❌ 不支持 | - |
//! | 运行时模型列表 | ✅ 支持 | 支持动态获取可用模型 |
//! | Turn 转向 | ❌ 不支持 | - |
//! | 会话内模型切换 | ✅ 支持 | 无需重启会话即可切换模型 |
//! | 原生命令发现 | ❌ 不支持 | - |
//!
//! # 模块依赖
//!
//! - 依赖 [`crate::jsonrpc_client::JsonRpcClient`] 进行底层通信
//! - 依赖 `remi_core::provider` 中的核心类型定义
//! - 实现 [`crate::adapter::ProviderAdapter`] trait

use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use remi_core::provider::{
    ProviderKind, ProviderRuntimeEvent, ProviderSession, ProviderSessionStartInput,
    ProviderTurnStartResult, TurnInput,
};
use serde_json::json;
use tokio::sync::{broadcast, RwLock};
use tracing::{debug, error, info};

use crate::adapter::{ProviderAdapter, ProviderCapabilities, SessionModelSwitchMode};
use crate::error::{ProviderError, ProviderResult};
use crate::jsonrpc_client::JsonRpcClient;

/// Grok Provider 适配器
///
/// 通过 JSON-RPC over stdio 与 xAI Grok 进程通信。
/// 内部维护活跃会话列表和事件广播通道。
///
/// # 能力特性
///
/// Grok 支持会话内模型切换和运行时模型列表，
/// 但不支持技能提及、技能发现、Turn 转向和原生命令发现。
pub struct GrokAdapter {
    /// 活跃会话列表
    ///
    /// 键为 thread_id，值为对应的 JSON-RPC 客户端实例。
    /// 每个会话对应一个独立的 Grok 子进程。
    sessions: Arc<RwLock<HashMap<String, Arc<JsonRpcClient>>>>,
    /// 事件广播发送器
    ///
    /// 将 Grok 推送的通知转换为 `ProviderRuntimeEvent` 后广播给订阅者。
    event_tx: broadcast::Sender<ProviderRuntimeEvent>,
}

impl GrokAdapter {
    /// 创建新的 Grok 适配器实例
    ///
    /// 初始化空的会话列表和事件广播通道。
    ///
    /// # 返回值
    ///
    /// 返回新创建的 `GrokAdapter` 实例
    pub fn new() -> Self {
        let (event_tx, _) = broadcast::channel(10000);

        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            event_tx,
        }
    }

    /// 启动 Grok 进程并建立 JSON-RPC 连接
    ///
    /// 启动 Grok CLI 子进程，传入模型和工作目录参数，
    /// 并启动后台事件监听线程。
    ///
    /// # 参数
    ///
    /// - `model`: 要使用的 Grok 模型名称（如 'grok-4'）
    /// - `cwd`: 子进程的工作目录
    ///
    /// # 返回值
    ///
    /// - `Ok(JsonRpcClient)`: 进程启动成功，返回 JSON-RPC 客户端
    /// - `Err(ProviderError)`: 进程启动失败
    async fn spawn_grok_process(
        &self,
        model: &str,
        cwd: &str,
    ) -> ProviderResult<JsonRpcClient> {
        info!("启动 Grok 进程: model={}, cwd={}", model, cwd);

        // Grok CLI 命令和参数
        let program = "grok";
        let args = vec!["--json", "--model", model];
        let env = HashMap::new();

        let client = JsonRpcClient::spawn(program, &args, &env, cwd).await?;

        // 启动事件监听
        let event_tx = self.event_tx.clone();
        let client_clone = Arc::new(client.clone());
        tokio::spawn(async move {
            Self::listen_events(client_clone, event_tx).await;
        });

        Ok(client)
    }

    /// 监听 Grok Provider 事件
    ///
    /// 后台任务，持续从 JSON-RPC 客户端接收通知并转换为 `ProviderRuntimeEvent`。
    /// 支持的通知类型：
    /// - `session.update` → `SessionUpdate`：会话更新事件
    /// - `turn.complete` → `TurnComplete`：Turn 完成事件
    /// - `error` → `Error`：错误事件
    ///
    /// # 参数
    ///
    /// - `client`: JSON-RPC 客户端的共享引用
    /// - `event_tx`: 事件广播发送器
    ///
    /// # 退出条件
    ///
    /// 当 `recv_notification` 返回 None（事件流关闭）时退出循环
    async fn listen_events(
        client: Arc<JsonRpcClient>,
        event_tx: broadcast::Sender<ProviderRuntimeEvent>,
    ) {
        loop {
            match client.recv_notification().await {
                Some(notification) => {
                    debug!("收到 Grok 通知: {}", notification.method);

                    // 将通知转换为 ProviderRuntimeEvent
                    let event = match notification.method.as_str() {
                        "session.update" => {
                            if let Some(params) = notification.params {
                                ProviderRuntimeEvent::SessionUpdate {
                                    session_id: params
                                        .get("sessionId")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string(),
                                    data: params,
                                }
                            } else {
                                continue;
                            }
                        }
                        "turn.complete" => {
                            if let Some(params) = notification.params {
                                ProviderRuntimeEvent::TurnComplete {
                                    turn_id: params
                                        .get("turnId")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string(),
                                    result: params,
                                }
                            } else {
                                continue;
                            }
                        }
                        "error" => {
                            if let Some(params) = notification.params {
                                ProviderRuntimeEvent::Error {
                                    session_id: params
                                        .get("sessionId")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string(),
                                    error: params
                                        .get("message")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("Unknown error")
                                        .to_string(),
                                }
                            } else {
                                continue;
                            }
                        }
                        _ => {
                            debug!("忽略未知通知: {}", notification.method);
                            continue;
                        }
                    };

                    let _ = event_tx.send(event);
                }
                None => {
                    info!("Grok 事件流已关闭");
                    break;
                }
            }
        }
    }
}

/// 默认实现，等同于 `new()`
impl Default for GrokAdapter {
    fn default() -> Self {
        Self::new()
    }
}

/// 实现 ProviderAdapter trait
///
/// 为 GrokAdapter 提供基础的 Provider 适配器接口实现。
/// Grok 不支持 Turn 转向、技能提及等高级功能。
#[async_trait]
impl ProviderAdapter for GrokAdapter {
    /// 获取 Provider 类型标识
    ///
    /// 返回 `ProviderKind::Grok`，标识此适配器对应的 Provider 类型。
    fn provider_kind(&self) -> ProviderKind {
        ProviderKind::Grok
    }

    /// 获取适配器能力声明
    ///
    /// Grok 支持会话内模型切换和运行时模型列表，
    /// 但不支持技能提及、技能发现、Turn 转向和原生命令发现。
    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            session_model_switch: SessionModelSwitchMode::InSession,
            supports_skill_mentions: false,
            supports_skill_discovery: false,
            supports_native_slash_command_discovery: false,
            supports_plugin_mentions: false,
            supports_plugin_discovery: false,
            supports_runtime_model_list: true,
            supports_turn_steering: false,
            supports_thread_compaction: false,
            supports_thread_import: false,
        }
    }

    /// 启动新的 Grok 会话
    ///
    /// 启动 Grok 子进程，初始化会话，并将客户端保存到会话列表。
    ///
    /// # 参数
    ///
    /// - `input`: 会话启动输入参数，包含 thread_id、模型选择等
    ///
    /// # 返回值
    ///
    /// - `Ok(ProviderSession)`: 会话创建成功
    /// - `Err(ProviderError::SessionAlreadyExists)`: 会话已存在
    /// - `Err(ProviderError::AdapterError)`: 进程启动或初始化失败
    async fn start_session(&self, input: ProviderSessionStartInput) -> ProviderResult<ProviderSession> {

        // 检查会话是否已存在
        {
            let sessions = self.sessions.read().await;
            if sessions.contains_key(&input.thread_id) {
                return Err(ProviderError::SessionAlreadyExists(input.thread_id.clone()));
            }
        }

        // 启动 Grok 进程
        let cwd = std::env::current_dir()
            .map_err(|e| ProviderError::AdapterError(format!("获取当前目录失败: {}", e)))?
            .to_string_lossy()
            .to_string();

        let client = self.spawn_grok_process(&input.model, &cwd).await?;
        let client = Arc::new(client);

        // 初始化会话
        let init_result = client
            .request(
                "session.initialize",
                Some(json!({
                    "threadId": input.thread_id,
                    "model": input.model,
                })),
            )
            .await?;

        if let Some(error) = init_result.error {
            return Err(ProviderError::AdapterError(format!(
                "初始化会话失败: {}",
                error.message
            )));
        }

        let session = ProviderSession {
            session_id: uuid::Uuid::new_v4().to_string(),
            thread_id: input.thread_id.clone(),
            provider: ProviderKind::Grok,
            model: input.model.clone(),
            status: remi_core::provider::ProviderSessionStatus::Running,
            created_at: chrono::Utc::now(),
        };

        // 保存客户端
        {
            let mut sessions = self.sessions.write().await;
            sessions.insert(input.thread_id.clone(), client);
        }

        Ok(session)
    }

    /// 发送 Turn（对话轮次）
    ///
    /// 向 Grok 发送用户消息，启动一个新的对话轮次。
    ///
    /// # 参数
    ///
    /// - `input`: Turn 输入参数，包含 thread_id、turn_id、消息内容等
    ///
    /// # 返回值
    ///
    /// - `Ok(ProviderTurnStartResult)`: Turn 发送成功
    /// - `Err(ProviderError::SessionNotFound)`: 会话不存在
    /// - `Err(ProviderError::AdapterError)`: 发送失败
    async fn send_turn(&self, input: TurnInput) -> ProviderResult<ProviderTurnStartResult> {

        let sessions = self.sessions.read().await;
        let client = sessions
            .get(&input.thread_id)
            .ok_or_else(|| ProviderError::SessionNotFound(input.thread_id.clone()))?;

        let result = client
            .request(
                "turn.send",
                Some(json!({
                    "threadId": input.thread_id,
                    "turnId": input.turn_id,
                    "message": input.message,
                })),
            )
            .await?;

        if let Some(error) = result.error {
            return Err(ProviderError::AdapterError(format!(
                "发送 Turn 失败: {}",
                error.message
            )));
        }

        Ok(ProviderTurnStartResult {
            turn_id: input.turn_id,
            thread_id: input.thread_id,
        })
    }

    /// 中断正在执行的 Turn
    ///
    /// 向 Grok 发送中断请求，停止指定 Turn 的执行。
    ///
    /// # 参数
    ///
    /// - `thread_id`: 会话线程 ID
    /// - `turn_id`: 可选的 Turn ID，为 None 时中断该会话所有正在执行的 Turn
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 中断成功
    /// - `Err(ProviderError::SessionNotFound)`: 会话不存在
    /// - `Err(ProviderError::AdapterError)`: 中断失败
    async fn interrupt_turn(&self, thread_id: &str, turn_id: Option<&str>) -> ProviderResult<()> {

        let sessions = self.sessions.read().await;
        let client = sessions
            .get(thread_id)
            .ok_or_else(|| ProviderError::SessionNotFound(thread_id.to_string()))?;

        let result = client
            .request(
                "turn.interrupt",
                Some(json!({
                    "threadId": thread_id,
                    "turnId": turn_id,
                })),
            )
            .await?;

        if let Some(error) = result.error {
            return Err(ProviderError::AdapterError(format!(
                "中断 Turn 失败: {}",
                error.message
            )));
        }

        Ok(())
    }

    /// 停止指定会话
    ///
    /// 从会话列表中移除并关闭对应的 Grok 子进程。
    /// 先尝试发送 `session.close` 请求，然后关闭客户端连接。
    ///
    /// # 参数
    ///
    /// - `thread_id`: 要停止的会话线程 ID
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 停止成功（即使会话不存在也返回 Ok）
    /// - `Err(ProviderError::AdapterError)`: 关闭客户端失败
    async fn stop_session(&self, thread_id: &str) -> ProviderResult<()> {

        let client = {
            let mut sessions = self.sessions.write().await;
            sessions.remove(thread_id)
        };

        if let Some(client) = client {
            // 发送关闭请求
            let _ = client.request("session.close", None).await;

            // 关闭客户端
            client.close().await?;
        }

        Ok(())
    }

    /// 停止所有会话
    ///
    /// 清空会话列表并关闭所有 Grok 子进程。
    /// 单个会话关闭失败不会影响其他会话的关闭。
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 所有会话已处理完毕（部分可能关闭失败，错误记录在日志中）
    async fn stop_all(&self) -> ProviderResult<()> {

        let sessions = {
            let mut sessions = self.sessions.write().await;
            std::mem::take(&mut *sessions)
        };

        for (thread_id, client) in sessions {
            if let Err(e) = client.close().await {
                error!("关闭会话 {} 失败: {}", thread_id, e);
            }
        }

        Ok(())
    }

    /// 列出所有活跃会话
    ///
    /// 返回当前管理的所有 Grok 会话信息。
    /// 注意：返回的 `model` 字段为空字符串，因为客户端未持久化模型信息。
    ///
    /// # 返回值
    ///
    /// - `Ok(Vec<ProviderSession>)`: 会话列表
    async fn list_sessions(&self) -> ProviderResult<Vec<ProviderSession>> {
        let sessions = self.sessions.read().await;
        let mut result = Vec::new();

        for (thread_id, _) in sessions.iter() {
            result.push(ProviderSession {
                session_id: uuid::Uuid::new_v4().to_string(),
                thread_id: thread_id.clone(),
                provider: ProviderKind::Grok,
                model: String::new(),
                status: remi_core::provider::ProviderSessionStatus::Running,
                created_at: chrono::Utc::now(),
            });
        }

        Ok(result)
    }

    /// 检查指定会话是否存在
    ///
    /// 快速检查 thread_id 对应的会话是否在活跃列表中。
    ///
    /// # 参数
    ///
    /// - `thread_id`: 要检查的会话线程 ID
    ///
    /// # 返回值
    ///
    /// - `Ok(true)`: 会话存在
    /// - `Ok(false)`: 会话不存在
    async fn has_session(&self, thread_id: &str) -> ProviderResult<bool> {
        let sessions = self.sessions.read().await;
        Ok(sessions.contains_key(thread_id))
    }

    /// 订阅 Grok Provider 事件流
    ///
    /// 创建新的事件接收器，用于接收 Grok 推送的运行时事件。
    /// 多个订阅者可以同时接收相同的事件。
    ///
    /// # 返回值
    ///
    /// 返回 `broadcast::Receiver<ProviderRuntimeEvent>`，用于异步接收事件
    async fn stream_events(&self) -> ProviderResult<broadcast::Receiver<ProviderRuntimeEvent>> {
        Ok(self.event_tx.subscribe())
    }
}

