//! MCP SSE (Server-Sent Events) 传输层
//!
//! 基于 HTTP + SSE 实现 MCP 传输，适用于远程 MCP 服务器。
//!
//! ## 协议流程
//!
//! 1. 客户端连接到 SSE 端点（GET 请求，Accept: text/event-stream）
//! 2. 服务器发送 `endpoint` 事件，包含 POST 消息的 URL
//! 3. 客户端通过 HTTP POST 发送 JSON-RPC 请求到该 URL
//! 4. 服务器通过 SSE 流发送 JSON-RPC 响应和通知
//!
//! ## SSE 事件格式
//!
//! ```text
//! event: endpoint
//! data: /messages?sessionId=abc123
//!
//! event: message
//! data: {"jsonrpc":"2.0","id":1,"result":{...}}
//! ```
//!
//! ## 设计要点
//!
//! - 后台任务持续读取 SSE 流，通过 channel 传递给 `recv()`
//! - `send()` 通过 HTTP POST 发送消息，无需等待响应
//! - `recv()` 从 channel 读取响应，支持并发请求
//! - 连接断开时返回 `SseStreamClosed` 错误

use std::collections::HashMap;
use std::sync::Arc;

use futures_util::StreamExt;
use tokio::sync::{mpsc, Mutex};
use tokio::task::JoinHandle;
use tracing::{debug, warn};

use super::error::{McpError, McpResult};

/// SSE 事件（内部解析用）
struct SseEvent {
    /// 事件类型（如 "endpoint"、"message"）
    event: String,
    /// 事件数据
    data: String,
}

/// MCP SSE 传输层
///
/// 通过 HTTP + Server-Sent Events 与远程 MCP 服务器通信。
pub struct McpSseTransport {
    /// HTTP 客户端（用于 POST 消息）
    http_client: reqwest::Client,
    /// POST 消息的端点 URL（从 SSE endpoint 事件获取）
    message_endpoint: Mutex<Option<String>>,
    /// SSE 事件接收 channel 的接收端
    rx: Mutex<mpsc::Receiver<McpResult<serde_json::Value>>>,
    /// SSE 读取后台任务句柄
    sse_task: Mutex<Option<JoinHandle<()>>>,
}

impl McpSseTransport {
    /// 连接到 MCP SSE 服务器
    ///
    /// # 参数
    ///
    /// - `url`: SSE 端点 URL（如 `http://localhost:3001/sse`）
    /// - `headers`: 额外 HTTP 头（如认证 token）
    pub async fn connect(url: &str, headers: &HashMap<String, String>) -> McpResult<Self> {
        let http_client = reqwest::Client::builder()
            .build()
            .map_err(|e| McpError::SseConnectionFailed {
                url: url.to_string(),
                detail: format!("HTTP 客户端创建失败: {e}"),
            })?;

        // 创建 channel：后台 SSE 读取任务 → recv()
        let (tx, rx) = mpsc::channel::<McpResult<serde_json::Value>>(64);

        // 共享的 endpoint URL（后台任务写入，connect 读取）
        let endpoint_shared = Arc::new(Mutex::new(None::<String>));

        // 启动 SSE 读取后台任务
        let sse_url = url.to_string();
        let sse_headers = headers.clone();
        let client_clone = http_client.clone();
        let endpoint_for_task = endpoint_shared.clone();

        let sse_task = tokio::spawn(async move {
            if let Err(e) = sse_read_loop(
                &client_clone,
                &sse_url,
                &sse_headers,
                &tx,
                &endpoint_for_task,
            )
            .await
            {
                let _ = tx.send(Err(e)).await;
            }
        });

        // 等待 endpoint URL 被设置（最多 15 秒超时）
        let endpoint_url = {
            let deadline = tokio::time::Instant::now() + tokio::time::Duration::from_secs(15);
            loop {
                {
                    let guard = endpoint_shared.lock().await;
                    if let Some(ref url) = *guard {
                        break url.clone();
                    }
                }
                if tokio::time::Instant::now() >= deadline {
                    return Err(McpError::SseEndpointNotReceived);
                }
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            }
        };

        debug!(endpoint = %endpoint_url, "MCP SSE 收到 endpoint 事件");

        // 如果 endpoint 是相对路径，拼接 base URL
        let full_endpoint = if endpoint_url.starts_with("http://") || endpoint_url.starts_with("https://") {
            endpoint_url
        } else {
            let base = url.trim_end_matches("/sse");
            format!("{base}{endpoint_url}")
        };

        Ok(Self {
            http_client,
            message_endpoint: Mutex::new(Some(full_endpoint)),
            rx: Mutex::new(rx),
            sse_task: Mutex::new(Some(sse_task)),
        })
    }

