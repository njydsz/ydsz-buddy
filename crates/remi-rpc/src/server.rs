//! WebSocket server setup.

use axum::{
    extract::{
        ws::{WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
    routing::get,
    Router,
};
use std::sync::Arc;

use crate::{handle_ws_connection, RpcState};

/// Create the WebSocket router.
pub fn create_ws_router(rpc_state: Arc<RpcState>) -> Router {
    Router::new()
        .route("/ws", get(ws_handler))
        .with_state(rpc_state)
}

/// WebSocket upgrade handler.
async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<RpcState>>,
) -> Response {
    ws.on_upgrade(move |socket: WebSocket| async move {
        if let Err(e) = handle_ws_connection(socket, state).await {
            tracing::error!("WebSocket connection error: {}", e);
        }
    })
}
