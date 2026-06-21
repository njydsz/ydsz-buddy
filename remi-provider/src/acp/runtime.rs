//! ACP 会话运行时
//!
//! 本模块提供 ACP (Agent Client Protocol) 会话的生命周期管理和进程通信能力。
//! 通过 JSON-RPC over stdio 协议与 ACP 客户端子进程进行双向通信。
//!
//! # 核心功能
//!
//! - **进程管理**：启动 ACP 客户端子进程，管理其生命周期
//! - **请求/响应**：发送 JSON-RPC 请求并等待对应的响应
//! - **事件广播**：通过 broadcast 通道发布 Provider 运行时事件
//! - **优雅关闭**：支持主动关闭子进程并清理资源
//!
//! # 架构设计
//!
//! ```text
//! ┌──────────────────────────────────────────┐
//! │        AcpSessionRuntime                  │
//! ├──────────────────────────────────────────┤
//! │  child: Mutex<Child>      ← 子进程句柄   │
//! │  stdin: Mutex<ChildStdin> ← 请求写入端   │
//! │  state: Mutex<AcpSessionState> ← 会话状态│
//! │  event_tx: broadcast       ← 事件广播    │
//! │  request_id: Mutex<u64>   ← 请求ID生成器 │
//! │  pending_responses         ← 待处理响应   │
//! └──────────────────────────────────────────┘
//!         ↓ stdin 写入          ↑ stdout 读取
//! ┌──────────────────────────────────────────┐
//! │        ACP 客户端子进程                   │
//! └──────────────────────────────────────────┘
//! ```
//!
//! # 会话生命周期
//!
//! ```text
//! ┌─────────────┐
//! │   spawn()   │ ← 启动子进程，创建运行时
//! └──────┬──────┘
//!        ↓
//! ┌─────────────┐
//! │send_request │ ← 发送 JSON-RPC 请求（可多次调用）
//! └──────┬──────┘
//!        ↓
//! ┌─────────────┐
//! │  shutdown() │ ← 关闭子进程，清理资源
//! └─────────────┘
//! ```
//!
//! # 线程安全
//!
//! - `child` 和 `stdin` 使用 `Mutex`，保证互斥访问
//! - `state` 使用 `Mutex`，保证状态变更的原子性
//! - `request_id` 使用 `Mutex`，保证 ID 递增的原子性
//! - `pending_responses` 使用 `Mutex`，保证并发安全
//!
//! # 模块依赖
//!
//! - 依赖 [`crate::acp::model::AcpSpawnInput`] 定义进程启动参数
//! - 依赖 [`crate::error`] 模块定义错误类型
//! - 被 [`crate::acp::cursor`] 和 [`crate::acp::grok`] 模块依赖

use crate::acp::json_rpc_connection::{AcpJsonRpcRequest, AcpJsonRpcResponse};
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
///
/// 描述 ACP 会话在其生命周期中所处的阶段。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AcpSessionState {
    /// 初始化中
    ///
    /// 子进程已启动但尚未完成初始化握手
    Initializing,
    /// 运行中
    ///
    /// 会话已就绪，可以正常处理请求
    Running,
    /// 已暂停
    ///
    /// 会话暂停，等待用户输入或其他条件恢复
    Paused,
    /// 已完成
    ///
    /// 会话正常结束，所有任务已完成
    Completed,
    /// 已失败
    ///
    /// 会话因错误而终止
    Failed,
}

/// ACP 会话信息
///
/// 记录 ACP 会话的基本元数据，包括标识、状态和时间信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpSession {
    /// 会话 ID
    ///
    /// 由运行时生成的唯一标识，格式为 'acp-{uuid}'
    pub id: String,
    /// 线程 ID
    ///
    /// 关联的 Remi 线程标识，用于与上层业务关联
    pub thread_id: String,
    /// 会话状态
    ///
    /// 当前会话所处的生命周期阶段
    pub state: AcpSessionState,
    /// 模型 ID
    ///
    /// 当前会话使用的 AI 模型标识
    pub model_id: String,
    /// 创建时间
    ///
    /// 会话创建的 UTC 时间戳
    pub created_at: chrono::DateTime<chrono::Utc>,
    /// 最后活动时间
    ///
    /// 会话最后一次活动的 UTC 时间戳
    pub last_activity_at: chrono::DateTime<chrono::Utc>,
}

