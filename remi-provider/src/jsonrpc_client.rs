//! JSON-RPC over stdio 客户端
//!
//! 本模块提供与 Provider 进程通过标准输入输出（stdin/stdout）进行 JSON-RPC 2.0 通信的能力。
//! 是各 Provider 适配器与底层 AI 服务进程通信的核心基础设施。
//!
//! # 核心功能
//!
//! - **进程管理**：启动 Provider 子进程，管理其生命周期
//! - **请求/响应**：发送 JSON-RPC 请求并等待对应的响应
//! - **通知处理**：异步接收 Provider 推送的 JSON-RPC 通知
//! - **并发安全**：支持多个请求并发发送，通过请求 ID 关联响应
//! - **优雅关闭**：支持主动关闭和自动清理（Drop trait）
//!
//! # 通信协议
//!
//! 采用 JSON-RPC 2.0 over stdio 协议：
//! - 请求和响应通过子进程的 stdin/stdout 以换行符分隔的 JSON 行传输
//! - 每条消息占一行，以 `\n` 结尾
//! - 请求携带唯一 `id`，响应对应相同的 `id`
//! - 通知无 `id` 字段，由 Provider 主动推送
//!
//! # 架构设计
//!
//! ```text
//! ┌──────────────────────────────────────────┐
//! │            JsonRpcClient                  │
//! ├──────────────────────────────────────────┤
//! │  child: Child        ← 子进程句柄         │
//! │  stdin: ChildStdin   ← 请求写入端         │
//! │  request_id: AtomicU64 ← 请求 ID 生成器   │
//! │  pending: HashMap<u64, PendingRequest>   │
//! │  notification_tx/rx ← 通知通道            │
//! │  closed: AtomicBool  ← 关闭状态标记       │
//! └──────────────────────────────────────────┘
//!         ↓ stdin 写入          ↑ stdout 读取
//! ┌──────────────────────────────────────────┐
//! │        Provider 子进程                    │
//! └──────────────────────────────────────────┘
//! ```
//!
//! # 线程安全
//!
//! - `request_id` 使用 `AtomicU64`，无锁递增
//! - `pending` 使用 `RwLock`，支持并发读写
//! - `stdin` 使用 `Mutex`，保证写入原子性
//! - `child` 使用 `Mutex`，保证进程操作互斥
//!
//! # 使用示例
//!
//! ```rust,ignore
//! use remi_provider::jsonrpc_client::JsonRpcClient;
//! use std::collections::HashMap;
//!
//! let client = JsonRpcClient::spawn(
//!     'claude',
//!     &['--json', '--model', 'claude-sonnet-4-5'],
//!     &HashMap::new(),
//!     '/path/to/workdir',
//! ).await?;
//!
//! // 发送请求
//! let response = client.request('session.initialize', Some(params)).await?;
//!
//! // 接收通知
//! if let Some(notification) = client.recv_notification().await {
//!     println!('收到通知: {}', notification.method);
//! }
//!
//! // 关闭客户端
//! client.close().await?;
//! ```
//!
//! # 模块依赖
//!
//! - 依赖 `tokio` 异步运行时提供进程管理和 I/O 操作
//! - 依赖 `serde_json` 进行 JSON 序列化/反序列化
//! - 被 [`crate::adapters`] 中的各适配器依赖，作为底层通信层

use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::{mpsc, oneshot, Mutex, RwLock};
use tracing::{debug, error, info, warn};

use crate::error::{ProviderError, ProviderResult};

/// JSON-RPC 2.0 请求
///
/// 遵循 JSON-RPC 2.0 规范的请求结构体，通过 stdin 发送给 Provider 进程。
///
/// # 字段说明
///
/// - `jsonrpc`: 协议版本，固定为 `'2.0'`
/// - `id`: 请求唯一标识，用于关联响应
/// - `method`: 要调用的远程方法名
/// - `params`: 可选的方法参数，序列化时为 None 则省略
#[derive(Debug, Clone, Serialize)]
pub struct JsonRpcRequest {
    /// 协议版本，固定为 '2.0'
    pub jsonrpc: String,
    /// 请求唯一标识，由 `AtomicU64` 自增生成
    pub id: u64,
    /// 要调用的远程方法名（如 'session.initialize'、'turn.send' 等）
    pub method: String,
    /// 可选的方法参数，为 None 时序列化时省略该字段
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
}

