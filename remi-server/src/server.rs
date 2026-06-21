//! # WebSocket 服务器模块
//!
//! 本模块基于 Axum 框架实现 WebSocket 服务器，负责 HTTP 路由配置、WebSocket 连接升级、
//! 消息收发和健康检查等功能。
//!
//! ## 路由配置
//!
//! | 路径 | 方法 | 用途 |
//! |------|------|------|
//! | `/ws` | GET | WebSocket 升级端点，客户端通过此端点建立 WebSocket 连接 |
//! | `/health` | GET | 健康检查端点，返回 "OK" 表示服务正常 |
//!
//! ## 连接处理流程
//!
//! 1. 客户端请求 `/ws` 端点，Axum 将 HTTP 连接升级为 WebSocket
//! 2. 为每个连接分配唯一 ID，注册到 [`WebSocketManager`]
//! 3. 启动发送和接收两个异步任务，分别处理出站和入站消息
//! 4. 任一任务结束时，移除连接并清理资源

use std::future::Future;
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

/// 服务器共享状态
///
/// 通过 Axum 的 `State` 提取器在请求处理函数间共享，
/// 包含 WebSocket 管理器和 RPC 路由器。
pub struct ServerState {
    /// WebSocket 连接管理器，负责连接注册、消息分发和通知推送
    pub ws_manager: Arc<WebSocketManager>,
    /// RPC 路由器，负责 JSON-RPC 请求的方法查找和分发
    pub rpc_router: Arc<RpcRouter>,
}

/// WebSocket 服务器
///
/// 封装了 Axum HTTP 服务器，提供 WebSocket 通信能力。
/// 启动后阻塞当前线程，直到服务器关闭。
pub struct WebSocketServer {
    /// 服务器共享状态
    state: Arc<ServerState>,
    /// 服务器监听地址
    addr: SocketAddr,
}

impl WebSocketServer {
    /// 创建新的 WebSocket 服务器
    ///
    /// # 参数
    ///
    /// - `addr`: 服务器监听地址
    /// - `rpc_router`: RPC 路由器实例，用于处理客户端请求
    pub fn new(addr: SocketAddr, rpc_router: Arc<RpcRouter>) -> Self {
        let ws_manager = Arc::new(WebSocketManager::new(rpc_router.clone()));

        let state = Arc::new(ServerState {
            ws_manager,
            rpc_router,
        });

        Self { state, addr }
    }

    /// 启动服务器
    ///
    /// 绑定 TCP 监听器并启动 Axum HTTP 服务器，阻塞直到服务器关闭。
    /// 配置了 CORS 中间件允许所有来源的跨域请求。
    ///
    /// 当传入地址的端口为 `0` 时，会由操作系统分配随机端口，返回值中的
    /// `SocketAddr` 为实际监听的地址（包含真实端口）。
    ///
    /// # 错误
    ///
    /// 当 TCP 绑定或服务器运行发生 IO 错误时返回 [`ServerError::IoError`]
    pub async fn start(
        &self,
    ) -> ServerResult<(SocketAddr, impl Future<Output = ServerResult<()>> + Send + 'static)> {
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
            .map_err(ServerError::IoError)?;

        let actual_addr = listener.local_addr().map_err(ServerError::IoError)?;

        let serve = async move {
            axum::serve(listener, app)
                .await
                .map_err(ServerError::IoError)
        };

        Ok((actual_addr, serve))
    }

    /// 获取 WebSocket 管理器引用
    pub fn ws_manager(&self) -> Arc<WebSocketManager> {
        self.state.ws_manager.clone()
    }

    /// 获取 RPC 路由器引用
    pub fn rpc_router(&self) -> Arc<RpcRouter> {
        self.state.rpc_router.clone()
    }
}

/// WebSocket 升级处理函数
///
/// 处理 `/ws` 端点的 HTTP 请求，将连接升级为 WebSocket 协议，
/// 升级成功后委托给 [`handle_socket`] 处理后续逻辑。
async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<ServerState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

/// 处理 WebSocket 连接
///
/// 为每个 WebSocket 连接创建独立的发送和接收异步任务：
/// - **发送任务**：从 mpsc 通道接收消息并通过 WebSocket 发送给客户端
/// - **接收任务**：从 WebSocket 接收客户端消息并交给 [`WebSocketManager`] 处理
///
/// 当任一任务结束时（连接断开或发生错误），清理连接资源。
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

/// 健康检查处理函数
///
/// 处理 `/health` 端点的 GET 请求，返回 "OK" 表示服务正常运行。
async fn health_handler() -> impl IntoResponse {
    "OK"
}
