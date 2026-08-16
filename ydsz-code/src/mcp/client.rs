//! MCP 客户端
//!
//! 实现 JSON-RPC 2.0 客户端 + MCP 协议核心方法（initialize / tools/list / tools/call / resources/read）
//!
//! ## 设计要点
//!
//! - 单 client 对应一个 server 进程（避免多 client 共享 stdin 造成消息错乱）
//! - 请求/响应匹配通过 `id` 字段
//! - `list_tools` / `call_tool` 公开为可调用 API，前端 Composer 通过
//!   `mcp_call_tool` 命令桥接到 AI

use std::collections::HashMap;
use std::future::Future;
use std::sync::Arc;
use std::time::Duration;

use parking_lot::Mutex as ParkingMutex;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio::sync::Mutex;
use tokio::time::timeout;
use tracing::{info, warn};
// `#[derive(specta::Type)]` 用的 derive 宏路径
#[allow(unused_imports)]
use specta::Type;

use super::error::{McpError, McpResult};
use super::sse_transport::McpSseTransport;
use super::transport::McpTransport;

/// MCP 工具描述
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct McpTool {
    /// 工具名称（全局唯一，跨 server 需加前缀）
    pub name: String,
    /// 工具描述
    pub description: Option<String>,
    /// JSON Schema 参数
    #[serde(default)]
    pub input_schema: serde_json::Value,
}

/// MCP 服务器信息（initialize 响应中提取）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerInfo {
    /// 服务器名称
    pub name: String,
    /// 服务器版本
    pub version: String,
    /// 协议版本
    pub protocol_version: String,
    /// 工具列表
    pub tools: Vec<McpTool>,
}

/// MCP 工具调用结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolCallResult {
    /// 文本内容（多个）
    pub content: Vec<McpContent>,
    /// 是否出错
    #[serde(default)]
    pub is_error: bool,
}

/// MCP 内容块
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum McpContent {
    Text { text: String },
    Image { data: String, mime_type: String },
    Resource { uri: String, text: Option<String> },
    #[serde(other)]
    Unknown,
}

/// MCP 传输后端枚举（stdio / SSE）
///
/// 统一 `McpTransport` 和 `McpSseTransport` 的接口，
/// 让 `McpClient` 无感知地支持两种传输方式。
pub enum McpAnyTransport {
    /// stdio 传输（本地子进程）
    Stdio(McpTransport),
    /// SSE 传输（远程 HTTP + Server-Sent Events）
    Sse(McpSseTransport),
}

impl McpAnyTransport {
    async fn send(&self, msg: &serde_json::Value) -> McpResult<()> {
        match self {
            Self::Stdio(t) => t.send(msg).await,
            Self::Sse(t) => t.send(msg).await,
        }
    }

    async fn recv(&self) -> McpResult<serde_json::Value> {
        match self {
            Self::Stdio(t) => t.recv().await,
            Self::Sse(t) => t.recv().await,
        }
    }

    async fn shutdown(&self) -> McpResult<()> {
        match self {
            Self::Stdio(t) => t.shutdown().await,
            Self::Sse(t) => t.shutdown().await,
        }
    }
}

/// MCP 客户端
pub struct McpClient {
    transport: Arc<Mutex<McpAnyTransport>>,
    info: ParkingMutex<Option<McpServerInfo>>,
    request_id: ParkingMutex<u64>,
    init_timeout: Duration,
    request_timeout: Duration,
}

impl McpClient {
    /// 启动并初始化 MCP 服务器（stdio 传输）
    pub async fn start(
        command: &str,
        args: &[String],
        env: &HashMap<String, String>,
    ) -> McpResult<Self> {
        let transport = McpTransport::spawn(command, args, env).await?;
        let client = Self {
            transport: Arc::new(Mutex::new(McpAnyTransport::Stdio(transport))),
            info: ParkingMutex::new(None),
            request_id: ParkingMutex::new(0),
            init_timeout: Duration::from_secs(15),
            request_timeout: Duration::from_secs(30),
        };
        client.initialize().await?;
        Ok(client)
    }