/// JSON-RPC 2.0 响应
///
/// Provider 进程通过 stdout 返回的响应结构体，包含请求结果或错误信息。
///
/// # 字段说明
///
/// - `jsonrpc`: 协议版本，固定为 `'2.0'`
/// - `id`: 对应请求的 ID，None 时表示该消息为通知
/// - `result`: 请求成功时的返回值
/// - `error`: 请求失败时的错误信息
///
/// # 注意
///
/// `result` 和 `error` 互斥：成功时 `result` 有值且 `error` 为 None，
/// 失败时 `error` 有值且 `result` 为 None。
#[derive(Debug, Clone, Deserialize)]
pub struct JsonRpcResponse {
    /// 协议版本
    pub jsonrpc: String,
    /// 对应请求的 ID，None 表示该消息可能是通知
    #[serde(default)]
    pub id: Option<u64>,
    /// 请求成功时的返回值
    #[serde(default)]
    pub result: Option<Value>,
    /// 请求失败时的错误信息
    #[serde(default)]
    pub error: Option<JsonRpcError>,
}

/// JSON-RPC 2.0 错误
///
/// 当 Provider 处理请求失败时返回的错误详情，遵循 JSON-RPC 2.0 错误规范。
///
/// # 字段说明
///
/// - `code`: 错误码，负数表示系统级错误，正数保留给自定义错误
/// - `message`: 人类可读的错误描述
/// - `data`: 可选的附加错误数据，包含更详细的诊断信息
#[derive(Debug, Clone, Deserialize)]
pub struct JsonRpcError {
    /// 错误码
    ///
    /// 常见标准错误码：
    /// - `-32700`: 解析错误（Parse error）
    /// - `-32600`: 无效请求（Invalid Request）
    /// - `-32601`: 方法未找到（Method not found）
    /// - `-32602`: 无效参数（Invalid params）
    /// - `-32603`: 内部错误（Internal error）
    pub code: i32,
    /// 人类可读的错误描述
    pub message: String,
    /// 可选的附加错误数据
    #[serde(default)]
    pub data: Option<Value>,
}

/// JSON-RPC 2.0 通知
///
/// Provider 进程主动推送的消息，不携带 `id` 字段，不需要客户端回复。
/// 用于实时推送状态更新、事件通知等异步信息。
///
/// # 字段说明
///
/// - `jsonrpc`: 协议版本，固定为 `'2.0'`
/// - `method`: 通知的方法名（如 'session.update'、'turn.complete' 等）
/// - `params`: 可选的通知参数
#[derive(Debug, Clone, Deserialize)]
pub struct JsonRpcNotification {
    /// 协议版本
    pub jsonrpc: String,
    /// 通知的方法名
    pub method: String,
    /// 可选的通知参数
    #[serde(default)]
    pub params: Option<Value>,
}

/// 待处理的请求
///
/// 内部结构体，保存每个已发送请求的响应回调通道。
/// 当收到对应 ID 的响应时，通过 `oneshot::Sender` 将结果发送给等待方。
struct PendingRequest {
    /// 响应回调的发送端
    ///
    /// 请求发送方通过 `oneshot::Receiver` 等待响应，
    /// 读取线程收到匹配 ID 的响应后通过此 sender 发送结果
    sender: oneshot::Sender<ProviderResult<JsonRpcResponse>>,
}

