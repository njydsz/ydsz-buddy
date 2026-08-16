//! # 系统对话框命令模块
//!
//! 本模块提供与系统对话框相关的 Tauri 命令，包括文件选择、文件保存、确认对话框和消息提示等功能。
//!
//! ## 模块职责
//!
//! - 封装 Tauri Dialog 插件的能力，提供前端可调用的对话框命令
//! - 处理文件/文件夹选择操作
//! - 处理文件保存操作（支持文件过滤器）
//! - 提供确认对话框和消息提示功能
//!
//! ## 核心功能
//!
//! 1. **文件夹选择**：通过系统原生对话框选择文件夹路径
//! 2. **文件保存**：带文件过滤器的文件保存对话框
//! 3. **确认对话框**：显示确认/取消对话框，返回用户选择
//! 4. **消息提示**：显示信息/警告/错误消息对话框
//!
//! ## 使用场景
//!
//! - 前端需要用户选择项目目录时调用 `pick_folder`
//! - 前端需要导出/保存文件时调用 `save_file`
//! - 前端需要用户确认危险操作时调用 `show_confirm`
//! - 前端需要显示提示信息时调用 `show_message`
//!
//! ## 依赖说明
//!
//! 本模块依赖 `tauri_plugin_dialog` 插件，该插件在 `lib.rs` 中已注册。

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri_plugin_dialog::DialogExt;

/// 选择文件夹对话框命令
///
/// 打开系统原生文件夹选择对话框，允许用户选择一个文件夹路径。
///
/// # 参数
///
/// - `app`: Tauri 应用句柄，用于访问对话框插件
///
/// # 返回值
///
/// - `Ok(Some(String))`: 用户选择了文件夹，返回文件夹的绝对路径
/// - `Ok(None)`: 用户取消了选择
/// - `Err(String)`: 对话框打开失败
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// const folder = await window.__TAURI__.invoke('pick_folder');
/// if (folder) {
///     console.log('用户选择了:', folder);
/// }
/// ```
#[tauri::command]
#[specta::specta]
pub async fn pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let dialog = app.dialog();
    let folder = dialog.file().blocking_pick_folder();
    Ok(folder.map(|p| p.to_string()))
}

/// 文件保存对话框命令
///
/// 打开系统原生文件保存对话框，允许用户指定保存路径并将内容写入文件。
/// 支持添加文件过滤器（如仅显示 .txt 文件）。
///
/// # 参数
///
/// - `app`: Tauri 应用句柄
/// - `default_filename`: 默认文件名（显示在对话框中的初始值）
/// - `contents`: 要保存到文件的内容字符串
/// - `filters`: 可选的文件过滤器列表，用于限制显示的文件类型
///
/// # 返回值
///
/// - `Ok(Some(String))`: 用户选择了保存路径，文件已成功写入，返回文件路径
/// - `Ok(None)`: 用户取消了保存操作
/// - `Err(String)`: 对话框打开失败或文件写入失败
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// const result = await window.__TAURI__.invoke('save_file', {
///     defaultFilename: 'export.txt',
///     contents: 'Hello World',
///     filters: [{ name: 'Text Files', extensions: ['txt'] }]
/// });
/// ```
#[tauri::command]
#[specta::specta]
pub async fn save_file(
    app: tauri::AppHandle,
    default_filename: String,
    contents: String,
    filters: Option<Vec<FileFilter>>,
) -> Result<Option<String>, String> {
    let dialog = app.dialog();
    let mut file_dialog = dialog.file().set_file_name(&default_filename);
    
    // 添加文件过滤器（如果提供）
    if let Some(filter_list) = filters {
        for filter in filter_list {
            let ext_refs: Vec<&str> = filter.extensions.iter().map(|s| s.as_str()).collect();
            file_dialog = file_dialog.add_filter(&filter.name, &ext_refs);
        }
    }
    
    let path = file_dialog.blocking_save_file();
    
    // 如果用户选择了路径，则写入文件内容
    if let Some(path) = path {
        let path_str = path.to_string();
        std::fs::write(&path_str, contents).map_err(|e| e.to_string())?;
        Ok(Some(path_str))
    } else {
        Ok(None)
    }
}

/// 文件过滤器结构
///
/// 用于在文件保存/打开对话框中过滤特定类型的文件。
///
/// # 字段说明
///
/// - `name`: 过滤器显示名称（如 'Text Files'、'Image Files'）
/// - `extensions`: 文件扩展名列表（如 ['txt', 'md']、['png', 'jpg']）
///
/// # 使用示例
///
/// ```json
/// {
///     'name': 'Text Files',
///     'extensions': ['txt', 'md', 'json']
/// }
/// ```
#[derive(Debug, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FileFilter {
    /// 过滤器显示名称
    pub name: String,
    /// 文件扩展名列表（不包含点号）
    pub extensions: Vec<String>,
}

/// 确认对话框命令
///
/// 显示一个带确认/取消按钮的消息对话框，用于让用户确认某个操作。
///
/// # 参数
///
/// - `app`: Tauri 应用句柄
/// - `message`: 要显示的消息内容
///
/// # 返回值
///
/// - `Ok(true)`: 用户点击了确认按钮
/// - `Ok(false)`: 用户点击了取消按钮或关闭了对话框
/// - `Err(String)`: 对话框显示失败
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// const confirmed = await window.__TAURI__.invoke('show_confirm', {
///     message: '确定要删除这个文件吗？'
/// });
/// if (confirmed) {
///     // 执行删除操作
/// }
/// ```
#[tauri::command]
#[specta::specta]
pub async fn show_confirm(app: tauri::AppHandle, message: String) -> Result<bool, String> {
    let dialog = app.dialog();
    let confirmed = dialog.message(&message)
        .title("确认")
        .kind(tauri_plugin_dialog::MessageDialogKind::Info)
        .blocking_show();
    Ok(confirmed)
}

/// 消息提示对话框命令
///
/// 显示一个仅带确认按钮的消息对话框，用于向用户展示信息。
///
/// # 参数
///
/// - `app`: Tauri 应用句柄
/// - `message`: 要显示的消息内容
/// - `title`: 可选的对话框标题，如果不提供则使用默认标题
///
/// # 返回值
///
/// - `Ok(())`: 消息对话框已成功显示并关闭
/// - `Err(String)`: 对话框显示失败
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// await window.__TAURI__.invoke('show_message', {
///     message: '操作成功完成！',
///     title: '提示'
/// });
/// ```
#[tauri::command]
#[specta::specta]
pub async fn show_message(app: tauri::AppHandle, message: String, title: Option<String>) -> Result<(), String> {
    let dialog = app.dialog();
    let mut msg = dialog.message(&message);
    // 如果提供了标题，则设置自定义标题
    if let Some(t) = title {
        msg = msg.title(&t);
    }
    msg.blocking_show();
    Ok(())
}

