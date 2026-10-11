//! # WebSocket JSON-RPC 客户端
//!
//! 连接到本地 ydzs-server，通过 WebSocket 发送 JSON-RPC 请求，
//! 接收服务端推送消息（SSE 风格 delta 推送），支持自动重连（指数退避）。
//!
//! ## 协议说明
//!
//! - JSON-RPC 2.0 格式
//! - 请求：`{ jsonrpc: "2.0", id, method, params }`
//! - 响应：`{ jsonrpc: "2.0", id, result }` 或 `{ jsonrpc: "2.0", id, error }`
//! - 通知（服务端推送）：`{ jsonrpc: "2.0", method, params }`
//!
//! ## 服务端推送方法
//!
//! - `message/delta` — 流式消息增量
//! - `message/complete` — 消息传输完成
//! - `turn/complete` — 交互轮次完成
//! - `thread/list` — 线程列表更新
//! - `error` — 错误通知
//! - `connection/reconnecting` — 服务端通知即将重连

use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};

pub mod types;

use types::*;

/// 客户端推送事件枚举
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub enum ClientEvent {
    /// 线程列表更新
    ThreadList {
        threads: Vec<ydsz_core::models::Thread>,
    },
    /// 消息流式增量（逐字）
    MessageDelta {
        thread_id: String,
        delta: String,
    },
    /// 消息完整到达
    MessageComplete {
        thread: String,
    },
    /// 交互轮次完成
    TurnComplete {
        thread_id: String,
        usage: Option<TokenUsage>,
    },
    /// 错误
    Error {
        message: String,
    },
    /// 连接状态变化
    ConnectionStatus {
        connected: bool,
        /// 重连信息（可选）
        reconnecting: Option<String>,
    },
}

/// WebSocket JSON-RPC 客户端
pub struct YdszClient {
    /// 服务器 WebSocket URL
    server_url: String,
    /// 消息发送通道（写入端）
    tx: Arc<tokio::sync::Mutex<Option<mpsc::UnboundedSender<String>>>>,
    /// 请求 ID 计数器
    request_counter: Arc<std::sync::atomic::AtomicU64>,
    /// 是否已连接
    connected: Arc<std::sync::atomic::AtomicBool>,
    /// 是否正在重连
    reconnecting: Arc<std::sync::atomic::AtomicBool>,
    /// 重连配置
    reconnect_config: ReconnectConfig,
}

/// 重连配置
#[derive(Debug, Clone)]
pub struct ReconnectConfig {
    /// 最大重连次数（0 表示无限）
    pub max_attempts: u32,
    /// 初始退避延迟（毫秒）
    pub base_delay_ms: u64,
    /// 最大退避延迟（毫秒）
    pub max_delay_ms: u64,
}

impl Default for ReconnectConfig {
    fn default() -> Self {
        Self {
            max_attempts: 10,
            base_delay_ms: 500,
            max_delay_ms: 30_000,
        }
    }
}

#[allow(dead_code)]
impl YdszClient {
    /// 创建新的客户端实例
    pub fn new(server_url: &str) -> Self {
        Self {
            server_url: server_url.to_string(),
            tx: Arc::new(tokio::sync::Mutex::new(None)),
            request_counter: Arc::new(std::sync::atomic::AtomicU64::new(1)),
            connected: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            reconnecting: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            reconnect_config: ReconnectConfig::default(),
        }
    }

    /// 设置重连配置
    pub fn with_reconnect_config(mut self, config: ReconnectConfig) -> Self {
        self.reconnect_config = config;
        self
    }

    /// 连接到服务器并启动接收循环（带自动重连）
    pub async fn connect(&self, event_tx: tokio::sync::mpsc::UnboundedSender<ClientEvent>) -> Result<()> {
        tracing::info!(url = %self.server_url, "正在连接服务器...");

        // 先尝试一次即时连接
        match self.try_connect(&event_tx).await {
            Ok(()) => Ok(()),
            Err(e) => {
                tracing::warn!(error = %e, "初始连接失败，启动重连循环");
                // 启动后台重连任务
                self.spawn_reconnect_loop(event_tx);
                Ok(())
            }
        }
    }