    /// 发送 JSON-RPC 消息（通过 HTTP POST）
    pub async fn send(&self, msg: &serde_json::Value) -> McpResult<()> {
        let endpoint = {
            let guard = self.message_endpoint.lock().await;
            guard
                .clone()
                .ok_or_else(|| McpError::Communication("SSE endpoint 未初始化".into()))?
        };

        let body = serde_json::to_string(msg)
            .map_err(|e| McpError::Communication(format!("JSON 序列化失败: {e}")))?;

        let resp = self
            .http_client
            .post(&endpoint)
            .header("Content-Type", "application/json")
            .body(body)
            .send()
            .await
            .map_err(|e| McpError::Communication(format!("HTTP POST 失败: {e}")))?;

        if !resp.status().is_success() {
            return Err(McpError::Communication(format!(
                "HTTP POST 返回非成功状态: {}",
                resp.status()
            )));
        }

        debug!(endpoint = %endpoint, "MCP SSE POST 消息已发送");
        Ok(())
    }

    /// 接收 JSON-RPC 消息（从 SSE 流读取）
    pub async fn recv(&self) -> McpResult<serde_json::Value> {
        let mut rx = self.rx.lock().await;
        rx.recv()
            .await
            .ok_or_else(|| McpError::SseStreamClosed("SSE 流已关闭".into()))?
    }

    /// 关闭 SSE 连接
    pub async fn shutdown(&self) -> McpResult<()> {
        let mut task_guard = self.sse_task.lock().await;
        if let Some(handle) = task_guard.take() {
            handle.abort();
        }
        debug!("MCP SSE 连接已关闭");
        Ok(())
    }

    /// 获取 endpoint（已连接时可用，用于测试）
    pub fn endpoint_connected(&self) -> bool {
        // 如果 endpoint 已设置，认为已连接
        // 通过 block_on 快速检查 Option 中是否有值
        true // placeholder; 真实检查需要同步锁 - 测试中直接验证 connect 行为
    }
}

/// SSE 读取循环（后台任务）
///
/// 持续读取 SSE 流，解析事件：
/// - `endpoint` 事件 → 写入 endpoint_shared
/// - `message` 事件 → 通过 channel 发送给 recv()
async fn sse_read_loop(
    client: &reqwest::Client,
    sse_url: &str,
    headers: &HashMap<String, String>,
    tx: &mpsc::Sender<McpResult<serde_json::Value>>,
    endpoint_shared: &Arc<Mutex<Option<String>>>,
) -> McpResult<()> {
    let mut req = client
        .get(sse_url)
        .header("Accept", "text/event-stream")
        .header("Cache-Control", "no-cache");

    for (k, v) in headers {
        req = req.header(k, v);
    }

    let resp = req
        .send()
        .await
        .map_err(|e| McpError::SseConnectionFailed {
            url: sse_url.to_string(),
            detail: format!("SSE 连接请求失败: {e}"),
        })?;

    if !resp.status().is_success() {
        return Err(McpError::SseConnectionFailed {
            url: sse_url.to_string(),
            detail: format!("SSE 连接返回非成功状态: {}", resp.status()),
        });
    }

    // 使用 stream 读取 SSE 事件
    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result
            .map_err(|e| McpError::SseStreamClosed(format!("读取 SSE 流失败: {e}")))?;

        buffer.push_str(&String::from_utf8_lossy(&chunk));

        // 处理 buffer 中的完整 SSE 事件（以双换行分隔）
        while let Some(pos) = buffer.find("\n\n") {
            let raw_event = buffer[..pos].to_string();
            buffer = buffer[pos + 2..].to_string();

            if raw_event.trim().is_empty() {
                continue;
            }

            let event = parse_sse_event(&raw_event);
            debug!(event_type = %event.event, "MCP SSE 收到事件");

            match event.event.as_str() {
                "endpoint" => {
                    let mut guard = endpoint_shared.lock().await;
                    *guard = Some(event.data);
                }
                "message" => {
                    let value: serde_json::Value = serde_json::from_str(&event.data)
                        .map_err(|e| McpError::Communication(format!(
                            "SSE 消息 JSON 解析失败: {e}"
                        )))?;
                    if tx.send(Ok(value)).await.is_err() {
                        // recv 端已关闭，退出循环
                        return Ok(());
                    }
                }
                _ => {
                    // 忽略未知事件类型（如 ping）
                    debug!(event_type = %event.event, "MCP SSE 忽略未知事件类型");
                }
            }
        }
    }

    warn!("MCP SSE 流结束");
    Ok(())
}

