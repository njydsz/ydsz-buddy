use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SandboxLevel {
    Strict,
    Workspace,
    Permissive,
}

#[derive(Debug, Clone)]
pub struct SandboxPolicy {
    pub level: SandboxLevel,
    pub allowed_dirs: Vec<String>,
    pub allowed_read_dirs: Vec<String>,
    pub allowed_write_dirs: Vec<String>,
    pub blocked_commands: Vec<String>,
    pub allowed_commands: Vec<String>,
    pub blocked_env_vars: Vec<String>,
    pub network_allowed: bool,
    pub timeout_secs: u64,
    pub max_output_bytes: usize,
}

impl SandboxPolicy {
    pub fn strict(workdir: &str) -> Self {
        Self {
            level: SandboxLevel::Strict,
            allowed_dirs: vec![workdir.to_string()],
            allowed_read_dirs: vec![],
            allowed_write_dirs: vec![],
            blocked_commands: vec![
                "rm".to_string(), "rmdir".to_string(), "del".to_string(),
                "format".to_string(), "mkfs".to_string(), "dd".to_string(),
                "shutdown".to_string(), "reboot".to_string(),
            ],
            allowed_commands: vec![],
            blocked_env_vars: vec!["AWS_SECRET_ACCESS_KEY".to_string(), "GITHUB_TOKEN".to_string()],
            network_allowed: false,
            timeout_secs: 30,
            max_output_bytes: 10_000_000,
        }
    }

    pub fn workspace(workdir: &str) -> Self {
        Self {
            level: SandboxLevel::Workspace,
            allowed_dirs: vec![workdir.to_string()],
            allowed_read_dirs: vec![],
            allowed_write_dirs: vec![],
            blocked_commands: vec![
                "rm".to_string(), "rmdir".to_string(), "del".to_string(),
                "format".to_string(), "shutdown".to_string(),
            ],
            allowed_commands: vec![],
            blocked_env_vars: vec!["AWS_SECRET_ACCESS_KEY".to_string()],
            network_allowed: false,
            timeout_secs: 60,
            max_output_bytes: 50_000_000,
        }
    }

    pub fn permissive() -> Self {
        Self {
            level: SandboxLevel::Permissive,
            allowed_dirs: vec![],
            allowed_read_dirs: vec![],
            allowed_write_dirs: vec![],
            blocked_commands: vec![],
            allowed_commands: vec![],
            blocked_env_vars: vec![],
            network_allowed: true,
            timeout_secs: 120,
            max_output_bytes: 100_000_000,
        }
    }
    
    pub fn check_write_path(&self, path: &str) -> bool {
        let path = Path::new(path);
        match self.level {
            SandboxLevel::Permissive => true,
            SandboxLevel::Strict | SandboxLevel::Workspace => {
                self.is_path_allowed(path, &self.allowed_dirs)
                    || self.is_path_allowed(path, &self.allowed_write_dirs)
            }
        }
    }
    
    pub fn check_read_path(&self, path: &str) -> bool {
        let path = Path::new(path);
        match self.level {
            SandboxLevel::Permissive => true,
            SandboxLevel::Strict | SandboxLevel::Workspace => {
                self.is_path_allowed(path, &self.allowed_dirs)
                    || self.is_path_allowed(path, &self.allowed_read_dirs)
            }
        }
    }

    fn is_path_allowed(&self, path: &Path, allowed: &[String]) -> bool {
        if allowed.is_empty() {
            return false;
        }
        allowed.iter().any(|dir| {
            path.starts_with(Path::new(dir))
        })
    }
}

#[derive(Debug, Serialize)]
pub struct SandboxExecResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: u64,
    pub timed_out: bool,
    pub command: String,
    pub killed: bool,
    pub policy_violations: Vec<String>,
    pub stripped_env_vars: Vec<String>,
}

impl SandboxExecResult {
    pub fn is_success(&self) -> bool {
        self.exit_code == 0
    }
}

#[derive(Debug, Clone, thiserror::Error, Serialize)]
pub enum CodeSandboxError {
    #[error("Command blocked: {0}")]
    CommandBlocked(String),
    #[error("Path not authorized: {0}")]
    PathNotAuthorized(String),
    #[error("Execution timed out")]
    Timeout,
    #[error("Policy violation: {0}")]
    PolicyViolation(String),
    #[error("Execution failed: {0}")]
    ExecutionFailed(String, Vec<String>),
}

impl CodeSandboxError {
    pub fn with_stripped_env_vars(self, _vars: Vec<String>) -> Self {
        self
    }
}

#[derive(Debug, Clone)]
pub struct SandboxExecutor {
    policy: SandboxPolicy,
}

impl SandboxExecutor {
    pub fn new(policy: SandboxPolicy) -> Self {
        Self { policy }
    }

    pub fn policy(&self) -> &SandboxPolicy {
        &self.policy
    }

    pub fn set_level(&mut self, level: SandboxLevel) {
        self.policy.level = level;
    }

    pub fn add_authorized_dir(&mut self, dir: &str) {
        self.policy.allowed_dirs.push(dir.to_string());
    }

    pub fn remove_authorized_dir(&mut self, dir: &str) {
        self.policy.allowed_dirs.retain(|d| d != dir);
    }
    
    pub fn add_write_dir(&mut self, dir: &str) {
        self.policy.allowed_write_dirs.push(dir.to_string());
    }
    