    /// 尝试单次连接（event_tx 以引用传入，clone 后传递给任务）
    async fn try_connect(&self, event_tx: &tokio::sync::mpsc::UnboundedSender<ClientEvent>) -> Result<()> {
        // clone event_tx 供异步任务使用
        let event_tx = event_tx.clone();
        let (ws_stream, _) = connect_async(&self.server_url)
            .await
            .with_context(|| format!("无法连接到服务器: {}", self.server_url))?;

        tracing::info!("WebSocket 连接已建立");

        let (mut write, mut read) = ws_stream.split();
        let (msg_tx, mut msg_rx) = mpsc::unbounded_channel::<String>();

        // 保存发送通道
        *self.tx.lock().await = Some(msg_tx);
        self.connected.store(true, std::sync::atomic::Ordering::Relaxed);
        self.reconnecting.store(false, std::sync::atomic::Ordering::Relaxed);

        let _ = event_tx.send(ClientEvent::ConnectionStatus {
            connected: true,
            reconnecting: None,
        });

        // 写入任务：从 channel 取消息发送到 WebSocket
        let tx_clone = self.tx.clone();
        let connected_clone = self.connected.clone();
        let write_task = tokio::spawn(async move {
            while let Some(text) = msg_rx.recv().await {
                if let Err(e) = write.send(Message::Text(text)).await {
                    tracing::error!(error = %e, "写入 WebSocket 失败");
                    connected_clone.store(false, std::sync::atomic::Ordering::Relaxed);
                    break;
                }
            }
            // 关闭写入端
            let _ = write.close().await;
            // 清空发送通道
            *tx_clone.lock().await = None;
        });

        // 读取任务：从 WebSocket 接收消息，解析为事件
        let connected_clone2 = self.connected.clone();
        let server_url = self.server_url.clone();
        let event_tx_read = event_tx.clone();
        let _read_task = tokio::spawn(async move {
            while let Some(result) = read.next().await {
                match result {
                    Ok(Message::Text(text)) => {
                        tracing::debug!(payload = %text, "收到 WebSocket 消息");
                        Self::handle_server_message(&text, &event_tx_read);
                    }
                    Ok(Message::Close(frame)) => {
                        let reason = frame.map(|f| f.reason.to_string()).unwrap_or_default();
                        tracing::info!(reason = %reason, "服务器关闭连接");
                        let _ = event_tx_read.send(ClientEvent::ConnectionStatus {
                            connected: false,
                            reconnecting: Some(format!("服务器关闭: {}", reason)),
                        });
                        break;
                    }
                    Ok(Message::Ping(data)) => {
                        tracing::debug!(?data, "收到 Ping（自动回复 Pong）");
                        // tokio-tungstenite 自动发送 Pong
                    }
                    Ok(Message::Pong(_)) => {
                        // 忽略 Pong
                    }
                    Ok(Message::Binary(bin)) => {
                        tracing::debug!(len = bin.len(), "收到二进制消息（已忽略）");
                    }
                    Ok(Message::Frame(_)) => {
                        // 低层帧消息，忽略
                    }
                    Err(e) => {
                        tracing::error!(error = %e, "WebSocket 读取错误");
                        let _ = event_tx_read.send(ClientEvent::Error {
                            message: format!("连接异常: {}", e),
                        });
                        break;
                    }
                }
            }

            // 连接断开
            connected_clone2.store(false, std::sync::atomic::Ordering::Relaxed);
            let _ = event_tx_read.send(ClientEvent::ConnectionStatus {
                connected: false,
                reconnecting: Some("连接已断开".to_string()),
            });
            tracing::warn!(url = %server_url, "WebSocket 读取端已断开");
        });

        // 不 join 任务——让它们在后台运行
        // 需要 pin 防止未使用警告
        let _ = write_task;
        let _ = _read_task;

        Ok(())
    }

