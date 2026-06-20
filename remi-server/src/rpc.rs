//! # JSON-RPC 2.0 远程过程调用框架模块
//!
//! 本模块实现了标准的 [JSON-RPC 2.0](https://www.jsonrpc.org/specification) 协议框架，
//! 为 WebSocket 通信提供请求-响应和通知两种交互模式。
//!
//! ## 核心数据结构
//!
//! - [`JsonRpcRequest`] - 客户端请求，包含方法名和参数
//! - [`JsonRpcResponse`] - 服务端响应，包含结果或错误
//! - [`JsonRpcNotification`] - 服务端主动推送的通知，无请求 ID
//! - [`JsonRpcError`] - 错误详情，包含错误码、消息和附加数据
//!
//! ## 路由与分发
//!
//! [`RpcRouter`] 负责方法注册和请求路由：
//! - 通过 [`RpcRouter::register`] 注册方法名与处理器的映射
//! - 通过 [`RpcRouter::handle_request`] 接收请求并分发到对应处理器
//! - 处理器实现 [`RpcMethodHandler`] trait，支持异步函数自动转换
//!
//! ## 错误码约定
//!
//! | 错误码 | 含义 |
//! |--------|------|
//! | -32601 | 方法未找到（Method not found） |
//! | -32602 | 参数无效（Invalid params） |
//! | -32000 | 服务器内部错误（Internal error） |

use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::RwLock;
use tracing::{debug, error, info};

use crate::error::ServerResult;

/// JSON-RPC 2.0 请求
///
/// 客户端发送的 RPC 请求，遵循 JSON-RPC 2.0 规范。
/// `id` 字段用于匹配请求与响应，通知类消息无 `id`。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    /// JSON-RPC 协议版本，固定为 "2.0"
    pub jsonrpc: String,
    /// 请求标识符，由客户端指定，用于匹配响应。通知消息无此字段
    pub id: Option<Value>,
    /// 要调用的方法名，如 "git.status"、"terminal.open" 等
    pub method: String,
    /// 方法调用参数，具体结构由各方法定义
    pub params: Option<Value>,
}

/// JSON-RPC 2.0 响应
///
/// 服务端对请求的响应，`result` 和 `error` 二者必有其一。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    /// JSON-RPC 协议版本，固定为 "2.0"
    pub jsonrpc: String,
    /// 对应请求的 ID
    pub id: Option<Value>,
    /// 调用成功时的返回值
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    /// 调用失败时的错误信息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

/// JSON-RPC 2.0 错误
///
/// 遵循 JSON-RPC 2.0 规范的错误对象，包含错误码、错误消息和可选的附加数据。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcError {
    /// 错误码，负数表示协议定义的错误，正数保留给应用自定义错误
    pub code: i32,
    /// 人类可读的错误消息
    pub message: String,
    /// 附加错误数据，如堆栈信息、详细错误描述等
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

/// JSON-RPC 2.0 通知（服务端推送）
///
/// 服务端主动向客户端推送的通知，不包含 `id` 字段，客户端无需回复。
/// 用于实时事件推送，如 Git 状态变更、终端输出等。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcNotification {
    /// JSON-RPC 协议版本，固定为 "2.0"
    pub jsonrpc: String,
    /// 通知的方法名，如 "git.status"、"terminal.event" 等
    pub method: String,
    /// 通知参数，包含事件详情
    pub params: Option<Value>,
}

/// RPC 方法处理器 trait
///
/// 所有 RPC 方法必须实现此 trait。通过 [`async_trait`] 支持异步处理，
/// 并要求 `Send + Sync` 以保证线程安全。
#[async_trait]
pub trait RpcMethodHandler: Send + Sync {
    /// 处理 RPC 方法调用
    ///
    /// # 参数
    ///
    /// - `params`: 客户端传入的参数，可能为 `None`
    ///
    /// # 返回值
    ///
    /// 成功时返回 JSON 值，失败时返回 [`ServerError`](crate::error::ServerError)
    async fn handle(&self, params: Option<Value>) -> ServerResult<Value>;
}

/// 为异步函数自动实现 [`RpcMethodHandler`]
///
/// 支持将 `async fn(Option<Value>) -> ServerResult<Value>` 形式的闭包
/// 直接作为 RPC 方法处理器使用，无需手动实现 trait。
#[async_trait]
impl<F, Fut> RpcMethodHandler for F
where
    F: Fn(Option<Value>) -> Fut + Send + Sync,
    Fut: std::future::Future<Output = ServerResult<Value>> + Send,
{
    async fn handle(&self, params: Option<Value>) -> ServerResult<Value> {
        (self)(params).await
    }
}

