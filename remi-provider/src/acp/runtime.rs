//! ACP 会话运行时
//!
//! 本模块提供 ACP 会话的生命周期管理和进程通信能力。

use crate::acp::model::AcpSpawnInput;
use crate::error::{ProviderError, ProviderResult};
use remi_core::provider::ProviderRuntimeEvent;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{broadcast, Mutex};
use tracing::{debug, error, info, warn};

/// ACP 会话状态
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AcpSessionState {
    /// 初始化中
    Initializing,
    /// 运行中
    Running,
    /// 已暂停
    Paused,
    /// 已完成
    Completed,
    /// 已失败
    Failed,
}

/// ACP 会话信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpSession {
    /// 会话 ID
    pub id: String,
    /// 线程 ID
    pub thread_id: String,
    /// 会话状态
    pub state: AcpSessionState,
    /// 模型 ID
    pub model_id: String,
    /// 创建时间
    pub created_at: chrono::DateTime<chrono::Utc>,
    /// 最后活动时间
    pub last_activity_at: chrono::DateTime<chrono::Utc>,
}

/// ACP 运行时选项
#[derive(Debug, Clone)]
pub struct AcpRuntimeOptions {
    /// 是否记录请求日志
    pub log_requests: bool,
    /// 是否记录响应日志
    pub log_responses: bool,
    /// 请求超时时间（秒）
    pub request_timeout_secs: u64,
}

impl Default for AcpRuntimeOptions {
    fn default() -> Self {
        Self {
            log_requests: false,
            log_responses: false,
            request_timeout_secs: 30,
        }
    }
}

/// ACP JSON-RPC 请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpJsonRpcRequest {
    /// JSON-RPC 版本
    pub jsonrpc: String,
    /// 请求 ID
    pub id: u64,
    /// 方法名
    pub method: String,
    /// 参数
    pub params: serde_json::Value,
}

/// ACP JSON-RPC 响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpJsonRpcResponse {
    /// JSON-RPC 版本
    pub jsonrpc: String,
    /// 请求 ID
    pub id: u64,
    /// 结果
    pub result: Option<serde_json::Value>,
    /// 错误
    pub error: Option<AcpJsonRpcError>,
}

/// ACP JSON-RPC 错误
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpJsonRpcError {
    /// 错误代码
    pub code: i32,
    /// 错误消息
    pub message: String,
    /// 附加数据
    pub data: Option<serde_json::Value>,
}

/// ACP 会话运行时
///
/// 管理与 ACP 客户端进程的通信和会话生命周期。
pub struct AcpSessionRuntime {
    /// 会话 ID
    session_id: String,
    /// 线程 ID
    thread_id: String,
    /// 子进程（stdout/stderr 已被 take）
    child: Arc<Mutex<Child>>,
    /// 子进程标准输入（单独存储以便反复写入）
    stdin: Arc<Mutex<ChildStdin>>,
    /// 会话状态
    state: Arc<Mutex<AcpSessionState>>,
    /// 事件发送器
    event_tx: broadcast::Sender<ProviderRuntimeEvent>,
    /// 请求 ID 计数器
    request_id: Arc<Mutex<u64>>,
    /// 运行时选项
    options: AcpRuntimeOptions,
    /// 待处理的响应
    pending_responses: Arc<Mutex<HashMap<u64, tokio::sync::oneshot::Sender<AcpJsonRpcResponse>>>>,
}

