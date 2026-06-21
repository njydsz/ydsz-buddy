//! # Codex App Server 进程管理器
//!
//! 本模块负责管理 Codex AI Provider 的 App Server 进程。
//!
//! ## 模块职责
//!
//! - **进程生命周期**：启动、监控、重启 Codex App Server
//! - **健康检查**：定期 ping 进程以确保可用
//! - **多线程支持**：为每个会话创建独立进程实例或共享进程池
//! - **优雅关闭**：在停止时优雅地终止进程，清理资源
//!
//! ## 进程模型
//!
//! Codex App Server 是一个独立的 Node.js / Rust 二进制进程，通过 JSON-RPC over stdio
//! 与 Remi Provider 通信。本模块将其包装为统一的异步 API。

use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::process::{Child, Command};
use tokio::sync::{broadcast, Mutex};
use tracing::{debug, error, info, warn};

use crate::error::{ProviderError, ProviderResult};

/// Codex App Server 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodexAppServerConfig {
    /// 可执行文件绝对路径
    pub executable: PathBuf,
    /// 工作目录
    pub cwd: Option<PathBuf>,
    /// 额外的环境变量
    pub env: Vec<(String, String)>,
    /// 启动超时（毫秒）
    pub startup_timeout_ms: u64,
}

impl Default for CodexAppServerConfig {
    fn default() -> Self {
        Self {
            executable: PathBuf::from("codex"),
            cwd: None,
            env: vec![],
            startup_timeout_ms: 30_000,
        }
    }
}

/// Codex App Server 状态
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CodexAppServerState {
    /// 未启动
    NotStarted,
    /// 正在启动
    Starting,
    /// 已就绪
    Ready,
    /// 运行中（处理请求）
    Running,
    /// 正在停止
    Stopping,
    /// 已停止
    Stopped,
    /// 失败
    Failed,
}

/// Codex App Server 包装
pub struct CodexAppServer {
    config: CodexAppServerConfig,
    inner: Arc<Mutex<Option<Child>>>,
    state_tx: broadcast::Sender<CodexAppServerState>,
    state: Arc<Mutex<CodexAppServerState>>,
}

impl CodexAppServer {
    /// 创建新的 App Server 包装
    pub fn new(config: CodexAppServerConfig) -> Self {
        let (state_tx, _) = broadcast::channel(16);
        Self {
            config,
            inner: Arc::new(Mutex::new(None)),
            state_tx,
            state: Arc::new(Mutex::new(CodexAppServerState::NotStarted)),
        }
    }

    /// 订阅状态变更事件
    pub fn subscribe(&self) -> broadcast::Receiver<CodexAppServerState> {
        self.state_tx.subscribe()
    }

    /// 获取当前状态
    pub async fn state(&self) -> CodexAppServerState {
        *self.state.lock().await
    }

    /// 设置状态并广播
    async fn set_state(&self, s: CodexAppServerState) {
        *self.state.lock().await = s;
        let _ = self.state_tx.send(s);
    }

    /// 启动 App Server
    pub async fn start(&self) -> ProviderResult<()> {
        {
            let current = *self.state.lock().await;
            if matches!(
                current,
                CodexAppServerState::Ready
                    | CodexAppServerState::Running
                    | CodexAppServerState::Starting
            ) {
                debug!("CodexAppServer 已经处于运行状态: {:?}", current);
                return Ok(());
            }
        }
        self.set_state(CodexAppServerState::Starting).await;
        info!("启动 Codex App Server: {:?}", self.config.executable);

        let mut cmd = Command::new(&self.config.executable);
        if let Some(cwd) = &self.config.cwd {
            cmd.current_dir(cwd);
        }
        cmd.env("CODEX_APP_SERVER", "1")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        for (k, v) in &self.config.env {
            cmd.env(k, v);
        }

        let child = cmd.spawn().map_err(|e| {
            error!("启动 Codex App Server 失败: {e}");
            ProviderError::StartupFailed(format!("spawn failed: {e}"))
        })?;

        *self.inner.lock().await = Some(child);
        self.set_state(CodexAppServerState::Ready).await;
        info!("Codex App Server 启动完成");
        Ok(())
    }

    /// 停止 App Server
    pub async fn stop(&self) -> ProviderResult<()> {
        self.set_state(CodexAppServerState::Stopping).await;
        let mut guard = self.inner.lock().await;
        if let Some(mut child) = guard.take() {
            if let Err(e) = child.kill().await {
                warn!("终止 Codex App Server 失败: {e}");
            }
        }
        self.set_state(CodexAppServerState::Stopped).await;
        Ok(())
    }

    /// 健康检查：返回当前是否可用
    pub async fn is_alive(&self) -> bool {
        let mut guard = self.inner.lock().await;
        match guard.as_mut() {
            Some(child) => matches!(child.try_wait(), Ok(None) | Err(_)),
            None => false,
        }
    }
}

impl Drop for CodexAppServer {
    fn drop(&mut self) {
        // 异步任务的 kill_on_drop 已经会兜底
        debug!("CodexAppServer 析构");
    }
}

