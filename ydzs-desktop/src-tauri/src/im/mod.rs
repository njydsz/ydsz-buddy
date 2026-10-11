//! # IM 通道集成框架
//!
//! 提供外部消息系统（飞书/钉钉/企微等）接入的通道框架。
//!
//! ## 架构
//!
//! - `ImChannel` trait: 定义通道的统一接口（连接/断开/收发消息）
//! - `ImRegistry`: 通道注册表，管理所有已注册的通道实例
//! - `feishu`: 飞书通道实现（第一版示例）

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};
use tracing::{info, warn, error};

/// IM 通道连接配置
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ImChannelConfig {
    /// 通道类型标识（feishu / dingtalk / wecom 等）
    pub channel_type: String,
    /// 飞书 App ID
    pub app_id: Option<String>,
    /// 飞书 App Secret
    pub app_secret: Option<String>,
    /// 接收频道过滤规则（为空表示接收所有）
    pub channel_filters: Option<Vec<String>>,
}

/// IM 通道信息
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ImChannelInfo {
    pub id: String,
    pub channel_type: String,
    pub display_name: String,
    pub status: ImChannelStatus,
}

/// IM 通道状态
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ImChannelStatus {
    pub id: String,
    pub connected: bool,
    pub last_connected_at: Option<String>,
    pub error: Option<String>,
}

/// IM 消息
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ImMessage {
    pub id: String,
    pub sender_id: String,
    pub sender_name: Option<String>,
    pub channel_id: String,
    pub text: String,
    pub message_type: String,
    pub timestamp: String,
}

/// ImChannel trait — IM 通道统一接口
///
/// 所有 IM 通道（飞书/钉钉/企微）需实现此 trait 以接入框架
pub trait ImChannel: Send + Sync {
    /// 获取通道类型标识
    fn channel_type(&self) -> &str;

    /// 获取显示名称
    fn display_name(&self) -> &str;

    /// 连接到 IM 服务
    fn connect(&mut self, config: ImChannelConfig) -> Result<(), String>;

    /// 断开连接
    fn disconnect(&mut self) -> Result<(), String>;

    /// 获取当前连接状态
    fn status(&self) -> ImChannelStatus;

    /// 发送消息到指定频道
    fn send(&self, channel_id: &str, message: &ImMessage) -> Result<(), String>;
}

/// IM 通道注册表状态
#[derive(Default, Clone)]
pub struct ImRegistryState {
    inner: Arc<Mutex<ImRegistryInner>>,
}

#[derive(Default)]
struct ImRegistryInner {
    channels: HashMap<String, Box<dyn ImChannel>>,
}

impl ImRegistryState {
    pub fn new() -> Self {
        Self::default()
    }

    /// 注册通道
    pub fn register(&self, id: String, channel: Box<dyn ImChannel>) -> Result<(), String> {
        let mut inner = self.inner.lock().map_err(|e| e.to_string())?;
        info!("注册 IM 通道: {} ({})", id, channel.display_name());
        inner.channels.insert(id, channel);
        Ok(())
    }

    /// 列出所有已注册的通道信息
    pub fn list(&self) -> Result<Vec<ImChannelInfo>, String> {
        let inner = self.inner.lock().map_err(|e| e.to_string())?;
        let infos = inner
            .channels
            .iter()
            .map(|(id, ch)| ImChannelInfo {
                id: id.clone(),
                channel_type: ch.channel_type().to_string(),
                display_name: ch.display_name().to_string(),
                status: ch.status(),
            })
            .collect();
        Ok(infos)
    }

    /// 连接指定通道
    pub fn connect(&self, id: &str, config: ImChannelConfig) -> Result<(), String> {
        let mut inner = self.inner.lock().map_err(|e| e.to_string())?;
        let channel = inner
            .channels
            .get_mut(id)
            .ok_or_else(|| format!("通道不存在: {}", id))?;
        channel.connect(config)
    }

    /// 断开指定通道
    pub fn disconnect(&self, id: &str) -> Result<(), String> {
        let mut inner = self.inner.lock().map_err(|e| e.to_string())?;
        let channel = inner
            .channels
            .get_mut(id)
            .ok_or_else(|| format!("通道不存在: {}", id))?;
        channel.disconnect()
    }

    /// 获取通道状态
    pub fn status(&self, id: &str) -> Result<ImChannelStatus, String> {
        let inner = self.inner.lock().map_err(|e| e.to_string())?;
        let channel = inner
            .channels
            .get(id)
            .ok_or_else(|| format!("通道不存在: {}", id))?;
        Ok(channel.status())
    }

    /// 发送消息
    pub fn send(&self, id: &str, message: ImMessage) -> Result<(), String> {
        let inner = self.inner.lock().map_err(|e| e.to_string())?;
        let channel = inner
            .channels
            .get(id)
            .ok_or_else(|| format!("通道不存在: {}", id))?;
        let channel_id = &message.channel_id;
        channel.send(channel_id, &message)
    }
}

pub mod feishu;
