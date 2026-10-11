//! # IM 通道 Tauri 命令模块
//!
//! 提供前端调用 IM 通道框架的 Tauri 命令接口。
//! 包括通道列表、连接、断开、状态查询和发送消息。

use tauri::State;
use crate::im::{ImChannelConfig, ImMessage, ImRegistryState, feishu::FeishuChannel};

/// 初始化 IM 注册表，注册飞书通道
fn init_registry(state: &ImRegistryState) {
    let _ = state.register("feishu".to_string(), Box::new(FeishuChannel::new()));
}

/// 列出所有可用 IM 通道
///
/// 前端通过此命令获取所有已注册的 IM 通道信息（ID、类型、名称、状态）。
#[tauri::command]
#[specta::specta]
pub async fn im_channel_list(
    state: State<'_, ImRegistryState>,
) -> Result<Vec<crate::im::ImChannelInfo>, String> {
    init_registry(&state);
    state.list()
}

/// 连接 IM 通道
///
/// 根据通道 ID 和配置连接到指定 IM 服务。
/// 第一版仅支持飞书通道。
#[tauri::command]
#[specta::specta]
pub async fn im_channel_connect(
    state: State<'_, ImRegistryState>,
    config: ImChannelConfig,
) -> Result<(), String> {
    init_registry(&state);
    // 根据 channel_type 确定通道 ID
    let channel_id = config.channel_type.clone();
    state.connect(&channel_id, config)
}

/// 断开 IM 通道
///
/// 根据通道 ID 断开已连接的 IM 通道。
#[tauri::command]
#[specta::specta]
pub async fn im_channel_disconnect(
    state: State<'_, ImRegistryState>,
    channel_id: String,
) -> Result<(), String> {
    state.disconnect(&channel_id)
}

/// 获取 IM 通道状态
///
/// 根据通道 ID 获取当前连接状态（是否连接、上次连接时间、错误信息）。
#[tauri::command]
#[specta::specta]
pub async fn im_channel_status(
    state: State<'_, ImRegistryState>,
    channel_id: String,
) -> Result<crate::im::ImChannelStatus, String> {
    state.status(&channel_id)
}

/// 通过 IM 通道发送消息
///
/// 根据通道 ID 和消息内容发送消息到指定频道。
#[tauri::command]
#[specta::specta]
pub async fn im_channel_send(
    state: State<'_, ImRegistryState>,
    channel_id: String,
    message: ImMessage,
) -> Result<(), String> {
    state.send(&channel_id, message)
}
