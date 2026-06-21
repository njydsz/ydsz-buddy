//! Claude Provider 适配器实现
//!
//! 本模块实现了 Claude Provider 的适配器，通过 JSON-RPC over stdio 协议
//! 与 Claude Agent 进程进行交互。
//!
//! # 功能特性
//!
//! - **会话管理**：支持创建、停止、列出会话
//! - **消息发送**：支持发送 Turn、转向 Turn、中断 Turn
//! - **事件流**：支持订阅运行时事件（TurnDelta、TurnCompleted、Error）
//!
//! # 能力支持
//!
//! | 特性 | 支持状态 | 说明 |
//! |------|---------|------|
//! | 技能提及 | ✅ 支持 | 支持 @mention 方式调用技能 |
//! | 技能发现 | ✅ 支持 | 支持自动发现可用技能 |
//! | 运行时模型列表 | ✅ 支持 | 支持动态获取可用模型 |
//! | Turn 转向 | ✅ 支持 | 支持运行中重定向对话方向 |
//! | 会话内模型切换 | ✅ 支持 | 无需重启会话即可切换模型 |
//! | 原生命令发现 | ✅ 支持 | 支持识别原生斜杠命令 |
//!
//! # 协议说明
//!
//! Claude Agent 使用 JSON-RPC over stdio 协议进行通信：
//! - 通过标准输入（stdin）发送 JSON-RPC 请求
//! - 通过标准输出（stdout）接收 JSON-RPC 响应和通知
//! - 支持 `session.update`、`turn.complete`、`error` 三种通知类型
//!
//! # 模块依赖
//!
//! - 依赖 [`crate::jsonrpc_client::JsonRpcClient`] 进行底层通信
//! - 依赖 `remi_core::provider` 中的核心类型定义
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

use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use remi_core::provider::{
    ProviderKind, ProviderListAgentsResult, ProviderListCommandsInput, ProviderListCommandsResult,
    ProviderListModelsInput, ProviderListModelsResult, ProviderListSkillsInput,
    ProviderListSkillsResult, ProviderRuntimeEvent, ProviderSession,
    ProviderSessionStartInput, ProviderTurnStartResult, TurnInput,
};
use serde_json::json;
use tokio::sync::{broadcast, RwLock};
use tracing::{debug, error, info};

use crate::adapter::{ProviderAdapter, ProviderCapabilities, SessionModelSwitchMode};
use crate::error::{ProviderError, ProviderResult};
use crate::jsonrpc_client::JsonRpcClient;