    /// 启动后台重连循环
    fn spawn_reconnect_loop(&self, event_tx: tokio::sync::mpsc::UnboundedSender<ClientEvent>) {
        let server_url = self.server_url.clone();
        let tx = self.tx.clone();
        let connected = self.connected.clone();
        let reconnecting = self.reconnecting.clone();
        let config = self.reconnect_config.clone();

        tokio::spawn(async move {
            let mut attempt: u32 = 0;

            loop {
                if connected.load(std::sync::atomic::Ordering::Relaxed) {
                    break;
                }

                if config.max_attempts > 0 && attempt >= config.max_attempts {
                    tracing::error!(attempts = attempt, "达到最大重连次数，放弃重连");
                    let _ = event_tx.send(ClientEvent::Error {
                        message: format!("重连失败：已达到最大重连次数 ({})", config.max_attempts),
                    });
                    break;
                }

                attempt += 1;
                reconnecting.store(true, std::sync::atomic::Ordering::Relaxed);

                let delay = Self::calc_backoff(attempt, &config);
                let delay_secs = delay as f64 / 1000.0;

                tracing::info!(
                    attempt = attempt,
                    delay_secs = delay_secs,
                    "调度第 {} 次重连（{:.1}s 后）",
                    attempt, delay_secs
                );

                let _ = event_tx.send(ClientEvent::ConnectionStatus {
                    connected: false,
                    reconnecting: Some(format!("重连中 ({}/{}), {:.1}s 后重试",
                        attempt,
                        if config.max_attempts > 0 { config.max_attempts } else { u32::MAX },
                        delay_secs
                    )),
                });

                tokio::time::sleep(Duration::from_millis(delay)).await;

                // 尝试连接
                tracing::info!(url = %server_url, attempt = attempt, "尝试连接服务器...");
                match connect_async(&server_url).await {
                    Ok((ws_stream, _)) => {
                        tracing::info!("WebSocket 连接已恢复（第 {} 次重连）", attempt);

                        let (mut write, read) = ws_stream.split();
                        let (msg_tx, mut msg_rx) = mpsc::unbounded_channel::<String>();

                        *tx.lock().await = Some(msg_tx);
                        connected.store(true, std::sync::atomic::Ordering::Relaxed);
                        reconnecting.store(false, std::sync::atomic::Ordering::Relaxed);

                        let _ = event_tx.send(ClientEvent::ConnectionStatus {
                            connected: true,
                            reconnecting: Some(format!("已恢复（第 {} 次重连）", attempt)),
                        });

                        // 启动写入任务
                        let tx_inner = tx.clone();
                        let connected_inner = connected.clone();
                        let _write_task = tokio::spawn(async move {
                            while let Some(text) = msg_rx.recv().await {
                                if let Err(e) = write.send(Message::Text(text)).await {
                                    tracing::error!(error = %e, "写入 WebSocket 失败");
                                    connected_inner.store(false, std::sync::atomic::Ordering::Relaxed);
                                    break;
                                }
                            }
                            let _ = write.close().await;
                            *tx_inner.lock().await = None;
                        });

                        // 启动读取任务
                        let connected_inner2 = connected.clone();
                        read.for_each(|result| {
                            let event_tx = event_tx.clone();
                            let connected_inner2 = connected_inner2.clone();
                            async move {
                                match result {
                                    Ok(Message::Text(text)) => {
                                        tracing::debug!(payload = %text, "收到 WebSocket 消息");
                                        Self::handle_server_message(&text, &event_tx);
                                    }
                                    Ok(Message::Close(_)) => {
                                        tracing::info!("服务器关闭连接（重连后）");
                                        let _ = event_tx.send(ClientEvent::ConnectionStatus {
                                            connected: false,
                                            reconnecting: Some("连接断开，准备重连".to_string()),
                                        });
                                        connected_inner2.store(false, std::sync::atomic::Ordering::Relaxed);
                                    }
                                    Ok(Message::Ping(_)) => { /* tokio-tungstenite 自动回复 Pong */ }
                                    Ok(_) => {}
                                    Err(e) => {
                                        tracing::error!(error = %e, "WebSocket 读取错误（重连后）");
                                        let _ = event_tx.send(ClientEvent::Error {
                                            message: format!("连接异常: {}", e),
                                        });
                                        connected_inner2.store(false, std::sync::atomic::Ordering::Relaxed);
                                    }
                                }
                            }
                        }).await;

                        connected.store(false, std::sync::atomic::Ordering::Relaxed);
                        // 如果还在运行，继续下一轮重连
                    }
                    Err(e) => {
                        tracing::warn!(
                            error = %e,
                            attempt = attempt,
                            "重连失败: {}",
                            e
                        );
                        // 继续下一轮重连
                    }
                }
            }

            tracing::info!("重连循环已结束");
        });
    }

