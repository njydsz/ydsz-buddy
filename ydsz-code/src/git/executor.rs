//! # Git 命令执行器抽象
//!
//! 提供 [`GitExecutor`] trait，让上层（GitManager / GitStatusBroadcaster）透明地
//! 在本地 git 和 SSH 远端 git 之间切换。
//!
//! ## 设计目标
//!
//! - **trait 对齐**：`LocalGitExecutor` 和 `SshGitExecutor` 实现同一套接口
//! - **复用现有类型**：直接使用 [`ExecuteGitInput`] / [`ExecuteGitResult`]，避免类型膨胀
//! - **远端 exit code**：SSH 命令拼接 `; echo "YDSZII_EXIT:$?"` 技巧获取真实退出码
//!
//! ## 与 [`GitCore`] 的关系
//!
//! `GitCore` 是旧的独立实现（无 trait），保留作为兼容 API。
//! `LocalGitExecutor` 是 trait-compliant 版本，封装 `tokio::process::Command`。
//! 后续 P0-3-C 编排层接入时，`GitCore` 将改为依赖 `dyn GitExecutor`。

use std::process::Stdio;
use std::sync::Arc;

use async_trait::async_trait;
use tokio::process::Command;
use tracing::{debug, warn};

use ydsz_shared::ssh::connection::SshConnection;

use super::core::{ExecuteGitInput, ExecuteGitResult};
use super::error::{GitError, GitResult};

/// 统一 Git 命令执行器抽象
///
/// 上层（GitManager / GitStatusBroadcaster）依赖此 trait，
/// 实现可以是 [`LocalGitExecutor`] 或 [`SshGitExecutor`]（SSH 远端）。
#[async_trait]
pub trait GitExecutor: Send + Sync {
    /// 执行 git 命令
    ///
    /// # 参数
    ///
    /// - `input`: 命令执行参数（cwd / args / env / allow_non_zero_exit）
    ///
    /// # 返回
    ///
    /// - `Ok(ExecuteGitResult)`: 命令执行完成（含退出码和输出）
    /// - `Err(GitError)`: 命令启动失败或退出码非零且 `allow_non_zero_exit = false`
    async fn execute(&self, input: ExecuteGitInput) -> GitResult<ExecuteGitResult>;
}

/// 本地 Git 执行器
///
/// 封装 `tokio::process::Command::new("git")`，与 [`super::core::GitCore::execute`] 逻辑一致。
#[derive(Debug, Clone, Default)]
pub struct LocalGitExecutor;

impl LocalGitExecutor {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl GitExecutor for LocalGitExecutor {
    async fn execute(&self, input: ExecuteGitInput) -> GitResult<ExecuteGitResult> {
        debug!(
            "执行本地 Git 命令: {} {}",
            input.operation,
            input.args.join(" ")
        );

        let mut cmd = Command::new("git");
        cmd.current_dir(&input.cwd);
        cmd.args(&input.args);
        cmd.stdin(Stdio::null());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        for (key, value) in &input.env {
            cmd.env(key, value);
        }

        let output = cmd
            .output()
            .await
            .map_err(|e| GitError::CommandError(format!("执行 Git 命令失败: {}", e)))?;

        let code = output.status.code().unwrap_or(-1);
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if code != 0 && !input.allow_non_zero_exit {
            warn!("Git 命令失败: {} - {}", input.operation, stderr);
            return Err(GitError::CommandError(format!(
                "Git {} 失败 (exit code {}): {}",
                input.operation, code, stderr
            )));
        }

        Ok(ExecuteGitResult {
            code,
            stdout,
            stderr,
        })
    }
}

/// SSH 远端 Git 执行器
///
/// 通过 SSH 连接在远端执行 git 命令。
///
/// ## exit code 获取
///
/// SSH `execute_command` 在退出码非零时返回错误，无法直接获取 exit code。
/// SshGitExecutor 拼接 `; echo "YDSZII_EXIT:$?"` 技巧：
/// 1. 命令格式：`cd '<cwd>' && <env> git <args> 2>&1; echo "YDSZII_EXIT:$?"`
/// 2. echo 总是返回 0，execute_command 返回 Ok
/// 3. 解析输出末尾的 `YDSZII_EXIT:N` 获取真实退出码
/// 4. N 之前的内容是合并的 stdout+stderr
pub struct SshGitExecutor {
    connection: Arc<SshConnection>,
}

impl std::fmt::Debug for SshGitExecutor {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SshGitExecutor").finish_non_exhaustive()
    }
}

impl SshGitExecutor {
    pub fn new(connection: Arc<SshConnection>) -> Self {
        Self { connection }
    }

    /// 转义单引号（用于 SSH 命令拼接）
    fn escape_single_quote(s: &str) -> String {
        s.replace("'", "'\\''")
    }

    /// 拼接 SSH git 命令
    fn build_command(input: &ExecuteGitInput) -> String {
        let cwd_escaped = Self::escape_single_quote(&input.cwd);

        // 环境变量 export
        let env_exports: Vec<String> = input
            .env
            .iter()
            .map(|(k, v)| {
                format!("export {}='{}'", k, Self::escape_single_quote(v))
            })
            .collect();

        // git 参数（每个参数用单引号包裹，防止 shell 解析）
        let git_args: Vec<String> = input
            .args
            .iter()
            .map(|arg| format!("'{}'", Self::escape_single_quote(arg)))
            .collect();

        let mut parts = Vec::new();
        parts.push(format!("cd '{}'", cwd_escaped));
        parts.extend(env_exports);
        parts.push(format!("git {}", git_args.join(" ")));

        // 2>&1 合并 stderr 到 stdout；echo 总是执行，获取 git 退出码
        format!(
            "({}) 2>&1; echo \"YDSZII_EXIT:$?\"",
            parts.join(" && ")
        )
    }

