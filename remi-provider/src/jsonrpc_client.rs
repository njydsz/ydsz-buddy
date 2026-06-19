//! JSON-RPC over stdio 客户端
//!
//! 提供与 Provider 进程通过标准输入输出进行 JSON-RPC 通信的能力

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

/// JSON-RPC 请求
#[derive(Debug, Clone, Serialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub id: u64,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
}

/// JSON-RPC 响应
#[derive(Debug, Clone, Deserialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    #[serde(default)]
    pub id: Option<u64>,
    #[serde(default)]
    pub result: Option<Value>,
    #[serde(default)]
    pub error: Option<JsonRpcError>,
}

/// JSON-RPC 错误
#[derive(Debug, Clone, Deserialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    #[serde(default)]
    pub data: Option<Value>,
}

/// JSON-RPC 通知（无 id）
#[derive(Debug, Clone, Deserialize)]
pub struct JsonRpcNotification {
    pub jsonrpc: String,
    pub method: String,
    #[serde(default)]
    pub params: Option<Value>,
}

/// 待处理的请求
struct PendingRequest {
    sender: oneshot::Sender<ProviderResult<JsonRpcResponse>>,
}

/// JSON-RPC 客户端
///
/// 管理与 Provider 进程的 JSON-RPC 通信
pub struct JsonRpcClient {
    /// 子进程
    child: Arc<Mutex<Child>>,
    /// 标准输入
    stdin: Arc<Mutex<ChildStdin>>,
    /// 请求 ID 计数器
    request_id: AtomicU64,
    /// 待处理请求映射
    pending: Arc<RwLock<HashMap<u64, PendingRequest>>>,
    /// 通知接收器
    notification_tx: mpsc::Sender<JsonRpcNotification>,
    notification_rx: Arc<Mutex<mpsc::Receiver<JsonRpcNotification>>>,
    /// 是否已关闭
    closed: Arc<std::sync::atomic::AtomicBool>,
}

impl JsonRpcClient {
    /// 启动 Provider 进程并创建客户端
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

    /// 读取循环
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

    /// 发送 JSON-RPC 请求
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

    /// 接收通知
    pub async fn recv_notification(&self) -> Option<JsonRpcNotification> {
        let mut rx = self.notification_rx.lock().await;
        rx.recv().await
    }

    /// 关闭客户端
    pub async fn close(&self) -> ProviderResult<()> {
        self.closed.store(true, Ordering::SeqCst);

        let mut child = self.child.lock().await;
        if let Err(e) = child.kill().await {
            warn!("杀死 Provider 进程失败: {}", e);
        }

        Ok(())
    }

    /// 检查是否已关闭
    pub fn is_closed(&self) -> bool {
        self.closed.load(Ordering::SeqCst)
    }
}

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
