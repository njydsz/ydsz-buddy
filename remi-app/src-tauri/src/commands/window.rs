//! # 窗口与系统交互命令模块
//!
//! 本模块提供与窗口管理和系统交互相关的 Tauri 命令，包括主题切换、文件管理器定位、外部链接打开等功能。
//!
//! ## 模块职责
//!
//! - 管理应用窗口的主题（明/暗模式）
//! - 在系统文件管理器中定位（选中并高亮）指定文件
//! - 使用系统默认程序打开外部链接
//!
//! ## 核心功能
//!
//! 1. **主题切换**：设置窗口为明/暗主题模式
//! 2. **文件定位**：在系统文件管理器中选中并高亮指定文件
//! 3. **外部打开**：使用系统默认浏览器/程序打开 URL
//!
//! ## 使用场景
//!
//! - 用户切换应用主题时调用 `set_theme`
//! - 用户需要在文件管理器中找到某个文件时调用 `show_in_folder`
//! - 用户需要打开外部链接时调用 `open_external`
//!
//! ## 跨平台支持
//!
//! - `show_in_folder` 命令支持 Windows（Explorer）、macOS（Finder）、Linux（xdg-open）
//! - `open_external` 通过 `open` crate 实现跨平台支持

use tauri::Manager;

/// 设置窗口主题命令
///
/// 切换应用主窗口的主题模式（明/暗）。
///
/// # 参数
///
/// - `app`: Tauri 应用句柄，用于获取主窗口
/// - `theme`: 主题名称字符串
///   - `'dark'`: 切换到暗色主题
///   - 其他值: 切换到亮色主题
///
/// # 返回值
///
/// - `Ok(())`: 设置成功
/// - `Err(String)`: 设置失败（如窗口未找到）
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例 - 切换到暗色主题
/// await window.__TAURI__.invoke('set_theme', { theme: 'dark' });
///
/// // 前端调用示例 - 切换到亮色主题
/// await window.__TAURI__.invoke('set_theme', { theme: 'light' });
/// ```
///
/// # 设计说明
///
/// - 通过窗口名称 `'main'` 获取主窗口
/// - 仅支持 `'dark'` 和非 `'dark'` 两种模式
#[tauri::command]
pub async fn set_theme(app: tauri::AppHandle, theme: String) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("Window not found")?;
    
    // 根据主题字符串设置窗口主题
    if theme == "dark" {
        window.set_theme(Some(tauri::Theme::Dark)).map_err(|e| e.to_string())?;
    } else {
        window.set_theme(Some(tauri::Theme::Light)).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

/// 在文件管理器中显示文件命令
///
/// 打开系统文件管理器并定位（选中并高亮）到指定文件。
///
/// # 参数
///
/// - `path`: 文件的绝对路径
///
/// # 返回值
///
/// - `Ok(())`: 打开成功
/// - `Err(String)`: 打开失败（如系统命令执行失败）
///
/// # 跨平台实现
///
/// | 平台 | 实现方式 |
/// |------|----------|
/// | Windows | `explorer /select,<path>` |
/// | macOS | `open -R <path>` |
/// | Linux | `xdg-open <path>` |
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// await window.__TAURI__.invoke('show_in_folder', {
///     path: '/home/user/project/file.txt'
/// });
/// ```
#[tauri::command]
pub async fn show_in_folder(path: String) -> Result<(), String> {
    // Windows: 使用 Explorer 的 /select 参数定位文件
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    // macOS: 使用 open -R 在 Finder 中定位文件
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    // Linux: 使用 xdg-open 打开文件所在目录
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

/// 打开主窗口开发者工具命令
///
/// 打开主窗口的 WebKit 开发者工具（DevTools），用于调试前端代码。
///
/// # 参数
///
/// - `app`: Tauri 应用句柄，用于获取主窗口
///
/// # 返回值
///
/// - `Ok(())`: 打开成功
/// - `Err(String)`: 打开失败（如窗口未找到）
///
/// # 使用场景
///
/// - 开发者调试前端代码时调用
/// - 用户通过 F12 或右键菜单触发
///
/// # 设计说明
///
/// - 仅在 debug 模式下有效（release 模式下 devtools 不可用）
/// - 通过窗口名称 `'main'` 获取主窗口
#[tauri::command]
pub async fn open_main_devtools(app: tauri::AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("Window not found")?;
    window.open_devtools();
    Ok(())
}

/// 使用外部程序打开 URL 命令
///
/// 使用系统默认浏览器（或其他关联程序）打开指定的 URL。
///
/// # 参数
///
/// - `url`: 要打开的 URL 字符串（如 'https://example.com'）
///
/// # 返回值
///
/// - `Ok(())`: 打开成功
/// - `Err(String)`: 打开失败
///
/// # 使用示例
///
/// ```javascript
/// // 前端调用示例
/// await window.__TAURI__.invoke('open_external', {
///     url: 'https://github.com'
/// });
/// ```
///
/// # 设计说明
///
/// - 使用 `open` crate 的 `open::that()` 方法实现跨平台打开
/// - URL 会由系统默认浏览器打开
/// - 也可以用于打开本地文件（由系统关联程序处理）
#[tauri::command]
pub async fn open_external(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}
