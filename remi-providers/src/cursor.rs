//! Cursor Provider 适配器。
//!
//! Cursor 通过 Cursor IDE / CLI 暴露其 agent。本适配器
//! 发现 `cursor` 可执行文件并通过 Cursor Agent Control Protocol (ACP) 与之通信
//! — 参见 [`crate::acp`] 了解 JSON-RPC 客户端和类型化载荷。

use crate::acp::{
    AcpClient, AcpCommand, AgentSendParams, AgentSendResult, InitializeParams,
};
use crate::errors::ProviderAdapterError;
use crate::traits::ProviderAdapter;
use async_trait::async_trait;
use dashmap::DashMap;
use futures::{Stream, StreamExt};
use remi_contracts::{
    ModelId, ProviderHealth, ProviderInfo, ProviderListCommandsInput,
    ProviderListCommandsOutput, ProviderName,
};
use remi_core::Result;
use serde_json::{json, Value};
use std::pin::Pin;
use std::sync::Arc;
use tokio::process::Command;
use tracing::{info, warn};
use uuid::Uuid;

/// Cursor 会话状态。
#[allow(dead_code)]
#[derive(Clone)]
struct CursorSession {
    /// 逻辑会话 ID（Remi 侧）。
    id: String,
    /// 底层 ACP 会话 ID（Cursor 侧）。
    acp_session_id: String,
    /// 启动时选择的模型。
    model: String,
    /// 共享 ACP 客户端（子进程跨轮次共享）。
    client: Arc<AcpClient>,
    /// 用于诊断的单调递增请求 ID 计数器。
    request_id: u64,
}

/// Cursor Provider 适配器。
pub struct CursorAdapter {
    /// `cursor` 可执行文件路径（如果在 PATH 中发现）。
    executable: Option<String>,
    /// 活动会话。
    sessions: Arc<DashMap<String, CursorSession>>,
    /// Remi Code 版本（在 ACP `agent/initialize` 握手中发送）。
    client_version: String,
}

impl CursorAdapter {
    /// 创建新的 Cursor 适配器，探测 `cursor` 可执行文件。
    pub fn new() -> Self {
        Self::with_version(env!("CARGO_PKG_VERSION"))
    }

    /// 使用显式客户端版本字符串创建 Cursor 适配器。
    pub fn with_version(version: impl Into<String>) -> Self {
        Self {
            executable: find_cursor_executable(),
            sessions: Arc::new(DashMap::new()),
            client_version: version.into(),
        }
    }

    /// 若 Cursor 可执行文件可用则返回 true。
    fn is_configured(&self) -> bool {
        self.executable.is_some()
    }

    /// 生成 `cursor agent --stdio` 子进程并将其包装为 ACP 客户端。
    fn spawn_acp_client(&self) -> Result<Arc<AcpClient>> {
        let executable = self
            .executable
            .as_ref()
            .ok_or_else(|| ProviderAdapterError::NotConfigured(ProviderName::Cursor))?;
        let child = Command::new(executable)
            .args(["agent", "--stdio"])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| {
                ProviderAdapterError::Transport(format!("启动 cursor 失败：{e}"))
            })?;
        Ok(Arc::new(AcpClient::new(child)))
    }
}

impl Default for CursorAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ProviderAdapter for CursorAdapter {
    fn info(&self) -> ProviderInfo {
        ProviderInfo {
            name: ProviderName::Cursor,
            display_name: "Cursor".to_string(),
            models: vec![
                ModelId::new("cursor-default"),
                ModelId::new("cursor-fast"),
            ],
            available: self.is_configured(),
        }
    }

