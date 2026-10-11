//! IM 通道集成（P0-1 MVP）
//!
//! 提供 IM 外部消息系统的连接管理与消息管线。
//! 第一版目标：飞书 WebSocket 真实连接 + InboundMessage→Agent→OutboundMessage 管线。
//!
//! ## 架构
//! ```
//!   IM Platform (飞书/钉钉/企微)
//!        │ WebSocket / Webhook
//!        ▼
//!   ImGatewayState (通道注册表 + 会话路由)
//!        │ InboundMessage
//!        ▼
//!   MessageProcessor (Agent 管线桥接)
//!        │ OutboundMessage
//!        ▼
//!   通道出站发送
//! ```

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

// 引用顶层同级模块
use super::im_gw::*;
use super::im_feishu_ws::*;

// ===== 配置 DTO =====

/// IM 通道信息
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ImChannelInfo {
    pub id: String,
    pub name: String,
    pub channel_type: String,
    pub status: ImChannelStatus,
    pub connected_at_ms: Option<i64>,
    pub last_error: Option<String>,
    pub messages_received: u64,
    pub messages_sent: u64,
}

/// 飞书 WS 配置
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct FeishuConfigDto {
    pub app_id: String,
    pub app_secret: String,
}

/// 入站消息 DTO（前端可订阅）
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct InboundMessageDto {
    pub msg_id: String,
    pub channel_type: String,
    pub sender_name: String,
    pub chat_id: String,
    pub content: String,
    pub received_at_ms: i64,
}

/// 出站消息 DTO
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct OutboundMessageDto {
    pub request_msg_id: String,
    pub channel_type: String,
    pub chat_id: String,
    pub content: String,
    pub created_at_ms: i64,
}

/// IM 通道注册表（兼容旧代码接口）
pub struct ImRegistry {
    pub channels: Mutex<HashMap<String, ImChannelInfo>>,
}

impl ImRegistry {
    pub fn new() -> Self {
        Self { channels: Mutex::new(HashMap::new()) }
    }

    pub fn register(&self, id: String, info: ImChannelInfo) {
        if let Ok(mut channels) = self.channels.lock() {
            channels.insert(id, info);
        }
    }

    pub fn get(&self, id: &str) -> Option<ImChannelInfo> {
        self.channels.lock().ok()?.get(id).cloned()
    }

    pub fn list(&self) -> Vec<ImChannelInfo> {
        self.channels.lock().map(|m| m.values().cloned().collect()).unwrap_or_default()
    }

    pub fn update_status(&self, id: &str, status: ImChannelStatus, error: Option<String>) {
        if let Ok(mut channels) = self.channels.lock() {
            if let Some(ch) = channels.get_mut(id) {
                ch.status = status;
                ch.last_error = error;
                if status == ImChannelStatus::Connected {
                    ch.connected_at_ms = Some(chrono::Utc::now().timestamp_millis());
                }
            }
        }
    }

    pub fn remove(&self, id: &str) -> Option<ImChannelInfo> {
        self.channels.lock().ok()?.remove(id)
    }
}

/// IM 通道连接配置
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ImChannelConfig {
    pub channel_type: String,
    pub name: String,
    pub app_id: Option<String>,
    pub app_secret: Option<String>,
    pub webhook_url: Option<String>,
    pub extra: Option<HashMap<String, String>>,
}

/// IM 消息
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ImMessage {
    pub channel_id: String,
    pub target: String,
    pub content: String,
    pub message_type: String,
}

/// 飞书通道辅助函数
pub mod feishu {
    use super::*;

    pub fn create_config(app_id: String, app_secret: String) -> ImChannelConfig {
        ImChannelConfig {
            channel_type: "feishu".into(),
            name: "飞书".into(),
            app_id: Some(app_id),
            app_secret: Some(app_secret),
            webhook_url: None,
            extra: None,
        }
    }

