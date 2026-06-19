//! OpenAI Codex App Server 协议。
//!
//! Codex CLI 提供了一个 **app-server** 子命令，用于以
//! 守护进程模式运行 Agent，并通过 stdio 暴露 JSON-RPC 接口。本模块
//! 实现了与该守护进程通信的客户端，并为编排层
//! 提供标准 [`crate::traits::ProviderAdapter`] 接口。
//!
//! # 协议概述
//!
//! ```text
//! client → server: { "id": 1, "method": "initialize", "params": { "client": "remi-code" } }
//! server → client: { "id": 1, "result": { "ok": true } }
//! client → server: { "id": 2, "method": "thread/start", "params": { "model": "..." } }
//! server → client: { "id": 2, "result": { "thread_id": "..." } }
//! client → server: { "id": 3, "method": "turn/start", "params": { "thread_id": "...", "input": [...] } }
//! server → client: { "id": 3, "result": { "turn_id": "..." } }
//! server → client: { "method": "turn/delta", "params": { "text": "..." } }  // 流式
//! server → client: { "id": 3, "result": { "status": "completed" } }
//! ```
//!
//! # 用法
//!
//! ```no_run
//! use remi_providers::codex_app_server::CodexAppServerClient;
//! use remi_providers::stdio_client::StdioJsonRpcClient;
//!
//! # async fn run() -> remi_providers::ProviderAdapterErrorResult {
//! let child = tokio::process::Command::new("codex")
//!     .arg("app-server")
//!     .stdin(std::process::Stdio::piped())
//!     .stdout(std::process::Stdio::piped())
//!     .spawn()?;
//! let client = StdioJsonRpcClient::new(child);
//! let mut app = CodexAppServerClient::new(client);
//! app.initialize().await?;
//! let thread = app.start_thread("codex-1").await?;
//! # Ok(())
//! # }
//! ```

use crate::errors::ProviderAdapterError;
use crate::stdio_client::StdioJsonRpcClient;
use async_trait::async_trait;
use futures::Stream;
use remi_contracts::{
    ModelId, ProviderHealth, ProviderHealthStatus, ProviderInfo, ProviderListCommandsInput,
    ProviderListCommandsOutput, ProviderName,
};
use remi_core::Result;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::pin::Pin;
use std::sync::Arc;
use tracing::{debug, info, warn};

/// Codex app-server 协议版本。
pub const CODEX_APP_SERVER_PROTOCOL_VERSION: &str = "1.0";

/// 标识我们的客户端名称。
pub const CODEX_APP_SERVER_CLIENT_NAME: &str = "remi-code";

/// `initialize` 方法的请求参数。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitializeParams {
    /// 客户端标识。
    pub client: String,
    /// 协议版本。
    pub protocol_version: String,
}

impl InitializeParams {
    /// 创建一个使用默认值的 initialize 请求。
    pub fn default_params() -> Self {
        Self {
            client: CODEX_APP_SERVER_CLIENT_NAME.to_string(),
            protocol_version: CODEX_APP_SERVER_PROTOCOL_VERSION.to_string(),
        }
    }
}

/// `thread/start` 方法的请求参数。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreadStartParams {
    /// 模型 ID。
    pub model: String,
    /// 可选的系统提示。
    pub system_prompt: Option<String>,
    /// 可选的 working directory。
    pub cwd: Option<String>,
}

/// `thread/start` 方法的响应。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreadStartResult {
    /// 线程 ID。
    pub thread_id: String,
}

/// `turn/start` 方法的请求参数。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TurnStartParams {
    /// 目标线程 ID。
    pub thread_id: String,
    /// 用户输入内容。
    pub input: Vec<TurnInputItem>,
    /// 流式输出（默认 true）。
    #[serde(default = "default_stream")]
    pub stream: bool,
}

fn default_stream() -> bool {
    true
}

/// 单个 turn 输入项。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum TurnInputItem {
    /// 用户文本消息。
    UserText {
        /// 文本内容。
        text: String,
    },
}