/// Claude Provider 适配器
///
/// 通过 JSON-RPC over stdio 与 Claude Agent 进程通信。
/// 内部维护活跃会话列表和事件广播通道，支持完整的会话生命周期管理。
///
/// # 能力特性
///
/// Claude Agent 是功能最丰富的 Provider，支持：
/// - 会话内模型切换（InSession）
/// - 技能提及和技能发现
/// - 原生命令发现
/// - 运行时模型列表
/// - Turn 转向
///
/// # 线程安全
///
/// 会话列表使用 `Arc<RwLock<...>>` 管理并发访问，
/// 事件通道使用 `broadcast` 支持多订阅者。
pub struct ClaudeAdapter {
    /// 活跃会话列表
    ///
    /// 键为 thread_id，值为对应的 JSON-RPC 客户端实例。
    /// 每个会话对应一个独立的 Claude Agent 子进程。
    sessions: Arc<RwLock<HashMap<String, Arc<JsonRpcClient>>>>,
    /// 事件广播发送器
    ///
    /// 将 Claude Agent 推送的通知转换为 `ProviderRuntimeEvent` 后广播给订阅者。
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
    pub fn new() -> Self {
        let (event_tx, _) = broadcast::channel(10000);

        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            event_tx,
        }
    }

    /// 启动 Claude 进程并建立 JSON-RPC 连接
    ///
    /// 启动 Claude CLI 子进程，传入模型和工作目录参数，
    /// 并启动后台事件监听线程。
    ///
    /// # 参数
    ///
    /// - `model`: 要使用的 Claude 模型名称（如 'claude-sonnet-4-5'）
    /// - `cwd`: 子进程的工作目录
    ///
    /// # 返回值
    ///
    /// - `Ok(JsonRpcClient)`: 进程启动成功，返回 JSON-RPC 客户端
    /// - `Err(ProviderError)`: 进程启动失败
    async fn spawn_claude_process(
        &self,
        model: &str,
        cwd: &str,
    ) -> ProviderResult<JsonRpcClient> {
        info!("启动 Claude 进程: model={}, cwd={}", model, cwd);

        // Claude CLI 命令和参数
        let program = "claude";
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

    /// 监听 Claude Provider 事件
    ///
    /// 后台任务，持续从 JSON-RPC 客户端接收通知并转换为 `ProviderRuntimeEvent`。
    /// 支持的通知类型：
    /// - `session.update` → `TurnDelta`：Turn 增量更新事件
    /// - `turn.complete` → `TurnCompleted`：Turn 完成事件
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
                    debug!("收到 Claude 通知: {}", notification.method);

                    // 将通知转换为 ProviderRuntimeEvent
                    let event = match notification.method.as_str() {
                        "session.update" => {
                            if let Some(params) = notification.params {
                                ProviderRuntimeEvent::TurnDelta {
                                    session_id: params
                                        .get("sessionId")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string(),
                                    turn_id: params
                                        .get("turnId")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string(),
                                    delta: params
                                        .get("delta")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string(),
                                }
                            } else {
                                continue;
                            }
                        }
                        "turn.complete" => {
                            if let Some(params) = notification.params {
                                ProviderRuntimeEvent::TurnCompleted {
                                    session_id: params
                                        .get("sessionId")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string(),
                                    turn_id: params
                                        .get("turnId")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string(),
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
                    info!("Claude 事件流已关闭");
                    break;
                }
            }
        }
    }

    /// 启动一个轻量的临时 Claude 进程用于能力发现
    ///
    /// 不初始化会话，仅用于发送 `models.list` 等发现请求。
    /// 如果环境变量中配置了 ANTHROPIC_API_KEY，会传递给子进程。
    pub async fn spawn_discovery_client(&self) -> ProviderResult<JsonRpcClient> {
        let cwd = std::env::current_dir()
            .map_err(|e| ProviderError::AdapterError(format!("获取当前目录失败: {}", e)))?
            .to_string_lossy()
            .to_string();

        let mut env = HashMap::new();
        if let Ok(api_key) = std::env::var("ANTHROPIC_API_KEY") {
            env.insert("ANTHROPIC_API_KEY".to_string(), api_key);
        }

        JsonRpcClient::spawn("claude", &["--json"], &env, &cwd).await
    }
}

impl Default for ClaudeAdapter {
    fn default() -> Self {
        Self::new()
    }
}

