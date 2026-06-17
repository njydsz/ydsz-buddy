//! WebSocket server setup.

use axum::{
    extract::{ws::WebSocketUpgrade, State},
    response::IntoResponse,
    routing::get,
    Router,
};
use std::sync::Arc;

use crate::{RpcState, WsState};

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
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| async move {
        if let Err(e) = crate::handle_ws_connection(socket, state).await {
            tracing::error!("WebSocket connection error: {}", e);
        }
    })
}