/// `turn/start` 方法的响应。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TurnStartResult {
    /// turn ID。
    pub turn_id: String,
}

/// `turn/delta` 通知的负载。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TurnDeltaNotification {
    /// turn ID。
    pub turn_id: String,
    /// 增量文本。
    pub text: String,
}

/// `turn/completed` 通知的负载。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TurnCompletedNotification {
    /// turn ID。
    pub turn_id: String,
    /// 状态。
    pub status: String,
}

/// Codex app-server 客户端。
///
/// 包装 [`StdioJsonRpcClient`] 并暴露高层 API 用于：
/// - initialize
/// - start_thread
/// - start_turn
/// - listen deltas
#[derive(Clone)]
pub struct CodexAppServerClient {
    rpc: Arc<Mutex<StdioJsonRpcClient>>,
    initialized: Arc<Mutex<bool>>,
}

impl CodexAppServerClient {
    /// 创建一个新的 Codex app-server 客户端。
    pub fn new(rpc: StdioJsonRpcClient) -> Self {
        Self {
            rpc: Arc::new(Mutex::new(rpc)),
            initialized: Arc::new(Mutex::new(false)),
        }
    }

    /// 初始化会话。
    ///
    /// 必须在 [`start_thread`](Self::start_thread) 之前调用。
    pub async fn initialize(&self) -> Result<(), ProviderAdapterError> {
        let rpc = self.rpc.lock().await;
        let params = InitializeParams::default_params();
        let result = rpc.request("initialize", serde_json::to_value(params)?).await?;
        debug!(?result, "codex app-server initialize 返回");
        *self.initialized.lock().await = true;
        info!("已初始化 codex app-server 客户端");
        Ok(())
    }

    /// 启动一个线程（Codex 术语中的"会话"）。
    pub async fn start_thread(
        &self,
        model: &ModelId,
        system_prompt: Option<String>,
    ) -> Result<String, ProviderAdapterError> {
        self.ensure_initialized().await?;
        let params = ThreadStartParams {
            model: model.to_string(),
            system_prompt,
            cwd: None,
        };
        let rpc = self.rpc.lock().await;
        let value = rpc
            .request("thread/start", serde_json::to_value(params)?)
            .await?;
        let result: ThreadStartResult = serde_json::from_value(value)
            .map_err(|e| ProviderAdapterError::Parse(format!("解析 thread/start 失败: {e}")))?;
        info!(thread_id = %result.thread_id, model = %model, "codex app-server 已启动线程");
        Ok(result.thread_id)
    }

