//! # WebSocket 推送通道管理模块
//!
//! 本模块实现了基于发布/订阅模式的消息推送通道管理，支持服务器主动向客户端推送事件通知。
//!
//! ## 通道列表
//!
//! 模块预定义了 8 个推送通道，覆盖所有业务域的事件推送需求：
//!
//! | 通道名 | 常量 | 用途 |
//! |--------|------|------|
//! | `orchestration.events` | [`channels::ORCHESTRATION_EVENTS`] | 编排引擎事件（Turn 启动/完成等） |
//! | `provider.status` | [`channels::PROVIDER_STATUS`] | Provider 状态变更通知 |
//! | `git.status` | [`channels::GIT_STATUS`] | Git 仓库状态变更通知 |
//! | `terminal.events` | [`channels::TERMINAL_EVENTS`] | 终端会话事件（输出、退出等） |
//! | `workspace.events` | [`channels::WORKSPACE_EVENTS`] | 工作空间文件变更事件 |
//! | `checkpoint.events` | [`channels::CHECKPOINT_EVENTS`] | 检查点创建/回滚事件 |
//! | `auth.events` | [`channels::AUTH_EVENTS`] | 认证事件（会话创建/撤销等） |
//! | `server.events` | [`channels::SERVER_EVENTS`] | 服务器级别事件 |
//!
//! ## 工作原理
//!
//! 每个通道内部使用 [`tokio::sync::broadcast`] 实现多播，客户端通过 [`PushChannelManager::subscribe`]
//! 订阅通道获取接收端，业务代码通过 [`PushChannelManager::publish`] 或类型化的 `publish_*` 方法发布事件。

use std::collections::HashMap;
use std::sync::Arc;

use serde::Serialize;
use tokio::sync::{broadcast, RwLock};
use tracing::{debug, info};

use crate::rpc::JsonRpcNotification;

/// 推送通道名称常量
///
/// 定义所有预置推送通道的名称，用于订阅和发布时的通道标识。
pub mod channels {
    /// 编排引擎事件通道，用于推送 Turn 启动/完成/中断等事件
    pub const ORCHESTRATION_EVENTS: &str = "orchestration.events";
    /// Provider 状态通道，用于推送 Provider 连接状态变更
    pub const PROVIDER_STATUS: &str = "provider.status";
    /// Git 状态通道，用于推送仓库分支、脏文件等状态变更
    pub const GIT_STATUS: &str = "git.status";
    /// 终端事件通道，用于推送终端输出、退出等事件
    pub const TERMINAL_EVENTS: &str = "terminal.events";
    /// 工作空间事件通道，用于推送文件创建/修改/删除等变更
    pub const WORKSPACE_EVENTS: &str = "workspace.events";
    /// 检查点事件通道，用于推送检查点创建/回滚/删除等事件
    pub const CHECKPOINT_EVENTS: &str = "checkpoint.events";
    /// 认证事件通道，用于推送会话创建/撤销等认证相关事件
    pub const AUTH_EVENTS: &str = "auth.events";
    /// 服务器事件通道，用于推送服务器级别的通知和告警
    pub const SERVER_EVENTS: &str = "server.events";
}

/// 推送事件数据
///
/// 使用 `#[serde(untagged)]` 实现多态序列化，根据实际类型自动选择对应的序列化格式。
/// 客户端可根据通知的 `method` 字段判断事件类型并反序列化为对应的结构体。
#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum PushEvent {
    /// 编排引擎事件，如 Turn 启动、完成、中断等
    Orchestration(OrchestrationEvent),
    /// Provider 状态变更事件，如连接建立/断开
    ProviderStatus(ProviderStatusEvent),
    /// Git 仓库状态变更事件，如分支切换、文件变更
    GitStatus(GitStatusEvent),
    /// 终端会话事件，如终端输出、进程退出
    TerminalEvent(TerminalEvent),
    /// 工作空间文件变更事件，如文件创建/修改/删除
    WorkspaceEvent(WorkspaceEvent),
    /// 检查点事件，如检查点创建/回滚/删除
    CheckpointEvent(CheckpointEvent),
    /// 认证事件，如会话创建/撤销
    AuthEvent(AuthEvent),
    /// 服务器事件，如服务器状态变更、告警通知
    ServerEvent(ServerEvent),
}

/// 编排引擎事件
///
/// 用于通知编排引擎的状态变更，如 Turn 启动、完成、中断等。
#[derive(Debug, Clone, Serialize)]
pub struct OrchestrationEvent {
    /// 事件类型标识，如 "turn_started"、"turn_completed"、"turn_interrupted"
    pub event_type: String,
    /// 事件附加数据，具体结构取决于 event_type
    pub data: serde_json::Value,
}

