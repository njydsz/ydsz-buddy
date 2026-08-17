//! # Agent 代码执行沙箱命令模块（P2-8）
//!
//! 提供沙箱化的命令和代码执行 Tauri 命令。
//!
//! ## 安全接入
//!
//! 所有执行请求在沙箱策略约束下进行：
//! - 命令白/黑名单检查
//! - 环境变量净化（过滤 API Key / Token 等敏感信息）
//! - 路径越权检测
//! - 超时保护与输出截断
//! - 策略违规审计记录
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `code_sandbox_execute_command` | 在沙箱中执行命令 |
//! | `code_sandbox_execute_code` | 在沙箱中执行代码片段 |
//! | `code_sandbox_get_policy` | 获取当前沙箱策略 |
//! | `code_sandbox_set_level` | 设置沙箱安全层级 |
//! | `code_sandbox_add_authorized_dir` | 添加授权目录（P0-3） |
//! | `code_sandbox_remove_authorized_dir` | 移除授权目录（P0-3） |
//! | `code_sandbox_check_path` | 检查路径是否在授权范围内（P0-3） |

use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::info;

use ydsz_work::code_sandbox::{
    SandboxExecResult, SandboxExecutor, SandboxLevel, SandboxPolicy,
};

// ============================================================================
// 状态管理
// ============================================================================

/// 沙箱执行器状态
pub struct CodeSandboxState {
    executor: Mutex<SandboxExecutor>,
}

impl Default for CodeSandboxState {
    fn default() -> Self {
        Self::new()
    }
}

impl CodeSandboxState {
    pub fn new() -> Self {
        // P0-S5: Agent 驱动的默认级别从 Workspace 切换为 Strict（白名单模式）
        // 用户通过 AuthorizedDirsPanel 显式授权目录后，Agent 方可在沙箱中读写
        Self {
            executor: Mutex::new(SandboxExecutor::new(SandboxPolicy::strict("."))),
        }
    }
}

// ============================================================================
// DTO 类型
// ============================================================================

/// 安全层级 DTO
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum SandboxLevelDto {
    Strict,
    Workspace,
    Permissive,
}

impl From<SandboxLevelDto> for SandboxLevel {
    fn from(dto: SandboxLevelDto) -> Self {
        match dto {
            SandboxLevelDto::Strict => Self::Strict,
            SandboxLevelDto::Workspace => Self::Workspace,
            SandboxLevelDto::Permissive => Self::Permissive,
        }
    }
}

impl From<SandboxLevel> for SandboxLevelDto {
    fn from(level: SandboxLevel) -> Self {
        match level {
            SandboxLevel::Strict => Self::Strict,
            SandboxLevel::Workspace => Self::Workspace,
            SandboxLevel::Permissive => Self::Permissive,
        }
    }
}

/// 沙箱策略 DTO
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SandboxPolicyDto {
    pub level: SandboxLevelDto,
    pub allowed_read_dirs: Vec<String>,
    pub allowed_write_dirs: Vec<String>,
    pub network_allowed: bool,
    pub blocked_env_vars: Vec<String>,
    pub allowed_commands: Option<Vec<String>>,
    pub blocked_commands: Vec<String>,
    pub timeout_secs: u64,
    pub max_output_bytes: usize,
}

impl From<&SandboxPolicy> for SandboxPolicyDto {
    fn from(p: &SandboxPolicy) -> Self {
        Self {
            level: p.level.into(),
            allowed_read_dirs: p.allowed_read_dirs.clone(),
            allowed_write_dirs: p.allowed_write_dirs.clone(),
            network_allowed: p.network_allowed,
            blocked_env_vars: p.blocked_env_vars.clone(),
            allowed_commands: if p.allowed_commands.is_empty() { None } else { Some(p.allowed_commands.clone()) },
            blocked_commands: p.blocked_commands.clone(),
            timeout_secs: p.timeout_secs,
            max_output_bytes: p.max_output_bytes,
        }
    }
}

/// 执行结果 DTO
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SandboxExecResultDto {
    pub command: String,
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: u64,
    pub timed_out: bool,
    pub killed: bool,
    pub policy_violations: Vec<String>,
    pub stripped_env_vars: Vec<String>,
    pub level: String,
    pub success: bool,
}

