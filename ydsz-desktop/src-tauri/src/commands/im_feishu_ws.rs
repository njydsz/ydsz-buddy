//! 飞书 WebSocket 长连接实现（P0-1 MVP）
//!
//! 参考飞书开放平台文档：
//! - 使用 WebSocket 长连接接收事件（无需公网 IP）
//! - 流程：获取 tenant_access_token → 建立 WS 连接 → 接收事件 → 回复
//! - 保活：pong 响应 + 断线重连（指数退避）

use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tracing::{info, warn, error, debug};

use super::im_gw::{InboundMessage, ImChannelStatus};

// ──────────── 配置 ────────────

#[derive(Debug, Clone)]
pub struct FeishuWsConfig {
    pub app_id: String,
    pub app_secret: String,
    pub http_url: String,       // 默认 https://open.feishu.cn
}

impl Default for FeishuWsConfig {
    fn default() -> Self {
        Self {
            app_id: String::new(),
            app_secret: String::new(),
            http_url: "https://open.feishu.cn".into(),
        }
    }
}

// ──────────── 飞书 WebSocket 客户端 ────────────

pub struct FeishuWsClient {
    config: FeishuWsConfig,
    tx_msg: mpsc::Sender<InboundMessage>,
    channel_id: String,
}

impl FeishuWsClient {
    pub fn new(config: FeishuWsConfig, tx_msg: mpsc::Sender<InboundMessage>, channel_id: String) -> Self {
        Self { config, tx_msg, channel_id }
    }

    /// 启动飞书 WebSocket 长连接（异步任务）
    pub async fn run(mut self, status_cb: Arc<dyn Fn(String, ImChannelStatus, Option<String>) + Send + Sync>) {
        let mut retry_count = 0u32;
        let max_retries = 5u32;
        let base_delay = Duration::from_secs(2);

        loop {
            (self.channel_id.clone(), ImChannelStatus::Connecting, None);

            // 1. 获取 tenant_access_token
            let token = match self.fetch_tenant_token().await {
                Ok(t) => {
                    info!("[FeishuWS] 获取 tenant_access_token 成功");
                    retry_count = 0;
                    t
                }
                Err(e) => {
                    error!("[FeishuWS] 获取 token 失败: {}", e);
                    (self.channel_id.clone(), ImChannelStatus::Error, Some(e.clone()));
                    retry_count += 1;
                    if retry_count > max_retries {
                        error!("[FeishuWS] 超过最大重试次数，停止连接");
                        break;
                    }
                    tokio::time::sleep(base_delay * retry_count).await;
                    continue;
                }
            };

            // 2. 建立 WebSocket 连接（飞书使用 tenant_token 作为 URL 参数）
            //    飞书 WS URL 格式：wss://open.feishu.cn/open-apis/ws/v2/connect?token=xxx
            //    这是飞书的简化版 WebSocket 接口
            let ws_url = format!(
                "{}/open-apis/ws/v2/connect?token={}",
                self.config.http_url.replace("https://", "wss://").replace("http://", "ws://"),
                token
            );

            info!("[FeishuWS] 尝试连接: {}", ws_url);

            match connect_async(&ws_url).await {
                Ok((ws_stream, _)) => {
                    info!("[FeishuWS] WebSocket 连接成功");
                    (self.channel_id.clone(), ImChannelStatus::Connected, None);
                    retry_count = 0;

                    // 3. 进入消息接收循环
                    if let Err(e) = self.message_loop(ws_stream).await {
                        warn!("[FeishuWS] 消息循环异常: {}", e);
                    }

                    (self.channel_id.clone(), ImChannelStatus::Disconnected, None);
                }
                Err(e) => {
                    error!("[FeishuWS] 连接失败: {}", e);
                    (self.channel_id.clone(), ImChannelStatus::Error, Some(format!("WS 连接失败: {}", e)));
                    retry_count += 1;
                }
            }

            if retry_count > max_retries {
                error!("[FeishuWS] 超过最大重试次数，停止连接");
                break;
            }

            // 指数退避（上限 60s）
            let delay = std::cmp::min(base_delay * retry_count, Duration::from_secs(60));
            info!("[FeishuWS] {}s 后重试 ({}/{})", delay.as_secs(), retry_count, max_retries);
            tokio::time::sleep(delay).await;
        }
    }

