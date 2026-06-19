//! Cursor Agent Control Protocol (ACP)。
//!
//! ACP 是 Cursor 基于 JSON-RPC 的协议，用于与 `cursor` agent 通信。
//! 该协议在 stdio 上运行（每行一个 JSON 对象）
//! 并暴露一组方法，如 `agent/send`、`agent/stream`、
//! `agent/approval` 和 `agent/list_commands`。
//!
//! 本模块提供 [`CursorAdapter`] 使用的类型化客户端，用于
//! 发送请求和解码响应，并对用于增量输出的
//! `agent/stream` 通知通道提供一流支持。

use crate::errors::ProviderAdapterError;
use futures::Stream;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::pin::Pin;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout};
use tokio::sync::Mutex;
use tracing::{debug, warn};

/// 本客户端实现的 ACP 协议版本。
pub const ACP_PROTOCOL_VERSION: &str = "1.0";

/// ACP 客户端，包装运行中的 `cursor agent --stdio` 子进程。
///
/// 客户端拥有子进程，并在互斥锁后序列化每个请求，
/// 以避免 stdin 上的交错写入。响应匹配通过
/// `id` 完成——响应是下一个 `id` 与请求 id 匹配的消息。
pub struct AcpClient {
    inner: Arc<AcpClientInner>,
}

struct AcpClientInner {
    stdin: Mutex<ChildStdin>,
    reader: Mutex<BufReader<ChildStdout>>,
    next_id: Mutex<u64>,
    child: Mutex<Child>,
}

impl AcpClient {
    /// 获取刚用 stdio 管道生成的子进程的所有权
    /// 并将其包装为 ACP 客户端。
    pub fn new(mut child: Child) -> Self {
        let stdin = child
            .stdin
            .take()
            .expect("子进程 stdin 必须为管道以用于 ACP 客户端");
        let stdout = child
            .stdout
            .take()
            .expect("子进程 stdout 必须为管道以用于 ACP 客户端");
        Self {
            inner: Arc::new(AcpClientInner {
                stdin: Mutex::new(stdin),
                reader: Mutex::new(BufReader::new(stdout)),
                next_id: Mutex::new(0),
                child: Mutex::new(child),
            }),
        }
    }