    /// 解析 SSH 命令输出，分离 stdout/stderr 和 exit code
    fn parse_output(raw: &str) -> (String, i32) {
        // 查找最后一行的 YDSZII_EXIT:N
        if let Some(pos) = raw.rfind("YDSZII_EXIT:") {
            let after_marker = &raw[pos + "YDSZII_EXIT:".len()..];
            let exit_code_str = after_marker.trim();
            let exit_code = exit_code_str.parse::<i32>().unwrap_or(-1);
            let output = raw[..pos].trim_end_matches('\n').to_string();
            return (output, exit_code);
        }
        // 没找到标记，返回原始输出和 -1
        (raw.to_string(), -1)
    }
}

#[async_trait]
impl GitExecutor for SshGitExecutor {
    async fn execute(&self, input: ExecuteGitInput) -> GitResult<ExecuteGitResult> {
        debug!(
            "执行远端 Git 命令: {} {}",
            input.operation,
            input.args.join(" ")
        );

        if !self.connection.is_connected().await {
            return Err(GitError::CommandError("SSH 连接已断开".to_string()));
        }

        let command = Self::build_command(&input);
        debug!("SSH git 命令: {}", command);

        let raw = self
            .connection
            .execute_command(&command)
            .await
            .map_err(|e| GitError::CommandError(format!("SSH 执行失败: {}", e)))?;

        let (output, code) = Self::parse_output(&raw.stdout);

        if code != 0 && !input.allow_non_zero_exit {
            warn!(
                "远端 Git 命令失败: {} - exit {}",
                input.operation, code
            );
            return Err(GitError::CommandError(format!(
                "Git {} 失败 (exit code {}): {}",
                input.operation, code, output
            )));
        }

        // SSH 无法分离 stdout/stderr，统一放到 stdout，stderr 留空
        Ok(ExecuteGitResult {
            code,
            stdout: output,
            stderr: String::new(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_output_with_exit_code() {
        let raw = "On branch main\nnothing to commit\nYDSZII_EXIT:0\n";
        let (output, code) = SshGitExecutor::parse_output(raw);
        assert_eq!(code, 0);
        assert_eq!(output, "On branch main\nnothing to commit");
    }

    #[test]
    fn test_parse_output_non_zero_exit() {
        let raw = "fatal: not a git repository\nYDSZII_EXIT:128\n";
        let (output, code) = SshGitExecutor::parse_output(raw);
        assert_eq!(code, 128);
        assert_eq!(output, "fatal: not a git repository");
    }

    #[test]
    fn test_parse_output_no_marker() {
        let raw = "some output without marker";
        let (output, code) = SshGitExecutor::parse_output(raw);
        assert_eq!(code, -1);
        assert_eq!(output, "some output without marker");
    }

    #[test]
    fn test_build_command_simple() {
        let input = ExecuteGitInput {
            operation: "status".to_string(),
            cwd: "/path/to/repo".to_string(),
            args: vec!["status".to_string(), "--porcelain".to_string()],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        };
        let cmd = SshGitExecutor::build_command(&input);
        assert!(cmd.contains("cd '/path/to/repo'"));
        assert!(cmd.contains("git 'status' '--porcelain'"));
        assert!(cmd.contains("YDSZII_EXIT:$?"));
        assert!(cmd.starts_with("("));
        assert!(cmd.contains("2>&1"));
    }

    #[test]
    fn test_build_command_with_env() {
        let input = ExecuteGitInput {
            operation: "commit".to_string(),
            cwd: "/repo".to_string(),
            args: vec!["commit".to_string(), "-m".to_string(), "msg".to_string()],
            env: vec![("GIT_AUTHOR_NAME".to_string(), "test".to_string())],
            allow_non_zero_exit: false,
            timeout_ms: None,
        };
        let cmd = SshGitExecutor::build_command(&input);
        assert!(cmd.contains("export GIT_AUTHOR_NAME='test'"));
        assert!(cmd.contains("git 'commit' '-m' 'msg'"));
    }

    #[test]
    fn test_build_command_escape_single_quote() {
        let input = ExecuteGitInput {
            operation: "commit".to_string(),
            cwd: "/repo".to_string(),
            args: vec![
                "commit".to_string(),
                "-m".to_string(),
                "it's a test".to_string(),
            ],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        };
        let cmd = SshGitExecutor::build_command(&input);
        // 单引号被转义为 '\''
        assert!(cmd.contains("it'\\''s a test"));
    }

    #[tokio::test]
    async fn test_local_git_executor_version() {
        // 验证 LocalGitExecutor 能正常执行 git --version
        let executor = LocalGitExecutor::new();
        let input = ExecuteGitInput {
            operation: "version".to_string(),
            cwd: std::env::temp_dir().to_string_lossy().to_string(),
            args: vec!["--version".to_string()],
            env: vec![],
            allow_non_zero_exit: false,
            timeout_ms: None,
        };
        let result = executor.execute(input).await.unwrap();
        assert_eq!(result.code, 0);
        assert!(result.stdout.contains("git version"));
    }
}