/// ACP 运行时选项
///
/// 控制 ACP 会话运行时的行为，包括日志记录和超时设置。
#[derive(Debug, Clone)]
pub struct AcpRuntimeOptions {
    /// 是否记录请求日志
    ///
    /// 启用后，每个发送的 JSON-RPC 请求都会以 debug 级别记录日志
    pub log_requests: bool,
    /// 是否记录响应日志
    ///
    /// 启用后，每个从子进程接收的 JSON-RPC 响应都会以 debug 级别记录日志
    pub log_responses: bool,
    /// 请求超时时间（秒）
    ///
    /// 发送 JSON-RPC 请求后等待响应的最大时间，超时返回错误。
    /// 默认为 30 秒。
    pub request_timeout_secs: u64,
}

impl Default for AcpRuntimeOptions {
    /// 默认运行时选项
    ///
    /// - `log_requests`: false（不记录请求日志）
    /// - `log_responses`: false（不记录响应日志）
    /// - `request_timeout_secs`: 30（30 秒超时）
    fn default() -> Self {
        Self {
            log_requests: false,
            log_responses: false,
            request_timeout_secs: 30,
        }
    }
}

/// ACP 会话运行时
///
/// 管理与 ACP 客户端子进程的完整通信生命周期，包括进程启动、
/// JSON-RPC 请求发送、事件广播和会话关闭。
///
/// # 线程安全
///
/// 内部使用 `Arc<Mutex<...>>` 管理所有共享状态，支持多线程并发访问。
/// stdin 写入通过 Mutex 保证原子性，避免消息交错。
///
/// # 生命周期
///
/// 1. 通过 [`spawn`](AcpSessionRuntime::spawn) 创建实例，启动子进程
/// 2. 通过 [`send_request`](AcpSessionRuntime::send_request) 发送请求
/// 3. 通过 [`subscribe_events`](AcpSessionRuntime::subscribe_events) 订阅事件
/// 4. 通过 [`shutdown`](AcpSessionRuntime::shutdown) 关闭会话
pub struct AcpSessionRuntime {
    /// 会话 ID
    ///
    /// 由运行时生成的唯一标识，格式为 'acp-{uuid}'
    session_id: String,
    /// 线程 ID
    ///
    /// 关联的 Remi 线程标识
    thread_id: String,
    /// 子进程句柄
    ///
    /// ACP 客户端子进程的句柄，stdout/stderr 已被 take。
    /// 使用 `Mutex` 保证终止操作的互斥性。
    child: Arc<Mutex<Child>>,
    /// 子进程标准输入
    ///
    /// 用于向 ACP 客户端写入 JSON-RPC 请求。
    /// 使用 `Mutex` 保证写入的原子性，避免消息交错。
    stdin: Arc<Mutex<ChildStdin>>,
    /// 会话状态
    ///
    /// 当前会话的生命周期状态，使用 `Mutex` 保证状态变更的原子性。
    state: Arc<Mutex<AcpSessionState>>,
    /// 事件广播发送器
    ///
    /// 将 ACP 客户端推送的事件转换为 `ProviderRuntimeEvent` 后广播给订阅者。
    event_tx: broadcast::Sender<ProviderRuntimeEvent>,
    /// 请求 ID 计数器
    ///
    /// 自增的请求 ID 生成器，保证每个请求获得唯一 ID。
    request_id: Arc<Mutex<u64>>,
    /// 运行时选项
    ///
    /// 控制日志记录和超时等行为
    options: AcpRuntimeOptions,
    /// 待处理的响应映射表
    ///
    /// 键为请求 ID，值为 oneshot 通道的发送端。
    /// 读取线程收到响应后，根据 ID 查找并通知对应的等待方。
    pending_responses: Arc<Mutex<HashMap<u64, tokio::sync::oneshot::Sender<AcpJsonRpcResponse>>>>,
}

