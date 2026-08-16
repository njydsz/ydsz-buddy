//! # 命令执行器（Code 域能力）
//!
//! 提供 Agent 驱动的终端命令执行能力：
//!
//! - [`execute_command`] — 一次性执行命令，返回 stdout/stderr/exit_code
//! - [`CommandResult`] — 命令执行结果
//! - [`CommandExecutor`] — 命令执行器，支持超时、工作目录、环境变量
//!
//! ## 设计
//!
//! - 基于 `tokio::process::Command`，非 PTY（适合 Agent 一次性执行）
//! - 超时保护：默认 120s
//! - 工作目录：支持指定 cwd
//! - 环境变量：支持传入额外环境变量
//! - 安全限制：命令在 shell 中执行，但 cwd 必须存在
//!
//! ## Skill 注册
//!
//! - `code.execute` — 执行命令
//! - `code.execute_batch` — 批量执行命令

pub mod error;

pub use error::RunnerError;
pub type RunnerResult<T> = Result<T, RunnerError>;

use std::collections::HashMap;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::process::Command;
use tracing::{debug, info, warn};

// ============================================================================
// CommandResult — 命令执行结果
// ============================================================================

/// 命令执行结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandResult {
    /// 执行的命令
    pub command: String,
    /// 退出码（0 表示成功）
    pub exit_code: i32,
    /// 标准输出
    pub stdout: String,
    /// 标准错误
    pub stderr: String,
    /// 执行时长（毫秒）
    pub duration_ms: u64,
    /// 是否超时
    pub timed_out: bool,
}

impl CommandResult {
    /// 命令是否执行成功
    pub fn is_success(&self) -> bool {
        self.exit_code == 0 && !self.timed_out
    }
}

// ============================================================================
// CommandExecutor — 命令执行器
// ============================================================================

/// 命令执行器配置
#[derive(Debug, Clone)]
pub struct ExecutorConfig {
    /// 默认超时时间
    pub timeout: Duration,
    /// 最大 stdout 截断长度（字节）
    pub max_stdout: usize,
    /// 最大 stderr 截断长度（字节）
    pub max_stderr: usize,
}

impl Default for ExecutorConfig {
    fn default() -> Self {
        Self {
            timeout: Duration::from_secs(120),
            max_stdout: 1_000_000,   // ~1MB
            max_stderr: 500_000,     // ~500KB
        }
    }
}

/// 命令执行器
///
/// 提供 Agent 可调用的一次性命令执行能力。
/// 与交互式 PTY 终端不同，本执行器适合 `npm test`、`cargo build` 等一次性命令。
#[derive(Clone)]
pub struct CommandExecutor {
    config: ExecutorConfig,
}

impl CommandExecutor {
    /// 创建新的命令执行器
    pub fn new(config: ExecutorConfig) -> Self {
        Self { config }
    }

    /// 使用默认配置创建
    pub fn with_defaults() -> Self {
        Self::new(ExecutorConfig::default())
    }

    /// 执行单条命令
    ///
    /// # 参数
    ///
    /// - `command`: 要执行的命令（含参数，如 "npm test"）
    /// - `cwd`: 工作目录（可选，默认当前目录）
    /// - `env`: 额外环境变量
    /// - `timeout`: 超时时间（可选，默认使用配置值）
    pub async fn execute(
        &self,
        command: &str,
        cwd: Option<&str>,
        env: Option<&HashMap<String, String>>,
        timeout: Option<Duration>,
    ) -> RunnerResult<CommandResult> {
        let timeout = timeout.unwrap_or(self.config.timeout);
        let start = std::time::Instant::now();

        info!(command = %command, cwd = ?cwd, "执行命令");

        // 构建 shell 命令
        let (program, args) = build_shell_command(command);

        let mut cmd = Command::new(&program);
        cmd.args(&args);

        // 设置工作目录
        if let Some(dir) = cwd {
            if !std::path::Path::new(dir).exists() {
                return Err(RunnerError::InvalidCwd(dir.to_string()));
            }
            cmd.current_dir(dir);
        }

        // 设置环境变量
        if let Some(env_vars) = env {
            for (key, value) in env_vars {
                cmd.env(key, value);
            }
        }

        // 捕获 stdout/stderr
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());
        cmd.stdin(std::process::Stdio::null());

        // 在 Windows 上隐藏控制台窗口
        #[cfg(target_os = "windows")]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        // 启动子进程
        let mut child = cmd.spawn().map_err(|e| {
            RunnerError::SpawnFailed(format!("启动命令失败: {e}"))
        })?;

        // 等待完成（带超时）
        let timed_out;
        let exit_status = match tokio::time::timeout(timeout, child.wait()).await {
            Ok(Ok(status)) => {
                timed_out = false;
                Some(status)
            }
            Ok(Err(e)) => {
                warn!(command = %command, error = %e, "等待命令完成失败");
                let _ = child.kill().await;
                return Err(RunnerError::WaitFailed(e.to_string()));
            }
            Err(_) => {
                warn!(command = %command, timeout_secs = timeout.as_secs(), "命令执行超时");
                let _ = child.kill().await;
                timed_out = true;
                None
            }
        };

        // 读取 stdout/stderr
        let stdout = if let Some(mut stdout) = child.stdout.take() {
            let mut buf = Vec::new();
            use tokio::io::AsyncReadExt;
            let _ = stdout.read_to_end(&mut buf).await;
            truncate_output(String::from_utf8_lossy(&buf).to_string(), self.config.max_stdout)
        } else {
            String::new()
        };