impl From<SandboxExecResult> for SandboxExecResultDto {
    fn from(r: SandboxExecResult) -> Self {
        let success = r.is_success();
        Self {
            command: r.command,
            exit_code: r.exit_code,
            stdout: r.stdout,
            stderr: r.stderr,
            duration_ms: r.duration_ms,
            timed_out: r.timed_out,
            killed: r.killed,
            policy_violations: r.policy_violations,
            stripped_env_vars: r.stripped_env_vars,
            level: "unknown".to_string(),
            success,
        }
    }
}

/// 命令执行输入
#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SandboxExecuteInput {
    /// 要执行的命令
    pub command: String,
    /// 工作目录（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    /// 额外环境变量
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env: Option<HashMap<String, String>>,
}

/// 代码执行输入
#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SandboxCodeInput {
    /// 代码内容
    pub code: String,
    /// 语言（python/javascript/node/shell/ruby）
    pub language: String,
    /// 工作目录（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
}

// ============================================================================
// Tauri 命令
// ============================================================================

/// 在沙箱中执行命令
#[tauri::command]
#[specta::specta]
pub async fn code_sandbox_execute_command(
    state: State<'_, CodeSandboxState>,
    input: SandboxExecuteInput,
) -> Result<SandboxExecResultDto, String> {
    info!(command = %input.command, "沙箱执行命令");

    let executor = (*state
        .executor
        .lock()
        .map_err(|e| e.to_string())?)
        .clone();

    let (result, _warnings) = executor
        .execute_command(&input.command, input.cwd.as_deref(), input.env.as_ref())
        .await
        .map_err(|e| e.to_string())?;

    Ok(result.into())
}

/// 在沙箱中执行代码片段
#[tauri::command]
#[specta::specta]
pub async fn code_sandbox_execute_code(
    state: State<'_, CodeSandboxState>,
    input: SandboxCodeInput,
) -> Result<SandboxExecResultDto, String> {
    info!(language = %input.language, code_len = input.code.len(), "沙箱执行代码");

    let executor = (*state
        .executor
        .lock()
        .map_err(|e| e.to_string())?)
        .clone();

    let (result, _warnings) = executor
        .execute_code(&input.code, &input.language, input.cwd.as_deref())
        .await
        .map_err(|e| e.to_string())?;

    Ok(result.into())
}

/// 获取当前沙箱策略
#[tauri::command]
#[specta::specta]
pub async fn code_sandbox_get_policy(
    state: State<'_, CodeSandboxState>,
) -> Result<SandboxPolicyDto, String> {
    let executor = state.executor.lock().map_err(|e| e.to_string())?;
    Ok(SandboxPolicyDto::from(executor.policy()))
}

/// 设置沙箱安全层级
///
/// 根据指定的层级和可选的工作区路径，重新配置沙箱策略。
#[tauri::command]
#[specta::specta]
pub async fn code_sandbox_set_level(
    state: State<'_, CodeSandboxState>,
    level: SandboxLevelDto,
    workspace: Option<String>,
) -> Result<SandboxPolicyDto, String> {
    info!(level = ?level, "设置沙箱安全层级");

    let policy = match level {
        SandboxLevelDto::Strict => {
            SandboxPolicy::strict(workspace.as_deref().unwrap_or("."))
        }
        SandboxLevelDto::Workspace => {
            SandboxPolicy::workspace(workspace.as_deref().unwrap_or("."))
        }
        SandboxLevelDto::Permissive => SandboxPolicy::permissive(),
    };

    let dto = SandboxPolicyDto::from(&policy);
    let executor = SandboxExecutor::new(policy);

    let mut guard = state.executor.lock().map_err(|e| e.to_string())?;
    *guard = executor;

    Ok(dto)
}