    /// 计算退避延迟
    fn calc_backoff(attempt: u32, config: &ReconnectConfig) -> u64 {
        let exp = config.base_delay_ms * 2_u64.pow(attempt.saturating_add(1) - 1);
        exp.min(config.max_delay_ms)
    }

    /// 处理服务端消息，解析为 ClientEvent
    fn handle_server_message(text: &str, event_tx: &tokio::sync::mpsc::UnboundedSender<ClientEvent>) {
        let value: Value = match serde_json::from_str(text) {
            Ok(v) => v,
            Err(e) => {
                tracing::warn!(error = %e, text = %text, "无法解析为 JSON");
                let _ = event_tx.send(ClientEvent::Error {
                    message: format!("JSON 解析失败: {}", e),
                });
                return;
            }
        };

        // 区分通知（无 id）和响应（有 id）
        let is_response = value.get("id").is_some();

        if is_response {
            Self::handle_response(&value, event_tx);
        } else {
            Self::handle_notification(&value, event_tx);
        }
    }

    /// 处理 JSON-RPC 响应
    fn handle_response(value: &Value, event_tx: &tokio::sync::mpsc::UnboundedSender<ClientEvent>) {
        // 如果有 error 字段，转发错误
        if let Some(error) = value.get("error") {
            let msg = error
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("未知错误")
                .to_string();
            let code = error.get("code").and_then(|c| c.as_i64()).unwrap_or(0);
            tracing::error!(code = code, message = %msg, "服务端返回错误");
            let _ = event_tx.send(ClientEvent::Error {
                message: format!("[{}] {}", code, msg),
            });
            return;
        }

        let result = value.get("result").unwrap_or(&Value::Null);

        // 根据 result 内容推断事件类型
        // 1. 线程列表结果
        if let Some(threads) = result.get("threads").and_then(|t| t.as_array()) {
            match Self::parse_thread_list(threads) {
                Ok(threads) => {
                    let _ = event_tx.send(ClientEvent::ThreadList { threads });
                    return;
                }
                Err(e) => {
                    tracing::warn!(error = %e, "解析 thread/list 结果失败");
                }
            }
        }

        // 2. 通用成功：不做特殊处理（某些方法可能返回空）
        tracing::debug!(?result, "收到 JSON-RPC 结果");
    }

