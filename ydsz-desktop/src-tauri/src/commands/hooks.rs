//! # Workspace Hooks 脚本执行命令
//!
//! 提供 Hook 脚本在 Rust 后端的安全子进程执行能力。
//!
//! ## 设计原则
//!
//! - **沙箱约束**：脚本在独立子进程中执行，受超时约束
//! - **环境变量注入**：Hook 引擎自动注入 HOOK_* 系列环境变量
//! - **输出捕获**：stdout/stderr 流式捕获，返回前端用于日志展示
//!
//! ## 命令清单
//!
//! | 命令 | 说明 |
//! |------|------|
//! | `hook_run_script` | 接收脚本内容 + 环境变量，在子进程中执行 |

use std::process::Stdio;
use std::time::Duration;

use serde::{Deserialize, Serialize};

/// Hook 脚本执行请求
#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct HookRunScriptRequest {
    /// 脚本内容（shell script）
    pub script_content: String,
    /// 环境变量映射
    pub env: std::collections::HashMap<String, String>,
}

/// Hook 脚本执行结果
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct HookRunScriptResult {
    /// 退出码（0 = 成功）
    pub exit_code: i32,
    /// 标准输出
    pub stdout: String,
    /// 标准错误
    pub stderr: String,
    /// 是否超时
    pub timed_out: bool,
}

/// 默认脚本执行超时（秒）
pub const DEFAULT_HOOK_TIMEOUT_SECS: u64 = 30;

/// 执行 Hook 脚本
///
/// 使用 `sh -c`（Unix）或 `cmd /c`（Windows）在子进程中执行脚本，
/// 通过 `tokio::process::Command` 异步等待完成或超时。
#[tauri::command]
pub async fn hook_run_script(
    script_content: String,
    env: std::collections::HashMap<String, String>,
) -> Result<HookRunScriptResult, String> {
    if script_content.trim().is_empty() {
        return Err("脚本内容不能为空".to_string());
    }

    let mut child = spawn_hook_process(&script_content, &env)?;

    let timeout_duration = Duration::from_secs(DEFAULT_HOOK_TIMEOUT_SECS);

    match tokio::time::timeout(timeout_duration, wait_with_output(&mut child)).await {
        Ok(result) => {
            let (exit_code, stdout, stderr) = result.map_err(|e| format!("脚本执行异常: {}", e))?;
            Ok(HookRunScriptResult {
                exit_code,
                stdout,
                stderr,
                timed_out: false,
            })
        }
        Err(_) => {
            // 超时：kill 子进程
            let _ = child.kill().await;
            Ok(HookRunScriptResult {
                exit_code: -1,
                stdout: String::new(),
                stderr: format!("脚本执行超时（{}秒）", DEFAULT_HOOK_TIMEOUT_SECS),
                timed_out: true,
            })
        }
    }
}

/// 启动 Hook 子进程
fn spawn_hook_process(
    script_content: &str,
    env: &std::collections::HashMap<String, String>,
) -> Result<tokio::process::Child, String> {
    #[cfg(windows)]
    {
        let mut cmd = tokio::process::Command::new("cmd");
        cmd.arg("/c").arg(script_content);
        cmd.envs(env);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        cmd.stdin(Stdio::null());
        cmd.spawn()
            .map_err(|e| format!("启动脚本进程失败: {}", e))
    }

    #[cfg(not(windows))]
    {
        let mut cmd = tokio::process::Command::new("sh");
        cmd.arg("-c").arg(script_content);
        cmd.envs(env);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        cmd.stdin(Stdio::null());
        cmd.spawn()
            .map_err(|e| format!("启动脚本进程失败: {}", e))
    }
}

/// 异步等待子进程完成并收集输出
async fn wait_with_output(
    child: &mut tokio::process::Child,
) -> Result<(i32, String, String), std::io::Error> {
    let output = child.wait_with_output().await?;
    let exit_code = output.status.code().unwrap_or(-1);
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    // 限制输出大小
    let stdout = if stdout.len() > 65_536 {
        format!("{}\n...（输出截断）", &stdout[..65_536])
    } else {
        stdout
    };
    let stderr = if stderr.len() > 65_536 {
        format!("{}\n...（输出截断）", &stderr[..65_536])
    } else {
        stderr
    };

    Ok((exit_code, stdout, stderr))
}

