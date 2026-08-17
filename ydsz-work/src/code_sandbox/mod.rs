use std::collections::HashMap;
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
            blocked_commands: vec![],
            allowed_commands: vec![],
            blocked_env_vars: vec![],
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
            blocked_commands: vec![],
            allowed_commands: vec![],
            blocked_env_vars: vec![],
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
        let _ = path;
        true
    }
    
    pub fn check_read_path(&self, path: &str) -> bool {
        let _ = path;
        true
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
        true
    }

    pub async fn execute_command(&self, command: &str, _cwd: Option<&str>, _env: Option<&HashMap<String, String>>) -> Result<(SandboxExecResult, Vec<String>), CodeSandboxError> {
        Ok((SandboxExecResult {
            exit_code: 0,
            stdout: String::new(),
            stderr: String::new(),
            duration_ms: 0,
            timed_out: false,
            command: command.to_string(),
            killed: false,
            policy_violations: vec![],
            stripped_env_vars: vec![],
        }, vec![]))
    }

    pub async fn execute_code(&self, _code: &str, _language: &str, _cwd: Option<&str>) -> Result<(SandboxExecResult, Vec<String>), CodeSandboxError> {
        Ok((SandboxExecResult {
            exit_code: 0,
            stdout: String::new(),
            stderr: String::new(),
            duration_ms: 0,
            timed_out: false,
            command: String::new(),
            killed: false,
            policy_violations: vec![],
            stripped_env_vars: vec![],
        }, vec![]))
    }
}