/// 实现 ProviderAdapter trait
///
/// 为 ClaudeAdapter 提供完整的 Provider 适配器接口实现，
/// 包括会话管理、消息发送、事件流等核心功能。
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
    /// Claude Agent 是功能最丰富的 Provider，支持所有可选能力。
    ///
    /// # 返回值
    ///
    /// 返回全功能开启的 `ProviderCapabilities` 实例
    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            session_model_switch: SessionModelSwitchMode::InSession,
            supports_skill_mentions: true,
            supports_skill_discovery: true,
            supports_native_slash_command_discovery: true,
            supports_plugin_mentions: false,
            supports_plugin_discovery: false,
            supports_runtime_model_list: true,
            supports_turn_steering: true,
            supports_thread_compaction: true,
            supports_thread_import: true,
        }
    }

    /// 启动新的 Claude 会话
    ///
    /// 启动 Claude Agent 子进程，初始化会话，并将客户端保存到会话列表。
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
    ///
    /// # 流程
    ///
    /// 1. 检查 thread_id 是否已存在，防止重复创建
    /// 2. 启动 Claude Agent 子进程
    /// 3. 发送 `session.initialize` 请求初始化会话
    /// 4. 将客户端保存到会话列表
    async fn start_session(&self, input: ProviderSessionStartInput) -> ProviderResult<ProviderSession> {
        info!("ClaudeAdapter: 启动会话 thread_id={}", input.thread_id);

        // 检查会话是否已存在
        {
            let sessions = self.sessions.read().await;
            if sessions.contains_key(&input.thread_id) {
                return Err(ProviderError::SessionAlreadyExists(input.thread_id.clone()));
            }
        }

        // 启动 Claude 进程
        let cwd = std::env::current_dir()
            .map_err(|e| ProviderError::AdapterError(format!("获取当前目录失败: {}", e)))?
            .to_string_lossy()
            .to_string();

        let client = self.spawn_claude_process(&input.model, &cwd).await?;
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
            provider: ProviderKind::ClaudeAgent,
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
    /// 向 Claude Agent 发送用户消息，启动一个新的对话轮次。
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

    /// 转向 Turn（重定向运行中的对话）
    ///
    /// 在 Turn 执行过程中重定向对话方向。Claude Agent 支持此功能。
    ///
    /// # 参数
    ///
    /// - `input`: Turn 输入参数，包含新的对话方向信息
    ///
    /// # 返回值
    ///
    /// - `Ok(ProviderTurnStartResult)`: 转向成功
    /// - `Err(ProviderError::SessionNotFound)`: 会话不存在
    /// - `Err(ProviderError::AdapterError)`: 转向失败
    async fn steer_turn(&self, input: TurnInput) -> ProviderResult<ProviderTurnStartResult> {

        let sessions = self.sessions.read().await;
        let client = sessions
            .get(&input.thread_id)
            .ok_or_else(|| ProviderError::SessionNotFound(input.thread_id.clone()))?;

        let result = client
            .request(
                "turn.steer",
                Some(json!({
                    "threadId": input.thread_id,
                    "turnId": input.turn_id,
                    "message": input.message,
                })),
            )
            .await?;

        if let Some(error) = result.error {
            return Err(ProviderError::AdapterError(format!(
                "转向 Turn 失败: {}",
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
    /// 向 Claude Agent 发送中断请求，停止指定 Turn 的执行。
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
    /// 从会话列表中移除并关闭对应的 Claude Agent 子进程。
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
    /// 清空会话列表并关闭所有 Claude Agent 子进程。
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
    /// 返回当前管理的所有 Claude 会话信息。
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
                provider: ProviderKind::ClaudeAgent,
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

    /// 订阅 Claude Provider 事件流
    ///
    /// 创建新的事件接收器，用于接收 Claude Agent 推送的运行时事件。
    /// 多个订阅者可以同时接收相同的事件。
    ///
    /// # 返回值
    ///
    /// 返回 `broadcast::Receiver<ProviderRuntimeEvent>`，用于异步接收事件
    async fn stream_events(&self) -> ProviderResult<broadcast::Receiver<ProviderRuntimeEvent>> {
        Ok(self.event_tx.subscribe())
    }

    /// 列出可用模型
    ///
    /// 优先尝试通过临时 Claude 进程动态获取模型列表；
    /// 动态获取失败时回退到内置静态模型目录。
    async fn list_models(
        &self,
        _input: ProviderListModelsInput,
    ) -> ProviderResult<ProviderListModelsResult> {
        match self.spawn_discovery_client().await {
            Ok(client) => {
                let response = tokio::time::timeout(
                    std::time::Duration::from_secs(5),
                    client.request("models.list", None),
                )
                .await;
                let _ = client.close().await;

                match response {
                    Ok(Ok(resp)) => {
                        if resp.error.is_none() {
                            if let Some(result) = resp.result {
                                if let Ok(parsed) =
                                    serde_json::from_value::<ProviderListModelsResult>(result)
                                {
                                    return Ok(ProviderListModelsResult {
                                        models: parsed.models,
                                        source: Some("claude-runtime".to_string()),
                                        cached: Some(false),
                                    });
                                }
                            }
                        }
                    }
                    Ok(Err(e)) => debug!("动态获取 Claude 模型列表失败: {}", e),
                    Err(_) => debug!("动态获取 Claude 模型列表超时"),
                }
            }
            Err(e) => debug!("启动 Claude 发现进程失败: {}", e),
        }

        Ok(crate::catalog::default_models_for(self.provider_kind()))
    }

    /// 列出可用 Agent
    ///
    /// 优先尝试通过临时 Claude 进程动态获取 Agent 列表；
    /// 动态获取失败时回退到内置静态 Agent 目录。
    async fn list_agents(&self) -> ProviderResult<ProviderListAgentsResult> {
        match self.spawn_discovery_client().await {
            Ok(client) => {
                let response = tokio::time::timeout(
                    std::time::Duration::from_secs(5),
                    client.request("agents.list", None),
                )
                .await;
                let _ = client.close().await;

                match response {
                    Ok(Ok(resp)) => {
                        if resp.error.is_none() {
                            if let Some(result) = resp.result {
                                if let Ok(parsed) =
                                    serde_json::from_value::<ProviderListAgentsResult>(result)
                                {
                                    return Ok(ProviderListAgentsResult {
                                        agents: parsed.agents,
                                        source: Some("claude-runtime".to_string()),
                                        cached: Some(false),
                                    });
                                }
                            }
                        }
                    }
                    Ok(Err(e)) => debug!("动态获取 Claude Agent 列表失败: {}", e),
                    Err(_) => debug!("动态获取 Claude Agent 列表超时"),
                }
            }
            Err(e) => debug!("启动 Claude 发现进程失败: {}", e),
        }

        Ok(crate::catalog::default_agents_for(self.provider_kind()))
    }

    /// 列出可用技能
    ///
    /// 优先尝试通过临时 Claude 进程动态获取技能列表；
    /// 动态获取失败时返回空列表。
    async fn list_skills(
        &self,
        input: ProviderListSkillsInput,
    ) -> ProviderResult<ProviderListSkillsResult> {
        match self.spawn_discovery_client().await {
            Ok(client) => {
                let params = json!({
                    "cwd": input.cwd,
                    "threadId": input.thread_id,
                    "forceReload": input.force_reload,
                });
                let response = tokio::time::timeout(
                    std::time::Duration::from_secs(5),
                    client.request("skills.list", Some(params)),
                )
                .await;
                let _ = client.close().await;

                match response {
                    Ok(Ok(resp)) => {
                        if resp.error.is_none() {
                            if let Some(result) = resp.result {
                                if let Ok(parsed) =
                                    serde_json::from_value::<ProviderListSkillsResult>(result)
                                {
                                    return Ok(parsed);
                                }
                            }
                        }
                    }
                    Ok(Err(e)) => debug!("动态获取 Claude 技能列表失败: {}", e),
                    Err(_) => debug!("动态获取 Claude 技能列表超时"),
                }
            }
            Err(e) => debug!("启动 Claude 发现进程失败: {}", e),
        }

        Ok(ProviderListSkillsResult {
            skills: vec![],
            source: Some("static-catalog".to_string()),
            cached: Some(false),
        })
    }

    /// 列出可用原生斜杠命令
    ///
    /// 优先尝试通过临时 Claude 进程动态获取命令列表；
    /// 动态获取失败时返回空列表。
    async fn list_commands(
        &self,
        input: ProviderListCommandsInput,
    ) -> ProviderResult<ProviderListCommandsResult> {
        match self.spawn_discovery_client().await {
            Ok(client) => {
                let params = json!({
                    "cwd": input.cwd,
                    "threadId": input.thread_id,
                    "forceReload": input.force_reload,
                });
                let response = tokio::time::timeout(
                    std::time::Duration::from_secs(5),
                    client.request("commands.list", Some(params)),
                )
                .await;
                let _ = client.close().await;

                match response {
                    Ok(Ok(resp)) => {
                        if resp.error.is_none() {
                            if let Some(result) = resp.result {
                                if let Ok(parsed) =
                                    serde_json::from_value::<ProviderListCommandsResult>(result)
                                {
                                    return Ok(parsed);
                                }
                            }
                        }
                    }
                    Ok(Err(e)) => debug!("动态获取 Claude 命令列表失败: {}", e),
                    Err(_) => debug!("动态获取 Claude 命令列表超时"),
                }
            }
            Err(e) => debug!("启动 Claude 发现进程失败: {}", e),
        }

        Ok(ProviderListCommandsResult {
            commands: vec![],
            source: Some("static-catalog".to_string()),
            cached: Some(false),
        })
    }


    /// 压缩对话上下文
    async fn compact_thread(&self, thread_id: &str) -> ProviderResult<()> {
        info!("ClaudeAdapter: 压缩线程上下文 thread_id={}", thread_id);
        let sessions = self.sessions.read().await;
        if let Some(client) = sessions.get(thread_id) {
            let result = client.request("thread.compact", Some(json!({"threadId": thread_id}))).await?;
            if let Some(error) = result.error {
                return Err(ProviderError::AdapterError(format!("压缩线程失败: {}", error.message)));
            }
            Ok(())
        } else {
            Err(ProviderError::SessionNotFound(thread_id.to_string()))
        }
    }
}