    async fn health(&self) -> Result<ProviderHealth> {
        if !self.is_configured() {
            return Ok(ProviderHealth {
                provider: ProviderName::Cursor,
                status: ProviderHealthStatus::Unhealthy,
                last_checked: chrono::Utc::now().to_rfc3339(),
                error: Some("cursor 可执行文件未在 PATH 中找到".to_string()),
            });
        }

        // 轻量级健康检查探针：生成 agent，运行 `agent/initialize`，然后
        // 终止进程。这很廉价，可以确认可执行文件可启动且
        // 能讲预期的协议。
        match self.spawn_acp_client() {
            Ok(client) => {
                let probe = client
                    .request(
                        "agent/initialize",
                        serde_json::to_value(InitializeParams::remi_code(&self.client_version))
                            .unwrap_or(Value::Null),
                    )
                    .await;
                let _ = client.shutdown().await;
                match probe {
                    Ok(_) => Ok(ProviderHealth {
                        provider: ProviderName::Cursor,
                        status: ProviderHealthStatus::Healthy,
                        last_checked: chrono::Utc::now().to_rfc3339(),
                        error: None,
                    }),
                    Err(e) => Ok(ProviderHealth {
                        provider: ProviderName::Cursor,
                        status: ProviderHealthStatus::Degraded,
                        last_checked: chrono::Utc::now().to_rfc3339(),
                        error: Some(format!("ACP 握手失败：{e}")),
                    }),
                }
            }
            Err(e) => Ok(ProviderHealth {
                provider: ProviderName::Cursor,
                status: ProviderHealthStatus::Unhealthy,
                last_checked: chrono::Utc::now().to_rfc3339(),
                error: Some(format!("生成失败：{e}")),
            }),
        }
    }

    async fn start_session(&self, model: &ModelId) -> Result<String> {
        if !self.is_configured() {
            return Err(ProviderAdapterError::NotConfigured(ProviderName::Cursor).into());
        }

        let client = self.spawn_acp_client()?;

        // ACP 握手。我们将结果视为不透明的（我们不依赖
        // 其形状），只是验证 agent 是否响应。
        client
            .request(
                "agent/initialize",
                serde_json::to_value(InitializeParams::remi_code(&self.client_version))
                    .unwrap_or(Value::Null),
            )
            .await
            .map_err(|e| ProviderAdapterError::Internal(format!("ACP 初始化：{e}")))?;

        let session_id = Uuid::new_v4().to_string();
        let session = CursorSession {
            id: session_id.clone(),
            acp_session_id: String::new(),
            model: model.0.clone(),
            client,
            request_id: 0,
        };
        self.sessions.insert(session_id.clone(), session);
        info!(session_id = %session_id, model = %model, "已启动 Cursor 会话");
        Ok(session_id)
    }

    async fn send_message(&self, session_id: &str, message: &str) -> Result<Value> {
        if !self.is_configured() {
            return Err(ProviderAdapterError::NotConfigured(ProviderName::Cursor).into());
        }
        let session = self
            .sessions
            .get(session_id)
            .ok_or_else(|| ProviderAdapterError::SessionNotFound(session_id.to_string()))?
            .clone();

        let params = AgentSendParams::new(message)
            .with_session(&session.acp_session_id)
            .with_model(&session.model);
        let value = serde_json::to_value(&params)
            .map_err(|e| ProviderAdapterError::Internal(format!("序列化参数：{e}")))?;

        let result = session
            .client
            .request("agent/send", value)
            .await
            .map_err(|e| ProviderAdapterError::Internal(format!("ACP agent/send：{e}")))?;

        // 尝试解码类型化结果，以便我们可以暴露 ACP 会话
        // ID 和工具调用。如果 agent 返回不同的形状，我们
        // 回退到原始值。
        match serde_json::from_value::<AgentSendResult>(result.clone()) {
            Ok(parsed) => {
                if let Some(mut s) = self.sessions.get_mut(session_id) {
                    if s.acp_session_id.is_empty() && !parsed.session_id.is_empty() {
                        s.acp_session_id = parsed.session_id.clone();
                    }
                    s.request_id += 1;
                }
                Ok(json!({
                    "response": parsed.response,
                    "session_id": parsed.session_id,
                    "tool_calls": parsed.tool_calls,
                    "approval_required": parsed.approval_required,
                    "usage": parsed.usage,
                }))
            }
            Err(_) => Ok(result),
        }
    }