    /// 发送 JSON-RPC 请求并读取匹配的响应。
    pub async fn request(&self, method: &str, params: Value) -> Result<Value, ProviderAdapterError> {
        let id = {
            let mut guard = self.inner.next_id.lock().await;
            *guard += 1;
            *guard
        };

        let payload = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });
        let line = serde_json::to_string(&payload)
            .map_err(|e| ProviderAdapterError::Internal(format!("序列化：{e}")))?;

        {
            let mut stdin = self.inner.stdin.lock().await;
            stdin
                .write_all(line.as_bytes())
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("stdin 写入：{e}")))?;
            stdin
                .write_all(b"\n")
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("stdin 换行：{e}")))?;
            stdin
                .flush()
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("stdin 刷新：{e}")))?;
        }

        // 排空通知并读取，直到找到匹配请求 id 的响应。
        let mut reader = self.inner.reader.lock().await;
        loop {
            let mut buf = String::new();
            let read = reader
                .read_line(&mut buf)
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("读取行：{e}")))?;
            if read == 0 {
                return Err(ProviderAdapterError::Internal(
                    "ACP 子进程在响应前关闭".to_string(),
                ));
            }

            let trimmed = buf.trim();
            if trimmed.is_empty() {
                continue;
            }
            let parsed: Value = match serde_json::from_str(trimmed) {
                Ok(v) => v,
                Err(e) => {
                    warn!(error = %e, "ACP 接收到非 JSON 行；忽略");
                    continue;
                }
            };

            // 服务器到客户端的通知（无 `id`）。
            if parsed.get("id").is_none() {
                debug!(payload = %trimmed, "ACP 通知");
                continue;
            }

            if let Some(resp_id) = parsed.get("id").and_then(|v| v.as_u64()) {
                if resp_id == id {
                    if let Some(err) = parsed.get("error") {
                        return Err(ProviderAdapterError::Internal(format!(
                            "ACP 错误：{}",
                            err
                        )));
                    }
                    return Ok(parsed.get("result").cloned().unwrap_or(Value::Null));
                }
                // 不是给我们的：另一个请求正在进行中。丢弃并
                // 继续排空。（这在序列化请求中极为罕见，
                // 但我们保持循环健壮。）
                warn!(id = resp_id, "ACP 接收到乱序响应");
                continue;
            }
        }
    }

    /// 发送流式请求并从 `agent/stream` 通知中收集增量文本
    /// 块生成流。
    pub async fn stream(
        &self,
        method: &str,
        params: Value,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String, ProviderAdapterError>> + Send>>, ProviderAdapterError>
    {
        // 预留下一个 id 并发送请求，然后返回一个
        // 拥有自己读取器克隆的流，这样我们就不会在
        // 整个流生命周期内锁定共享读取器。
        let id = {
            let mut guard = self.inner.next_id.lock().await;
            *guard += 1;
            *guard
        };
        let payload = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });
        let line = serde_json::to_string(&payload)
            .map_err(|e| ProviderAdapterError::Internal(format!("序列化：{e}")))?;
        {
            let mut stdin = self.inner.stdin.lock().await;
            stdin
                .write_all(line.as_bytes())
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("stdin 写入：{e}")))?;
            stdin
                .write_all(b"\n")
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("stdin 换行：{e}")))?;
            stdin
                .flush()
                .await
                .map_err(|e| ProviderAdapterError::Transport(format!("stdin 刷新：{e}")))?;
        }

        let inner_arc = self.inner.clone();
        // 创建从缓冲读取器读取行的流 —— 每次读都重新加锁，
        // 避免长时间持有 MutexGuard 导致锁被绑死。
        let stream = futures::stream::unfold((), move |()| {
            let inner_arc = inner_arc.clone();
            async move {
                let mut line = String::new();
                let mut reader = inner_arc.reader.lock().await;
                match reader.read_line(&mut line).await {
                    Ok(0) => None, // EOF
                    Ok(_) => {
                        let trimmed = line.trim();
                        if trimmed.is_empty() {
                            return Some((Ok(String::new()), ()));
                        }
                        let parsed: Value = match serde_json::from_str(trimmed) {
                            Ok(v) => v,
                            Err(_) => return Some((Ok(String::new()), ())),
                        };
                        // 从通知中提取文本
                        if let Some(method) = parsed.get("method").and_then(|m| m.as_str()) {
                            if method == "agent/stream" || method == "agent/notification" {
                                if let Some(params) = parsed.get("params") {
                                    if let Some(text) = extract_text(params) {
                                        return Some((Ok(text), ()));
                                    }
                                }
                            }
                        }
                        Some((Ok(String::new()), ()))
                    }
                    Err(e) => Some((
                        Err(ProviderAdapterError::Transport(format!("流读取：{e}"))),
                        (),
                    )),
                }
            }
        });

        Ok(Box::pin(stream))
    }

    /// 终止子进程。尽力而为：忽略错误。
    pub async fn shutdown(&self) {
        let mut child = self.inner.child.lock().await;
        let _ = child.start_kill();
    }
}

fn extract_text(params: &Value) -> Option<String> {
    if let Some(s) = params.as_str() {
        return Some(s.to_string());
    }
    if let Some(text) = params.get("text").and_then(|t| t.as_str()) {
        return Some(text.to_string());
    }
    if let Some(delta) = params.get("delta").and_then(|d| d.as_str()) {
        return Some(delta.to_string());
    }
    if let Some(content) = params.get("content").and_then(|c| c.as_str()) {
        return Some(content.to_string());
    }
    None
}

// ---------------------------------------------------------------------------
// 类型化载荷
// ---------------------------------------------------------------------------

/// `agent/initialize` 的请求载荷。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitializeParams {
    /// 客户端使用的协议版本。
    pub protocol_version: String,
    /// 客户端标识符（例如 "remi-code"）。
    pub client: String,
    /// 客户端版本。
    pub client_version: String,
}

