//! # 浏览器/编辑器启动服务模块
//!
//! 本模块提供浏览器和编辑器的启动功能，包括：
//! - 在默认浏览器中打开 URL
//! - 检测可用的编辑器
//! - 在指定编辑器中打开文件/目录
//!
//! 迁移自 Peak Code `apps/server/src/open.ts`

use std::process::Command;

/// 在默认浏览器中打开 URL
///
/// 使用系统默认浏览器打开指定的 URL。
pub fn open_browser(url: &str) -> Result<(), String> {
    open::that(url).map_err(|e| format!("无法打开浏览器: {}", e))
}

/// 在文件管理器中打开指定路径
///
/// 跨平台实现：
/// - macOS: 使用 `open`
/// - Windows: 使用 `explorer`
/// - Linux: 使用 `xdg-open`
pub fn open_in_file_manager(path: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("无法打开文件管理器: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|e| format!("无法打开文件管理器: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("无法打开文件管理器: {}", e))?;
    }
    Ok(())
}

/// 在编辑器中打开文件
///
/// 支持 VS Code、Cursor 等编辑器。如果无法识别编辑器，会尝试用系统默认方式打开。
pub fn open_in_editor(path: &str, editor_command: Option<&str>) -> Result<(), String> {
    if let Some(cmd) = editor_command {
        Command::new(cmd)
            .arg(path)
            .spawn()
            .map_err(|e| format!("无法用编辑器 {} 打开文件: {}", cmd, e))?;
    } else {
        // 尝试自动检测编辑器
        if let Some(editor) = detect_available_editor() {
            Command::new(&editor)
                .arg(path)
                .spawn()
                .map_err(|e| format!("无法用编辑器 {} 打开文件: {}", editor, e))?;
        } else {
            // 回退到系统默认方式
            open::that(path).map_err(|e| format!("无法打开文件: {}", e))?;
        }
    }
    Ok(())
}

/// 检测系统上可用的编辑器
///
/// 按优先级检测常见的编辑器：
/// 1. VS Code (`code`)
/// 2. Cursor (`cursor`)
/// 3. 其他
fn detect_available_editor() -> Option<String> {
    let candidates = ["code", "cursor", "code-insiders", "zed", "sublime", "atom"];

    for candidate in &candidates {
        if is_command_available(candidate) {
            return Some(candidate.to_string());
        }
    }

    None
}

/// 检测命令是否在 PATH 中可用
fn is_command_available(command: &str) -> bool {
    #[cfg(target_os = "windows")]
    {
        for ext in &["", ".exe", ".cmd", ".bat"] {
            let full_cmd = format!("{}{}", command, ext);
            if let Ok(output) = Command::new("where").arg(&full_cmd).output() {
                if output.status.success() {
                    return true;
                }
            }
        }
        false
    }
    #[cfg(not(target_os = "windows"))]
    {
        Command::new("which")
            .arg(command)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_available_editor() {
        let _ = detect_available_editor();
    }

    #[test]
    fn test_is_command_available() {
        #[cfg(target_os = "windows")]
        {
            assert!(is_command_available("cmd"));
        }
        #[cfg(not(target_os = "windows"))]
        {
            assert!(is_command_available("echo"));
        }
        assert!(!is_command_available("__nonexistent_command_xyz__"));
    }
}