        let stderr = if let Some(mut stderr) = child.stderr.take() {
            let mut buf = Vec::new();
            use tokio::io::AsyncReadExt;
            let _ = stderr.read_to_end(&mut buf).await;
            truncate_output(String::from_utf8_lossy(&buf).to_string(), self.config.max_stderr)
        } else {
            String::new()
        };

        let exit_code = exit_status
            .and_then(|s| s.code())
            .unwrap_or(-1);

        let duration_ms = start.elapsed().as_millis() as u64;

        debug!(
            command = %command,
            exit_code,
            duration_ms,
            stdout_len = stdout.len(),
            stderr_len = stderr.len(),
            "命令执行完成"
        );

        Ok(CommandResult {
            command: command.to_string(),
            exit_code,
            stdout,
            stderr,
            duration_ms,
            timed_out,
        })
    }

    /// 批量执行命令（顺序执行）
    ///
    /// # 参数
    ///
    /// - `commands`: 命令列表
    /// - `cwd`: 工作目录
    /// - `env`: 环境变量
    /// - `stop_on_error`: 是否在第一个失败命令时停止
    pub async fn execute_batch(
        &self,
        commands: &[String],
        cwd: Option<&str>,
        env: Option<&HashMap<String, String>>,
        stop_on_error: bool,
    ) -> RunnerResult<Vec<CommandResult>> {
        let mut results = Vec::with_capacity(commands.len());
        for cmd in commands {
            let result = self.execute(cmd, cwd, env, None).await?;
            let success = result.is_success();
            results.push(result);
            if stop_on_error && !success {
                break;
            }
        }
        Ok(results)
    }
}

/// 根据平台构建 shell 命令
fn build_shell_command(command: &str) -> (String, Vec<String>) {
    #[cfg(target_os = "windows")]
    {
        (
            "cmd".to_string(),
            vec!["/C".to_string(), command.to_string()],
        )
    }
    #[cfg(not(target_os = "windows"))]
    {
        (
            "sh".to_string(),
            vec!["-c".to_string(), command.to_string()],
        )
    }
}

/// 截断输出到最大长度
fn truncate_output(mut output: String, max_len: usize) -> String {
    if output.len() > max_len {
        let truncated = &output[..max_len];
        output = format!("{truncated}\n... [output truncated at {max_len} bytes]");
    }
    output
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_execute_echo() {
        let executor = CommandExecutor::with_defaults();
        let result = executor
            .execute("echo hello", None, None, None)
            .await
            .unwrap();
        assert!(result.is_success());
        assert!(result.stdout.contains("hello"));
    }

    #[tokio::test]
    async fn test_execute_with_cwd() {
        let executor = CommandExecutor::with_defaults();
        // 使用跨平台命令和临时目录
        let temp_dir = std::env::temp_dir();
        let cmd = if cfg!(target_os = "windows") {
            "cd"
        } else {
            "pwd"
        };
        let result = executor
            .execute(cmd, Some(temp_dir.to_str().unwrap()), None, None)
            .await
            .unwrap();
        assert!(result.is_success());
    }

    #[tokio::test]
    async fn test_execute_invalid_cwd() {
        let executor = CommandExecutor::with_defaults();
        let result = executor
            .execute("echo test", Some("/nonexistent/path/12345"), None, None)
            .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_execute_timeout() {
        let executor = CommandExecutor::new(ExecutorConfig {
            timeout: Duration::from_millis(100),
            ..Default::default()
        });
        // 运行一个会持续较长时间的命令（跨平台）
        let cmd = if cfg!(target_os = "windows") {
            "ping -n 10 127.0.0.1"
        } else {
            "sleep 5"
        };
        let result = executor
            .execute(cmd, None, None, None)
            .await
            .unwrap();
        assert!(result.timed_out);
        assert!(!result.is_success());
    }

    #[tokio::test]
    async fn test_execute_batch() {
        let executor = CommandExecutor::with_defaults();
        let commands = vec!["echo first".to_string(), "echo second".to_string()];
        let results = executor
            .execute_batch(&commands, None, None, false)
            .await
            .unwrap();
        assert_eq!(results.len(), 2);
        assert!(results[0].is_success());
        assert!(results[1].is_success());
    }

    #[tokio::test]
    async fn test_execute_batch_stop_on_error() {
        let executor = CommandExecutor::with_defaults();
        let commands = vec![
            "echo first".to_string(),
            "exit 1".to_string(),
            "echo third".to_string(),
        ];
        let results = executor
            .execute_batch(&commands, None, None, true)
            .await
            .unwrap();
        assert_eq!(results.len(), 2); // 第三条不会执行
    }

    #[test]
    fn test_command_result_is_success() {
        let success = CommandResult {
            command: "echo ok".to_string(),
            exit_code: 0,
            stdout: "ok".to_string(),
            stderr: String::new(),
            duration_ms: 10,
            timed_out: false,
        };
        assert!(success.is_success());

        let failed = CommandResult {
            command: "false".to_string(),
            exit_code: 1,
            stdout: String::new(),
            stderr: "error".to_string(),
            duration_ms: 5,
            timed_out: false,
        };
        assert!(!failed.is_success());
    }

    #[test]
    fn test_truncate_output() {
        let long = "x".repeat(2000);
        let truncated = truncate_output(long, 1000);
        assert!(truncated.len() < 2000);
        assert!(truncated.contains("truncated"));
    }

    #[test]
    fn test_build_shell_command() {
        let (program, args) = build_shell_command("echo hello");
        assert!(!program.is_empty());
        assert!(!args.is_empty());
        assert!(args.last().unwrap().contains("echo hello"));
    }
}