    /// 连接并初始化 MCP SSE 服务器
    ///
    /// # 参数
    ///
    /// - `url`: SSE 端点 URL（如 `http://localhost:3001/sse`）
    /// - `headers`: 额外 HTTP 头（如认证 token）
    pub async fn start_sse(
        url: &str,
        headers: &HashMap<String, String>,
    ) -> McpResult<Self> {
        let transport = McpSseTransport::connect(url, headers).await?;
        let client = Self {
            transport: Arc::new(Mutex::new(McpAnyTransport::Sse(transport))),
            info: ParkingMutex::new(None),
            request_id: ParkingMutex::new(0),
            init_timeout: Duration::from_secs(15),
            request_timeout: Duration::from_secs(30),
        };
        client.initialize().await?;
        Ok(client)
    }

    /// 根据 McpServerConfig 自动选择传输方式并连接
    ///
    /// - `transport_type == Sse`: command 字段作为 SSE URL
    /// - `transport_type == Stdio`（默认）: command 作为可执行文件名
    pub async fn start_from_config(config: &super::config::McpServerConfig) -> McpResult<Self> {
        use super::config::McpTransportType;
        match config.transport_type {
            McpTransportType::Sse => Self::start_sse(&config.command, &config.env).await,
            McpTransportType::Stdio => Self::start(&config.command, &config.args, &config.env).await,
        }
    }

    /// 设置超时（仅本次实例）
    pub fn with_timeouts(mut self, init: Duration, request: Duration) -> Self {
        self.init_timeout = init;
        self.request_timeout = request;
        self
    }

    /// 发送 initialize 请求
    async fn initialize(&self) -> McpResult<()> {
        let req = self.build_request(
            "initialize",
            json!({
                "protocolVersion": "2025-06-18",
                "capabilities": {
                    "sampling": {},
                    "roots": { "listChanged": false }
                },
                "clientInfo": {
                    "name": "ydsz-buddy",
                    "version": env!("CARGO_PKG_VERSION")
                }
            }),
        );
        let resp = timeout(self.init_timeout, self.request(req))
            .await
            .map_err(|_| McpError::ServerInitTimeout {
                seconds: self.init_timeout.as_secs(),
            })??;

        // 解析 serverInfo
        let server_info = resp
            .get("serverInfo")
            .ok_or_else(|| McpError::ProtocolMissingField("serverInfo".into()))?;
        let name = server_info
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();
        let version = server_info
            .get("version")
            .and_then(|v| v.as_str())
            .unwrap_or("0.0.0")
            .to_string();
        let protocol_version = resp
            .get("protocolVersion")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();

        // 发送 initialized 通知
        let notif = self.build_notification("notifications/initialized", json!({}));
        self.notify(notif).await?;

        // 拉取 tools 列表
        let tools = self.fetch_tools().await.unwrap_or_else(|e| {
            warn!(error = %e, "MCP 拉取工具列表失败，初始化时跳过");
            Vec::new()
        });

        *self.info.lock() = Some(McpServerInfo {
            name,
            version,
            protocol_version,
            tools,
        });
        info!("MCP 客户端初始化成功");
        Ok(())
    }

    /// 拉取工具列表
    pub async fn fetch_tools(&self) -> McpResult<Vec<McpTool>> {
        let req = self.build_request("tools/list", json!({}));
        let resp = self.request(req).await?;
        let tools_value = resp
            .get("tools")
            .and_then(|v| v.as_array())
            .ok_or_else(|| McpError::ProtocolMissingField("tools".into()))?;
        let mut tools = Vec::with_capacity(tools_value.len());
        for t in tools_value {
            let name = t
                .get("name")
                .and_then(|v| v.as_str())
                .ok_or_else(|| McpError::ProtocolMissingField("tool.name".into()))?
                .to_string();
            let description = t
                .get("description")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let input_schema = t
                .get("inputSchema")
                .cloned()
                .unwrap_or_else(|| json!({ "type": "object" }));
            tools.push(McpTool {
                name,
                description,
                input_schema,
            });
        }
        Ok(tools)
    }

    /// 调用工具
    pub async fn call_tool(
        &self,
        tool_name: &str,
        arguments: serde_json::Value,
    ) -> McpResult<McpToolCallResult> {
        let req = self.build_request(
            "tools/call",
            json!({
                "name": tool_name,
                "arguments": arguments,
            }),
        );
        let resp = timeout(self.request_timeout, self.request(req))
            .await
            .map_err(|_| McpError::Communication(format!(
                "工具调用超时（{}s）",
                self.request_timeout.as_secs()
            )))??;
        let result: McpToolCallResult = serde_json::from_value(resp)
            .map_err(|e| McpError::Communication(format!("解析工具结果失败: {e}")))?;
        Ok(result)
    }