impl InitializeParams {
    /// 为 Remi Code 构建 `InitializeParams`。
    pub fn remi_code(version: impl Into<String>) -> Self {
        Self {
            protocol_version: ACP_PROTOCOL_VERSION.to_string(),
            client: "remi-code".to_string(),
            client_version: version.into(),
        }
    }
}

/// `agent/send` 和 `agent/stream` 的请求载荷。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSendParams {
    /// 会话 ID（可选；如果缺失，Cursor 可能会创建一个）。
    pub session_id: Option<String>,
    /// 用户消息。
    pub message: String,
    /// 可选的模型覆盖。
    pub model: Option<String>,
    /// 可选的工作区路径列表，作为上下文包含。
    pub workspace_paths: Option<Vec<String>>,
}

impl AgentSendParams {
    /// 为纯文本消息构造新的 `AgentSendParams`。
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            session_id: None,
            message: message.into(),
            model: None,
            workspace_paths: None,
        }
    }

    /// 附加会话 ID。
    pub fn with_session(mut self, session_id: impl Into<String>) -> Self {
        self.session_id = Some(session_id.into());
        self
    }

    /// 附加模型覆盖。
    pub fn with_model(mut self, model: impl Into<String>) -> Self {
        self.model = Some(model.into());
        self
    }
}

/// `agent/send` 的响应载荷。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSendResult {
    /// agent 分配的会话 ID。
    pub session_id: String,
    /// 助手回复文本。
    pub response: String,
    /// agent 想要进行的工具调用（可选）。
    #[serde(default)]
    pub tool_calls: Vec<ToolCall>,
    /// 响应是否需要在继续前获得用户批准。
    #[serde(default)]
    pub approval_required: bool,
    /// Token 用量（如果报告）。
    #[serde(default)]
    pub usage: Option<TokenUsage>,
}

/// agent 请求的工具调用。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    /// 工具标识符。
    pub id: String,
    /// 工具名称（例如 "file_read"、"shell_run"）。
    pub name: String,
    /// 工具输入，作为 JSON 对象。
    pub input: Value,
}

/// Token 用量信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    /// 输入 / 提示 token。
    pub input_tokens: u32,
    /// 输出 / 完成 token。
    pub output_tokens: u32,
}

/// `agent/approval` 的请求载荷。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentApprovalParams {
    /// 会话 ID。
    pub session_id: String,
    /// 用户是否批准了请求。
    pub approved: bool,
    /// 给 agent 的可选反馈。
    #[serde(default)]
    pub feedback: Option<String>,
}

/// `agent/list_commands` 返回的 Provider 原生命令描述符。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpCommand {
    /// 命令名称（例如 "/explain"、"/test"）。
    pub name: String,
    /// 人类可读的描述。
    pub description: Option<String>,
    /// 显示给用户的参数提示。
    #[serde(default)]
    pub args_hint: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn initialize_params_default() {
        let params = InitializeParams::remi_code("0.1.0");
        assert_eq!(params.protocol_version, ACP_PROTOCOL_VERSION);
        assert_eq!(params.client, "remi-code");
        assert_eq!(params.client_version, "0.1.0");
    }

    #[test]
    fn agent_send_params_builder() {
        let params = AgentSendParams::new("hi")
            .with_session("sess-1")
            .with_model("claude-3-5-sonnet");
        assert_eq!(params.message, "hi");
        assert_eq!(params.session_id.as_deref(), Some("sess-1"));
        assert_eq!(params.model.as_deref(), Some("claude-3-5-sonnet"));
    }

    #[test]
    fn deserialize_agent_send_result() {
        let raw = json!({
            "session_id": "abc",
            "response": "Hello there",
            "tool_calls": [{
                "id": "t1",
                "name": "file_read",
                "input": {"path": "/tmp/x"}
            }],
            "approval_required": false,
            "usage": { "input_tokens": 10, "output_tokens": 20 }
        });
        let parsed: AgentSendResult = serde_json::from_value(raw).unwrap();
        assert_eq!(parsed.session_id, "abc");
        assert_eq!(parsed.response, "Hello there");
        assert_eq!(parsed.tool_calls.len(), 1);
        assert_eq!(parsed.tool_calls[0].name, "file_read");
        assert_eq!(parsed.usage.unwrap().output_tokens, 20);
    }
}
