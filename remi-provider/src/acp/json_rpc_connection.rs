//! # ACP JSON-RPC Connection 模块
//!
//! 抽象一个 ACP over stdio 的 JSON-RPC 长连接：
//!
//! - 持有一个 stdin (写) + stdout (读) + stderr (旁路) 的子进程
//! - 异步读取 stdout，每行解析一个 JSON-RPC 消息（带长度前缀的 ndjson / 简单换行分隔）
//! - 维护一个 request id 计数器，发送时绑定 oneshot 接收响应
//! - 通知（notification，id 为 null）不关联 response
//!
//! ## 协议
//!
//! ```text
//! client -> server: { "jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {} }
//! server -> client: { "jsonrpc": "2.0", "id": 1, "result": [...] }
//! server -> client: { "jsonrpc": "2.0", "method": "session/update", "params": {...} }
//! ```
//!
//! ## 设计
//!
//! - 单一长连接 = 一个 [`AcpJsonRpcConnection`]
//! - 内部维护 `pending: HashMap<u64, oneshot::Sender<Value>>`
//! - 读循环在独立 task 中跑，dispatch 到对应 sender
//! - close 一次性：取消所有 pending、向子进程发送 EOF、kill child

use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{oneshot, Mutex, Notify};
use tracing::{info, warn};

/// JSON-RPC 请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpJsonRpcRequest {
    pub jsonrpc: String,
    pub id: Option<u64>,
    pub method: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
}

impl AcpJsonRpcRequest {
    pub fn notification(method: impl Into<String>, params: Option<Value>) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id: None,
            method: method.into(),
            params,
        }
    }
}

/// JSON-RPC 响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpJsonRpcResponse {
    pub jsonrpc: String,
    pub id: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<AcpJsonRpcError>,
}