/// JSON-RPC over stdio 客户端
///
/// 管理与 Provider 子进程的完整 JSON-RPC 2.0 通信生命周期，包括：
/// - 启动子进程并建立 stdin/stdout 通信管道
/// - 发送请求并等待响应（请求-响应模式）
/// - 接收 Provider 主动推送的通知（通知模式）
/// - 管理待处理请求的映射关系
/// - 优雅关闭子进程
///
/// # 线程安全
///
/// 本结构体内部使用多种同步原语保证并发安全：
/// - `child` 和 `stdin` 使用 `Mutex`，保证互斥访问
/// - `request_id` 使用 `AtomicU64`，无锁递增
/// - `pending` 使用 `RwLock`，支持并发读写
/// - `closed` 使用 `AtomicBool`，无锁状态检查
///
/// # 生命周期
///
/// 1. 通过 [`spawn`](JsonRpcClient::spawn) 创建实例，启动子进程和读取线程
/// 2. 通过 [`request`](JsonRpcClient::request) 发送请求并等待响应
/// 3. 通过 [`recv_notification`](JsonRpcClient::recv_notification) 接收通知
/// 4. 通过 [`close`](JsonRpcClient::close) 主动关闭，或通过 Drop 自动清理
pub struct JsonRpcClient {
    /// Provider 子进程句柄
    ///
    /// 用于在关闭时终止子进程。使用 `Mutex` 保证终止操作的互斥性。
    child: Arc<Mutex<Child>>,
    /// 子进程标准输入
    ///
    /// 用于向 Provider 进程写入 JSON-RPC 请求。使用 `Mutex` 保证写入的原子性，
    /// 避免多个请求并发写入导致消息交错。
    stdin: Arc<Mutex<ChildStdin>>,
    /// 请求 ID 自增计数器
    ///
    /// 使用 `AtomicU64` 实现无锁递增，保证每个请求获得唯一 ID。
    /// 初始值为 1，每次调用 `fetch_add` 自动递增。
    request_id: AtomicU64,
    /// 待处理请求映射表
    ///
    /// 键为请求 ID，值为 `PendingRequest`（包含响应回调通道）。
    /// 读取线程收到响应后，根据 ID 查找并通知对应的等待方。
    /// 使用 `RwLock` 支持并发读取（查找）和独占写入（插入/删除）。
    pending: Arc<RwLock<HashMap<u64, PendingRequest>>>,
    /// 通知发送通道
    ///
    /// 读取线程将 Provider 推送的通知通过此通道发送，
    /// 客户端通过 `notification_rx` 接收。
    notification_tx: mpsc::Sender<JsonRpcNotification>,
    /// 通知接收通道
    ///
    /// 客户端通过 [`recv_notification`](JsonRpcClient::recv_notification) 从此通道读取通知。
    /// 使用 `Mutex` 保证同一时刻只有一个消费者在读取。
    notification_rx: Arc<Mutex<mpsc::Receiver<JsonRpcNotification>>>,
    /// 客户端关闭状态标记
    ///
    /// 当子进程退出或主动关闭时设为 `true`，阻止后续请求发送。
    /// 使用 `AtomicBool` 实现无锁状态检查。
    closed: Arc<std::sync::atomic::AtomicBool>,
}

impl Clone for JsonRpcClient {
    fn clone(&self) -> Self {
        Self {
            child: self.child.clone(),
            stdin: self.stdin.clone(),
            request_id: AtomicU64::new(self.request_id.load(std::sync::atomic::Ordering::Relaxed)),
            pending: self.pending.clone(),
            notification_tx: self.notification_tx.clone(),
            notification_rx: self.notification_rx.clone(),
            closed: self.closed.clone(),
        }
    }
}