/// Provider 状态变更事件
///
/// 用于通知 Provider 的连接状态变更。
#[derive(Debug, Clone, Serialize)]
pub struct ProviderStatusEvent {
    /// Provider 名称标识
    pub provider: String,
    /// 当前状态，如 "connected"、"disconnected"、"error"
    pub status: String,
}

/// Git 仓库状态变更事件
///
/// 用于通知 Git 仓库的分支、文件变更等状态。
#[derive(Debug, Clone, Serialize)]
pub struct GitStatusEvent {
    /// 仓库路径
    pub repo_path: String,
    /// 当前分支名
    pub branch: String,
    /// 是否有未提交的变更
    pub dirty: bool,
}

/// 终端会话事件
///
/// 用于通知终端会话的输出、退出等事件。
#[derive(Debug, Clone, Serialize)]
pub struct TerminalEvent {
    /// 终端会话 ID
    pub session_id: String,
    /// 事件类型标识，如 "output"、"exit"、"error"
    pub event_type: String,
    /// 事件附加数据，如终端输出内容、退出码等
    pub data: serde_json::Value,
}

/// 工作空间文件变更事件
///
/// 用于通知工作空间中文件的创建、修改、删除等变更。
#[derive(Debug, Clone, Serialize)]
pub struct WorkspaceEvent {
    /// 事件类型标识，如 "created"、"modified"、"deleted"
    pub event_type: String,
    /// 变更文件的路径
    pub path: String,
}

/// 检查点事件
///
/// 用于通知检查点的创建、回滚、删除等操作。
#[derive(Debug, Clone, Serialize)]
pub struct CheckpointEvent {
    /// 检查点 ID
    pub checkpoint_id: String,
    /// 事件类型标识，如 "created"、"reverted"、"deleted"
    pub event_type: String,
}

/// 认证事件
///
/// 用于通知会话的创建、撤销等认证相关变更。
#[derive(Debug, Clone, Serialize)]
pub struct AuthEvent {
    /// 事件类型标识，如 "session_created"、"session_revoked"
    pub event_type: String,
    /// 关联的会话 ID
    pub session_id: String,
}

/// 服务器级别事件
///
/// 用于通知服务器状态变更、告警等全局性事件。
#[derive(Debug, Clone, Serialize)]
pub struct ServerEvent {
    /// 事件类型标识，如 "status_changed"、"warning"、"error"
    pub event_type: String,
    /// 事件附加数据
    pub data: serde_json::Value,
}

/// 推送通道管理器
///
/// 管理所有推送通道的生命周期，提供通道订阅、事件发布等功能。
/// 内部使用 [`tokio::sync::broadcast`] 实现多播，每个通道容量为 1000 条消息。
///
/// # 示例
///
/// ```ignore
/// let manager = PushChannelManager::new();
///
/// // 订阅通道
/// let mut rx = manager.subscribe(channels::GIT_STATUS).await.unwrap();
///
/// // 发布事件
/// manager.publish_git_status(GitStatusEvent {
///     repo_path: "/path/to/repo".to_string(),
///     branch: "main".to_string(),
///     dirty: false,
/// }).await;
/// ```
pub struct PushChannelManager {
    /// 各个通道的广播发送器，键为通道名称，值为广播发送端
    channels: Arc<RwLock<HashMap<String, broadcast::Sender<JsonRpcNotification>>>>,
}

impl PushChannelManager {
    /// 创建新的推送通道管理器
    ///
    /// 初始化所有预定义的推送通道，每个通道的广播容量为 1000 条消息。
    /// 当消息堆积超过容量时，旧的未消费消息会被丢弃。
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
    ///
    /// # 参数
    ///
    /// - `channel`: 通道名称，应使用 [`channels`] 模块中定义的常量
    ///
    /// # 返回值
    ///
    /// 返回 `Some(Receiver)` 表示订阅成功，返回 `None` 表示通道不存在
    pub async fn subscribe(
        &self,
        channel: &str,
    ) -> Option<broadcast::Receiver<JsonRpcNotification>> {
        let channels = self.channels.read().await;
        channels.get(channel).map(|tx| tx.subscribe())
    }

    /// 发布推送到指定通道
    ///
    /// 将 JSON-RPC 通知发布到指定通道，所有订阅该通道的接收端都会收到此通知。
    /// 如果通道不存在，则静默忽略（不报错）。
    ///
    /// # 参数
    ///
    /// - `channel`: 目标通道名称
    /// - `notification`: 要推送的 JSON-RPC 通知
    pub async fn publish(&self, channel: &str, notification: JsonRpcNotification) {
        let channels = self.channels.read().await;
        if let Some(tx) = channels.get(channel) {
            let _ = tx.send(notification.clone());
            debug!("发布推送到通道 {}: {}", channel, notification.method);
        }
    }