/// RPC 路由器
///
/// 管理所有已注册的 RPC 方法，负责请求分发和响应构造。
/// 内部使用 `HashMap` 存储方法名到处理器的映射，支持并发读写。
pub struct RpcRouter {
    /// 方法注册表，键为方法名，值为对应的处理器
    methods: Arc<RwLock<HashMap<String, Arc<dyn RpcMethodHandler>>>>,
}

impl RpcRouter {
    /// 创建新的 RPC 路由器
    ///
    /// 初始化空的方法注册表，后续通过 [`register`](RpcRouter::register) 方法注册处理器。
    pub fn new() -> Self {
        Self {
            methods: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// 注册 RPC 方法
    ///
    /// 将方法名与处理器绑定，后续收到同名请求时会路由到该处理器。
    /// 如果方法名已存在，新的处理器会覆盖旧的。
    ///
    /// # 参数
    ///
    /// - `method`: 方法名，如 "git.status"、"terminal.open" 等
    /// - `handler`: 方法处理器，实现 [`RpcMethodHandler`] trait 的实例
    pub async fn register<H>(&self, method: &str, handler: H)
    where
        H: RpcMethodHandler + 'static,
    {
        debug!("注册 RPC 方法: {}", method);
        let mut methods = self.methods.write().await;
        methods.insert(method.to_string(), Arc::new(handler));
    }

    /// 处理 RPC 请求
    ///
    /// 根据请求中的方法名查找已注册的处理器并执行，返回对应的响应。
    /// - 方法存在且执行成功：返回包含 `result` 的成功响应
    /// - 方法存在但执行失败：返回包含错误码 -32000 的错误响应
    /// - 方法不存在：返回包含错误码 -32601 的错误响应
    ///
    /// # 参数
    ///
    /// - `request`: JSON-RPC 2.0 请求对象
    ///
    /// # 返回值
    ///
    /// 返回 [`JsonRpcResponse`]，包含结果或错误信息
    pub async fn handle_request(&self, request: JsonRpcRequest) -> JsonRpcResponse {
        info!("处理 RPC 请求: {}", request.method);

        let methods = self.methods.read().await;

        match methods.get(&request.method) {
            Some(handler) => {
                match handler.handle(request.params).await {
                    Ok(result) => JsonRpcResponse {
                        jsonrpc: "2.0".to_string(),
                        id: request.id,
                        result: Some(result),
                        error: None,
                    },
                    Err(e) => {
                        error!("RPC 方法执行失败: {} - {}", request.method, e);
                        JsonRpcResponse {
                            jsonrpc: "2.0".to_string(),
                            id: request.id,
                            result: None,
                            error: Some(JsonRpcError {
                                code: -32000,
                                message: e.to_string(),
                                data: None,
                            }),
                        }
                    }
                }
            }
            None => {
                error!("RPC 方法未找到: {}", request.method);
                JsonRpcResponse {
                    jsonrpc: "2.0".to_string(),
                    id: request.id,
                    result: None,
                    error: Some(JsonRpcError {
                        code: -32601,
                        message: format!("Method not found: {}", request.method),
                        data: None,
                    }),
                }
            }
        }
    }

    /// 获取已注册的方法列表
    ///
    /// # 返回值
    ///
    /// 返回所有已注册方法名的列表
    pub async fn list_methods(&self) -> Vec<String> {
        let methods = self.methods.read().await;
        methods.keys().cloned().collect()
    }
}

impl Default for RpcRouter {
    fn default() -> Self {
        Self::new()
    }
}

/// 创建成功响应
///
/// 构造一个包含结果的 JSON-RPC 2.0 成功响应。
///
/// # 参数
///
/// - `id`: 请求 ID，用于匹配对应的请求
/// - `result`: 方法调用的返回值
pub fn success_response(id: Option<Value>, result: Value) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        id,
        result: Some(result),
        error: None,
    }
}

/// 创建错误响应
///
/// 构造一个包含错误信息的 JSON-RPC 2.0 错误响应。
///
/// # 参数
///
/// - `id`: 请求 ID，用于匹配对应的请求
/// - `code`: 错误码，如 -32601（方法未找到）、-32602（参数无效）等
/// - `message`: 错误消息
pub fn error_response(id: Option<Value>, code: i32, message: String) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        id,
        result: None,
        error: Some(JsonRpcError {
            code,
            message,
            data: None,
        }),
    }
}

/// 创建通知（服务端推送）
///
/// 构造一个 JSON-RPC 2.0 通知对象，用于服务端主动向客户端推送事件。
/// 通知没有 `id` 字段，客户端无需回复。
///
/// # 参数
///
/// - `method`: 通知方法名，如 "git.status"、"terminal.event" 等
/// - `params`: 通知参数，包含事件详情
pub fn create_notification(method: &str, params: Option<Value>) -> JsonRpcNotification {
    JsonRpcNotification {
        jsonrpc: "2.0".to_string(),
        method: method.to_string(),
        params,
    }
}