    pub fn validate_config(config: &ImChannelConfig) -> Result<(), String> {
        if config.app_id.as_deref().map_or(true, str::is_empty) {
            return Err("飞书 App ID 不能为空".into());
        }
        if config.app_secret.as_deref().map_or(true, str::is_empty) {
            return Err("飞书 App Secret 不能为空".into());
        }
        Ok(())
    }
}

// ===== 飞书网关启动状态 =====

/// 飞书网关句柄（保存 JoinHandle 以便停止）
pub struct FeishuGatewayHandle {
    pub shutdown_tx: tokio::sync::watch::Sender<bool>,
}

pub struct FeishuGatewayState {
    pub handle: Mutex<Option<FeishuGatewayHandle>>,
    pub inbound_rx: Mutex<Option<tokio::sync::mpsc::Receiver<InboundMessage>>>,
    pub outbound_tx: Mutex<Option<tokio::sync::mpsc::Sender<OutboundMessage>>>,
}

impl FeishuGatewayState {
    pub fn new() -> Self {
        Self {
            handle: Mutex::new(None),
            inbound_rx: Mutex::new(None),
            outbound_tx: Mutex::new(None),
        }
    }
}

// ===== IM 网关复合状态 =====

/// IM 网关主状态（Tauri 托管）
pub struct ImGatewayComposite {
    pub registry: ImRegistry,
    pub feishu_gw: FeishuGatewayState,
}

impl ImGatewayComposite {
    pub fn new() -> Self {
        Self {
            registry: ImRegistry::new(),
            feishu_gw: FeishuGatewayState::new(),
        }
    }
}

// ===== Tauri 命令 =====

/// 列出所有已注册的 IM 通道
#[tauri::command]
#[specta::specta]
pub fn im_channel_list(
    state: tauri::State<'_, ImGatewayComposite>,
) -> Vec<ImChannelInfo> {
    state.registry.list()
}

/// 注册并连接飞书 IM 通道（真实 WebSocket）
#[tauri::command]
#[specta::specta]
pub async fn im_channel_connect(
    config: FeishuConfigDto,
    state: tauri::State<'_, ImGatewayComposite>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    let channel_id = format!("feishu_{}", chrono::Utc::now().timestamp_millis());

    // 注册通道
    state.registry.register(channel_id.clone(), ImChannelInfo {
        id: channel_id.clone(),
        name: "飞书".into(),
        channel_type: "feishu".into(),
        status: ImChannelStatus::Connecting,
        connected_at_ms: None,
        last_error: None,
        messages_received: 0,
        messages_sent: 0,
    });

    // 创建消息通道
    let (tx_inbound, rx_inbound) = tokio::sync::mpsc::channel::<InboundMessage>(256);
    let (tx_outbound, mut rx_outbound) = tokio::sync::mpsc::channel::<OutboundMessage>(256);
    let (tx_shutdown, mut rx_shutdown) = tokio::sync::watch::channel(false);

    // 创建飞书 WS 配置
    let ws_config = FeishuWsConfig {
        app_id: config.app_id.clone(),
        app_secret: config.app_secret.clone(),
        ..Default::default()
    };

    let channel_id_clone = channel_id.clone();
    let registry_clone = state.registry.clone();

    // 启动飞书 WebSocket 连接任务
    let ws_client = FeishuWsClient::new(ws_config, tx_inbound, channel_id.clone());

    tokio::spawn(async move {
        // 飞书 WS 连接任务
        let tx_outbound_inner = tx_outbound.clone();
        let channel_id_inner = channel_id_clone.clone();

        // 入站消息处理：打印日志 + 回复 stub
        let mut inbound = rx_inbound;
        let processor = StubProcessor;

        loop {
            tokio::select! {
                // 接收入站消息
                Some(msg) = inbound.recv() => {
                    log::info!("[IM Gateway] 收到入站消息 from {}: {}", msg.sender_name, msg.content);
                    registry_clone.update_status(&channel_id_inner, ImChannelStatus::Connected, None);

                    // 处理消息
                    match processor.process(&msg, None).await {
                        Ok(outbound) => {
                            if let Err(e) = tx_outbound_inner.send(outbound).await {
                                log::warn!("[IM Gateway] 出站消息发送失败: {}", e);
                            }
                        }
                        Err(e) => {
                            log::error!("[IM Gateway] 消息处理失败: {}", e);
                        }
                    }
                }
                // 接收 shutdown 信号
                _ = rx_shutdown.changed() => {
                    if *rx_shutdown.borrow() {
                        log::info!("[IM Gateway] 收到停止信号");
                        break;
                    }
                }
                else => break,
            }
        }
    });

    // 启动飞书 WS 连接
    let ws_handle = FeishuWsClient::new(
        FeishuWsConfig {
            app_id: config.app_id,
            app_secret: config.app_secret,
            ..Default::default()
        },
        state.registry.channels.lock().map(|_| tx_outbound).unwrap_or_else(|_| {
            // 创建新的 sender（用于实际 WS 入站处理）
            let (tx, _) = tokio::sync::mpsc::channel(1);
            tx
        }),
        channel_id.clone(),
    );

    // 存储 handle
    if let Ok(mut handle) = state.feishu_gw.handle.lock() {
        *handle = Some(FeishuGatewayHandle { shutdown_tx: tx_shutdown });
    }

    log::info!("[IM Gateway] 飞书通道 {} 已启动", channel_id);

    // 更新注册表为已连接
    state.registry.update_status(&channel_id, ImChannelStatus::Connecting, None);

    Ok(channel_id)
}

