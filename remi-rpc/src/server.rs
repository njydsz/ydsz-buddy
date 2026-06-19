//! WebSocket 服务器配置。

use axum::{
    Router,
    extract::{
        State,
        ws::{WebSocket, WebSocketUpgrade},
    },
    response::Response,
    routing::get,
};
use std::sync::Arc;

use crate::{RpcState, handle_ws_connection};

/// 创建 WebSocket 路由。
pub fn create_ws_router(rpc_state: Arc<RpcState>) -> Router {
    Router::new()
        .route("/ws", get(ws_handler))
        .with_state(rpc_state)
}

/// WebSocket 升级处理器。
async fn ws_handler(ws: WebSocketUpgrade, State(state): State<Arc<RpcState>>) -> Response {
    ws.on_upgrade(move |socket: WebSocket| async move {
        if let Err(e) = handle_ws_connection(socket, state).await {
            tracing::error!("WebSocket connection error: {}", e);
        }
    })
}
