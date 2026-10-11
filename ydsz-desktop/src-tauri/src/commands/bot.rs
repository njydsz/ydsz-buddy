//! Multi-channel Bot Integration (P0-4)
//!
//! Webhook-based bot abstraction layer for Feishu, Telegram,
//! WeChat, and generic webhook channels.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::State;

/// Bot channel configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BotChannel {
    pub id: String,
    pub name: String,
    pub channel_type: String,
    pub enabled: bool,
    pub webhook_token: Option<String>,
    pub app_id: Option<String>,
    pub app_secret: Option<String>,
    pub bot_token: Option<String>,
    pub created_at: String,
}

/// Incoming message from any channel
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BotMessage {
    pub channel_id: String,
    pub message_id: String,
    pub sender: String,
    pub content: String,
    pub timestamp: String,
}

/// Bot reply to be sent back
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BotReply {
    pub message_id: String,
    pub reply_content: String,
    pub channel_id: String,
}

/// Bot engine state
pub struct BotState {
    pub channels: Mutex<HashMap<String, BotChannel>>,
    pub message_queue: Mutex<Vec<BotMessage>>,
    pub reply_queue: Mutex<Vec<BotReply>>,
}

impl BotState {
    pub fn new() -> Self {
        Self {
            channels: Mutex::new(HashMap::new()),
            message_queue: Mutex::new(Vec::new()),
            reply_queue: Mutex::new(Vec::new()),
        }
    }
}

impl Default for BotState {
    fn default() -> Self {
        Self::new()
    }
}

/// Request to create a bot channel
#[derive(Debug, Deserialize)]
pub struct CreateBotChannelRequest {
    pub name: String,
    pub channel_type: String,
    pub webhook_token: Option<String>,
    pub app_id: Option<String>,
    pub app_secret: Option<String>,
    pub bot_token: Option<String>,
}

/// Incoming webhook payload
#[derive(Debug, Deserialize)]
pub struct WebhookPayload {
    pub channel_id: String,
    pub sender: String,
    pub content: String,
    pub timestamp: Option<String>,
}

/// Webhook response
#[derive(Debug, Serialize)]
pub struct WebhookResponse {
    pub success: bool,
    pub message: String,
    pub task_id: Option<String>,
}

/// List all bot channels
#[tauri::command]
pub fn bot_channel_list(state: State<'_, BotState>) -> Result<Vec<BotChannel>, String> {
    let channels = state.channels.lock().map_err(|e| e.to_string())?;
    Ok(channels.values().cloned().collect())
}

/// Create a bot channel
#[tauri::command]
pub fn bot_channel_create(
    state: State<'_, BotState>,
    request: CreateBotChannelRequest,
) -> Result<BotChannel, String> {
    let mut channels = state.channels.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let channel = BotChannel {
        id: id.clone(),
        name: request.name,
        channel_type: request.channel_type,
        enabled: true,
        webhook_token: request.webhook_token,
        app_id: request.app_id,
        app_secret: request.app_secret,
        bot_token: request.bot_token,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    channels.insert(id, channel.clone());
    Ok(channel)
}

/// Toggle channel enabled/disabled
#[tauri::command]
pub fn bot_channel_toggle(
    state: State<'_, BotState>,
    channel_id: String,
    enabled: bool,
) -> Result<(), String> {
    let mut channels = state.channels.lock().map_err(|e| e.to_string())?;
    if let Some(ch) = channels.get_mut(&channel_id) {
        ch.enabled = enabled;
        Ok(())
    } else {
        Err(format!("Channel {} not found", channel_id))
    }
}

/// Delete a channel
#[tauri::command]
pub fn bot_channel_delete(
    state: State<'_, BotState>,
    channel_id: String,
) -> Result<(), String> {
    let mut channels = state.channels.lock().map_err(|e| e.to_string())?;
    channels.remove(&channel_id);
    Ok(())
}

/// Receive message from external channel
#[tauri::command]
pub fn bot_message_receive(
    state: State<'_, BotState>,
    payload: WebhookPayload,
) -> Result<WebhookResponse, String> {
    let channels = state.channels.lock().map_err(|e| e.to_string())?;
    if let Some(ch) = channels.get(&payload.channel_id) {
        if !ch.enabled {
            return Ok(WebhookResponse {
                success: false,
                message: "Channel is disabled".to_string(),
                task_id: None,
            });
        }
    } else {
        return Ok(WebhookResponse {
            success: false,
            message: "Channel not found".to_string(),
            task_id: None,
        });
    }
    drop(channels);

    let mut queue = state.message_queue.lock().map_err(|e| e.to_string())?;
    let message_id = uuid::Uuid::new_v4().to_string();
    queue.push(BotMessage {
        channel_id: payload.channel_id,
        message_id: message_id.clone(),
        sender: payload.sender,
        content: payload.content,
        timestamp: payload.timestamp.unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
    });

    Ok(WebhookResponse {
        success: true,
        message: "Message queued".to_string(),
        task_id: Some(message_id),
    })
}

/// Poll pending messages for Agent processing
#[tauri::command]
pub fn bot_message_poll(state: State<'_, BotState>) -> Result<Vec<BotMessage>, String> {
    let mut queue = state.message_queue.lock().map_err(|e| e.to_string())?;
    if queue.is_empty() {
        Ok(Vec::new())
    } else {
        Ok(queue.drain(..).collect())
    }
}

/// Send reply back to channel
#[tauri::command]
pub fn bot_reply_send(
    state: State<'_, BotState>,
    channel_id: String,
    message_id: String,
    reply_content: String,
) -> Result<(), String> {
    let mut replies = state.reply_queue.lock().map_err(|e| e.to_string())?;
    replies.push(BotReply {
        message_id,
        reply_content,
        channel_id,
    });
    Ok(())
}

/// Poll pending replies for external push
#[tauri::command]
pub fn bot_reply_poll(state: State<'_, BotState>) -> Result<Vec<BotReply>, String> {
    let mut replies = state.reply_queue.lock().map_err(|e| e.to_string())?;
    if replies.is_empty() {
        Ok(Vec::new())
    } else {
        Ok(replies.drain(..).collect())
    }
}