impl AcpSessionRuntime {
    /// 创建新的 ACP 会话运行时
    ///
    /// 启动 ACP 客户端子进程，建立 stdin/stdout/stderr 通信管道，
    /// 并启动后台读取任务处理响应和错误输出。
    ///
    /// # 参数
    ///
    /// - `spawn_input`: 进程启动参数，包含可执行文件路径、命令行参数、环境变量等
    /// - `thread_id`: 关联的 Remi 线程 ID，用于与上层业务关联
    /// - `options`: 运行时选项，控制日志记录和超时等行为
    ///
    /// # 返回值
    ///
    /// - `Ok(AcpSessionRuntime)`: 运行时创建成功
    /// - `Err(ProviderError::AdapterError)`: 进程启动失败或管道建立失败
    ///
    /// # 错误
    ///
    /// - 可执行文件不存在或无执行权限
    /// - 无法获取子进程的 stdin/stdout/stderr 管道
    ///
    /// # 启动流程
    ///
    /// 1. 根据 `spawn_input` 构建 `Command` 并配置环境变量和工作目录
    /// 2. 启动子进程并获取 stdin/stdout/stderr 管道
    /// 3. 创建事件广播通道和会话 ID
    /// 4. 启动 stdout 读取任务，处理 JSON-RPC 响应
    /// 5. 启动 stderr 读取任务，记录错误输出
    /// 6. 将会话状态更新为 `Running`
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
                    if let Some(resp_id) = response.id {
                        let mut pending = pending_responses_clone.lock().await;
                        if let Some(sender) = pending.remove(&resp_id) {
                            let _ = sender.send(response);
                        }
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
    ///
    /// 构造 JSON-RPC 2.0 请求，通过 stdin 发送给 ACP 客户端子进程，
    /// 并阻塞等待对应的响应返回。
    ///
    /// # 参数
    ///
    /// - `method`: 要调用的远程方法名
    /// - `params`: 方法参数，以 JSON Value 形式传递
    ///
    /// # 返回值
    ///
    /// - `Ok(serde_json::Value)`: 请求成功时的返回值
    /// - `Err(ProviderError::AdapterError)`: 请求失败，可能原因包括序列化失败、
    ///   发送失败、超时、响应通道关闭、服务端返回错误等
    ///
    /// # 错误
    ///
    /// - 请求序列化失败
    /// - stdin 写入失败
    /// - 等待响应超时（由 `request_timeout_secs` 控制）
    /// - 响应通道关闭（通常因为子进程退出）
    /// - 服务端返回 JSON-RPC 错误
    /// - 响应中缺少 result 字段
    ///
    /// # 并发安全
    ///
    /// stdin 写入通过 Mutex 保证原子性，多个请求可并发发送，
    /// 每个请求通过唯一的 `id` 关联其响应。
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
            id: Some(request_id),
            method: method.to_string(),
            params: Some(params),
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
    ///
    /// 返回当前会话的元数据快照，包括 ID、状态和时间信息。
    ///
    /// # 返回值
    ///
    /// 返回 [`AcpSession`] 结构体，包含会话的当前信息。
    /// 注意：`model_id` 字段当前返回空字符串，
    /// `created_at` 和 `last_activity_at` 返回当前时间。
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
    ///
    /// 返回当前会话的生命周期状态。
    ///
    /// # 返回值
    ///
    /// 返回 [`AcpSessionState`] 枚举值
    pub async fn get_state(&self) -> AcpSessionState {
        self.state.lock().await.clone()
    }

    /// 订阅事件流
    ///
    /// 创建一个新的事件接收器，用于接收 Provider 运行时事件。
    /// 多个订阅者可以同时接收相同的事件。
    ///
    /// # 返回值
    ///
    /// 返回 `broadcast::Receiver<ProviderRuntimeEvent>`，用于异步接收事件
    pub fn subscribe_events(&self) -> broadcast::Receiver<ProviderRuntimeEvent> {
        self.event_tx.subscribe()
    }

    /// 关闭会话
    ///
    /// 将会话状态更新为 `Completed`，并向子进程发送 SIGKILL 信号终止其运行。
    ///
    /// # 返回值
    ///
    /// - `Ok(())`: 关闭成功
    /// - `Err(ProviderError::AdapterError)`: 关闭失败（通常不会发生）
    ///
    /// # 注意
    ///
    /// 此方法会强制终止子进程（SIGKILL），不会等待子进程优雅退出。
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
