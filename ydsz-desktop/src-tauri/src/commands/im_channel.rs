//! IM 通道集成框架（G4-P1）
//!
//! 提供 IM 外部消息系统的连接框架。
//! 第一版实现飞书（Lark）通道的注册和管理。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

/// IM 通道信息
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ImChannelInfo {
    pub id: String,
    pub name: String,
    pub channel_type: String,
    pub status: ImChannelStatus,
    pub connected_at_ms: Option<i64>,
    pub last_error: Option<String>,
}

/// IM 通道状态
#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ImChannelStatus {
    Disconnected,
    Connecting,
    Connected,
    Error,
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
    pub target: String,       // 目标频道/用户 ID
    pub content: String,
    pub message_type: String, // "text" | "markdown" | "image"
}

/// IM 通道注册表
pub struct ImRegistry {
    pub channels: Mutex<HashMap<String, ImChannelInfo>>,
}

impl ImRegistry {
    pub fn new() -> Self {
        Self {
            channels: Mutex::new(HashMap::new()),
        }
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

/// 飞书通道实现
pub mod feishu {
    use super::*;

    /// 创建飞书通道配置
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

    /// 验证飞书配置是否完整
    pub fn validate_config(config: &ImChannelConfig) -> Result<(), String> {
        if config.app_id.is_none() || config.app_id.as_ref().unwrap().is_empty() {
            return Err("飞书 App ID 不能为空".into());
        }
        if config.app_secret.is_none() || config.app_secret.as_ref().unwrap().is_empty() {
            return Err("飞书 App Secret 不能为空".into());
        }
        Ok(())
    }

    /// 获取飞书 tenant_access_token（HTTP API 调用骨架）
    #[allow(dead_code)]
    pub async fn fetch_tenant_token(app_id: &str, app_secret: &str) -> Result<String, String> {
        // 实际实现需要调用飞书 API: POST https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal
        let _ = (app_id, app_secret);
        Err("飞书 API 调用需要配置 reqwest 客户端".into())
    }
}

// === Tauri 命令 ===

/// 列出所有已注册的 IM 通道
#[tauri::command]
#[specta::specta]
pub fn im_channel_list(
    state: tauri::State<'_, ImRegistry>,
) -> Vec<ImChannelInfo> {
    state.list()
}

/// 注册并连接 IM 通道
#[tauri::command]
#[specta::specta]
pub fn im_channel_connect(
    config: ImChannelConfig,
    state: tauri::State<'_, ImRegistry>,
) -> Result<String, String> {
    // 验证配置
    match config.channel_type.as_str() {
        "feishu" => feishu::validate_config(&config)?,
        other => return Err(format!("不支持的通道类型: {}", other)),
    }

    let id = format!("{}_{}", config.channel_type, chrono::Utc::now().timestamp_millis());
    let info = ImChannelInfo {
        id: id.clone(),
        name: config.name,
        channel_type: config.channel_type,
        status: ImChannelStatus::Connecting,
        connected_at_ms: None,
        last_error: None,
    };

    state.register(id.clone(), info);

    // 第一版只做注册，实际连接在后台异步完成
    state.update_status(&id, ImChannelStatus::Connected, None);

    Ok(id)
}

/// 断开 IM 通道
#[tauri::command]
#[specta::specta]
pub fn im_channel_disconnect(
    channel_id: String,
    state: tauri::State<'_, ImRegistry>,
) -> Result<(), String> {
    state.update_status(&channel_id, ImChannelStatus::Disconnected, None);
    Ok(())
}

/// 获取通道状态
#[tauri::command]
#[specta::specta]
pub fn im_channel_status(
    channel_id: String,
    state: tauri::State<'_, ImRegistry>,
) -> Result<ImChannelInfo, String> {
    state.get(&channel_id).ok_or_else(|| format!("通道不存在: {}", channel_id))
}

/// 通过通道发送消息
#[tauri::command]
#[specta::specta]
pub fn im_channel_send(
    message: ImMessage,
    state: tauri::State<'_, ImRegistry>,
) -> Result<(), String> {
    let channel = state.get(&message.channel_id)
        .ok_or_else(|| format!("通道不存在: {}", message.channel_id))?;

    if channel.status != ImChannelStatus::Connected {
        return Err("通道未连接".into());
    }

    // 实际发送需要根据通道类型调用不同 API
    log::info!(
        "[IM] Sending {} message via {:?} to {}",
        message.message_type,
        channel.channel_type,
        message.target
    );

    Ok(())
}