    async fn fetch_tenant_token(&self) -> Result<String, String> {
        let client = reqwest::Client::new();
        let resp = client
            .post(format!("{}/open-apis/auth/v3/tenant_access_token/internal", self.config.http_url))
            .json(&serde_json::json!({
                "app_id": self.config.app_id,
                "app_secret": self.config.app_secret
            }))
            .timeout(Duration::from_secs(10))
            .send()
            .await
            .map_err(|e| format!("HTTP 请求失败: {}", e))?;

        let json: serde_json::Value = resp.json().await
            .map_err(|e| format!("JSON 解析失败: {}", e))?;

        json["tenant_access_token"].as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| format!("飞书 API 返回错误: code={}, msg={}",
                json["code"].as_i64().unwrap_or(-1),
                json["msg"].as_str().unwrap_or("unknown")))
    }

    async fn message_loop(
        &mut self,
        ws_stream: tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
    ) -> Result<(), String> {
        use futures_util::{StreamExt, SinkExt};
        let (mut write, mut read) = ws_stream.split();

        while let Some(msg_result) = read.next().await {
            match msg_result {
                Ok(Message::Text(text)) => {
                    debug!("[FeishuWS] 收到: {}", text);
                    match serde_json::from_str::<FeishuWsFrame>(&text) {
                        Ok(frame) => {
                            // 提取消息事件并转换为 InboundMessage
                            if let Some(inbound) = self.parse_frame_to_inbound(&frame) {
                                if let Err(e) = self.tx_msg.send(inbound).await {
                                    warn!("[FeishuWS] 入站消息发送失败: {}", e);
                                }
                            }
                        }
                        Err(e) => {
                            debug!("[FeishuWS] JSON 解析失败: {}", e);
                        }
                    }
                }
                Ok(Message::Ping(data)) => {
                    // 回复 pong
                    if write.send(Message::Pong(data)).await.is_err() {
                        return Err("Pong 发送失败".into());
                    }
                }
                Ok(Message::Close(_)) => {
                    info!("[FeishuWS] 连接被远端关闭");
                    return Ok(());
                }
                Ok(_) => {}
                Err(e) => {
                    return Err(format!("消息接收错误: {}", e));
                }
            }
        }
        Ok(())
    }

    /// 将飞书 WebSocket Frame 转换为 InboundMessage
    fn parse_frame_to_inbound(&self, frame: &FeishuWsFrame) -> Option<InboundMessage> {
        // 飞书 WebSocket 帧格式（简化）
        // header.event_type = "im.message.receive_v1"
        let event = frame.payload.get("event")?;
        let message = event.get("message")?;
        let sender = event.get("sender")?;

        let msg_type = message.get("message_type")?.as_str()?;
        let chat_id = message.get("chat_id")?.as_str()?;
        let message_id = message.get("message_id")?.as_str()?;

        // 根据消息类型提取文本内容
        let content = match msg_type {
            "text" => {
                let content_str = message.get("content")?.as_str().unwrap_or("{}");
                let inner: serde_json::Value = serde_json::from_str(content_str).ok()?;
                inner.get("text")?.as_str()?.to_string()
            }
            "post" => {
                // 富文本消息的简化处理
                format!("[富文本消息] {}", message.get("content").and_then(|v| v.as_str()).unwrap_or("{}"))
            }
            _ => format!("[{}消息]", msg_type),
        };

        let sender_id = sender.get("sender_id")?
            .get("open_id")?.as_str()?;
        let sender_type = sender.get("sender_type")?.as_str()?;
        let sender_name = if sender_type == "app" {
            "机器人".to_string()
        } else {
            sender_id.to_string()
        };

        Some(InboundMessage {
            msg_id: message_id.to_string(),
            channel_type: "feishu".into(),
            sender_id: sender_id.into(),
            sender_name,
            chat_id: chat_id.into(),
            content,
            content_type: "text".into(),
            received_at_ms: chrono::Utc::now().timestamp_millis(),
            extra: std::collections::HashMap::new(),
        })
    }
}

// ──────────── 飞书 WebSocket 帧格式 ────────────

#[derive(Debug, Deserialize)]
struct FeishuWsFrame {
    #[serde(default)]
    header: FeishuWsHeader,
    #[serde(default)]
    payload: serde_json::Value,
}

#[derive(Debug, Default, Deserialize)]
struct FeishuWsHeader {
    #[serde(default)]
    event_type: String,
    #[serde(default)]
    event_id: String,
}

use std::sync::Arc;