    async fn stream_response(
        &self,
        session_id: &str,
        message: &str,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String>> + Send>>> {
        if !self.is_configured() {
            return Err(ProviderAdapterError::NotConfigured(ProviderName::Cursor).into());
        }
        let session = self
            .sessions
            .get(session_id)
            .ok_or_else(|| ProviderAdapterError::SessionNotFound(session_id.to_string()))?
            .clone();

        let params = AgentSendParams::new(message)
            .with_session(&session.acp_session_id)
            .with_model(&session.model);
        let value = serde_json::to_value(&params)
            .map_err(|e| ProviderAdapterError::Internal(format!("序列化参数：{e}")))?;

        let stream = session
            .client
            .stream("agent/stream", value)
            .await
            .map_err(|e| ProviderAdapterError::Internal(format!("ACP agent/stream：{e}")))?;

        let mapped = stream.map(|res| res.map_err(Into::into));
        Ok(Box::pin(mapped))
    }

    async fn close_session(&self, session_id: &str) -> Result<()> {
        if let Some((_, session)) = self.sessions.remove(session_id) {
            session.client.shutdown().await;
            info!(session_id = %session_id, "已关闭 Cursor 会话");
        } else {
            warn!(session_id = %session_id, "关闭时未找到 Cursor 会话");
        }
        Ok(())
    }

    async fn list_commands(
        &self,
        _input: ProviderListCommandsInput,
    ) -> Result<ProviderListCommandsOutput> {
        if !self.is_configured() {
            return Ok(ProviderListCommandsOutput {
                commands: Vec::new(),
                source: Some(ProviderName::Cursor.to_string()),
                cached: Some(false),
            });
        }
        // 通过生成短生命周期的 ACP 客户端来枚举原生
        // 命令。子进程在退出时被终止。
        let client = self.spawn_acp_client()?;
        let result = list_cursor_commands(&client).await;
        let _ = client.shutdown().await;
        match result {
            Ok(commands) => Ok(ProviderListCommandsOutput {
                commands: commands
                    .into_iter()
                    .map(|c| remi_contracts::ProviderNativeCommandDescriptor {
                        name: c.name,
                        description: c.description,
                    })
                    .collect(),
                source: Some(ProviderName::Cursor.to_string()),
                cached: Some(false),
            }),
            Err(_) => Ok(ProviderListCommandsOutput {
                commands: Vec::new(),
                source: Some(ProviderName::Cursor.to_string()),
                cached: Some(false),
            }),
        }
    }
}

/// 列出运行中的 Cursor agent 暴露的 Provider 原生斜杠命令。
///
/// 这是 ACP 特定的辅助函数（它发送 `agent/list_commands`）。当
/// 适配器未配置时返回空列表。
pub async fn list_cursor_commands(client: &AcpClient) -> Result<Vec<AcpCommand>> {
    let raw = client
        .request("agent/list_commands", Value::Null)
        .await
        .map_err(|e| ProviderAdapterError::Internal(format!("ACP list_commands：{e}")))?;
    let commands: Vec<AcpCommand> = serde_json::from_value(raw).unwrap_or_default();
    Ok(commands)
}

/// 在 PATH 中搜索 `cursor` 可执行文件。
fn find_cursor_executable() -> Option<String> {
    let candidates = ["cursor", "cursor.exe"];
    let path_var = std::env::var_os("PATH")?;

    for candidate in &candidates {
        for dir in std::env::split_paths(&path_var) {
            let full_path = dir.join(candidate);
            if full_path.is_file() {
                return Some(full_path.to_string_lossy().to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_cursor_info() {
        let adapter = CursorAdapter::new();
        let info = adapter.info();
        assert_eq!(info.name, ProviderName::Cursor);
        assert_eq!(info.display_name, "Cursor");
    }

    #[tokio::test]
    async fn test_cursor_session_lifecycle() {
        let adapter = CursorAdapter::new();
        let model = ModelId::new("cursor-default");
        if !adapter.is_configured() {
            // `cursor` 可执行文件在测试
            // 环境中不可用：验证 `start_session` 返回预期的
            // 错误且 `info.available` 为 false。
            assert!(!adapter.info().available);
            let err = adapter.start_session(&model).await.unwrap_err();
            let msg = err.to_string();
            assert!(
                msg.contains("not configured") || msg.contains("NotConfigured"),
                "unexpected error: {msg}"
            );
        } else {
            let session_id = adapter.start_session(&model).await.unwrap();
            assert!(!session_id.is_empty());
            adapter.close_session(&session_id).await.unwrap();
            assert!(adapter.sessions.get(&session_id).is_none());
        }
    }
}