/// 添加授权目录（P0-3：细粒度目录授权）
///
/// 将目录添加到沙箱的读取和写入白名单中。
/// Agent 访问该目录下的文件时不会被沙箱策略阻止。
#[tauri::command]
#[specta::specta]
pub async fn code_sandbox_add_authorized_dir(
    state: State<'_, CodeSandboxState>,
    dir: String,
    read_only: Option<bool>,
) -> Result<SandboxPolicyDto, String> {
    info!(dir = %dir, read_only = ?read_only, "添加授权目录");

    let executor = state.executor.lock().map_err(|e| e.to_string())?;
    let mut policy = executor.policy().clone();

    // 避免重复添加
    if !policy.allowed_read_dirs.contains(&dir) {
        policy.allowed_read_dirs.push(dir.clone());
    }

    // 如果不是只读，也添加到写入白名单
    if read_only != Some(true) {
        if !policy.allowed_write_dirs.contains(&dir) {
            policy.allowed_write_dirs.push(dir);
        }
    }

    let dto = SandboxPolicyDto::from(&policy);
    let new_executor = SandboxExecutor::new(policy);
    drop(executor);
    *state.executor.lock().map_err(|e| e.to_string())? = new_executor;

    Ok(dto)
}

/// 移除授权目录（P0-3：细粒度目录授权）
#[tauri::command]
#[specta::specta]
pub async fn code_sandbox_remove_authorized_dir(
    state: State<'_, CodeSandboxState>,
    dir: String,
) -> Result<SandboxPolicyDto, String> {
    info!(dir = %dir, "移除授权目录");

    let executor = state.executor.lock().map_err(|e| e.to_string())?;
    let mut policy = executor.policy().clone();

    policy.allowed_read_dirs.retain(|d| d != &dir);
    policy.allowed_write_dirs.retain(|d| d != &dir);

    let dto = SandboxPolicyDto::from(&policy);
    let new_executor = SandboxExecutor::new(policy);
    drop(executor);
    *state.executor.lock().map_err(|e| e.to_string())? = new_executor;

    Ok(dto)
}

/// 检查路径是否在授权范围内（P0-3：细粒度目录授权）
///
/// 前端在 Agent 执行文件操作前可调用此命令预检查，
/// 如果返回 false，应弹出确认对话框让用户决定是否授权。
#[tauri::command]
#[specta::specta]
pub async fn code_sandbox_check_path(
    state: State<'_, CodeSandboxState>,
    path: String,
    write: Option<bool>,
) -> Result<bool, String> {
    let executor = state.executor.lock().map_err(|e| e.to_string())?;
    let policy = executor.policy();

    let check = if write == Some(true) {
        policy.check_write_path(&path)
    } else {
        policy.check_read_path(&path)
    };

    Ok(check)
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sandbox_state_creation() {
        let state = CodeSandboxState::new();
        assert!(state.executor.lock().is_ok());
    }

    #[test]
    fn test_level_dto_conversion() {
        assert_eq!(
            SandboxLevel::from(SandboxLevelDto::Strict),
            SandboxLevel::Strict
        );
        assert_eq!(
            SandboxLevel::from(SandboxLevelDto::Workspace),
            SandboxLevel::Workspace
        );
        assert_eq!(
            SandboxLevel::from(SandboxLevelDto::Permissive),
            SandboxLevel::Permissive
        );
    }

    #[test]
    fn test_result_dto_conversion() {
        let result = SandboxExecResult {
            command: "echo test".to_string(),
            exit_code: 0,
            stdout: "test".to_string(),
            stderr: String::new(),
            duration_ms: 10,
            timed_out: false,
            killed: false,
            policy_violations: vec![],
            stripped_env_vars: vec!["SECRET".to_string()],
            level: "workspace".to_string(),
        };
        let dto = SandboxExecResultDto::from(result);
        assert!(dto.success);
        assert_eq!(dto.exit_code, 0);
        assert!(!dto.stripped_env_vars.is_empty());
    }

    #[test]
    fn test_policy_dto_conversion() {
        let policy = SandboxPolicy::strict("/tmp");
        let dto = SandboxPolicyDto::from(&policy);
        assert_eq!(dto.level, SandboxLevelDto::Strict);
        assert!(!dto.allowed_commands.is_none());
        assert!(!dto.network_allowed);
    }
}
