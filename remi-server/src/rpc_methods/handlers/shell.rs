//! # Shell 操作 RPC 方法模块
//!
//! 本模块注册与 Shell 操作相关的 RPC 方法，包括在编辑器中打开目录等。
//!
//! ## 注册的方法
//!
//! | 方法名 | 说明 |
//! |--------|------|
//! | `shell.openInEditor` | 在指定编辑器中打开目录 |

use std::sync::Arc;

use serde_json::Value;
use tracing::info;

use crate::rpc::RpcRouter;
use crate::rpc_methods::registration::ServiceContainer;

/// 注册 Shell 相关 RPC 方法
///
/// 将所有 Shell 操作方法注册到路由器，每个方法绑定对应的服务实例。
///
/// # 参数
///
/// - `router`: RPC 路由器实例
/// - `services`: 服务容器，提供各服务实例
pub async fn register_shell_methods(
    router: Arc<RpcRouter>,
    services: Arc<ServiceContainer>,
) {
    info!("注册 Shell RPC 方法...");

    // shell.openInEditor - 在指定编辑器中打开目录
    let config = services.config.clone();
    router
        .register("shell.openInEditor", move |params: Option<Value>| {
            let config = config.clone();
            async move {
                let params = params.ok_or_else(|| {
                    crate::error::ServerError::InvalidParams("Missing params".to_string())
                })?;

                let cwd = params
                    .get("cwd")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing cwd".to_string())
                    })?;

                let editor = params
                    .get("editor")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        crate::error::ServerError::InvalidParams("Missing editor".to_string())
                    })?;

                // 解析编辑器命令
                let (command, args) = resolve_editor_command(editor, cwd, &config)?;

                // 启动编辑器进程（detached）
                #[cfg(unix)]
                {
                    use std::os::unix::process::CommandExt;
                    let mut child = std::process::Command::new(&command)
                        .args(&args)
                        .current_dir(cwd)
                        .stdin(std::process::Stdio::null())
                        .stdout(std::process::Stdio::null())
                        .stderr(std::process::Stdio::null())
                        .before_exec(|| unsafe {
                            // 创建新的进程组，使进程独立
                            libc::setsid();
                            Ok(())
                        })
                        .spawn()
                        .map_err(|e| {
                            crate::error::ServerError::Internal(format!(
                                "Failed to spawn editor: {}",
                                e
                            ))
                        })?;

                    // 分离进程，不等待其完成
                    child.wait().ok();
                }

                #[cfg(windows)]
                {
                    use std::os::windows::process::CommandExt;
                    const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
                    const DETACHED_PROCESS: u32 = 0x00000008;

                    let mut child = std::process::Command::new(&command)
                        .args(&args)
                        .current_dir(cwd)
                        .stdin(std::process::Stdio::null())
                        .stdout(std::process::Stdio::null())
                        .stderr(std::process::Stdio::null())
                        .creation_flags(CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS)
                        .spawn()
                        .map_err(|e| {
                            crate::error::ServerError::InternalError(format!(
                                "Failed to spawn editor: {}",
                                e
                            ))
                        })?;

                    // 分离进程，不等待其完成
                    child.wait().ok();
                }

                info!("已在 {} 编辑器中打开目录: {}", editor, cwd);
                Ok(Value::Null)
            }
        })
        .await;

    info!("Shell RPC 方法注册完成");
}

/// 解析编辑器命令
///
/// 根据编辑器 ID 和当前工作目录，返回对应的命令和参数。
///
/// # 参数
///
/// - `editor_id`: 编辑器 ID
/// - `cwd`: 当前工作目录
/// - `config`: 服务器配置
///
/// # 返回值
///
/// 成功时返回 (命令, 参数列表)，失败时返回错误。
fn resolve_editor_command(
    editor_id: &str,
    cwd: &str,
    _config: &remi_config::ServerConfig,
) -> Result<(String, Vec<String>), crate::error::ServerError> {
    // 编辑器定义（与前端 contracts/editor.ts 保持一致）
    let editors = vec![
        ("cursor", vec!["cursor"], "goto"),
        ("trae", vec!["trae"], "goto"),
        ("vscode", vec!["code"], "goto"),
        ("vscode-insiders", vec!["code-insiders"], "goto"),
        ("vscodium", vec!["codium"], "goto"),
        ("zed", vec!["zed", "zeditor"], "direct-path"),
        ("antigravity", vec!["agy"], "goto"),
        ("idea", vec!["idea"], "line-column"),
        ("file-manager", vec![], "direct-path"),
    ];

    let editor_def = editors
        .iter()
        .find(|(id, _, _)| *id == editor_id)
        .ok_or_else(|| {
            crate::error::ServerError::InvalidParams(format!("Unknown editor: {}", editor_id))
        })?;

    let (id, commands, launch_style) = editor_def;

    // 文件管理器特殊处理
    if *id == "file-manager" {
        let command = file_manager_command_for_platform();
        return Ok((command, vec![cwd.to_string()]));
    }

    // 查找可用的命令
    let command = commands
        .iter()
        .find(|cmd| is_command_available(cmd))
        .or_else(|| commands.first())
        .ok_or_else(|| {
            crate::error::ServerError::InternalError(format!("No command available for editor: {}", id))
        })?;

    // 根据启动样式构建参数
    let args = match *launch_style {
        "direct-path" => vec![cwd.to_string()],
        "goto" => vec!["--goto".to_string(), cwd.to_string()],
        "line-column" => {
            // 对于 line-column 样式，暂时只传路径
            // 未来可以扩展支持行号/列号
            vec![cwd.to_string()]
        }
        _ => vec![cwd.to_string()],
    };

    Ok((command.to_string(), args))
}

/// 获取文件管理器命令
///
/// 根据当前操作系统返回对应的文件管理器命令。
fn file_manager_command_for_platform() -> String {
    if cfg!(target_os = "macos") {
        "open".to_string()
    } else if cfg!(target_os = "windows") {
        "explorer".to_string()
    } else {
        "xdg-open".to_string()
    }
}

/// 检查命令是否可用
///
/// 检查指定命令是否在系统 PATH 中可用。
///
/// # 参数
///
/// - `command`: 命令名称
///
/// # 返回值
///
/// 如果命令可用返回 true，否则返回 false。
fn is_command_available(command: &str) -> bool {
    // 使用 which/where 命令检查
    let check_cmd = if cfg!(target_os = "windows") {
        format!("where {}", command)
    } else {
        format!("which {}", command)
    };

    std::process::Command::new(if cfg!(target_os = "windows") {
        "cmd"
    } else {
        "sh"
    })
    .args(if cfg!(target_os = "windows") {
        vec!["/C", &check_cmd]
    } else {
        vec!["-c", &check_cmd]
    })
    .stdout(std::process::Stdio::null())
    .stderr(std::process::Stdio::null())
    .status()
    .map(|status| status.success())
    .unwrap_or(false)
}