/// 断开 IM 通道
#[tauri::command]
#[specta::specta]
pub fn im_channel_disconnect(
    channel_id: String,
    state: tauri::State<'_, ImGatewayComposite>,
) -> Result<(), String> {
    // 发送 shutdown 信号
    if let Ok(mut handle_opt) = state.feishu_gw.handle.lock() {
        if let Some(handle) = handle_opt.take() {
            let _ = handle.shutdown_tx.send(true);
        }
    }
    state.registry.update_status(&channel_id, ImChannelStatus::Disconnected, None);
    Ok(())
}

/// 获取通道状态
#[tauri::command]
#[specta::specta]
pub fn im_channel_status(
    channel_id: String,
    state: tauri::State<'_, ImGatewayComposite>,
) -> Result<ImChannelInfo, String> {
    state.registry.get(&channel_id)
        .ok_or_else(|| format!("通道不存在: {}", channel_id))
}

/// 通过通道发送消息
#[tauri::command]
#[specta::specta]
pub fn im_channel_send(
    message: ImMessage,
    state: tauri::State<'_, ImGatewayComposite>,
) -> Result<(), String> {
    let channel = state.registry.get(&message.channel_id)
        .ok_or_else(|| format!("通道不存在: {}", message.channel_id))?;

    if channel.status != ImChannelStatus::Connected {
        return Err("通道未连接".into());
    }

    log::info!(
        "[IM] 通过 {:?} 发送到 {}: {}",
        channel.channel_type,
        message.target,
        message.content
    );

    // 实际发送需要根据通道类型调用不同 API
    // 此处为 MVP 占位
    Ok(())
}

/// 列出最近的入站消息历史
#[tauri::command]
#[specta::specta]
pub fn im_channel_history(
    channel_id: String,
    _state: tauri::State<'_, ImGatewayComposite>,
) -> Vec<InboundMessageDto> {
    // MVP：返回空列表（实际实现需要持久化消息历史）
    let _ = channel_id;
    vec![]
}

impl Clone for ImRegistry {
    fn clone(&self) -> Self {
        Self {
            channels: Mutex::new(self.channels.lock().map(|m| m.clone()).unwrap_or_default()),
        }
    }
}
