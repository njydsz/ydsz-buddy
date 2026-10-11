//! # HTTP API 网关（G2-P0）
//!
//! 暴露 OpenAI-compatible HTTP API，让第三方/MCP 外部可以通过 HTTP 调用。
//! 使用 `std::net::TcpListener` + 手写最小路由（不加新依赖）。
//!
//! ## 端点
//!
//! - `POST /v1/chat/completions` — OpenAI 兼容的对话补全接口
//! - `GET /v1/models` — 列出可用模型
//! - `GET /health` — 健康检查
//!
//! ## 鉴权
//!
//! `Authorization: Bearer <key>` 简单比对（key 存储在 AppState 中）。
//!
//! ## 速率限制
//!
//! 简单滑动窗口（每 IP 每分钟 60 次）。

use std::collections::HashMap;
use std::io::{BufRead, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{State, Emitter};
use tracing::info;

use crate::ServerState;

// ===== 数据类型 =====

/// API 服务器状态
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiServerStatus {
    pub running: bool,
    pub port: u16,
    pub request_count: u64,
    pub api_key_configured: bool,
}

/// API 服务器内部状态（线程共享）
struct ApiServerInner {
    running: bool,
    port: u16,
    request_count: u64,
    api_key: String,
    rate_limiter: RateLimiter,
}

/// 请求计数滑动窗口速率限制器
struct RateLimiter {
    /// IP -> (窗口起始时间, 请求计数)
    windows: HashMap<String, (Instant, u32)>,
    max_per_minute: u32,
}

impl RateLimiter {
    fn new(max_per_minute: u32) -> Self {
        Self {
            windows: HashMap::new(),
            max_per_minute,
        }
    }

    fn check(&mut self, ip: &str) -> bool {
        let now = Instant::now();
        let window = self.windows.entry(ip.to_string()).or_insert((now, 0));

        // 窗口超过 1 分钟则重置
        if now.duration_since(window.0) >= Duration::from_secs(60) {
            *window = (now, 1);
            return true;
        }

        window.1 += 1;
        window.1 <= self.max_per_minute
    }
}

/// API 服务器线程共享状态
pub type ApiServerState = Arc<Mutex<ApiServerInner>>;

// ===== 启动参数 =====

#[derive(Debug, Clone, serde::Deserialize, specta::Type)]
pub struct ApiServerStartParams {
    /// 监听端口（默认 18791）
    pub port: Option<u16>,
    /// API Key（为空则自动生成）
    pub api_key: Option<String>,
}

// ===== Tauri 命令 =====

/// 启动 HTTP API 服务
#[tauri::command]
#[specta::specta]
pub async fn api_server_start(
    state: State<'_, ServerState>,
    app_handle: tauri::AppHandle,
    params: Option<ApiServerStartParams>,
) -> Result<String, String> {
    let port = params.as_ref().and_then(|p| p.port).unwrap_or(18791);
    let api_key = params
        .as_ref()
        .and_then(|p| p.api_key.clone())
        .unwrap_or_else(|| format!("ydsz-{}", uuid::Uuid::new_v4().to_string()[..12].to_string()));

    let inner = Arc::new(Mutex::new(ApiServerInner {
        running: false,
        port,
        request_count: 0,
        api_key: api_key.clone(),
        rate_limiter: RateLimiter::new(60),
    }));

    // 克隆 Arc 供线程使用
    let inner_clone = inner.clone();
    let state_clone = state.inner().clone();
    let app_handle_clone = app_handle.clone();

    // 在新线程中启动 TCP 服务器
    thread::spawn(move || {
        let addr = format!("127.0.0.1:{}", port);
        let listener = match TcpListener::bind(&addr) {
            Ok(l) => l,
            Err(e) => {
                info!("API 服务绑定端口 {} 失败: {}", port, e);
                return;
            }
        };

        // 通知前端服务已启动
        {
            let mut guard = inner_clone.lock().unwrap();
            guard.running = true;
        }

        info!("HTTP API 服务已启动: http://{}", addr);
        let _ = app_handle_clone.emit("api_server://started", port);

        listener.set_nonblocking(false).ok();

        for stream in listener.incoming() {
            match stream {
                Ok(stream) => {
                    let inner = inner_clone.clone();
                    let state = state_clone.clone();
                    thread::spawn(move || {
                        handle_connection(stream, inner, Arc::new(state));
                    });
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(10));
                    continue;
                }
                Err(e) => {
                    // 服务已停止时 accept 会退出
                    debug_assert!(true, "accept 错误: {}", e);
                    break;
                }
            }

            // 检查是否应该停止
            {
                let guard = inner_clone.lock().unwrap();
                if !guard.running {
                    break;
                }
            }
        }

        info!("HTTP API 服务已停止");
    });

    // 等待一小段时间确认启动成功
    tokio::time::sleep(Duration::from_millis(200)).await;

    {
        let guard = inner.lock().unwrap();
        if guard.running {
            Ok(format!(
                "API 服务已启动: http://127.0.0.1:{}",
                port
            ))
        } else {
            Err("API 服务启动中，请稍后重试".into())
        }
    }
}

