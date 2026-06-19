//! WebSocket 推送通道管理
//!
//! 实现 8 个推送通道的订阅和发布功能

use std::collections::HashMap;
use std::sync::Arc;

use serde::Serialize;
use tokio::sync::{broadcast, RwLock};
use tracing::{debug, info};

use crate::rpc::JsonRpcNotification;

/// 推送通道名称
pub mod channels {
    pub const ORCHESTRATION_EVENTS: &str = "orchestration.events";
    pub const PROVIDER_STATUS: &str = "provider.status";
    pub const GIT_STATUS: &str = "git.status";
    pub const TERMINAL_EVENTS: &str = "terminal.events";
    pub const WORKSPACE_EVENTS: &str = "workspace.events";
    pub const CHECKPOINT_EVENTS: &str = "checkpoint.events";
    pub const AUTH_EVENTS: &str = "auth.events";
    pub const SERVER_EVENTS: &str = "server.events";
}

/// 推送事件数据
#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum PushEvent {
    /// 编排事件
    Orchestration(OrchestrationEvent),
    /// Provider 状态
    ProviderStatus(ProviderStatusEvent),
    /// Git 状态
    GitStatus(GitStatusEvent),
    /// 终端事件
    TerminalEvent(TerminalEvent),
    /// 工作空间事件
    WorkspaceEvent(WorkspaceEvent),
    /// 检查点事件
    CheckpointEvent(CheckpointEvent),
    /// 认证事件
    AuthEvent(AuthEvent),
    /// 服务器事件
    ServerEvent(ServerEvent),
}

/// 编排事件
#[derive(Debug, Clone, Serialize)]
pub struct OrchestrationEvent {
    pub event_type: String,
    pub data: serde_json::Value,
}

/// Provider 状态事件
#[derive(Debug, Clone, Serialize)]
pub struct ProviderStatusEvent {
    pub provider: String,
    pub status: String,
}

/// Git 状态事件
#[derive(Debug, Clone, Serialize)]
pub struct GitStatusEvent {
    pub repo_path: String,
    pub branch: String,
    pub dirty: bool,
}

/// 终端事件
#[derive(Debug, Clone, Serialize)]
pub struct TerminalEvent {
    pub session_id: String,
    pub event_type: String,
    pub data: serde_json::Value,
}

/// 工作空间事件
#[derive(Debug, Clone, Serialize)]
pub struct WorkspaceEvent {
    pub event_type: String,
    pub path: String,
}

/// 检查点事件
#[derive(Debug, Clone, Serialize)]
pub struct CheckpointEvent {
    pub checkpoint_id: String,
    pub event_type: String,
}

/// 认证事件
#[derive(Debug, Clone, Serialize)]
pub struct AuthEvent {
    pub event_type: String,
    pub session_id: String,
}

/// 服务器事件
#[derive(Debug, Clone, Serialize)]
pub struct ServerEvent {
    pub event_type: String,
    pub data: serde_json::Value,
}

/// 推送通道管理器
pub struct PushChannelManager {
    /// 各个通道的广播发送器
    channels: Arc<RwLock<HashMap<String, broadcast::Sender<JsonRpcNotification>>>>,
}

impl PushChannelManager {
    /// 创建新的推送通道管理器
    pub fn new() -> Self {
        let channels = Arc::new(RwLock::new(HashMap::new()));

        // 初始化所有通道
        let channel_names = vec![
            channels::ORCHESTRATION_EVENTS,
            channels::PROVIDER_STATUS,
            channels::GIT_STATUS,
            channels::TERMINAL_EVENTS,
            channels::WORKSPACE_EVENTS,
            channels::CHECKPOINT_EVENTS,
            channels::AUTH_EVENTS,
            channels::SERVER_EVENTS,
        ];

        let channel_count = channel_names.len();
        for name in channel_names {
            let (tx, _) = broadcast::channel(1000);
            channels.blocking_write().insert(name.to_string(), tx);
        }

        info!("推送通道管理器初始化完成，共 {} 个通道", channel_count);

        Self { channels }
    }

