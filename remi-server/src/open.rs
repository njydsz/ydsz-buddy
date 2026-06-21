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
/// 在系统默认文件管理器中打开指定路径。
pub fn open_in_folder(path: &str) -> Result<(), String> {
    open::that(path).map_err(|e| format!("无法打开文件: {}", e))
}

/// 检测可用的代码编辑器
///
/// 按优先级检测系统上安装的代码编辑器（VS Code、Cursor、Sublime 等）。
/// 返回检测到的编辑器命令名列表。
pub fn detect_editors() -> Vec<String> {
    let candidates = [
        "code",
        "cursor",
        "subl",
        "atom",
        "vim",
        "nvim",
        "emacs",
    ];

    candidates
        .iter()
        .filter_map(|cmd| {
            if which::which(cmd).is_ok() {
                Some(cmd.to_string())
            } else {
                None
            }
        })
        .collect()
}

/// 在指定编辑器中打开文件/目录
///
/// 使用指定的编辑器命令打开文件或目录。
pub fn open_in_editor(editor: &str, path: &str) -> Result<(), String> {
    Command::new(editor)
        .arg(path)
        .spawn()
        .map_err(|e| format!("无法启动编辑器 {}: {}", editor, e))?;
    Ok(())
}

/// 在默认编辑器中打开文件/目录
///
/// 检测系统上可用的编辑器，使用第一个检测到的编辑器打开。
pub fn open_in_default_editor(path: &str) -> Result<(), String> {
    let editors = detect_editors();
    if let Some(editor) = editors.first() {
        open_in_editor(editor, path)
    } else {
        // 没有检测到编辑器，使用系统默认程序打开
        open_in_folder(path)
    }
}