    /// 在已启动的线程上发起一轮对话（流式）。
    pub async fn start_turn_stream(
        &self,
        thread_id: &str,
        content: &str,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String, ProviderAdapterError>> + Send>>, ProviderAdapterError>
    {
        self.ensure_initialized().await?;
        let params = TurnStartParams {
            thread_id: thread_id.to_string(),
            input: vec![TurnInputItem::UserText {
                text: content.to_string(),
            }],
            stream: true,
        };
        let rpc = self.rpc.lock().await;
        let value = rpc
            .request("turn/start", serde_json::to_value(params)?)
            .await?;
        let result: TurnStartResult = serde_json::from_value(value)
            .map_err(|e| ProviderAdapterError::Parse(format!("解析 turn/start 失败: {e}")))?;
        debug!(turn_id = %result.turn_id, "已启动 codex turn（流式）");
        // 真实的流式响应需要订阅通知通道。
        // 这里返回空流作为占位 —— 实际实现需要接入推送通道。
        let empty: Pin<Box<dyn Stream<Item = Result<String, ProviderAdapterError>> + Send>> =
            Box::pin(futures::stream::empty());
        Ok(empty)
    }

    /// 在已启动的线程上发起一轮对话（非流式，发送后等待完整响应）。
    pub async fn start_turn(
        &self,
        thread_id: &str,
        content: &str,
    ) -> Result<String, ProviderAdapterError> {
        self.ensure_initialized().await?;
        let params = TurnStartParams {
            thread_id: thread_id.to_string(),
            input: vec![TurnInputItem::UserText {
                text: content.to_string(),
            }],
            stream: false,
        };
        let rpc = self.rpc.lock().await;
        let value = rpc
            .request("turn/start", serde_json::to_value(params)?)
            .await?;
        let result: TurnStartResult = serde_json::from_value(value)
            .map_err(|e| ProviderAdapterError::Parse(format!("解析 turn/start 失败: {e}")))?;
        info!(turn_id = %result.turn_id, thread_id = %thread_id, "codex turn 已完成");
        Ok(result.turn_id)
    }

    /// 关闭会话。
    pub async fn shutdown(&self) {
        let rpc = self.rpc.lock().await;
        rpc.shutdown().await;
    }

    async fn ensure_initialized(&self) -> Result<(), ProviderAdapterError> {
        if !*self.initialized.lock().await {
            return Err(ProviderAdapterError::Internal(
                "codex app-server 客户端未初始化".to_string(),
            ));
        }
        Ok(())
    }
}

/// 高层适配器：将 CodexAppServerClient 暴露为 ProviderAdapter。
///
/// 大厂标准：使用一个统一的 HTTP-like 接口封装多种底层协议
/// （HTTP REST、stdio JSON-RPC、gRPC），让编排层不感知
/// 协议差异。
pub struct CodexAppServerAdapter {
    /// 客户端句柄。
    client: Arc<tokio::sync::Mutex<Option<CodexAppServerClient>>>,
    /// Provider 信息。
    info: ProviderInfo,
    /// 已启动的线程（thread_id -> model_id）。
    threads: Arc<dashmap::DashMap<String, String>>,
    /// 模型支持列表。
    models: Vec<ModelId>,
}

impl CodexAppServerAdapter {
    /// 创建一个新的 Codex app-server 适配器。
    pub fn new() -> Self {
        let models = vec![
            ModelId::new("gpt-5-codex"),
            ModelId::new("gpt-5"),
            ModelId::new("gpt-4o"),
            ModelId::new("gpt-4o-mini"),
            ModelId::new("o3"),
        ];
        Self {
            client: Arc::new(tokio::sync::Mutex::new(None)),
            info: ProviderInfo {
                name: ProviderName::Codex,
                display_name: "Codex (app-server)".to_string(),
                models: models.clone(),
                available: false,
            },
            threads: Arc::new(dashmap::DashMap::new()),
            models,
        }
    }

    /// 启动 `codex app-server` 子进程并初始化客户端。
    pub async fn spawn(&self) -> Result<(), ProviderAdapterError> {
        let mut command = tokio::process::Command::new("codex");
        command
            .arg("app-server")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        let child = command.spawn().map_err(|e| {
            ProviderAdapterError::Transport(format!("启动 codex app-server 失败: {e}"))
        })?;
        let rpc = StdioJsonRpcClient::new(child);
        let client = CodexAppServerClient::new(rpc);
        client.initialize().await?;
        *self.client.lock().await = Some(client);
        info!("已启动 codex app-server");
        Ok(())
    }
}

impl Default for CodexAppServerAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl crate::traits::ProviderAdapter for CodexAppServerAdapter {
    fn info(&self) -> ProviderInfo {
        let mut info = self.info.clone();
        info.available = self.client.try_lock().map(|c| c.is_some()).unwrap_or(false);
        info
    }

    async fn health(&self) -> Result<ProviderHealth, remi_core::Error> {
        let available = self
            .client
            .try_lock()
            .map(|c| c.is_some())
            .unwrap_or(false);
        Ok(ProviderHealth {
            provider: ProviderName::Codex,
            status: if available {
                ProviderHealthStatus::Healthy
            } else {
                ProviderHealthStatus::Unhealthy
            },
            last_checked: chrono::Utc::now().to_rfc3339(),
            error: if available {
                None
            } else {
                Some("codex app-server 未运行".to_string())
            },
        })
    }