    /// 订阅推送通道
    pub async fn subscribe(
        &self,
        channel: &str,
    ) -> Option<broadcast::Receiver<JsonRpcNotification>> {
        let channels = self.channels.read().await;
        channels.get(channel).map(|tx| tx.subscribe())
    }

    /// 发布推送到指定通道
    pub async fn publish(&self, channel: &str, notification: JsonRpcNotification) {
        let channels = self.channels.read().await;
        if let Some(tx) = channels.get(channel) {
            let _ = tx.send(notification);
            debug!("发布推送到通道 {}: {}", channel, notification.method);
        }
    }

    /// 发布编排事件
    pub async fn publish_orchestration_event(&self, event: OrchestrationEvent) {
        let notification = JsonRpcNotification {
            jsonrpc: "2.0".to_string(),
            method: "orchestration.event".to_string(),
            params: Some(serde_json::to_value(&event).unwrap_or_default()),
        };
        self.publish(channels::ORCHESTRATION_EVENTS, notification).await;
    }

    /// 发布 Provider 状态
    pub async fn publish_provider_status(&self, event: ProviderStatusEvent) {
        let notification = JsonRpcNotification {
            jsonrpc: "2.0".to_string(),
            method: "provider.status".to_string(),
            params: Some(serde_json::to_value(&event).unwrap_or_default()),
        };
        self.publish(channels::PROVIDER_STATUS, notification).await;
    }

    /// 发布 Git 状态
    pub async fn publish_git_status(&self, event: GitStatusEvent) {
        let notification = JsonRpcNotification {
            jsonrpc: "2.0".to_string(),
            method: "git.status".to_string(),
            params: Some(serde_json::to_value(&event).unwrap_or_default()),
        };
        self.publish(channels::GIT_STATUS, notification).await;
    }

    /// 发布终端事件
    pub async fn publish_terminal_event(&self, event: TerminalEvent) {
        let notification = JsonRpcNotification {
            jsonrpc: "2.0".to_string(),
            method: "terminal.event".to_string(),
            params: Some(serde_json::to_value(&event).unwrap_or_default()),
        };
        self.publish(channels::TERMINAL_EVENTS, notification).await;
    }

    /// 发布工作空间事件
    pub async fn publish_workspace_event(&self, event: WorkspaceEvent) {
        let notification = JsonRpcNotification {
            jsonrpc: "2.0".to_string(),
            method: "workspace.event".to_string(),
            params: Some(serde_json::to_value(&event).unwrap_or_default()),
        };
        self.publish(channels::WORKSPACE_EVENTS, notification).await;
    }

    /// 发布检查点事件
    pub async fn publish_checkpoint_event(&self, event: CheckpointEvent) {
        let notification = JsonRpcNotification {
            jsonrpc: "2.0".to_string(),
            method: "checkpoint.event".to_string(),
            params: Some(serde_json::to_value(&event).unwrap_or_default()),
        };
        self.publish(channels::CHECKPOINT_EVENTS, notification).await;
    }

    /// 发布认证事件
    pub async fn publish_auth_event(&self, event: AuthEvent) {
        let notification = JsonRpcNotification {
            jsonrpc: "2.0".to_string(),
            method: "auth.event".to_string(),
            params: Some(serde_json::to_value(&event).unwrap_or_default()),
        };
        self.publish(channels::AUTH_EVENTS, notification).await;
    }

    /// 发布服务器事件
    pub async fn publish_server_event(&self, event: ServerEvent) {
        let notification = JsonRpcNotification {
            jsonrpc: "2.0".to_string(),
            method: "server.event".to_string(),
            params: Some(serde_json::to_value(&event).unwrap_or_default()),
        };
        self.publish(channels::SERVER_EVENTS, notification).await;
    }

    /// 获取所有通道名称
    pub async fn list_channels(&self) -> Vec<String> {
        let channels = self.channels.read().await;
        channels.keys().cloned().collect()
    }
}

impl Default for PushChannelManager {
    fn default() -> Self {
        Self::new()
    }
}