/// JSON-RPC 错误
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpJsonRpcError {
    pub code: i32,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

/// JSON-RPC 通知
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpJsonRpcNotification {
    pub jsonrpc: String,
    pub method: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
}

/// JSON-RPC 错误码（标准 + 自定义）
pub mod codes {
    pub const PARSE_ERROR: i32 = -32700;
    pub const INVALID_REQUEST: i32 = -32600;
    pub const METHOD_NOT_FOUND: i32 = -32601;
    pub const INVALID_PARAMS: i32 = -32602;
    pub const INTERNAL_ERROR: i32 = -32603;
}

/// 启动配置
#[derive(Debug, Clone)]
pub struct AcpConnectionConfig {
    pub binary: String,
    pub args: Vec<String>,
    pub working_dir: Option<std::path::PathBuf>,
    pub env: Vec<(String, String)>,
    /// 协议帧超时（响应最长等待时间）
    pub response_timeout: Duration,
}

impl AcpConnectionConfig {
    pub fn new(binary: impl Into<String>) -> Self {
        Self {
            binary: binary.into(),
            args: Vec::new(),
            working_dir: None,
            env: Vec::new(),
            response_timeout: Duration::from_secs(30),
        }
    }

    pub fn with_arg(mut self, arg: impl Into<String>) -> Self {
        self.args.push(arg.into());
        self
    }
}

impl Default for AcpConnectionConfig {
    fn default() -> Self {
        Self::new("acp")
    }
}

/// 连接状态
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionState {
    Idle,
    Spawning,
    Connected,
    Closing,
    Closed,
    Failed,
}

/// ACP JSON-RPC 连接
pub struct AcpJsonRpcConnection {
    config: AcpConnectionConfig,
    child: Arc<Mutex<Option<Child>>>,
    stdin: Arc<Mutex<Option<tokio::process::ChildStdin>>>,
    next_id: Arc<Mutex<u64>>,
    pending: Arc<Mutex<HashMap<u64, oneshot::Sender<AcpJsonRpcResponse>>>>,
    state: Arc<Mutex<ConnectionState>>,
    /// 收到通知时回调（外部用）
    notification_handler: Arc<Mutex<Option<Box<dyn Fn(AcpJsonRpcNotification) + Send + Sync>>>>,
    /// 退出通知
    closed_notify: Arc<Notify>,
}

impl AcpJsonRpcConnection {
    pub fn new(config: AcpConnectionConfig) -> Self {
        Self {
            config,
            child: Arc::new(Mutex::new(None)),
            stdin: Arc::new(Mutex::new(None)),
            next_id: Arc::new(Mutex::new(1)),
            pending: Arc::new(Mutex::new(HashMap::new())),
            state: Arc::new(Mutex::new(ConnectionState::Idle)),
            notification_handler: Arc::new(Mutex::new(None)),
            closed_notify: Arc::new(Notify::new()),
        }
    }

    /// 设置通知处理器
    pub async fn set_notification_handler<F>(&self, handler: F)
    where
        F: Fn(AcpJsonRpcNotification) + Send + Sync + 'static,
    {
        *self.notification_handler.lock().await = Some(Box::new(handler));
    }

    /// 启动子进程
    pub async fn start(&self) -> Result<u32, AcpConnectionError> {
        *self.state.lock().await = ConnectionState::Spawning;
        let mut cmd = Command::new(&self.config.binary);
        for arg in &self.config.args {
            cmd.arg(arg);
        }
        if let Some(wd) = &self.config.working_dir {
            cmd.current_dir(wd);
        }
        for (k, v) in &self.config.env {
            cmd.env(k, v);
        }
        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = cmd
            .spawn()
            .map_err(|e| AcpConnectionError::SpawnFailed(e.to_string()))?;
        let pid = child.id().unwrap_or(0);
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| AcpConnectionError::SpawnFailed("stdin not captured".to_string()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AcpConnectionError::SpawnFailed("stdout not captured".to_string()))?;
        let stderr = child.stderr.take();

        *self.child.lock().await = Some(child);
        *self.stdin.lock().await = Some(stdin);
        *self.state.lock().await = ConnectionState::Connected;

        // 启动读循环
        self.spawn_read_loop(stdout).await;
        // 启动 stderr 旁路
        if let Some(stderr) = stderr {
            self.spawn_stderr_loop(stderr).await;
        }

        info!("ACP JSON-RPC 连接已启动 (pid: {})", pid);
        Ok(pid)
    }

    async fn spawn_read_loop(&self, stdout: tokio::process::ChildStdout) {
        let pending = self.pending.clone();
        let handler = self.notification_handler.clone();
        let state = self.state.clone();
        let closed_notify = self.closed_notify.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            loop {
                match reader.next_line().await {
                    Ok(Some(line)) => {
                        if line.trim().is_empty() {
                            continue;
                        }
                        match serde_json::from_str::<AcpJsonRpcResponse>(&line) {
                            Ok(resp) => {
                                if let Some(id) = resp.id {
                                    let mut p = pending.lock().await;
                                    if let Some(tx) = p.remove(&id) {
                                        let _ = tx.send(resp);
                                    }
                                }
                            }
                            Err(_) => {
                                // 尝试作为 notification 解析
                                if let Ok(notif) =
                                    serde_json::from_str::<AcpJsonRpcNotification>(&line)
                                {
                                    let h = handler.lock().await;
                                    if let Some(cb) = h.as_ref() {
                                        cb(notif);
                                    }
                                } else {
                                    warn!("ACP 收到无法解析的行: {}", line);
                                }
                            }
                        }
                    }
                    Ok(None) => {
                        info!("ACP stdout EOF");
                        break;
                    }
                    Err(e) => {
                        warn!("ACP stdout 读取错误: {}", e);
                        break;
                    }
                }
            }
            *state.lock().await = ConnectionState::Closed;
            closed_notify.notify_waiters();
        });
    }

    async fn spawn_stderr_loop(&self, stderr: tokio::process::ChildStderr) {
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                tracing::debug!("[acp stderr] {}", line);
            }
        });
    }

    /// 发送一个 request 并等待响应
    pub async fn request(
        &self,
        method: impl Into<String>,
        params: Option<Value>,
    ) -> Result<AcpJsonRpcResponse, AcpConnectionError> {
        let (tx, rx) = oneshot::channel();
        let id = {
            let mut nid = self.next_id.lock().await;
            let id = *nid;
            *nid += 1;
            id
        };
        self.pending.lock().await.insert(id, tx);
        let req = AcpJsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Some(id),
            method: method.into(),
            params,
        };
        self.send_raw(&serde_json::to_string(&req).unwrap()).await?;
        match tokio::time::timeout(self.config.response_timeout, rx).await {
            Ok(Ok(resp)) => Ok(resp),
            Ok(Err(_)) => Err(AcpConnectionError::ChannelClosed),
            Err(_) => {
                // 超时：清理 pending
                self.pending.lock().await.remove(&id);
                Err(AcpConnectionError::Timeout)
            }
        }
    }

    /// 发送一个通知（无 id，无响应）
    pub async fn notify(
        &self,
        method: impl Into<String>,
        params: Option<Value>,
    ) -> Result<(), AcpConnectionError> {
        let notif = AcpJsonRpcRequest::notification(method, params);
        self.send_raw(&serde_json::to_string(&notif).unwrap()).await
    }

    async fn send_raw(&self, line: &str) -> Result<(), AcpConnectionError> {
        let mut guard = self.stdin.lock().await;
        let stdin = guard
            .as_mut()
            .ok_or(AcpConnectionError::NotConnected)?;
        stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| AcpConnectionError::WriteFailed(e.to_string()))?;
        stdin
            .write_all(b"\n")
            .await
            .map_err(|e| AcpConnectionError::WriteFailed(e.to_string()))?;
        stdin
            .flush()
            .await
            .map_err(|e| AcpConnectionError::WriteFailed(e.to_string()))?;
        Ok(())
    }

    /// 状态
    pub async fn state(&self) -> ConnectionState {
        *self.state.lock().await
    }

    /// 优雅关闭
    pub async fn close(&self) -> Result<(), AcpConnectionError> {
        *self.state.lock().await = ConnectionState::Closing;
        // 关 stdin → 子进程会收到 EOF
        {
            let mut guard = self.stdin.lock().await;
            if let Some(mut stdin) = guard.take() {
                let _ = stdin.shutdown().await;
            }
        }
        // 等子进程退出或超时
        let mut child_guard = self.child.lock().await;
        if let Some(mut child) = child_guard.take() {
            let _ = tokio::time::timeout(Duration::from_secs(2), child.wait()).await;
            let _ = child.kill().await;
        }
        // 取消所有 pending
        let mut pending = self.pending.lock().await;
        for (_, tx) in pending.drain() {
            let _ = tx.send(AcpJsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                id: None,
                result: None,
                error: Some(AcpJsonRpcError {
                    code: codes::INTERNAL_ERROR,
                    message: "connection closed".to_string(),
                    data: None,
                }),
            });
        }
        *self.state.lock().await = ConnectionState::Closed;
        self.closed_notify.notify_waiters();
        Ok(())
    }

    /// 等待关闭
    pub async fn wait_closed(&self) {
        self.closed_notify.notified().await;
    }
}

/// 连接错误
#[derive(Debug, thiserror::Error, Serialize, Deserialize)]
pub enum AcpConnectionError {
    #[error("spawn 失败: {0}")]
    SpawnFailed(String),
    #[error("写入失败: {0}")]
    WriteFailed(String),
    #[error("未连接")]
    NotConnected,
    #[error("响应超时")]
    Timeout,
    #[error("通道已关闭")]
    ChannelClosed,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_serializes_with_id() {
        let r = AcpJsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Some(42),
            method: "tools/list".to_string(),
            params: None,
        };
        let s = serde_json::to_string(&r).unwrap();
        assert!(s.contains("\"id\":42"));
        assert!(s.contains("\"method\":\"tools/list\""));
    }

    #[test]
    fn notification_has_null_id() {
        let n = AcpJsonRpcRequest::notification("session/update", Some(serde_json::json!({})));
        let s = serde_json::to_string(&n).unwrap();
        assert!(s.contains("\"id\":null"));
    }

    #[test]
    fn connection_starts_in_idle_state() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let conn = AcpJsonRpcConnection::new(AcpConnectionConfig::default());
            assert_eq!(conn.state().await, ConnectionState::Idle);
        });
    }
}