impl JsonRpcClient {
    /// 启动 Provider 进程并创建 JSON-RPC 客户端
    ///
    /// 启动指定的 Provider 子进程，建立 stdin/stdout 通信管道，
    /// 并启动后台读取线程处理响应和通知。
    ///
    /// # 参数
    ///
    /// - `program`: Provider CLI 可执行文件名（如 'claude'、'codex' 等）
    /// - `args`: 传递给子进程的命令行参数
    /// - `env`: 额外的环境变量
    /// - `cwd`: 子进程的工作目录
    ///
    /// # 返回值
    ///
    /// - `Ok(JsonRpcClient)`: 客户端创建成功，可以开始通信
    /// - `Err(ProviderError::AdapterError)`: 进程启动失败或管道建立失败
    ///
    /// # 错误
    ///
    /// - 进程启动失败（如可执行文件不存在）
    /// - 无法获取子进程的 stdin 或 stdout 管道
    ///
    /// # 示例
    ///
    /// ```rust,ignore
    /// let client = JsonRpcClient::spawn(
    ///     'claude',
    ///     &['--json', '--model', 'claude-sonnet-4-5'],
    ///     &HashMap::new(),
    ///     '/path/to/workdir',
    /// ).await?;
    /// ```
    pub async fn spawn(
        program: &str,
        args: &[&str],
        env: &HashMap<String, String>,
        cwd: &str,
    ) -> ProviderResult<Self> {
        info!("启动 Provider 进程: {} {:?}", program, args);

        let mut cmd = Command::new(program);
        cmd.args(args)
            .current_dir(cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .envs(env);

        let mut child = cmd.spawn().map_err(|e| {
            ProviderError::AdapterError(format!("启动进程失败: {}", e))
        })?;

        let stdin = child.stdin.take().ok_or_else(|| {
            ProviderError::AdapterError("无法获取 stdin".to_string())
        })?;

        let stdout = child.stdout.take().ok_or_else(|| {
            ProviderError::AdapterError("无法获取 stdout".to_string())
        })?;

        let (notification_tx, notification_rx) = mpsc::channel(1000);

        let client = Self {
            child: Arc::new(Mutex::new(child)),
            stdin: Arc::new(Mutex::new(stdin)),
            request_id: AtomicU64::new(1),
            pending: Arc::new(RwLock::new(HashMap::new())),
            notification_tx,
            notification_rx: Arc::new(Mutex::new(notification_rx)),
            closed: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        };

        // 启动读取线程
        let pending = client.pending.clone();
        let notification_tx = client.notification_tx.clone();
        let closed = client.closed.clone();
        tokio::spawn(async move {
            Self::read_loop(stdout, pending, notification_tx, closed).await;
        });

        Ok(client)
    }

    /// 后台读取循环
    ///
    /// 持续从子进程 stdout 逐行读取 JSON-RPC 消息，根据消息类型分发处理：
    /// - **响应**：根据 `id` 查找对应的待处理请求，通过 oneshot 通道发送结果
    /// - **通知**：通过 mpsc 通道转发给通知接收方
    ///
    /// 当子进程关闭 stdout 或读取出错时，循环退出并清理所有待处理请求。
    ///
    /// # 参数
    ///
    /// - `stdout`: 子进程的标准输出流
    /// - `pending`: 待处理请求映射表的共享引用
    /// - `notification_tx`: 通知发送通道
    /// - `closed`: 关闭状态标记，退出循环时设为 true
    ///
    /// # 退出条件
    ///
    /// - 读取到 EOF（子进程关闭 stdout）
    /// - 读取发生 I/O 错误
    async fn read_loop(
        stdout: ChildStdout,
        pending: Arc<RwLock<HashMap<u64, PendingRequest>>>,
        notification_tx: mpsc::Sender<JsonRpcNotification>,
        closed: Arc<std::sync::atomic::AtomicBool>,
    ) {
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();

        loop {
            line.clear();
            match reader.read_line(&mut line).await {
                Ok(0) => {
                    info!("Provider 进程已关闭 stdout");
                    break;
                }
                Ok(_) => {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    debug!("收到 Provider 消息: {}", trimmed);

                    // 尝试解析为响应
                    if let Ok(response) = serde_json::from_str::<JsonRpcResponse>(trimmed) {
                        if let Some(id) = response.id {
                            let mut pending = pending.write().await;
                            if let Some(req) = pending.remove(&id) {
                                let _ = req.sender.send(Ok(response));
                            } else {
                                warn!("收到未知请求 ID 的响应: {}", id);
                            }
                        }
                        continue;
                    }

                    // 尝试解析为通知
                    if let Ok(notification) = serde_json::from_str::<JsonRpcNotification>(trimmed) {
                        if let Err(e) = notification_tx.send(notification).await {
                            error!("发送通知失败: {}", e);
                        }
                        continue;
                    }

                    warn!("无法解析 Provider 消息: {}", trimmed);
                }
                Err(e) => {
                    error!("读取 Provider 输出失败: {}", e);
                    break;
                }
            }
        }

        closed.store(true, std::sync::atomic::Ordering::SeqCst);

        // 取消所有待处理请求
        let mut pending = pending.write().await;
        for (_, req) in pending.drain() {
            let _ = req.sender.send(Err(ProviderError::AdapterError(
                "Provider 进程已关闭".to_string(),
            )));
        }
    }

    /// 发送 JSON-RPC 请求并等待响应
    ///
    /// 构造 JSON-RPC 2.0 请求，通过 stdin 发送给 Provider 进程，
    /// 并阻塞等待对应的响应返回。
    ///
    /// # 参数
    ///
    /// - `method`: 要调用的远程方法名
    /// - `params`: 可选的方法参数
    ///
    /// # 返回值
    ///
    /// - `Ok(JsonRpcResponse)`: 收到 Provider 的响应
    /// - `Err(ProviderError::AdapterError)`: 客户端已关闭、序列化失败、
    ///   发送失败或响应通道关闭
    ///
    /// # 错误
    ///
    /// - 客户端已关闭（子进程已退出或主动关闭）
    /// - 请求序列化失败
    /// - stdin 写入失败
    /// - 响应通道关闭（通常因为读取线程退出）
    ///
    /// # 并发安全
    ///
    /// 多个请求可以并发发送，每个请求通过唯一的 `id` 关联其响应。
    /// stdin 写入通过 Mutex 保证原子性，避免消息交错。
    pub async fn request(
        &self,
        method: &str,
        params: Option<Value>,
    ) -> ProviderResult<JsonRpcResponse> {
        if self.closed.load(Ordering::SeqCst) {
            return Err(ProviderError::AdapterError("客户端已关闭".to_string()));
        }

        let id = self.request_id.fetch_add(1, Ordering::SeqCst);

        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id,
            method: method.to_string(),
            params,
        };

        let json = serde_json::to_string(&request).map_err(|e| {
            ProviderError::AdapterError(format!("序列化请求失败: {}", e))
        })?;

        // 创建响应通道
        let (sender, receiver) = oneshot::channel();

        {
            let mut pending = self.pending.write().await;
            pending.insert(id, PendingRequest { sender });
        }

        // 发送请求
        {
            let mut stdin = self.stdin.lock().await;
            stdin.write_all(json.as_bytes()).await.map_err(|e| {
                ProviderError::AdapterError(format!("发送请求失败: {}", e))
            })?;
            stdin.write_all(b"\n").await.map_err(|e| {
                ProviderError::AdapterError(format!("发送换行符失败: {}", e))
            })?;
            stdin.flush().await.map_err(|e| {
                ProviderError::AdapterError(format!("刷新 stdin 失败: {}", e))
            })?;
        }

        debug!("发送 JSON-RPC 请求: {} (id={})", method, id);

        // 等待响应
        receiver.await.map_err(|_| {
            ProviderError::AdapterError("响应通道已关闭".to_string())
        })?
    }