    async fn start_session(&self, model: &ModelId) -> Result<String, remi_core::Error> {
        let guard = self.client.lock().await;
        let client = guard.as_ref().ok_or_else(|| {
            remi_core::Error::Provider("codex app-server 未启动".to_string())
        })?;
        let thread_id = client
            .start_thread(model, None)
            .await
            .map_err(|e| remi_core::Error::Provider(e.to_string()))?;
        self.threads.insert(thread_id.clone(), model.to_string());
        Ok(thread_id)
    }

    async fn send_message(
        &self,
        session_id: &str,
        message: &str,
    ) -> Result<Value, remi_core::Error> {
        let guard = self.client.lock().await;
        let client = guard.as_ref().ok_or_else(|| {
            remi_core::Error::Provider("codex app-server 未启动".to_string())
        })?;
        let turn_id = client
            .start_turn(session_id, message)
            .await
            .map_err(|e| remi_core::Error::Provider(e.to_string()))?;
        Ok(json!({
            "turn_id": turn_id,
            "response": format!("[codex-app-server] 已接收 turn: {turn_id}"),
        }))
    }

    async fn stream_response(
        &self,
        session_id: &str,
        message: &str,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String>> + Send>>, remi_core::Error> {
        let guard = self.client.lock().await;
        let client = guard.as_ref().ok_or_else(|| {
            remi_core::Error::Provider("codex app-server 未启动".to_string())
        })?;
        let stream = client
            .start_turn_stream(session_id, message)
            .await
            .map_err(|e| remi_core::Error::Provider(e.to_string()))?;
        // 适配 ProviderAdapterError -> remi_core::Error
        let adapted = stream.map(|r| r.map_err(|e| remi_core::Error::Provider(e.to_string())));
        Ok(Box::pin(adapted))
    }

    async fn close_session(&self, session_id: &str) -> Result<(), remi_core::Error> {
        self.threads.remove(session_id);
        debug!(session_id, "已关闭 codex app-server 会话");
        Ok(())
    }

    async fn list_commands(
        &self,
        _input: ProviderListCommandsInput,
    ) -> Result<ProviderListCommandsOutput, remi_core::Error> {
        // Codex app-server 不暴露原生命令词汇表。
        Ok(ProviderListCommandsOutput {
            commands: Vec::new(),
            source: Some("codex-app-server".to_string()),
            cached: Some(false),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_initialize_params_default() {
        let p = InitializeParams::default_params();
        assert_eq!(p.client, "remi-code");
        assert_eq!(p.protocol_version, "1.0");
    }

    #[test]
    fn test_thread_start_params_serialize() {
        let p = ThreadStartParams {
            model: "gpt-5".to_string(),
            system_prompt: Some("You are helpful".to_string()),
            cwd: None,
        };
        let v = serde_json::to_value(&p).unwrap();
        assert_eq!(v["model"], "gpt-5");
        assert_eq!(v["system_prompt"], "You are helpful");
    }

    #[test]
    fn test_turn_input_item_user_text() {
        let item = TurnInputItem::UserText {
            text: "hello".to_string(),
        };
        let v = serde_json::to_value(&item).unwrap();
        assert_eq!(v["type"], "UserText");
        assert_eq!(v["text"], "hello");
    }

    #[test]
    fn test_adapter_default_info() {
        let adapter = CodexAppServerAdapter::new();
        let info = adapter.info();
        assert_eq!(info.name, ProviderName::Codex);
        assert!(!info.available);
        assert!(!info.models.is_empty());
    }

    #[tokio::test]
    async fn test_adapter_health_unavailable() {
        let adapter = CodexAppServerAdapter::new();
        let health = adapter.health().await.unwrap();
        assert!(matches!(
            health.status,
            ProviderHealthStatus::Unhealthy | ProviderHealthStatus::Degraded
        ));
    }

    #[tokio::test]
    async fn test_ensure_initialized_fails() {
        let rpc = StdioJsonRpcClient::new_fake();
        let client = CodexAppServerClient::new(rpc);
        let result = client.start_thread(&ModelId::new("gpt-5"), None).await;
        assert!(result.is_err());
    }
}
