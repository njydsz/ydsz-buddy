//! # WebSocket 连接管理模块
//!
//! 本模块管理所有 WebSocket 连接的生命周期，包括连接注册、移除、消息收发和通知推送。
//!
//! ## 核心组件
//!
//! - [`WebSocketConnection`] - 单个 WebSocket 连接的封装，提供消息发送能力
//! - [`WebSocketManager`] - 连接管理器，维护所有活跃连接，提供广播和定向推送功能
//!
//! ## 消息处理流程
//!
//! 1. 客户端发送文本消息 → 解析为 [`JsonRpcRequest`] → 通过 [`RpcRouter`] 路由到对应处理器
//! 2. 处理器返回结果 → 封装为 [`JsonRpcResponse`] → 发送回客户端
//! 3. 服务端主动推送 → 封装为 [`JsonRpcNotification`] → 广播或定向发送到客户端

use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::ws::Message;
use tokio::sync::{broadcast, mpsc, RwLock};
use tracing::{debug, error, info, warn};

use crate::error::{ServerError, ServerResult};
use crate::rpc::{JsonRpcNotification, JsonRpcRequest, JsonRpcResponse, RpcRouter};

/// WebSocket 连接 ID 类型
///
/// 使用 UUID 字符串作为连接的唯一标识符
pub type ConnectionId = String;

/// WebSocket 连接封装
///
/// 封装单个 WebSocket 连接，提供消息发送能力。
/// 通过内部的 `mpsc::Sender` 向客户端发送消息，实现异步非阻塞发送。
pub struct WebSocketConnection {
    /// 连接唯一标识符
    pub id: ConnectionId,
    /// 消息发送通道，与服务器端的发送任务对接
    tx: mpsc::Sender<Message>,
}

impl WebSocketConnection {
    /// 发送原始 WebSocket 消息
    ///
    /// # 参数
    ///
    /// - `message`: 要发送的 WebSocket 消息
    ///
    /// # 错误
    ///
    /// 当发送通道关闭时返回 [`ServerError::WebSocketError`]
    pub async fn send(&self, message: Message) -> ServerResult<()> {
        self.tx
            .send(message)
            .await
            .map_err(|e| ServerError::WebSocketError(e.to_string()))
    }

    /// 发送 JSON-RPC 响应
    ///
    /// 将响应序列化为 JSON 字符串并通过 WebSocket 发送。
    ///
    /// # 参数
    ///
    /// - `response`: JSON-RPC 响应对象
    ///
    /// # 错误
    ///
    /// 序列化失败或发送通道关闭时返回错误
    pub async fn send_response(&self, response: JsonRpcResponse) -> ServerResult<()> {
        let json = serde_json::to_string(&response)
            .map_err(|e| ServerError::WebSocketError(e.to_string()))?;
        self.send(Message::Text(json)).await
    }

    /// 发送 JSON-RPC 通知
    ///
    /// 将通知序列化为 JSON 字符串并通过 WebSocket 发送。
    ///
    /// # 参数
    ///
    /// - `notification`: JSON-RPC 通知对象
    ///
    /// # 错误
    ///
    /// 序列化失败或发送通道关闭时返回错误
    pub async fn send_notification(&self, notification: JsonRpcNotification) -> ServerResult<()> {
        let json = serde_json::to_string(&notification)
            .map_err(|e| ServerError::WebSocketError(e.to_string()))?;
        self.send(Message::Text(json)).await
    }
}

/// WebSocket 连接管理器
///
/// 维护所有活跃的 WebSocket 连接，提供连接注册/移除、消息处理、
/// 广播通知和定向推送等功能。
///
/// 内部使用 `RwLock<HashMap>` 保证并发安全，`broadcast` 通道用于通知分发。
pub struct WebSocketManager {
    /// 活跃连接池，键为连接 ID，值为连接引用
    connections: Arc<RwLock<HashMap<ConnectionId, Arc<WebSocketConnection>>>>,
    /// RPC 路由器，用于将客户端请求分发到对应的处理器
    router: Arc<RpcRouter>,
    /// 通知广播发送端，用于发布 (通道名, 通知) 元组
    notification_tx: broadcast::Sender<(String, JsonRpcNotification)>,
}

impl WebSocketManager {
    /// 创建新的连接管理器
    ///
    /// # 参数
    ///
    /// - `router`: RPC 路由器实例，用于处理客户端请求
    pub fn new(router: Arc<RpcRouter>) -> Self {
        let (notification_tx, _) = broadcast::channel(10000);

        Self {
            connections: Arc::new(RwLock::new(HashMap::new())),
            router,
            notification_tx,
        }
    }

    /// 注册新连接
    ///
    /// 将新连接添加到连接池中，返回连接的引用供后续使用。
    ///
    /// # 参数
    ///
    /// - `id`: 连接唯一标识符
    /// - `tx`: 消息发送通道，与服务器端的发送任务对接
    ///
    /// # 返回值
    ///
    /// 返回新创建的连接引用
    pub async fn register_connection(
        &self,
        id: ConnectionId,
        tx: mpsc::Sender<Message>,
    ) -> Arc<WebSocketConnection> {
        info!("注册 WebSocket 连接: {}", id);

        let connection = Arc::new(WebSocketConnection { id: id.clone(), tx });

        let mut connections = self.connections.write().await;
        connections.insert(id, connection.clone());

        connection
    }

