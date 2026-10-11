//! # WebSocket JSON-RPC 客户端
//!
//! 连接到本地 ydzs-server，通过 WebSocket 发送 JSON-RPC 请求，
//! 接收服务器推送消息（SSE 流），支持自动重连。

use std::sync::Arc;

use anyhow::{Context, Result};
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};

pub mod types;

use types::*;

/// 客户端推送事件枚举
#[derive(Debug, Clone)]
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
        message: ydsz_core::models::Message,
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
}

impl YdszClient {
    /// 创建新的客户端实例
    pub fn new(server_url: &str) -> Self {
        Self {
            server_url: server_url.to_string(),
            tx: Arc::new(tokio::sync::Mutex::new(None)),
            request_counter: Arc::new(std::sync::atomic::AtomicU64::new(1)),
            connected: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        }
    }

    /// 连接到服务器并启动接收循环
    pub async fn connect(&self, event_tx: tokio::sync::mpsc::UnboundedSender<ClientEvent>) -> Result<()> {
        tracing::info!(url = %self.server_url, "正在连接服务器...");

        let (ws_stream, _) = connect_async(&self.server_url)
            .await
            .with_context(|| format!("无法连接到服务器: {}", self.server_url))?;

        tracing::info!("WebSocket 连接已建立");

        let (mut write, mut read) = ws_stream.split();
        let (msg_tx, mut msg_rx) = mpsc::unbounded_channel::<String>();

        // 保存发送通道
        *self.tx.lock().await = Some(msg_tx);
        self.connected.store(true, std::sync::atomic::Ordering::Relaxed);
        event_tx.send(ClientEvent::ConnectionStatus { connected: true })?;

        // 写入任务：从 channel 取消息发送到 WebSocket
        let write_task = tokio::spawn(async move {
            while let Some(text) = msg_rx.recv().await {
                if let Err(e) = write.send(Message::Text(text)).await {
                    tracing::error!(error = %e, "写入 WebSocket 失败");
                    break;
                }
            }
            // 关闭写入端
            let _ = write.close().await;
        });

        // 读取任务：从 WebSocket 接收消息，解析为事件
        let _read_task = tokio::spawn(async move {
            while let Some(Ok(msg)) = read.next().await {
                match msg {
                    Message::Text(text) => {
                        tracing::debug!(payload = %text, "收到 WebSocket 消息");
                        // TODO: 解析 JSON-RPC 响应并分类为 ClientEvent
                        // 骨架阶段暂时只记录日志
                        if let Err(e) = event_tx.send(ClientEvent::Error {
                            message: format!("收到未处理消息: {text}"),
                        }) {
                            tracing::error!(error = %e, "发送事件失败");
                            break;
                        }
                    }
                    Message::Close(_) => {
                        tracing::info!("服务器关闭连接");
                        let _ = event_tx.send(ClientEvent::ConnectionStatus { connected: false });
                        break;
                    }
                    Message::Ping(data) => {
                        // pong 由 tokio-tungstenite 自动发送，忽略
                        tracing::debug!(?data, "收到 Ping");
                    }
                    _ => {
                        tracing::debug!(?msg, "收到其他类型消息");
                    }
                }
            }

            // 连接断开
            let _ = event_tx.send(ClientEvent::ConnectionStatus { connected: false });
            tracing::info!("WebSocket 读取端已断开");
        });

        // 保存任务句柄防止被 drop（骨架阶段忽略，后续添加 JoinHandle 存储）
        let _ = write_task;
        let _ = _read_task;

        Ok(())
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
}

impl Drop for YdszClient {
    fn drop(&mut self) {
        self.connected.store(false, std::sync::atomic::Ordering::Relaxed);
    }
}