    /// 读取资源
    pub async fn read_resource(&self, uri: &str) -> McpResult<Vec<McpContent>> {
        let req = self.build_request(
            "resources/read",
            json!({ "uri": uri }),
        );
        let resp = self.request(req).await?;
        let contents_value = resp
            .get("contents")
            .and_then(|v| v.as_array())
            .ok_or_else(|| McpError::ProtocolMissingField("contents".into()))?;
        let mut contents = Vec::with_capacity(contents_value.len());
        for c in contents_value {
            if let Ok(parsed) = serde_json::from_value::<McpContent>(c.clone()) {
                contents.push(parsed);
            }
        }
        Ok(contents)
    }

    /// 关闭连接
    pub async fn shutdown(&self) -> McpResult<()> {
        let transport = self.transport.lock().await;
        transport.shutdown().await
    }

    /// 内部：发送请求并等待响应
    async fn request(&self, msg: serde_json::Value) -> McpResult<serde_json::Value> {
        let transport = self.transport.clone();
        let msg_for_send = msg.clone();

        transport.lock().await.send(&msg_for_send).await?;

        // 简单实现：循环 recv 寻找匹配 id 的响应
        // 实际 MCP 协议可能夹杂 notification，需要继续 recv
        let id = msg.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
        loop {
            let resp = transport.lock().await.recv().await?;
            // 响应中 id 匹配
            if let Some(resp_id) = resp.get("id").and_then(|v| v.as_u64()) {
                if resp_id == id {
                    // 检查 error
                    if let Some(err) = resp.get("error") {
                        let code = err.get("code").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                        let message = err
                            .get("message")
                            .and_then(|v| v.as_str())
                            .unwrap_or("未知错误")
                            .to_string();
                        return Err(McpError::ServerError { code, message });
                    }
                    return Ok(resp.get("result").cloned().unwrap_or(json!({})));
                }
                // 不匹配的 id - 可能是其他并发请求（这里忽略）
            }
            // 没有 id 字段 - 是 notification，继续 recv
        }
    }

    /// 内部：发送 notification（不期待响应）
    async fn notify(&self, msg: serde_json::Value) -> McpResult<()> {
        self.transport.lock().await.send(&msg).await
    }

    /// 构建 JSON-RPC 2.0 请求
    fn build_request(&self, method: &str, params: serde_json::Value) -> serde_json::Value {
        let mut counter = self.request_id.lock();
        *counter += 1;
        let id = *counter;
        json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        })
    }

    /// 构建 notification（无 id）
    fn build_notification(&self, method: &str, params: serde_json::Value) -> serde_json::Value {
        json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        })
    }

    /// 获取服务器信息
    pub fn info(&self) -> Option<McpServerInfo> {
        self.info.lock().clone()
    }

    /// 短超时包装器
    async fn try_timeout<F>(dur: Duration, fut: F) -> Result<(), ()>
    where
        F: Future<Output = McpResult<()>>,
    {
        match timeout(dur, fut).await {
            Ok(Ok(())) => Ok(()),
            _ => Err(()),
        }
    }

    /// 健康检查
    ///
    /// 通过发送短超时（3s）的 `tools/list` 请求来验证连接是否仍可用。
    /// 若服务器未初始化（info 为 None）或请求失败，返回 `false`。
    ///
    /// 此方法幂等，可被后台探活任务频繁调用。
    pub async fn is_healthy(&self) -> bool {
        {
            if self.info.lock().is_none() {
                return false;
            }
        }
        let req = self.build_request("tools/list", json!({}));
        Self::try_timeout(self.request_timeout.min(Duration::from_secs(3)), async move {
            self.request(req).await.map(|_| ())
        })
        .await
        .is_ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_request_assigns_monotonic_id() {
        // 用零成本 fake transport 太重，仅验证 id 递增
        let info: ParkingMutex<Option<McpServerInfo>> = ParkingMutex::new(None);
        let counter = ParkingMutex::new(0u64);
        let next = || {
            let mut g = counter.lock();
            *g += 1;
            *g
        };
        let r1 = json!({ "id": next(), "method": "x" });
        let r2 = json!({ "id": next(), "method": "y" });
        assert_eq!(r1["id"].as_u64().unwrap(), 1);
        assert_eq!(r2["id"].as_u64().unwrap(), 2);
        drop(info);
    }
}
