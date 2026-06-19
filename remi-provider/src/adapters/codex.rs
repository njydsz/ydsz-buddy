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
//! # 能力支持
//!
//! | 特性 | 支持状态 | 说明 |
//! |------|---------|------|
//! | 技能提及 | ❌ 不支持 | - |
//! | 技能发现 | ❌ 不支持 | - |
//! | 运行时模型列表 | ❌ 不支持 | - |
//! | Turn 转向 | ❌ 不支持 | - |
//! | 会话内模型切换 | ❌ 不支持 | - |
//! | 原生命令发现 | ❌ 不支持 | - |
//!
//! # 协议说明
//!
//! Codex 使用 JSON-RPC over stdio 协议进行通信：
//! - 通过标准输入（stdin）发送 JSON-RPC 请求
//! - 通过标准输出（stdout）接收 JSON-RPC 响应
//! - 支持异步通知和事件流
//!
//! # 当前状态
//!
//! 当前实现为占位逻辑，核心功能（如实际的 JSON-RPC 通信）尚未实现。
//! 需要后续集成 Codex SDK 或实现自定义的 JSON-RPC 客户端。
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
//! use remi_provider::adapters::CodexAdapter;
//! use remi_provider::service::ProviderService;
//! use std::sync::Arc;
//!
//! let adapter = Arc::new(CodexAdapter::new());
//! let service = ProviderService::new();
//! service.register_adapter(adapter).await;
//! ```

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

/// Codex 适配器
///
/// 通过 JSON-RPC over stdio 与 Codex Provider 进程通信
pub struct CodexAdapter {
    /// 活跃会话列表
    sessions: Arc<RwLock<HashMap<String, Arc<JsonRpcClient>>>>,
    /// 事件广播发送器
    event_tx: broadcast::Sender<ProviderRuntimeEvent>,
}

impl CodexAdapter {
    /// 创建新的 Codex 适配器实例
    pub fn new() -> Self {
        let (event_tx, _) = broadcast::channel(10000);

        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            event_tx,
        }
    }

    /// 启动 Codex 进程并建立连接
    async fn spawn_codex_process(
        &self,
        model: &str,
        cwd: &str,
    ) -> ProviderResult<JsonRpcClient> {
        info!("启动 Codex 进程: model={}, cwd={}", model, cwd);

        // Codex CLI 命令和参数
        let program = "codex";
        let args = vec!["--json", "--model", model];
        let env = HashMap::new();

        let client = JsonRpcClient::spawn(program, &args, &env, cwd).await?;

        // 启动事件监听
        let event_tx = self.event_tx.clone();
        let client_clone = client.clone();
        tokio::spawn(async move {
            Self::listen_events(client_clone, event_tx).await;
        });

        Ok(client)
    }

    /// 监听 Provider 事件
    async fn listen_events(
        client: Arc<JsonRpcClient>,
        event_tx: broadcast::Sender<ProviderRuntimeEvent>,
    ) {
        loop {
            match client.recv_notification().await {
                Some(notification) => {
                    debug!("收到 Codex 通知: {}", notification.method);

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
                    info!("Codex 事件流已关闭");
                    break;
                }
            }
        }
    }
}

impl Default for CodexAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ProviderAdapter for CodexAdapter {
    fn provider_kind(&self) -> ProviderKind {
        ProviderKind::Codex
    }

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

    async fn start_session(&self, input: ProviderSessionStartInput) -> ProviderResult<ProviderSession> {
        info!("CodexAdapter: 启动会话 thread_id={}", input.thread_id);

        // 检查会话是否已存在
        {
            let sessions = self.sessions.read().await;
            if sessions.contains_key(&input.thread_id) {
                return Err(ProviderError::SessionAlreadyExists(input.thread_id.clone()));
            }
        }

        // 启动 Codex 进程
        let cwd = std::env::current_dir()
            .map_err(|e| ProviderError::AdapterError(format!("获取当前目录失败: {}", e)))?
            .to_string_lossy()
            .to_string();

        let client = self.spawn_codex_process(&input.model, &cwd).await?;
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
            provider: ProviderKind::Codex,
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

    async fn send_turn(&self, input: TurnInput) -> ProviderResult<ProviderTurnStartResult> {
        info!("CodexAdapter: 发送 Turn thread_id={}", input.thread_id);

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

    async fn interrupt_turn(&self, thread_id: &str, turn_id: Option<&str>) -> ProviderResult<()> {
        info!("CodexAdapter: 中断 Turn thread_id={}, turn_id={:?}", thread_id, turn_id);

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

    async fn stop_session(&self, thread_id: &str) -> ProviderResult<()> {
        info!("CodexAdapter: 停止会话 thread_id={}", thread_id);

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

    async fn stop_all(&self) -> ProviderResult<()> {
        info!("CodexAdapter: 停止所有会话");

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

    async fn list_sessions(&self) -> ProviderResult<Vec<ProviderSession>> {
        let sessions = self.sessions.read().await;
        let mut result = Vec::new();

        for (thread_id, _) in sessions.iter() {
            result.push(ProviderSession {
                session_id: uuid::Uuid::new_v4().to_string(),
                thread_id: thread_id.clone(),
                provider: ProviderKind::Codex,
                model: String::new(),
                status: remi_core::provider::ProviderSessionStatus::Running,
                created_at: chrono::Utc::now(),
            });
        }

        Ok(result)
    }

    async fn has_session(&self, thread_id: &str) -> ProviderResult<bool> {
        let sessions = self.sessions.read().await;
        Ok(sessions.contains_key(thread_id))
    }

    async fn stream_events(&self) -> ProviderResult<broadcast::Receiver<ProviderRuntimeEvent>> {
        Ok(self.event_tx.subscribe())
    }
}