    /// 接收一条 Provider 通知
    ///
    /// 从通知通道中异步读取一条 Provider 主动推送的通知。
    /// 如果通道中没有通知，则会异步等待直到有新通知到达。
    ///
    /// # 返回值
    ///
    /// - `Some(JsonRpcNotification)`: 收到一条通知
    /// - `None`: 通知通道已关闭（通常因为读取线程退出）
    ///
    /// # 注意
    ///
    /// 此方法会获取 `notification_rx` 的 Mutex 锁，
    /// 同一时刻只能有一个调用者在等待通知。
    pub async fn recv_notification(&self) -> Option<JsonRpcNotification> {
        let mut rx = self.notification_rx.lock().await;
        rx.recv().await
    }

    /// 关闭客户端并终止子进程
    ///
    /// 设置关闭标记，阻止后续请求发送，并向子进程发送 SIGKILL 信号终止其运行。
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 关闭成功
    /// - 终止子进程失败的错误会被记录警告日志，不会返回 Err
    ///
    /// # 注意
    ///
    /// 此方法会强制终止子进程（SIGKILL），不会等待子进程优雅退出。
    /// 如果需要优雅关闭，应先通过 `request` 发送关闭请求。
    pub async fn close(&self) -> ProviderResult<()> {
        self.closed.store(true, Ordering::SeqCst);

        let mut child = self.child.lock().await;
        if let Err(e) = child.kill().await {
            warn!("杀死 Provider 进程失败: {}", e);
        }

        Ok(())
    }

    /// 检查客户端是否已关闭
    ///
    /// 当子进程退出或主动调用 `close` 后，此方法返回 `true`。
    /// 已关闭的客户端不能再发送请求。
    ///
    /// # 返回值
    ///
    /// - `true`: 客户端已关闭
    /// - `false`: 客户端仍可用
    pub fn is_closed(&self) -> bool {
        self.closed.load(Ordering::SeqCst)
    }
}

/// 自动清理资源
///
/// 当 `JsonRpcClient` 被丢弃时，自动设置关闭标记并终止子进程，
/// 防止子进程成为孤儿进程。
///
/// # 注意
///
/// 由于 Drop trait 不支持异步，子进程终止操作通过 `tokio::spawn`
/// 在异步上下文中执行。这意味着在 Drop 返回后，子进程可能尚未完全终止。
impl Drop for JsonRpcClient {
    fn drop(&mut self) {
        let closed = self.closed.clone();
        let child = self.child.clone();
        tokio::spawn(async move {
            closed.store(true, Ordering::SeqCst);
            let mut child = child.lock().await;
            let _ = child.kill().await;
        });
    }
}