impl AcpSessionRuntime {
    /// 创建新的 ACP 会话运行时
    pub async fn spawn(
        spawn_input: AcpSpawnInput,
        thread_id: String,
        options: AcpRuntimeOptions,
    ) -> ProviderResult<Self> {
        info!(
            executable = %spawn_input.executable,
            thread_id = %thread_id,
            "启动 ACP 会话"
        );

        // 构建命令
        let mut cmd = Command::new(&spawn_input.executable);
        cmd.args(&spawn_input.args);

        // 设置环境变量
        for (key, value) in &spawn_input.env {
            cmd.env(key, value);
        }

        // 设置工作目录
        if let Some(cwd) = &spawn_input.cwd {
            cmd.current_dir(cwd);
        }

        // 配置标准输入输出
        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // 启动子进程
        let mut child = cmd.spawn().map_err(|e| {
            error!(error = %e, "启动 ACP 子进程失败");
            ProviderError::AdapterError(format!("启动 ACP 子进程失败: {}", e))
        })?;

        // 获取标准输入输出
        let stdin = child.stdin.take().ok_or_else(|| {
            ProviderError::AdapterError("无法获取子进程标准输入".to_string())
        })?;

        let stdout = child.stdout.take().ok_or_else(|| {
            ProviderError::AdapterError("无法获取子进程标准输出".to_string())
        })?;

        let stderr = child.stderr.take().ok_or_else(|| {
            ProviderError::AdapterError("无法获取子进程标准错误".to_string())
        })?;

        // 创建事件广播通道
        let (event_tx, _) = broadcast::channel(1000);

        // 生成会话 ID
        let session_id = format!("acp-{}", uuid::Uuid::new_v4());

        // 创建运行时实例
        let runtime = Self {
            session_id: session_id.clone(),
            thread_id: thread_id.clone(),
            child: Arc::new(Mutex::new(child)),
            stdin: Arc::new(Mutex::new(stdin)),
            state: Arc::new(Mutex::new(AcpSessionState::Initializing)),
            event_tx: event_tx.clone(),
            request_id: Arc::new(Mutex::new(0)),
            options: options.clone(),
            pending_responses: Arc::new(Mutex::new(HashMap::new())),
        };

        // 启动标准输出读取任务
        let pending_responses_clone = runtime.pending_responses.clone();
        let thread_id_clone = thread_id.clone();
        let log_responses = options.log_responses;

        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                if log_responses {
                    debug!(thread_id = %thread_id_clone, response = %line, "ACP 响应");
                }

                // 解析 JSON-RPC 响应
                if let Ok(response) = serde_json::from_str::<AcpJsonRpcResponse>(&line) {
                    let mut pending = pending_responses_clone.lock().await;
                    if let Some(sender) = pending.remove(&response.id) {
                        let _ = sender.send(response);
                    }
                }
            }
        });

        // 启动标准错误读取任务
        let thread_id_clone = thread_id.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                warn!(thread_id = %thread_id_clone, stderr = %line, "ACP 子进程错误");
            }
        });

        // 更新状态为运行中
        {
            let mut state = runtime.state.lock().await;
            *state = AcpSessionState::Running;
        }

        info!(session_id = %session_id, thread_id = %thread_id, "ACP 会话已启动");

        Ok(runtime)
    }

    /// 发送 JSON-RPC 请求
    pub async fn send_request(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> ProviderResult<serde_json::Value> {
        // 获取请求 ID
        let request_id = {
            let mut id = self.request_id.lock().await;
            *id += 1;
            *id
        };

        // 构建请求
        let request = AcpJsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: request_id,
            method: method.to_string(),
            params,
        };

        if self.options.log_requests {
            debug!(
                thread_id = %self.thread_id,
                request_id = request_id,
                method = %method,
                "发送 ACP 请求"
            );
        }

        // 序列化请求
        let request_json = serde_json::to_string(&request).map_err(|e| {
            ProviderError::AdapterError(format!("序列化请求失败: {}", e))
        })?;

        // 创建响应接收器
        let (tx, rx) = tokio::sync::oneshot::channel();
        {
            let mut pending = self.pending_responses.lock().await;
            pending.insert(request_id, tx);
        }

        // 发送请求（通过独立存储的 stdin 写入）
        {
            let mut stdin = self.stdin.lock().await;
            stdin.write_all(request_json.as_bytes()).await.map_err(|e| {
                ProviderError::AdapterError(format!("发送请求失败: {}", e))
            })?;
            stdin.write_all(b"\n").await.map_err(|e| {
                ProviderError::AdapterError(format!("发送请求失败: {}", e))
            })?;
            stdin.flush().await.map_err(|e| {
                ProviderError::AdapterError(format!("刷新标准输入失败: {}", e))
            })?;
        }

        // 等待响应
        let response = tokio::time::timeout(
            std::time::Duration::from_secs(self.options.request_timeout_secs),
            rx,
        )
        .await
        .map_err(|_| ProviderError::AdapterError("请求超时".to_string()))?
        .map_err(|_| ProviderError::AdapterError("响应通道已关闭".to_string()))?;

        // 检查错误
        if let Some(error) = response.error {
            return Err(ProviderError::AdapterError(format!(
                "ACP 错误 [{}]: {}",
                error.code, error.message
            )));
        }

        // 返回结果
        response.result.ok_or_else(|| {
            ProviderError::AdapterError("响应中缺少结果".to_string())
        })
    }

    /// 获取会话信息
    pub async fn get_session(&self) -> AcpSession {
        let state = self.state.lock().await.clone();
        AcpSession {
            id: self.session_id.clone(),
            thread_id: self.thread_id.clone(),
            state,
            model_id: String::new(),
            created_at: chrono::Utc::now(),
            last_activity_at: chrono::Utc::now(),
        }
    }

    /// 获取会话状态
    pub async fn get_state(&self) -> AcpSessionState {
        self.state.lock().await.clone()
    }

    /// 订阅事件流
    pub fn subscribe_events(&self) -> broadcast::Receiver<ProviderRuntimeEvent> {
        self.event_tx.subscribe()
    }

    /// 关闭会话
    pub async fn shutdown(&self) -> ProviderResult<()> {
        info!(session_id = %self.session_id, "关闭 ACP 会话");

        {
            let mut state = self.state.lock().await;
            *state = AcpSessionState::Completed;
        }

        {
            let mut child = self.child.lock().await;
            let _ = child.kill().await;
        }

        Ok(())
    }
}
