//! # Build/Test Runner 命令模块
//!
//! 提供自动检测项目类型并执行构建/测试的 Tauri 命令。
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `build_runner_detect` | 检测项目类型 |
//! | `build_runner_build` | 执行构建 |
//! | `build_runner_test` | 执行测试 |
//! | `build_runner_lint` | 执行 lint |
//! | `build_runner_format_check` | 执行格式化检查 |
//! | `build_runner_run_custom` | 执行自定义命令 |
//! | `build_runner_run_all` | 一键全流程（build → test → lint） |

use tokio::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::State;
use tracing::info;

use ydsz_code::build_runner::{BuildRunner, BuildResult, detect_project_type, default_commands, BuildCommands};

/// Build Runner 状态
pub struct BuildRunnerState {
    runner: Mutex<BuildRunner>,
}

impl Default for BuildRunnerState {
    fn default() -> Self {
        Self::new()
    }
}

impl BuildRunnerState {
    pub fn new() -> Self {
        Self {
            runner: Mutex::new(BuildRunner::new()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct BuildResultDto {
    pub project_type: String,
    pub action: String,
    pub command: String,
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: u64,
    pub success: bool,
    pub timed_out: bool,
}

impl From<BuildResult> for BuildResultDto {
    fn from(r: BuildResult) -> Self {
        Self {
            project_type: r.project_type,
            action: r.action,
            command: r.command,
            exit_code: r.exit_code,
            stdout: r.stdout,
            stderr: r.stderr,
            duration_ms: r.duration_ms,
            success: r.success,
            timed_out: r.timed_out,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ProjectTypeInfoDto {
    pub project_type: String,
    pub commands: BuildCommandsDto,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct BuildCommandsDto {
    pub build: String,
    pub test: String,
    pub lint: Option<String>,
    pub format_check: Option<String>,
}

impl From<BuildCommands> for BuildCommandsDto {
    fn from(c: BuildCommands) -> Self {
        Self {
            build: c.build,
            test: c.test,
            lint: c.lint,
            format_check: c.format_check,
        }
    }
}

/// 检测项目类型
#[tauri::command]
#[specta::specta]
pub async fn build_runner_detect(workspace: String) -> Result<ProjectTypeInfoDto, String> {
    info!(workspace = %workspace, "检测项目类型");
    let ptype = detect_project_type(&workspace);
    let cmds = default_commands(ptype);
    Ok(ProjectTypeInfoDto {
        project_type: ptype.as_str().to_string(),
        commands: cmds.into(),
    })
}

/// 执行构建
#[tauri::command]
#[specta::specta]
pub async fn build_runner_build(
    state: State<'_, BuildRunnerState>,
    workspace: String,
) -> Result<BuildResultDto, String> {
    info!(workspace = %workspace, "执行构建");
    let runner = state.runner.lock().await;
    let result = runner.build(&workspace).await;
    Ok(result.into())
}

/// 执行测试
#[tauri::command]
#[specta::specta]
pub async fn build_runner_test(
    state: State<'_, BuildRunnerState>,
    workspace: String,
) -> Result<BuildResultDto, String> {
    info!(workspace = %workspace, "执行测试");
    let runner = state.runner.lock().await;
    let result = runner.test(&workspace).await;
    Ok(result.into())
}

/// 执行 lint
#[tauri::command]
#[specta::specta]
pub async fn build_runner_lint(
    state: State<'_, BuildRunnerState>,
    workspace: String,
) -> Result<Option<BuildResultDto>, String> {
    info!(workspace = %workspace, "执行 lint");
    let runner = state.runner.lock().await;
    let result = runner.lint(&workspace).await;
    Ok(result.map(Into::into))
}

/// 执行格式化检查
#[tauri::command]
#[specta::specta]
pub async fn build_runner_format_check(
    state: State<'_, BuildRunnerState>,
    workspace: String,
) -> Result<Option<BuildResultDto>, String> {
    info!(workspace = %workspace, "执行格式化检查");
    let runner = state.runner.lock().await;
    let result = runner.format_check(&workspace).await;
    Ok(result.map(Into::into))
}

/// 执行自定义命令
#[tauri::command]
#[specta::specta]
pub async fn build_runner_run_custom(
    state: State<'_, BuildRunnerState>,
    workspace: String,
    command: String,
) -> Result<BuildResultDto, String> {
    info!(workspace = %workspace, command = %command, "执行自定义命令");
    let runner = state.runner.lock().await;
    let result = runner.run_custom(&workspace, &command).await;
    Ok(result.into())
}

/// 一键全流程（build → test → lint）
#[tauri::command]
#[specta::specta]
pub async fn build_runner_run_all(
    state: State<'_, BuildRunnerState>,
    workspace: String,
) -> Result<Vec<BuildResultDto>, String> {
    info!(workspace = %workspace, "一键全流程");
    let runner = state.runner.lock().await;
    let results = runner.run_all(&workspace).await;
    Ok(results.into_iter().map(Into::into).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_build_runner_state_creation() {
        let state = BuildRunnerState::new();
        let _guard = state.runner.lock().await;
    }
}
