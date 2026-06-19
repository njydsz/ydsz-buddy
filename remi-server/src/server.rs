//! WebSocket 服务器

use std::net::SocketAddr;
use std::sync::Arc;

use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use tower_http::cors::{Any, CorsLayer};
use tracing::{error, info};

use crate::error::{ServerError, ServerResult};
use crate::rpc::RpcRouter;
use crate::websocket::WebSocketManager;

/// 服务器状态
pub struct ServerState {
    /// WebSocket 管理器
    pub ws_manager: Arc<WebSocketManager>,
    /// RPC 路由器
    pub rpc_router: Arc<RpcRouter>,
}

/// WebSocket 服务器
pub struct WebSocketServer {
    state: Arc<ServerState>,
    addr: SocketAddr,
}

impl WebSocketServer {
    /// 创建新的 WebSocket 服务器
    pub fn new(addr: SocketAddr, rpc_router: Arc<RpcRouter>) -> Self {
        let ws_manager = Arc::new(WebSocketManager::new(rpc_router.clone()));

        let state = Arc::new(ServerState {
            ws_manager,
            rpc_router,
        });

        Self { state, addr }
    }

    /// 启动服务器
    pub async fn start(&self) -> ServerResult<()> {
        info!("启动 WebSocket 服务器: {}", self.addr);

        let cors = CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any);

        let app = Router::new()
            .route("/ws", get(ws_handler))
            .route("/health", get(health_handler))
            .layer(cors)
            .with_state(self.state.clone());

        let listener = tokio::net::TcpListener::bind(self.addr)
            .await
            .map_err(|e| ServerError::IoError(e))?;

        info!("WebSocket 服务器已启动，监听地址: {}", self.addr);

        axum::serve(listener, app)
            .await
            .map_err(|e| ServerError::IoError(e))?;

        Ok(())
    }

    /// 获取 WebSocket 管理器
    pub fn ws_manager(&self) -> Arc<WebSocketManager> {
        self.state.ws_manager.clone()
    }

    /// 获取 RPC 路由器
    pub fn rpc_router(&self) -> Arc<RpcRouter> {
        self.state.rpc_router.clone()
    }
}

/// WebSocket 升级处理
async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<ServerState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

/// 处理 WebSocket 连接
async fn handle_socket(socket: WebSocket, state: Arc<ServerState>) {
    let (mut ws_tx, mut ws_rx) = socket.split();

    // 创建消息通道
    let (msg_tx, mut msg_rx) = mpsc::channel::<Message>(100);

    // 生成连接 ID
    let connection_id = uuid::Uuid::new_v4().to_string();
    info!("新的 WebSocket 连接: {}", connection_id);

    // 注册连接
    let connection = state
        .ws_manager
        .register_connection(connection_id.clone(), msg_tx)
        .await;

    // 发送消息任务
    let send_task = tokio::spawn(async move {
        while let Some(message) = msg_rx.recv().await {
            if let Err(e) = ws_tx.send(message).await {
                error!("发送 WebSocket 消息失败: {}", e);
                break;
            }
        }
    });

    // 接收消息任务
    let state_for_recv = state.clone();
    let recv_task = tokio::spawn(async move {
        while let Some(Ok(message)) = ws_rx.next().await {
            if let Err(e) = state_for_recv.ws_manager.handle_message(&connection, message).await {
                error!("处理 WebSocket 消息失败: {}", e);
                break;
            }
        }
    });

    // 等待任一任务完成
    tokio::select! {
        _ = send_task => {},
        _ = recv_task => {},
    }

    // 移除连接
    state.ws_manager.remove_connection(&connection_id).await;
    info!("WebSocket 连接已关闭: {}", connection_id);
}

/// 健康检查处理
async fn health_handler() -> impl IntoResponse {
    "OK"
}