    /// 发布编排引擎事件
    ///
    /// 将编排引擎事件封装为 JSON-RPC 通知并发布到 [`channels::ORCHESTRATION_EVENTS`] 通道。
    pub async fn publish_orchestration_event(&self, event: OrchestrationEvent) {
        let notification = JsonRpcNotification {
            jsonrpc: "2.0".to_string(),
            method: "orchestration.event".to_string(),
            params: Some(serde_json::to_value(&event).unwrap_or_default()),
        };
        self.publish(channels::ORCHESTRATION_EVENTS, notification).await;
    }

    /// 发布 Provider 状态变更
    ///
    /// 将 Provider 状态事件封装为 JSON-RPC 通知并发布到 [`channels::PROVIDER_STATUS`] 通道。
    pub async fn publish_provider_status(&self, event: ProviderStatusEvent) {
        let notification = JsonRpcNotification {
            jsonrpc: "2.0".to_string(),
            method: "provider.status".to_string(),
            params: Some(serde_json::to_value(&event).unwrap_or_default()),
        };
        self.publish(channels::PROVIDER_STATUS, notification).await;
    }

    /// 发布 Git 状态变更
    ///
    /// 将 Git 状态事件封装为 JSON-RPC 通知并发布到 [`channels::GIT_STATUS`] 通道。
    pub async fn publish_git_status(&self, event: GitStatusEvent) {
        let notification = JsonRpcNotification {
            jsonrpc: "2.0".to_string(),
            method: "git.status".to_string(),
            params: Some(serde_json::to_value(&event).unwrap_or_default()),
        };
        self.publish(channels::GIT_STATUS, notification).await;
    }

    /// 发布终端事件
    ///
    /// 将终端事件封装为 JSON-RPC 通知并发布到 [`channels::TERMINAL_EVENTS`] 通道。
    pub async fn publish_terminal_event(&self, event: TerminalEvent) {
        let notification = JsonRpcNotification {
            jsonrpc: "2.0".to_string(),
            method: "terminal.event".to_string(),
            params: Some(serde_json::to_value(&event).unwrap_or_default()),
        };
        self.publish(channels::TERMINAL_EVENTS, notification).await;
    }

    /// 发布工作空间事件
    ///
    /// 将工作空间事件封装为 JSON-RPC 通知并发布到 [`channels::WORKSPACE_EVENTS`] 通道。
    pub async fn publish_workspace_event(&self, event: WorkspaceEvent) {
        let notification = JsonRpcNotification {
            jsonrpc: "2.0".to_string(),
            method: "workspace.event".to_string(),
            params: Some(serde_json::to_value(&event).unwrap_or_default()),
        };
        self.publish(channels::WORKSPACE_EVENTS, notification).await;
    }

    /// 发布检查点事件
    ///
    /// 将检查点事件封装为 JSON-RPC 通知并发布到 [`channels::CHECKPOINT_EVENTS`] 通道。
    pub async fn publish_checkpoint_event(&self, event: CheckpointEvent) {
        let notification = JsonRpcNotification {
            jsonrpc: "2.0".to_string(),
            method: "checkpoint.event".to_string(),
            params: Some(serde_json::to_value(&event).unwrap_or_default()),
        };
        self.publish(channels::CHECKPOINT_EVENTS, notification).await;
    }

    /// 发布认证事件
    ///
    /// 将认证事件封装为 JSON-RPC 通知并发布到 [`channels::AUTH_EVENTS`] 通道。
    pub async fn publish_auth_event(&self, event: AuthEvent) {
        let notification = JsonRpcNotification {
            jsonrpc: "2.0".to_string(),
            method: "auth.event".to_string(),
            params: Some(serde_json::to_value(&event).unwrap_or_default()),
        };
        self.publish(channels::AUTH_EVENTS, notification).await;
    }

    /// 发布服务器事件
    ///
    /// 将服务器事件封装为 JSON-RPC 通知并发布到 [`channels::SERVER_EVENTS`] 通道。
    pub async fn publish_server_event(&self, event: ServerEvent) {
        let notification = JsonRpcNotification {
            jsonrpc: "2.0".to_string(),
            method: "server.event".to_string(),
            params: Some(serde_json::to_value(&event).unwrap_or_default()),
        };
        self.publish(channels::SERVER_EVENTS, notification).await;
    }

    /// 获取所有通道名称
    ///
    /// # 返回值
    ///
    /// 返回当前所有已注册通道的名称列表
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
