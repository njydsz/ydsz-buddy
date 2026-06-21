//! # 浏览器使用管道服务器
//!
//! 本模块将内嵌浏览器暴露为 Codex 兼容的 browser-use 命名管道，
//! 允许外部 Codex CLI 通过命名管道与 Remi Claw 内嵌浏览器通信。
//!
//! 迁移自 Peak Code `apps/desktop/src/browserUsePipeServer.ts`

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Mutex;
use serde::{Deserialize, Serialize};
use tracing::{info, warn, error};

/// 浏览器使用管道帧头字节数
const BROWSER_USE_HEADER_BYTES: usize = 4;
/// 浏览器使用管道最大消息字节数
const BROWSER_USE_MAX_MESSAGE_BYTES: usize = 8 * 1024 * 1024;
/// 浏览器面板就绪超时（毫秒）
const BROWSER_USE_PANEL_READY_TIMEOUT_MS: u64 = 2_000;
/// 浏览器面板就绪轮询间隔（毫秒）
const BROWSER_USE_PANEL_READY_POLL_MS: u64 = 50;
/// 初始 URL
const BROWSER_USE_INITIAL_URL: &str = "about:blank";

/// 浏览器使用 JSON-RPC 请求
#[derive(Debug, Deserialize)]
struct BrowserUseRpcRequest {
    id: Option<serde_json::Value>,
    method: Option<String>,
    params: Option<serde_json::Value>,
}

/// 浏览器使用 JSON-RPC 响应
#[derive(Debug, Serialize)]
struct BrowserUseRpcResponse {
    jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<BrowserUseRpcError>,
}

/// 浏览器使用 JSON-RPC 错误
#[derive(Debug, Serialize)]
struct BrowserUseRpcError {
    code: i32,
    message: String,
}

/// 浏览器使用通知
#[derive(Debug, Serialize)]
struct BrowserUseRpcNotification {
    jsonrpc: String,
    method: String,
    params: serde_json::Value,
}

/// 追踪的标签页
#[derive(Debug, Clone)]
struct TrackedTab {
    id: usize,
    tab_id: String,
}

/// 浏览器标签页信息
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TabInfo {
    id: usize,
    title: String,
    active: bool,
    url: String,
}

/// 浏览器使用连接状态
struct ConnectionState {
    buffer: Vec<u8>,
    tracked_tabs: Vec<TrackedTab>,
    selected_tab_id: Option<usize>,
    next_tab_id: usize,
}

impl ConnectionState {
    fn new() -> Self {
        Self {
            buffer: Vec::new(),
            tracked_tabs: Vec::new(),
            selected_tab_id: None,
            next_tab_id: 1,
        }
    }
}

/// 浏览器使用管道服务器
pub struct BrowserUsePipeServer {
    /// 监听地址
    addr: SocketAddr,
    /// 连接状态
    state: Arc<Mutex<ConnectionState>>,
    /// 活跃的 CDP 事件监听器
    cdp_listeners: Arc<Mutex<HashMap<String, Box<dyn Fn(serde_json::Value) + Send + Sync>>>>,
    /// 请求打开面板的回调
    request_open_panel: Option<Arc<dyn Fn() + Send + Sync>>,
}

impl BrowserUsePipeServer {
    /// 创建新的浏览器使用管道服务器
    pub fn new(addr: SocketAddr) -> Self {
        Self {
            addr,
            state: Arc::new(Mutex::new(ConnectionState::new())),
            cdp_listeners: Arc::new(Mutex::new(HashMap::new())),
            request_open_panel: None,
        }
    }

    /// 设置请求打开面板的回调
    pub fn with_request_open_panel<F>(mut self, callback: F) -> Self
    where
        F: Fn() + Send + Sync + 'static,
    {
        self.request_open_panel = Some(Arc::new(callback));
        self
    }