    /// 处理 JSON-RPC 通知（服务端推送）
    fn handle_notification(value: &Value, event_tx: &tokio::sync::mpsc::UnboundedSender<ClientEvent>) {
        let method = value.get("method").and_then(|m| m.as_str()).unwrap_or("");
        let params = value.get("params").unwrap_or(&Value::Null);

        tracing::debug!(method = %method, "收到服务端通知");

        match method {
            // 流式消息增量
            "message/delta" | "thread/messageDelta" => {
                let thread_id = params
                    .get("threadId")
                    .or_else(|| params.get("thread_id"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let delta = params
                    .get("delta")
                    .or_else(|| params.get("textDelta"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let _ = event_tx.send(ClientEvent::MessageDelta { thread_id, delta });
            }

            // 消息完整到达
            "message/complete" | "thread/messageComplete" => {
                let thread_id = params
                    .get("threadId")
                    .or_else(|| params.get("thread_id"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let _ = event_tx.send(ClientEvent::MessageComplete { thread: thread_id });
            }

            // 交互轮次完成
            "turn/complete" | "thread/turnComplete" | "thread.turnComplete" => {
                let thread_id = params
                    .get("threadId")
                    .or_else(|| params.get("thread_id"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                let usage = params.get("usage").and_then(|u| {
                    Some(TokenUsage {
                        input_tokens: u.get("inputTokens").and_then(|v| v.as_u64()).unwrap_or(0),
                        output_tokens: u.get("outputTokens").and_then(|v| v.as_u64()).unwrap_or(0),
                    })
                });

                let _ = event_tx.send(ClientEvent::TurnComplete { thread_id, usage });
            }

            // 线程列表推送
            "thread/list" => {
                if let Some(threads_val) = params.get("threads") {
                    if let Some(threads_arr) = threads_val.as_array() {
                        match Self::parse_thread_list(threads_arr) {
                            Ok(threads) => {
                                let _ = event_tx.send(ClientEvent::ThreadList { threads });
                            }
                            Err(e) => {
                                tracing::warn!(error = %e, "解析 thread/list 通知失败");
                            }
                        }
                    }
                }
            }

            // 错误通知
            "error" => {
                let message = params
                    .get("message")
                    .or_else(|| params.get("error"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("未知错误")
                    .to_string();
                let _ = event_tx.send(ClientEvent::Error { message });
            }

            // 服务端欢迎消息
            "connection/welcome" | "server/welcome" => {
                tracing::info!(?params, "收到服务端欢迎消息");
            }

            // 未知通知
            _ => {
                tracing::debug!(method = %method, "收到未处理的服务端通知");
            }
        }
    }

    /// 解析线程列表
    fn parse_thread_list(arr: &[serde_json::Value]) -> Result<Vec<ydsz_core::models::Thread>> {
        let mut threads = Vec::with_capacity(arr.len());
        for val in arr {
            match serde_json::from_value::<ydsz_core::models::Thread>(val.clone()) {
                Ok(t) => threads.push(t),
                Err(e) => {
                    tracing::warn!(error = %e, "解析单个 Thread 失败，跳过");
                }
            }
        }
        Ok(threads)
    }

    /// 发送文本消息
    pub async fn send_message(&self, text: &str) -> Result<()> {
        let request = JsonRpcRequest::new(
            self.next_id(),
            "message/send",
            Some(serde_json::json!({
                "text": text,
                "mode": "code",
            })),
        );

        self.send_json(&serde_json::to_value(&request)?).await?;
        tracing::debug!(text = %text, "消息已发送");
        Ok(())
    }

    /// 请求线程列表
    pub async fn fetch_threads(&self, project_id: &str) -> Result<()> {
        let request = JsonRpcRequest::new(
            self.next_id(),
            "thread/list",
            Some(serde_json::json!({
                "projectId": project_id,
            })),
        );

        self.send_json(&serde_json::to_value(&request)?).await
    }

    /// 发送 JSON 数据到服务器
    async fn send_json(&self, value: &Value) -> Result<()> {
        let text = serde_json::to_string(value)?;
        let tx_guard = self.tx.lock().await;

        if let Some(tx) = tx_guard.as_ref() {
            tx.send(text)?;
            tracing::debug!("JSON-RPC 请求已发送");
        } else {
            tracing::warn!("未连接到服务器，消息未发送");
            anyhow::bail!("WebSocket 未连接，无法发送消息");
        }

        Ok(())
    }

    /// 生成下一个请求 ID
    fn next_id(&self) -> String {
        self.request_counter
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            .to_string()
    }

    /// 检查是否已连接
    pub fn is_connected(&self) -> bool {
        self.connected.load(std::sync::atomic::Ordering::Relaxed)
    }

    /// 检查是否正在重连
    pub fn is_reconnecting(&self) -> bool {
        self.reconnecting.load(std::sync::atomic::Ordering::Relaxed)
    }
}

impl Drop for YdszClient {
    fn drop(&mut self) {
        self.connected.store(false, std::sync::atomic::Ordering::Relaxed);
    }
}
