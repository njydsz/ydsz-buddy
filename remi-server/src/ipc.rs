//! # 进程内 IPC 桥接模块
//!
//! 本模块为嵌入式调用方（如 Tauri 同进程）提供对 remi-server RPC 方法的进程内调用能力。
//! 通过 `OnceCell<RpcRouter>` 静态注册 RPC 路由器，`ipc_*` 函数复用与 WebSocket 同一套处理器。
//!
//! ## 适用场景
//!
//! - Tauri 命令需要调用某个 RPC 方法而不必绕一圈 WebSocket
//! - CLI 子命令需要复用业务处理器
//!
//! ## 使用方法
//!
//! 在 [`bootstrap_embedded`](crate::bootstrap::bootstrap_embedded) 或 [`bootstrap`](crate::bootstrap::bootstrap) 中
//! 已经通过 [`register_router`] 注册了路由器；调用方直接调用 `ipc_voice_transcribe` 等函数即可。

use std::sync::Arc;

use once_cell::sync::OnceCell;
use serde_json::Value;
use tracing::warn;

use crate::rpc::RpcRouter;

static ROUTER: OnceCell<Arc<RpcRouter>> = OnceCell::new();

/// 注册全局 RPC 路由器（重复注册会被忽略）
pub fn register_router(router: Arc<RpcRouter>) {
    if ROUTER.set(router).is_err() {
        warn!("RPC router 已经注册过，忽略重复注册");
    }
}

/// 取出当前注册的 RPC 路由器（如未注册则返回 None）
pub fn router() -> Option<Arc<RpcRouter>> {
    ROUTER.get().cloned()
}

/// 通过 RPC 路由器同步处理一个 JSON-RPC 风格的请求
///
/// # 参数
///
/// - `method`: 方法名，如 `voice.transcribe`
/// - `params`: 方法参数（可序列化为 JSON 的对象）
///
/// # 返回值
///
/// 成功时返回 `result` 字段的 JSON 值；失败时返回错误信息
pub async fn ipc_call(method: &str, params: Value) -> Result<Value, String> {
    let router = router().ok_or_else(|| "RPC router not initialized".to_string())?;
    router
        .dispatch(method, Some(params))
        .await
        .map_err(|e| e.to_string())
}

/// 语音转文字 IPC 桥接
///
/// 由 Tauri `transcribe_voice` 命令调用，转发到 `voice.transcribe` RPC 方法。
///
/// # 参数
///
/// - `params`: 必须包含 `format`、`audioBase64` 字段；可选 `language`
pub async fn ipc_voice_transcribe(params: Value) -> Result<Value, String> {
    let router = router().ok_or_else(|| "RPC router not initialized".to_string())?;
    router
        .dispatch("voice.transcribe", Some(params))
        .await
}