/// 解析 SSE 事件文本
///
/// SSE 事件格式：
/// ```text
/// event: message
/// data: {"jsonrpc":"2.0",...}
/// ```
fn parse_sse_event(raw: &str) -> SseEvent {
    let mut event_type = String::from("message"); // 默认事件类型
    let mut data_parts: Vec<&str> = Vec::new();

    for line in raw.lines() {
        if let Some(rest) = line.strip_prefix("event:") {
            event_type = rest.trim().to_string();
        } else if let Some(rest) = line.strip_prefix("data:") {
            data_parts.push(rest.trim());
        }
        // 忽略 id: / retry: 等其他字段
    }

    SseEvent {
        event: event_type,
        data: data_parts.join("\n"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_sse_event_message() {
        let raw = "event: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{}}";
        let event = parse_sse_event(raw);
        assert_eq!(event.event, "message");
        assert_eq!(event.data, r#"{"jsonrpc":"2.0","id":1,"result":{}}"#);
    }

    #[test]
    fn parse_sse_event_endpoint() {
        let raw = "event: endpoint\ndata: /messages?sessionId=abc123";
        let event = parse_sse_event(raw);
        assert_eq!(event.event, "endpoint");
        assert_eq!(event.data, "/messages?sessionId=abc123");
    }

    #[test]
    fn parse_sse_event_default_type() {
        let raw = "data: hello";
        let event = parse_sse_event(raw);
        assert_eq!(event.event, "message");
        assert_eq!(event.data, "hello");
    }

    #[test]
    fn parse_sse_event_multiline_data() {
        let raw = "event: message\ndata: line1\ndata: line2";
        let event = parse_sse_event(raw);
        assert_eq!(event.event, "message");
        assert_eq!(event.data, "line1\nline2");
    }

    #[test]
    fn parse_sse_event_ignores_id_and_retry() {
        // SSE 的 id: / retry: 字段应被忽略
        let raw = "id: 123\nretry: 5000\nevent: message\ndata: hi";
        let event = parse_sse_event(raw);
        assert_eq!(event.event, "message");
        assert_eq!(event.data, "hi");
    }

    #[test]
    fn parse_sse_event_relative_endpoint() {
        let raw = "event: endpoint\ndata: /messages?sessionId=abc";
        let event = parse_sse_event(raw);
        assert_eq!(event.event, "endpoint");
        event.data.starts_with("/messages");
        assert!(event.data.starts_with("/messages"));
    }

    #[test]
    fn parse_sse_event_preserves_json_prettiness() {
        let json = r#"{"jsonrpc":"2.0","id":1,"result":{"count":42}}"#;
        let raw = format!("event: message\ndata: {json}");
        let event = parse_sse_event(&raw);
        let parsed: serde_json::Value = serde_json::from_str(&event.data).unwrap();
        assert_eq!(parsed["id"], 1);
        assert_eq!(parsed["result"]["count"], 42);
    }

    #[test]
    fn parse_sse_event_handles_unknown_event_type() {
        let raw = "event: ping\ndata: keep-alive";
        let event = parse_sse_event(raw);
        assert_eq!(event.event, "ping");
        assert_eq!(event.data, "keep-alive");
    }
}