    /// 启动管道服务器，返回实际绑定的地址
    pub async fn start(&self) -> Result<SocketAddr, String> {
        let listener = TcpListener::bind(self.addr)
            .await
            .map_err(|e| format!("无法绑定浏览器管道地址 {}: {}", self.addr, e))?;

        let bound_addr = listener
            .local_addr()
            .map_err(|e| format!("无法获取浏览器管道实际地址: {}", e))?;

        info!("浏览器使用管道服务器已启动: {}", bound_addr);

        let state = self.state.clone();
        let cdp_listeners = self.cdp_listeners.clone();
        let request_open_panel = self.request_open_panel.clone();

        tokio::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((stream, peer_addr)) => {
                        info!("浏览器管道新连接: {}", peer_addr);
                        let state = state.clone();
                        let cdp_listeners = cdp_listeners.clone();
                        let request_open_panel = request_open_panel.clone();
                        tokio::spawn(handle_connection(stream, state, cdp_listeners, request_open_panel));
                    }
                    Err(e) => {
                        error!("浏览器管道接受连接失败: {}", e);
                    }
                }
            }
        });

        Ok(bound_addr)
    }

    /// 向所有连接的客户端广播 CDP 事件
    pub async fn broadcast_cdp_event(&self, method: &str, params: serde_json::Value) {
        let listeners = self.cdp_listeners.lock().await;
        for (_id, listener) in listeners.iter() {
            listener(serde_json::json!({
                "method": method,
                "params": params,
            }));
        }
    }
}

/// 编码浏览器使用帧
fn encode_browser_use_frame(message: &serde_json::Value) -> Vec<u8> {
    let payload = serde_json::to_vec(message).unwrap_or_default();
    let len = payload.len() as u32;
    let mut frame = Vec::with_capacity(BROWSER_USE_HEADER_BYTES + payload.len());
    frame.extend_from_slice(&len.to_le_bytes());
    frame.extend_from_slice(&payload);
    frame
}

/// 解码浏览器使用帧
fn decode_browser_use_frames(buffer: &[u8]) -> Option<(Vec<String>, Vec<u8>)> {
    let mut offset = 0;
    let mut messages = Vec::new();

    while buffer.len() - offset >= BROWSER_USE_HEADER_BYTES {
        let message_len = u32::from_le_bytes([
            buffer[offset],
            buffer[offset + 1],
            buffer[offset + 2],
            buffer[offset + 3],
        ]) as usize;

        if message_len > BROWSER_USE_MAX_MESSAGE_BYTES {
            return None;
        }

        let frame_len = BROWSER_USE_HEADER_BYTES + message_len;
        if buffer.len() - offset < frame_len {
            break;
        }

        let payload = &buffer[offset + BROWSER_USE_HEADER_BYTES..offset + frame_len];
        messages.push(String::from_utf8_lossy(payload).to_string());
        offset += frame_len;
    }

    Some((messages, buffer[offset..].to_vec()))
}