    pub fn remove_write_dir(&mut self, dir: &str) {
        self.policy.allowed_write_dirs.retain(|d| d != dir);
    }

    pub fn check_path(&self, path: &str) -> bool {
        self.policy.check_read_path(path)
    }

    /// 执行 shell 命令（真实实现）
    ///
    /// 流程：
    /// 1. 命令黑名单检查
    /// 2. 工作目录路径校验
    /// 3. 环境变量脱敏
    /// 4. 启动进程并设置超时
    /// 5. 收集输出（受 max_output_bytes 限制）
    pub async fn execute_command(
        &self,
        command: &str,
        cwd: Option<&str>,
        env: Option<&HashMap<String, String>>,
    ) -> Result<(SandboxExecResult, Vec<String>), CodeSandboxError> {
        let start = std::time::Instant::now();
        let mut violations = Vec::new();
        let mut stripped_env_vars = Vec::new();

        // 1. 命令黑名单检查
        let cmd_lower = command.trim().to_lowercase();
        for blocked in &self.policy.blocked_commands {
            if cmd_lower.starts_with(&blocked.to_lowercase()) {
                return Err(CodeSandboxError::CommandBlocked(format!(
                    "{} 在黑名单中", blocked
                )));
            }
        }

        // 2. 路径校验
        if let Some(dir) = cwd {
            if !self.policy.check_read_path(dir) {
                return Err(CodeSandboxError::PathNotAuthorized(dir.to_string()));
            }
        }

        // 3. 环境变量准备 + 脱敏
        let mut cmd_env = std::env::vars().collect::<HashMap<_, _>>();
        if let Some(extra) = env {
            for (k, v) in extra {
                cmd_env.insert(k.clone(), v.clone());
            }
        }
        for var in &self.policy.blocked_env_vars {
            if cmd_env.remove(var).is_some() {
                stripped_env_vars.push(var.clone());
            }
        }

        // 4. 构建命令
        let mut child = if cfg!(target_os = "windows") {
            tokio::process::Command::new("cmd")
        } else {
            tokio::process::Command::new("sh")
        };
        child.stdout(std::process::Stdio::piped());
        child.stderr(std::process::Stdio::piped());
        for (k, v) in &cmd_env {
            child.env(k, v);
        }
        if cfg!(target_os = "windows") {
            child.arg("/C").arg(command);
        } else {
            child.arg("-c").arg(command);
        }
        if let Some(dir) = cwd {
            child.current_dir(dir);
        }

        // 5. 执行
        let output = child.output();
        let timeout = Duration::from_secs(self.policy.timeout_secs);
        let output = match tokio::time::timeout(timeout, output).await {
            Ok(result) => result,
            Err(_) => {
                return Ok((
                    SandboxExecResult {
                        exit_code: -1,
                        stdout: String::new(),
                        stderr: "命令执行超时".to_string(),
                        duration_ms: self.policy.timeout_secs * 1000,
                        timed_out: true,
                        command: command.to_string(),
                        killed: true,
                        policy_violations: violations,
                        stripped_env_vars: stripped_env_vars.clone(),
                    },
                    stripped_env_vars,
                ));
            }
        };

        let output = match output {
            Ok(o) => o,
            Err(e) => {
                return Err(CodeSandboxError::ExecutionFailed(
                    format!("进程启动失败: {}", e),
                    vec![],
                ));
            }
        };

        // 6. 收集输出
        let max_bytes = self.policy.max_output_bytes;
        let stdout = if output.stdout.len() > max_bytes {
            format!(
                "{}...[truncated {} bytes]",
                String::from_utf8_lossy(&output.stdout[..max_bytes]),
                output.stdout.len() - max_bytes
            )
        } else {
            String::from_utf8_lossy(&output.stdout).to_string()
        };
        let stderr = if output.stderr.len() > max_bytes {
            format!(
                "{}...[truncated {} bytes]",
                String::from_utf8_lossy(&output.stderr[..max_bytes]),
                output.stderr.len() - max_bytes
            )
        } else {
            String::from_utf8_lossy(&output.stderr).to_string()
        };

        let duration_ms = start.elapsed().as_millis() as u64;

        Ok((
            SandboxExecResult {
                exit_code: output.status.code().unwrap_or(-1),
                stdout,
                stderr,
                duration_ms,
                timed_out: false,
                command: command.to_string(),
                killed: false,
                policy_violations: violations,
                stripped_env_vars: stripped_env_vars.clone(),
            },
            stripped_env_vars,
        ))
    }

    /// 执行代码片段（路由到对应解释器后 execute_command）
    pub async fn execute_code(
        &self,
        code: &str,
        language: &str,
        cwd: Option<&str>,
    ) -> Result<(SandboxExecResult, Vec<String>), CodeSandboxError> {
        let command = match language.to_lowercase().as_str() {
            "sh" | "bash" | "shell" => code.to_string(),
            "zsh" => code.to_string(),
            "python" | "python3" => format!("python -c '{}'", code.replace('\'', "'\\''")),
            "node" | "javascript" | "js" => format!("node -e '{}'", code.replace('\'', "'\\''")),
            "ts" | "typescript" => format!("npx tsx -e '{}'", code.replace('\'', "'\\''")),
            _ => {
                return Err(CodeSandboxError::PolicyViolation(format!(
                    "不支持的语言: {}", language
                )));
            }
        };
        self.execute_command(&command, cwd, None).await
    }
}