    /// 移除连接
    ///
    /// 从连接池中移除指定 ID 的连接，释放相关资源。
    ///
    /// # 参数
    ///
    /// - `id`: 要移除的连接 ID
    pub async fn remove_connection(&self, id: &str) {
        info!("移除 WebSocket 连接: {}", id);

        let mut connections = self.connections.write().await;
        connections.remove(id);
    }

    /// 处理 WebSocket 消息
    ///
    /// 根据消息类型进行不同的处理：
    /// - **Text**：解析为 JSON-RPC 请求，通过路由器处理后返回响应
    /// - **Binary**：当前不支持，记录警告日志
    /// - **Ping/Pong**：由 tungstenite 库自动处理
    /// - **Close**：记录关闭信息
    ///
    /// # 参数
    ///
    /// - `connection`: 发送消息的连接引用
    /// - `message`: 接收到的 WebSocket 消息
    ///
    /// # 错误
    ///
    /// JSON 解析失败或响应发送失败时返回错误
    pub async fn handle_message(
        &self,
        connection: &WebSocketConnection,
        message: Message,
    ) -> ServerResult<()> {
        match message {
            Message::Text(text) => {
                debug!("收到 WebSocket 文本消息: {}", text);

                // 解析 JSON-RPC 请求
                let request: JsonRpcRequest = serde_json::from_str(&text)
                    .map_err(|e| ServerError::WebSocketError(e.to_string()))?;

                // 处理请求
                let response = self.router.handle_request(request).await;

                // 发送响应
                connection.send_response(response).await?;
            }
            Message::Binary(_data) => {
                warn!("收到不支持的二进制消息");
            }
            Message::Ping(_data) => {
                debug!("收到 Ping 消息");
                // 自动回复 Pong（由 tungstenite 处理）
            }
            Message::Pong(_) => {
                debug!("收到 Pong 消息");
            }
            Message::Close(frame) => {
                info!("收到 Close 消息: {:?}", frame);
            }
        }

        Ok(())
    }

    /// 广播通知到所有活跃连接
    ///
    /// 向所有已注册的 WebSocket 连接发送同一通知。
    /// 如果某个连接发送失败，记录错误日志但继续向其他连接发送。
    ///
    /// # 参数
    ///
    /// - `notification`: 要广播的 JSON-RPC 通知
    pub async fn broadcast_notification(&self, notification: JsonRpcNotification) -> ServerResult<()> {
        let connections = self.connections.read().await;

        for (id, connection) in connections.iter() {
            if let Err(e) = connection.send_notification(notification.clone()).await {
                error!("广播通知到连接 {} 失败: {}", id, e);
            }
        }

        Ok(())
    }

    /// 发送通知到指定连接
    ///
    /// 向指定 ID 的连接发送通知，用于定向推送场景。
    ///
    /// # 参数
    ///
    /// - `connection_id`: 目标连接 ID
    /// - `notification`: 要发送的 JSON-RPC 通知
    ///
    /// # 错误
    ///
    /// 连接不存在时返回 [`ServerError::WebSocketError`]
    pub async fn send_notification_to(
        &self,
        connection_id: &str,
        notification: JsonRpcNotification,
    ) -> ServerResult<()> {
        let connections = self.connections.read().await;

        match connections.get(connection_id) {
            Some(connection) => connection.send_notification(notification).await,
            None => Err(ServerError::WebSocketError(format!(
                "Connection not found: {}",
                connection_id
            ))),
        }
    }

    /// 订阅通知广播
    ///
    /// 返回通知广播的接收端，可用于监听所有发布的通知。
    ///
    /// # 返回值
    ///
    /// 返回 broadcast 通道的接收端，接收 `(通道名, 通知)` 元组
    pub fn subscribe_notifications(
        &self,
    ) -> broadcast::Receiver<(String, JsonRpcNotification)> {
        self.notification_tx.subscribe()
    }

    /// 发布通知到广播通道
    ///
    /// 将通知发布到内部的 broadcast 通道，所有订阅者都会收到。
    ///
    /// # 参数
    ///
    /// - `channel`: 通道名称
    /// - `notification`: 要发布的通知
    pub fn publish_notification(&self, channel: String, notification: JsonRpcNotification) {
        let _ = self.notification_tx.send((channel, notification));
    }

    /// 获取当前活跃连接数
    pub async fn connection_count(&self) -> usize {
        let connections = self.connections.read().await;
        connections.len()
    }

    /// 获取所有活跃连接的 ID 列表
    pub async fn list_connections(&self) -> Vec<ConnectionId> {
        let connections = self.connections.read().await;
        connections.keys().cloned().collect()
    }
}