/// 处理单个连接
async fn handle_connection(
    mut stream: TcpStream,
    state: Arc<Mutex<ConnectionState>>,
    cdp_listeners: Arc<Mutex<HashMap<String, Box<dyn Fn(serde_json::Value) + Send + Sync>>>>,
    _request_open_panel: Option<Arc<dyn Fn() + Send + Sync>>,
) {
    let mut buffer = Vec::new();
    let mut read_buf = vec![0u8; 4096];

    loop {
        match stream.read(&mut read_buf).await {
            Ok(0) => {
                // 连接关闭
                break;
            }
            Ok(n) => {
                buffer.extend_from_slice(&read_buf[..n]);

                while let Some((messages, remaining)) = decode_browser_use_frames(&buffer) {
                    buffer = remaining;

                    for message in messages {
                        if let Ok(request) = serde_json::from_str::<BrowserUseRpcRequest>(&message) {
                            if let Some(id) = request.id.clone() {
                                if let Some(method) = request.method.as_deref() {
                                    let result = handle_request(
                                        method,
                                        request.params.as_ref(),
                                        &state,
                                    )
                                    .await;

                                    let response = match result {
                                        Ok(value) => BrowserUseRpcResponse {
                                            jsonrpc: "2.0".to_string(),
                                            id: Some(id),
                                            result: Some(value),
                                            error: None,
                                        },
                                        Err(err_msg) => BrowserUseRpcResponse {
                                            jsonrpc: "2.0".to_string(),
                                            id: Some(id),
                                            result: None,
                                            error: Some(BrowserUseRpcError {
                                                code: 1,
                                                message: err_msg,
                                            }),
                                        },
                                    };

                                    let frame = encode_browser_use_frame(
                                        &serde_json::to_value(&response).unwrap(),
                                    );
                                    if stream.write_all(&frame).await.is_err() {
                                        return;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Err(_) => {
                break;
            }
        }
    }
}

/// 处理浏览器使用请求
async fn handle_request(
    method: &str,
    params: Option<&serde_json::Value>,
    state: &Arc<Mutex<ConnectionState>>,
) -> Result<serde_json::Value, String> {
    match method {
        "ping" => Ok(serde_json::Value::String("pong".to_string())),

        "getInfo" => {
            let session_id = params
                .and_then(|p| p.get("session_id"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let mut info = serde_json::json!({
                "name": "Remi Claw In-app Browser",
                "version": "0.2.0",
                "type": "iab",
            });

            if let Some(sid) = session_id {
                info["metadata"] = serde_json::json!({
                    "codexSessionId": sid,
                });
            }

            Ok(info)
        }

        "getTabs" => {
            let state = state.lock().await;
            let tabs: Vec<TabInfo> = state
                .tracked_tabs
                .iter()
                .map(|tab| {
                    let active = state.selected_tab_id == Some(tab.id);
                    TabInfo {
                        id: tab.id,
                        title: format!("Tab {}", tab.id),
                        active,
                        url: BROWSER_USE_INITIAL_URL.to_string(),
                    }
                })
                .collect();
            Ok(serde_json::to_value(tabs).unwrap())
        }

        "createTab" => {
            let mut state = state.lock().await;
            let tab_id = format!("tab-{}", state.next_tab_id);
            let tracked = TrackedTab {
                id: state.next_tab_id,
                tab_id,
            };
            state.next_tab_id += 1;
            state.tracked_tabs.push(tracked.clone());
            state.selected_tab_id = Some(tracked.id);

            Ok(serde_json::to_value(TabInfo {
                id: tracked.id,
                title: format!("Tab {}", tracked.id),
                active: true,
                url: BROWSER_USE_INITIAL_URL.to_string(),
            })
            .unwrap())
        }

        "nameSession" => {
            // 验证 session_id 和 name 参数存在
            let session_id = params.and_then(|p| p.get("session_id")).and_then(|v| v.as_str());
            let name = params.and_then(|p| p.get("name")).and_then(|v| v.as_str());

            if session_id.is_none() {
                return Err("Missing required browser session_id".to_string());
            }
            if name.is_none() {
                return Err("nameSession requires a name".to_string());
            }

            Ok(serde_json::json!({}))
        }

        "attach" => {
            let mut state = state.lock().await;
            let tab_id = params
                .and_then(|p| p.get("tabId"))
                .and_then(|v| v.as_u64())
                .map(|id| id as usize);

            if let Some(id) = tab_id {
                state.selected_tab_id = Some(id);
            }

            Ok(serde_json::json!({}))
        }

        "detach" => Ok(serde_json::json!({})),

        "executeCdp" => {
            let method = params
                .and_then(|p| p.get("method"))
                .and_then(|v| v.as_str())
                .ok_or("executeCdp requires a method")?;

            let command_params = params
                .and_then(|p| p.get("commandParams"))
                .cloned();

            info!("执行 CDP 命令: {} params: {:?}", method, command_params);

            // 返回占位结果，实际 CDP 命令由前端浏览器面板处理
            Ok(serde_json::json!({
                "result": {}
            }))
        }

        _ => Err(format!("No handler registered for method: {}", method)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_decode_frame() {
        let message = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "result": "pong"
        });

        let frame = encode_browser_use_frame(&message);
        let (messages, remaining) = decode_browser_use_frames(&frame).unwrap();

        assert_eq!(messages.len(), 1);
        assert!(remaining.is_empty());
        assert!(messages[0].contains("pong"));
    }

    #[test]
    fn test_decode_multiple_frames() {
        let msg1 = serde_json::json!({"jsonrpc": "2.0", "id": 1, "result": "first"});
        let msg2 = serde_json::json!({"jsonrpc": "2.0", "id": 2, "result": "second"});

        let mut combined = encode_browser_use_frame(&msg1);
        combined.extend_from_slice(&encode_browser_use_frame(&msg2));

        let (messages, remaining) = decode_browser_use_frames(&combined).unwrap();
        assert_eq!(messages.len(), 2);
        assert!(remaining.is_empty());
        assert!(messages[0].contains("first"));
        assert!(messages[1].contains("second"));
    }

    #[test]
    fn test_decode_oversized_message() {
        // 创建一个超过最大大小的消息
        let huge_len = (BROWSER_USE_MAX_MESSAGE_BYTES + 1) as u32;
        let mut frame = Vec::new();
        frame.extend_from_slice(&huge_len.to_le_bytes());
        frame.extend(vec![0u8; 10]);

        assert!(decode_browser_use_frames(&frame).is_none());
    }
}
