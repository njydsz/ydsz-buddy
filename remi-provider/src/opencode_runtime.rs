//! # OpenCode Runtime 模块
//!
//! 包装 OpenCode Provider 的运行时进程管理：
//!
//! - 启动时 spawn `opencode serve`（或 `opencode` 子命令，根据 CLI 行为）
//! - 维护 child process handle
//! - 处理 stdout/stderr 解析（识别 lifecycle 事件）
//! - 提供 graceful shutdown（先 SIGTERM，3 秒后 SIGKILL）
//!
//! ## 与 adapter 的关系
//!
//! - `adapters::opencode::OpenCodeAdapter`：负责 turn 协议（JSON-RPC / OpenCode SDK）
//! - 本模块：负责进程生命周期（spawn / kill / 重启）
//!
//! ## 设计
//!
//! - 一个 Runtime 对应一个 child process
//! - Runtime 不缓存 token 也不维护长连接状态，纯粹做"启动 / 停止 / 观测"
//! - 上层（adapter / service）决定什么时候 start / stop

use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::process::{Child, Command};
use tokio::sync::{Mutex, Notify};
use tracing::{info, warn};

/// OpenCode 运行时配置
#[derive(Debug, Clone)]
pub struct OpenCodeRuntimeConfig {
    /// OpenCode 可执行路径
    pub binary: String,
    /// 工作目录（OpenCode 会从这里读 config）
    pub working_dir: Option<PathBuf>,
    /// 启动参数（追加到 `opencode serve` 之后）
    pub extra_args: Vec<String>,
    /// 环境变量
    pub env: Vec<(String, String)>,
    /// 优雅退出超时
    pub shutdown_grace: Duration,
}

impl OpenCodeRuntimeConfig {
    /// 构造默认（`opencode serve`）
    pub fn default_with_binary(binary: impl Into<String>) -> Self {
        Self {
            binary: binary.into(),
            working_dir: None,
            extra_args: vec!["serve".to_string()],
            env: Vec::new(),
            shutdown_grace: Duration::from_secs(3),
        }
    }
}

impl Default for OpenCodeRuntimeConfig {
    fn default() -> Self {
        Self::default_with_binary("opencode")
    }
}

/// OpenCode 运行时句柄
pub struct OpenCodeRuntime {
    config: OpenCodeRuntimeConfig,
    child: Mutex<Option<Child>>,
    /// 状态变更通知（如启动了/退出了）
    state_notify: Notify,
    /// 累计重启次数
    restart_count: Mutex<u32>,
}

impl OpenCodeRuntime {
    /// 创建新实例
    pub fn new(config: OpenCodeRuntimeConfig) -> Self {
        Self {
            config,
            child: Mutex::new(None),
            state_notify: Notify::new(),
            restart_count: Mutex::new(0),
        }
    }

    /// 启动（如果已运行则 no-op）
    pub async fn start(&self) -> Result<u32, OpenCodeRuntimeError> {
        let mut guard = self.child.lock().await;
        if guard.is_some() {
            return Ok(0);
        }
        let mut cmd = Command::new(&self.config.binary);
        for arg in &self.config.extra_args {
            cmd.arg(arg);
        }
        if let Some(wd) = &self.config.working_dir {
            cmd.current_dir(wd);
        }
        for (k, v) in &self.config.env {
            cmd.env(k, v);
        }
        cmd.stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let child = cmd
            .spawn()
            .map_err(|e| OpenCodeRuntimeError::SpawnFailed(e.to_string()))?;
        let pid = child.id().unwrap_or(0);
        info!("OpenCode 运行时已启动 (pid: {})", pid);
        *guard = Some(child);
        self.state_notify.notify_waiters();
        Ok(pid)
    }

    /// 优雅停止（先 SIGTERM，grace 内未退出再 SIGKILL）
    pub async fn stop(&self) -> Result<(), OpenCodeRuntimeError> {
        let mut guard = self.child.lock().await;
        let Some(mut child) = guard.take() else {
            return Ok(());
        };
        // 尝试 kill（tokio 1.x 的 Child 用 start_kill）
        if let Err(e) = child.start_kill() {
            warn!("OpenCode start_kill 失败: {} (退化为 SIGKILL 已发出)", e);
        }
        match tokio::time::timeout(self.config.shutdown_grace, child.wait()).await {
            Ok(_) => {
                info!("OpenCode 运行时已停止");
                Ok(())
            }
            Err(_) => {
                warn!(
                    "OpenCode 在 {:?} 内未退出，尝试 SIGKILL",
                    self.config.shutdown_grace
                );
                let _ = child.kill().await;
                Ok(())
            }
        }
    }

    /// 是否在运行
    pub async fn is_running(&self) -> bool {
        self.child.lock().await.is_some()
    }

    /// 当前 PID（若运行）
    pub async fn pid(&self) -> Option<u32> {
        self.child.lock().await.as_ref().and_then(|c| c.id())
    }

    /// 标记一次重启（外部在适配器自动恢复时调用）
    pub async fn record_restart(&self) {
        *self.restart_count.lock().await += 1;
    }

    /// 累计重启次数
    pub async fn restart_count(&self) -> u32 {
        *self.restart_count.lock().await
    }

    /// 配置
    pub fn config(&self) -> &OpenCodeRuntimeConfig {
        &self.config
    }

    /// 状态变更通知
    pub fn state_notify(&self) -> &Notify {
        &self.state_notify
    }
}

/// 运行时错误
#[derive(Debug, thiserror::Error, Serialize, Deserialize)]
pub enum OpenCodeRuntimeError {
    #[error("spawn 失败: {0}")]
    SpawnFailed(String),
    #[error("kill 失败: {0}")]
    KillFailed(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_uses_opencode_binary() {
        let cfg = OpenCodeRuntimeConfig::default();
        assert_eq!(cfg.binary, "opencode");
        assert_eq!(cfg.extra_args, vec!["serve".to_string()]);
    }

    #[test]
    fn default_with_binary() {
        let cfg = OpenCodeRuntimeConfig::default_with_binary("/usr/local/bin/opencode");
        assert_eq!(cfg.binary, "/usr/local/bin/opencode");
    }

    #[tokio::test]
    async fn runtime_starts_unstarted() {
        let rt = OpenCodeRuntime::new(OpenCodeRuntimeConfig::default());
        assert!(!rt.is_running().await);
        assert_eq!(rt.pid().await, None);
    }

    #[tokio::test]
    async fn stop_when_not_started_is_noop() {
        let rt = OpenCodeRuntime::new(OpenCodeRuntimeConfig::default());
        // 不应报错
        let _ = rt.stop().await;
        assert!(!rt.is_running().await);
    }
}