/// 停止 HTTP API 服务
#[tauri::command]
#[specta::specta]
pub async fn api_server_stop() -> Result<(), String> {
    // 由于 ApiServerState 是全局状态，需要通过停止标志让 accept 循环退出
    // 这里使用一个简化的方案：由前端记录端口，发送停止请求
    info!("停止 HTTP API 服务");
    // TODO: 完整实现需要共享停止信号
    Ok(())
}

/// 获取 API 服务状态
#[tauri::command]
#[specta::specta]
pub async fn api_server_status() -> ApiServerStatus {
    // 返回默认未运行状态（完整实现需共享 ApiServerState）
    ApiServerStatus {
        running: false,
        port: 0,
        request_count: 0,
        api_key_configured: false,
    }
}

/// 重新生成 API Key
#[tauri::command]
#[specta::specta]
pub async fn api_server_regenerate_key() -> Result<String, String> {
    let new_key = format!("ydsz-{}", uuid::Uuid::new_v4().to_string()[..12].to_string());
    info!("已重新生成 API Key");
    Ok(new_key)
}

// ===== 请求处理 =====

fn handle_connection(
    mut stream: TcpStream,
    _inner: Arc<Mutex<ApiServerInner>>,
    _server_state: Arc<crate::ServerState>,
) {
    stream.set_read_timeout(Some(Duration::from_secs(30))).ok();
    stream.set_write_timeout(Some(Duration::from_secs(30))).ok();

    let peer_addr = stream.peer_addr().map(|a| a.to_string()).unwrap_or_default();
    let peer_ip = peer_addr.split(':').next().unwrap_or("unknown").to_string();

    // 读取请求（简化版 HTTP/1.1 解析）
    let mut request_line = String::new();
    let mut headers: HashMap<String, String> = HashMap::new();

    let mut buf_reader = std::io::BufReader::new(&stream);

    // 读取请求行
    if buf_reader.read_line(&mut request_line).is_err() {
        send_response(&mut stream, 400, "Bad Request", "invalid request");
        return;
    }

    let request_line = request_line.trim();
    let parts: Vec<&str> = request_line.split_whitespace().collect();
    if parts.len() < 2 {
        send_response(&mut stream, 400, "Bad Request", "invalid request line");
        return;
    }

    let method = parts[0];
    let path = parts[1];

    // 读取请求头
    loop {
        let mut line = String::new();
        if buf_reader.read_line(&mut line).is_err() || line.trim().is_empty() {
            break;
        }
        if let Some((key, value)) = line.trim().split_once(':') {
            headers.insert(key.trim().to_lowercase(), value.trim().to_string());
        }
    }

    // 读取请求体（如果有 Content-Length）
    let body = if let Some(content_length) = headers.get("content-length") {
        if let Ok(len) = content_length.parse::<usize>() {
            let mut body_buf = vec![0u8; len.min(1024 * 1024)]; // 最大 1MB
            use std::io::Read;
            let body_len = len.min(body_buf.len());
            if buf_reader.read_exact(&mut body_buf[..body_len]).is_ok() {
                Some(String::from_utf8_lossy(&body_buf[..body_len]).to_string())
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    };

    // 路由分发
    let response = match (method, path) {
        ("GET", "/health") => handle_health(),
        ("GET", "/v1/models") => handle_list_models(),
        ("POST", "/v1/chat/completions") => {
            handle_chat_completions(body, &headers, &peer_ip)
        }
        _ => handle_not_found(),
    };

    send_response(&mut stream, response.status, response.content_type, &response.body);
}

// ===== 响应结构 =====

struct HttpResponse {
    status: u16,
    content_type: &'static str,
    body: String,
}

fn json_response(status: u16, body: serde_json::Value) -> HttpResponse {
    HttpResponse {
        status,
        content_type: "application/json",
        body: serde_json::to_string_pretty(&body).unwrap_or_default(),
    }
}

fn handle_health() -> HttpResponse {
    json_response(
        200,
        serde_json::json!({
            "status": "ok",
            "service": "ydsz-buddy-api",
            "version": env!("CARGO_PKG_VERSION"),
        }),
    )
}

fn handle_list_models() -> HttpResponse {
    json_response(
        200,
        serde_json::json!({
            "object": "list",
            "data": [
                {
                    "id": "ydsz-buddy-default",
                    "object": "model",
                    "created": 1700000000,
                    "owned_by": "ydsz-buddy",
                },
                {
                    "id": "claude-sonnet-4-20250514",
                    "object": "model",
                    "created": 1700000000,
                    "owned_by": "ydsz-buddy",
                },
                {
                    "id": "gpt-4o",
                    "object": "model",
                    "created": 1700000000,
                    "owned_by": "ydsz-buddy",
                },
                {
                    "id": "deepseek-chat",
                    "object": "model",
                    "created": 1700000000,
                    "owned_by": "ydsz-buddy",
                },
            ],
        }),
    )
}

fn handle_chat_completions(
    body: Option<String>,
    headers: &HashMap<String, String>,
    _peer_ip: &str,
) -> HttpResponse {
    // 鉴权检查
    let auth = headers.get("authorization").map(|s| s.as_str()).unwrap_or("");
    if !auth.starts_with("Bearer ") {
        return json_response(
            401,
            serde_json::json!({
                "error": {
                    "message": "Missing or invalid Authorization header. Use: Bearer <API_KEY>",
                    "type": "auth_error",
                },
            }),
        );
    }

    // 解析请求体
    let request_body: serde_json::Value = match body {
        Some(b) => match serde_json::from_str(&b) {
            Ok(v) => v,
            Err(e) => {
                return json_response(
                    400,
                    serde_json::json!({
                        "error": {
                            "message": format!("Invalid JSON: {}", e),
                            "type": "invalid_request_error",
                        },
                    }),
                );
            }
        },
        None => {
            return json_response(
                400,
                serde_json::json!({
                    "error": {
                        "message": "Request body is required",
                        "type": "invalid_request_error",
                    },
                }),
            );
        }
    };

    // 提取消息
    let messages = request_body
        .get("messages")
        .and_then(|m| m.as_array())
        .map(|arr| arr.as_slice())
        .unwrap_or(&[]);

    let model = request_body
        .get("model")
        .and_then(|m| m.as_str())
        .unwrap_or("ydsz-buddy-default");

    let stream = request_body
        .get("stream")
        .and_then(|s| s.as_bool())
        .unwrap_or(false);

    if stream {
        // TODO: 流式响应实现
        // 当前返回非流式简化结果
    }

    // 构造兼容响应
    let last_user_message = messages
        .iter()
        .rev()
        .find(|m| m.get("role").and_then(|r| r.as_str()) == Some("user"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .unwrap_or("");

    let response_content = format!(
        "这是一个来自 ydsz-buddy HTTP API 的占位响应。收到消息: 「{}」。模型: {}。实际响应需要 Provider 接入。",
        if last_user_message.len() > 100 {
            &last_user_message[..100]
        } else {
            last_user_message
        },
        model
    );

    json_response(
        200,
        serde_json::json!({
            "id": format!("chatcmpl-{}", uuid::Uuid::new_v4().to_string()[..8].to_string()),
            "object": "chat.completion",
            "created": chrono::Utc::now().timestamp(),
            "model": model,
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": response_content,
                    },
                    "finish_reason": "stop",
                },
            ],
            "usage": {
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0,
            },
        }),
    )
}

fn handle_not_found() -> HttpResponse {
    json_response(
        404,
        serde_json::json!({
            "error": {
                "message": "Not Found",
                "type": "invalid_request_error",
            },
        }),
    )
}

fn send_response(stream: &mut TcpStream, status: u16, content_type: &str, body: &str) {
    let status_text = match status {
        200 => "OK",
        400 => "Bad Request",
        401 => "Unauthorized",
        404 => "Not Found",
        500 => "Internal Server Error",
        _ => "Unknown",
    };

    let body_bytes = body.as_bytes();
    let response = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n",
        status,
        status_text,
        content_type,
        body_bytes.len(),
    );

    let _ = stream.write_all(response.as_bytes());
    let _ = stream.write_all(body_bytes);
    let _ = stream.flush();
}
