//! WebSocket 连接管理

use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::ws::Message;
use tokio::sync::{broadcast, mpsc, RwLock};
use tracing::{debug, error, info, warn};

use crate::error::{ServerError, ServerResult};
use crate::rpc::{JsonRpcNotification, JsonRpcRequest, JsonRpcResponse, RpcRouter};

/// WebSocket 连接 ID
pub type ConnectionId = String;

/// WebSocket 连接
pub struct WebSocketConnection {
    /// 连接 ID
    pub id: ConnectionId,
    /// 发送通道
    tx: mpsc::Sender<Message>,
}

impl WebSocketConnection {
    /// 发送消息
    pub async fn send(&self, message: Message) -> ServerResult<()> {
        self.tx
            .send(message)
            .await
            .map_err(|e| ServerError::WebSocketError(e.to_string()))
    }

    /// 发送 JSON-RPC 响应
    pub async fn send_response(&self, response: JsonRpcResponse) -> ServerResult<()> {
        let json = serde_json::to_string(&response)
            .map_err(|e| ServerError::WebSocketError(e.to_string()))?;
        self.send(Message::Text(json)).await
    }

    /// 发送 JSON-RPC 通知
    pub async fn send_notification(&self, notification: JsonRpcNotification) -> ServerResult<()> {
        let json = serde_json::to_string(&notification)
            .map_err(|e| ServerError::WebSocketError(e.to_string()))?;
        self.send(Message::Text(json)).await
    }
}

/// WebSocket 连接管理器
pub struct WebSocketManager {
    connections: Arc<RwLock<HashMap<ConnectionId, Arc<WebSocketConnection>>>>,
    router: Arc<RpcRouter>,
    notification_tx: broadcast::Sender<(String, JsonRpcNotification)>,
}

impl WebSocketManager {
    /// 创建新的连接管理器
    pub fn new(router: Arc<RpcRouter>) -> Self {
        let (notification_tx, _) = broadcast::channel(10000);

        Self {
            connections: Arc::new(RwLock::new(HashMap::new())),
            router,
            notification_tx,
        }
    }

    /// 注册连接
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
    pub async fn remove_connection(&self, id: &str) {
        info!("移除 WebSocket 连接: {}", id);

        let mut connections = self.connections.write().await;
        connections.remove(id);
    }

    /// 处理 WebSocket 消息
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

    /// 广播通知到所有连接
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

    /// 订阅通知
    pub fn subscribe_notifications(
        &self,
    ) -> broadcast::Receiver<(String, JsonRpcNotification)> {
        self.notification_tx.subscribe()
    }

    /// 发布通知
    pub fn publish_notification(&self, channel: String, notification: JsonRpcNotification) {
        let _ = self.notification_tx.send((channel, notification));
    }

    /// 获取连接数
    pub async fn connection_count(&self) -> usize {
        let connections = self.connections.read().await;
        connections.len()
    }

    /// 获取所有连接 ID
    pub async fn list_connections(&self) -> Vec<ConnectionId> {
        let connections = self.connections.read().await;
        connections.keys().cloned().collect()
    }
}
