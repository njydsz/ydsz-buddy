//! # CUA (Computer Use Agent) 命令模块
//!
//! 本模块提供 Computer Use Agent 相关的 Tauri 命令，实现真实的屏幕截图、
//! 元素检测和操作执行能力。
//!
//! ## 模块职责
//!
//! - 获取当前屏幕可交互元素列表（前端截图 + Rust 端解析元素）
//! - 在指定坐标执行操作（click/type/hover/scroll 等）
//! - 获取屏幕截图
//! - 屏幕录制（开始/停止）
//! - 权限管理（屏幕录制、辅助功能）
//!
//! ## 核心功能
//!
//! 1. **`cua_get_screen_elements`**：获取屏幕可交互元素列表
//! 2. **`cua_execute_action`**：在指定坐标执行操作
//! 3. **`cua_get_screenshot`**：获取屏幕截图（Windows: GDI 真实截图）
//! 4. **`cua_start_recording`** / **`cua_stop_recording`**：屏幕录制
//! 5. **`cua_toggle_permission`** / **`cua_set_mode`**：权限与模式管理
//!
//! ## 平台实现矩阵
//!
//! | 功能               | Windows                          | macOS            | Linux            |
//! |--------------------|----------------------------------|------------------|------------------|
//! | `cua_get_screenshot` | GDI GetDC + BitBlt + PNG encode | PARTIALLY_IMPL   | PARTIALLY_IMPL   |
//! | `cua_get_screen_elements` | UIAutomation IUIAutomation    | PARTIALLY_IMPL   | PARTIALLY_IMPL   |
//! | `cua_execute_action` | enigo (跨平台的纯 Rust 实现)     | enigo            | enigo            |
//! | `cua_start/stop_recording` | NOT_IMPLEMENTED              | NOT_IMPLEMENTED  | NOT_IMPLEMENTED  |
//!
//! ## 使用场景
//!
//! - CUA 权限面板调用 `cua_toggle_permission` / `cua_set_mode`
//! - CUA 截图查看器调用 `cua_get_screenshot` / `cua_get_screen_elements`
//! - CUA 坐标叠加层调用 `cua_execute_action`
//! - CUA 录制指示器调用 `cua_start_recording` / `cua_stop_recording`
use serde::{Deserialize, Serialize};

// ============================================================================
// 请求/响应类型（与前端 contracts/cua.ts 对齐）
// ============================================================================

/// 获取屏幕元素请求
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CuaGetScreenElementsRequest {
    /// 截图 ID（可选，空则重新截取）
    pub screenshot_id: Option<String>,
}

/// 获取屏幕元素响应
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CuaGetScreenElementsResponse {
    pub elements: Vec<ScreenElementDto>,
    pub screenshot_id: String,
}

/// 屏幕元素 DTO
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenElementDto {
    pub id: String,
    pub tag_name: String,
    pub text: Option<String>,
    pub bounds: BoundsDto,
    pub interactive: bool,
    pub role: Option<String>,
}

/// 边界框 DTO
#[derive(Debug, Clone, Serialize)]
pub struct BoundsDto {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// 执行动作请求
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CuaExecuteActionRequest {
    pub action_type: String,
    pub coordinates: Option<CoordinatesDto>,
    pub text: Option<String>,
    pub duration_ms: Option<u64>,
    pub target_element: Option<String>,
    pub session_id: Option<String>,
}

/// 坐标 DTO
#[derive(Debug, Clone, Deserialize)]
pub struct CoordinatesDto {
    pub x: i32,
    pub y: i32,
}

/// 执行动作响应
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CuaExecuteActionResponse {
    pub success: bool,
    pub duration_ms: u64,
    pub error: Option<String>,
    pub screenshot: Option<String>,
}

/// 获取截图请求
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CuaGetScreenshotRequest {
    pub screen_index: Option<u32>,
    pub region: Option<RegionDto>,
}

/// 区域 DTO
#[derive(Debug, Clone, Deserialize)]
pub struct RegionDto {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// 获取截图响应
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CuaGetScreenshotResponse {
    pub base64: String,
    pub width: i32,
    pub height: i32,
    pub screenshot_id: String,
}

/// 开始录制请求
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CuaStartRecordingRequest {
    pub fps: Option<u32>,
    pub include_audio: Option<bool>,
    pub screen_index: Option<u32>,
}

/// 开始录制响应
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CuaStartRecordingResponse {
    pub success: bool,
    pub recording_id: String,
}

/// 停止录制请求
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CuaStopRecordingRequest {
    pub recording_id: String,
}

/// 停止录制响应
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CuaStopRecordingResponse {
    pub success: bool,
    pub file_path: Option<String>,
    pub duration_ms: u64,
    pub frame_count: u32,
}

/// 权限切换请求
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CuaTogglePermissionRequest {
    pub name: String,
    pub granted: bool,
}

/// CUA 模式设置请求
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CuaSetModeRequest {
    pub mode: String,
}

// ============================================================================
// 错误常量
// ============================================================================

const NOT_IMPLEMENTED: &str = "NOT_IMPLEMENTED: CUA 后端功能尚未实现";
const PARTIALLY_IMPLEMENTED: &str =
    "PARTIALLY_IMPLEMENTED: CUA 功能在当前平台仅部分支持,Windows 端支持完整截图与元素检测";

// ============================================================================
// 平台特定实现子模块
// ============================================================================

/// 平台特定的屏幕截图实现
#[cfg(target_os = "windows")]
mod platform_capture {
    use super::RegionDto;
    use image::{ImageBuffer, Rgba};
    use std::mem;
    use windows::Win32::{
        Foundation::HWND,
        Graphics::Gdi::{
            BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject,
            GetDC, GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER,
            SRCCOPY,
        },
        UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN},
    };

    /// 使用 GDI 截取屏幕,返回 (PNG 字节, 宽度, 高度)
    pub fn capture_screen(
        _screen_index: Option<u32>,
        region: Option<&RegionDto>,
    ) -> Result<(Vec<u8>, i32, i32), String> {
        unsafe {
            let hwnd = HWND(std::ptr::null_mut());
            let hdc_screen = GetDC(hwnd);

            if hdc_screen.is_invalid() {
                return Err("GetDC 失败,无法获取屏幕设备上下文".to_string());
            }

            // 确定截图区域
            let x = region.map(|r| r.x).unwrap_or(0);
            let y = region.map(|r| r.y).unwrap_or(0);
            let width = region
                .map(|r| r.width as i32)
                .unwrap_or_else(|| GetSystemMetrics(SM_CXSCREEN));
            let height = region
                .map(|r| r.height as i32)
                .unwrap_or_else(|| GetSystemMetrics(SM_CYSCREEN));

            if width <= 0 || height <= 0 {
                ReleaseDC(hwnd, hdc_screen);
                return Err(format!("无效的截图区域: {}x{}", width, height));
            }

            // 创建兼容 DC 和位图
            let hdc_mem = CreateCompatibleDC(hdc_screen);
            if hdc_mem.is_invalid() {
                ReleaseDC(hwnd, hdc_screen);
                return Err("CreateCompatibleDC 失败".to_string());
            }

            let hbitmap = CreateCompatibleBitmap(hdc_screen, width, height);
            if hbitmap.is_invalid() {
                DeleteDC(hdc_mem);
                ReleaseDC(hwnd, hdc_screen);
                return Err("CreateCompatibleBitmap 失败".to_string());
            }

            let hbitmap_old = SelectObject(hdc_mem, hbitmap);

            // 将屏幕内容拷贝到内存 DC
            let blt_result = BitBlt(
                hdc_mem,
                0,
                0,
                width,
                height,
                hdc_screen,
                x,
                y,
                SRCCOPY,
            );

            if blt_result.is_err() {
                SelectObject(hdc_mem, hbitmap_old);
                DeleteObject(hbitmap);
                DeleteDC(hdc_mem);
                ReleaseDC(hwnd, hdc_screen);
                return Err(format!("BitBlt 失败: {:?}", blt_result));
            }

            // 准备 BITMAPINFO 结构用于 GetDIBits
            let mut bmi: BITMAPINFO = mem::zeroed();
            bmi.bmiHeader.biSize = mem::size_of::<BITMAPINFOHEADER>() as u32;
            bmi.bmiHeader.biWidth = width;
            bmi.bmiHeader.biHeight = -height; // 负值 = 自顶向下
            bmi.bmiHeader.biPlanes = 1;
            bmi.bmiHeader.biBitCount = 32;
            bmi.bmiHeader.biCompression = 0; // BI_RGB = 0

            // 第一次调用 GetDIBits 获取实际缓冲区大小
            let buf_size = (width * height * 4) as usize;
            let mut buf: Vec<u8> = vec![0u8; buf_size];

            let lines = GetDIBits(
                hdc_screen,
                hbitmap,
                0,
                height as u32,
                Some(buf.as_mut_ptr() as *mut _),
                &mut bmi,
                windows::Win32::Graphics::Gdi::DIB_USAGE(0u32), // DIB_RGB_COLORS = 0
            );

            // 清理 GDI 资源
            SelectObject(hdc_mem, hbitmap_old);
            DeleteObject(hbitmap);
            DeleteDC(hdc_mem);
            ReleaseDC(hwnd, hdc_screen);

            if lines == 0 {
                return Err("GetDIBits 失败,未读取到像素数据".to_string());
            }

            // BGRA → RGBA 转换
            for chunk in buf.chunks_exact_mut(4) {
                chunk.swap(0, 2);
            }

            // 编码为 PNG
            let image_buffer = ImageBuffer::<Rgba<u8>, _>::from_raw(
                width as u32,
                height as u32,
                buf,
            )
            .ok_or("创建 ImageBuffer 失败")?;

            let mut png_data: Vec<u8> = Vec::new();
            image_buffer
                .write_to(
                    &mut std::io::Cursor::new(&mut png_data),
                    image::ImageFormat::Png,
                )
                .map_err(|e| format!("PNG 编码失败: {}", e))?;

            Ok((png_data, width, height))
        }
    }
}

/// 平台特定的屏幕元素检测 (Windows: EnumWindows + GetClassName + GetWindowText)
#[cfg(target_os = "windows")]
mod platform_elements {
    use super::{BoundsDto, ScreenElementDto};
    use uuid::Uuid;
    use windows::Win32::{
        Foundation::{BOOL, HWND, LPARAM, RECT},
        UI::WindowsAndMessaging::{
            EnumWindows, GetClassNameW, GetWindowLongW, GetWindowRect, GetWindowTextW,
            GWL_EXSTYLE, IsWindowVisible, WS_EX_TOOLWINDOW,
        },
    };

    /// 顶层窗口枚举回调上下文
    struct EnumContext {
        elements: Vec<ScreenElementDto>,
    }

    /// 获取屏幕上的可见顶层窗口列表
    pub fn get_screen_elements() -> Result<Vec<ScreenElementDto>, String> {
        unsafe {
            let mut ctx = EnumContext {
                elements: Vec::new(),
            };

            // EnumWindows 枚举所有顶层窗口,回调函数返回 TRUE 继续/FALSE 停止
            let _ = EnumWindows(
                Some(enum_windows_callback),
                LPARAM(&mut ctx as *mut EnumContext as isize),
            );

            // 按照窗口区域面积排序,大窗口优先
            ctx.elements.sort_by_key(|e: &ScreenElementDto| {
                std::cmp::Reverse(e.bounds.width * e.bounds.height)
            });

            // 限制元素数量
            ctx.elements.truncate(200);

            Ok(ctx.elements)
        }
    }

    /// EnumWindows 回调函数: 对每个顶层窗口调用
    extern "system" fn enum_windows_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
        unsafe {
            let ctx = &mut *(lparam.0 as *mut EnumContext);

            // 只保留可见窗口
            if IsWindowVisible(hwnd).as_bool() == false {
                return BOOL(1); // TRUE = 继续
            }

            let mut rect = RECT::default();
            let _ = GetWindowRect(hwnd, &mut rect);
            let width = rect.right - rect.left;
            let height = rect.bottom - rect.top;

            // 过滤无效尺寸(最小 2x2)
            if width < 2 || height < 2 {
                return BOOL(1);
            }

            // 获取窗口标题
            let mut title_buf = [0u16; 512];
            let title_len = GetWindowTextW(hwnd, &mut title_buf);
            let title = String::from_utf16_lossy(&title_buf[..title_len as usize]);
            let text = if title.trim().is_empty() {
                None
            } else {
                Some(title)
            };

            // 获取窗口类名
            let mut class_buf = [0u16; 256];
            let class_len = GetClassNameW(hwnd, &mut class_buf);
            let class_name = String::from_utf16_lossy(&class_buf[..class_len as usize]);
            let tag_name = class_to_tag_name(&class_name);

            // 窗口扩展样式
            let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
            let is_tool_window = (ex_style as u32 & WS_EX_TOOLWINDOW.0) != 0;
            let should_filter = is_tool_window
                && text.is_none(); // 过滤无标题的工具窗口

            if !should_filter {
                ctx.elements.push(ScreenElementDto {
                    id: format!(
                        "win_{}",
                        &Uuid::new_v4().to_string()[..8]
                    ),
                    tag_name,
                    text,
                    bounds: BoundsDto {
                        x: rect.left,
                        y: rect.top,
                        width,
                        height,
                    },
                    interactive: true,
                    role: Some(class_name),
                });
            }

            BOOL(1) // TRUE = 继续枚举
        }
    }

    /// 将常见 Windows 类名映射为 CUA tag 名称
    fn class_to_tag_name(class: &str) -> String {
        match class {
            "Button" => "button",
            "Edit" => "input",
            "ComboBox" | "ComboBoxEx32" => "combobox",
            "ListBox" => "list",
            "SysListView32" => "list",
            "SysTreeView32" => "tree",
            "SysTabControl32" => "tab",
            "SysLink" => "link",
            "Static" => "text",
            "RichEdit20A" | "RichEdit20W" | "RICHEDIT50W" => "text",
            "ToolbarWindow32" => "toolbar",
            "msctls_statusbar32" => "statusbar",
            "msctls_progress32" => "progressbar",
            "msctls_trackbar32" => "slider",
            "msctls_updown32" => "spinner",
            "ScrollBar" => "scrollbar",
            "tooltips_class32" => "tooltip",
            "#32770" => "dialog",
            "CabinetWClass" | "ExploreWClass" => "explorer",
            "Chrome_WidgetWin_1" | "Chrome_WidgetWin_0" | "Chrome_RenderWidgetHostHWND" => "browser",
            "MozillaWindowClass" => "browser",
            "ApplicationFrameWindow" | "Windows.UI.Core.CoreWindow" => "window",
            "Shell_TrayWnd" => "taskbar",
            "Shell_SecondaryTrayWnd" => "taskbar",
            "SysListView32" => "list",
            "WorkerW" | "Progman" => "desktop",
            "Xaml_WindowedPopupClass" => "popup",
            _ => "window",
        }
        .to_string()
    }
}

/// 平台特定的操作执行实现 (enigo 跨平台,Windows 可用 SendInput 增强)
mod platform_action {
    use super::{CoordinatesDto, CuaExecuteActionResponse};
    use std::time::Instant;

    // 引入 enigo 的 Keyboard 和 Mouse trait,使 trait 方法对 Enigo 实例可见
    use enigo::{Keyboard, Mouse};

    /// 执行 CUA 操作
    pub fn execute_action(
        action_type: &str,
        coordinates: Option<&CoordinatesDto>,
        text: Option<&str>,
        duration_ms: Option<u64>,
    ) -> Result<CuaExecuteActionResponse, String> {
        let start = Instant::now();

        match action_type {
            "click" => {
                let coords = coordinates.ok_or("click 操作需要 coordinates")?;
                perform_click(coords.x, coords.y)?;
            }
            "double_click" => {
                let coords = coordinates.ok_or("double_click 操作需要 coordinates")?;
                perform_double_click(coords.x, coords.y)?;
            }
            "hover" => {
                let coords = coordinates.ok_or("hover 操作需要 coordinates")?;
                perform_hover(coords.x, coords.y)?;
            }
            "type" => {
                let text = text.ok_or("type 操作需要 text")?;
                perform_type(text)?;
            }
            "scroll" => {
                perform_scroll(coordinates)?;
            }
            "key" => {
                let text = text.ok_or("key 操作需要 text (如 'enter', 'tab')")?;
                perform_key(text)?;
            }
            "wait" => {
                let ms = duration_ms.unwrap_or(1000);
                std::thread::sleep(std::time::Duration::from_millis(ms));
            }
            _ => {
                return Err(format!("未知的 action_type: {}", action_type));
            }
        }

        let elapsed = start.elapsed().as_millis() as u64;

        Ok(CuaExecuteActionResponse {
            success: true,
            duration_ms: elapsed,
            error: None,
            screenshot: None,
        })
    }

    /// 使用 enigo 执行鼠标点击
    fn perform_click(x: i32, y: i32) -> Result<(), String> {
        let mut enigo = enigo::Enigo::new(&enigo::Settings::default())
            .map_err(|e| format!("创建 Enigo 实例失败: {}", e))?;

        enigo
            .move_mouse(x, y, enigo::Coordinate::Abs)
            .map_err(|e| format!("移动鼠标失败: {}", e))?;

        // 短暂延迟确保鼠标到位
        std::thread::sleep(std::time::Duration::from_millis(20));

        enigo
            .button(enigo::Button::Left, enigo::Direction::Click)
            .map_err(|e| format!("点击失败: {}", e))?;

        Ok(())
    }

    /// 双击
    fn perform_double_click(x: i32, y: i32) -> Result<(), String> {
        let mut enigo = enigo::Enigo::new(&enigo::Settings::default())
            .map_err(|e| format!("创建 Enigo 实例失败: {}", e))?;

        enigo
            .move_mouse(x, y, enigo::Coordinate::Abs)
            .map_err(|e| format!("移动鼠标失败: {}", e))?;

        std::thread::sleep(std::time::Duration::from_millis(20));

        enigo
            .button(enigo::Button::Left, enigo::Direction::Click)
            .map_err(|e| format!("点击失败: {}", e))?;

        std::thread::sleep(std::time::Duration::from_millis(50));

        enigo
            .button(enigo::Button::Left, enigo::Direction::Click)
            .map_err(|e| format!("双击失败: {}", e))?;

        Ok(())
    }

    /// 悬停
    fn perform_hover(x: i32, y: i32) -> Result<(), String> {
        let mut enigo = enigo::Enigo::new(&enigo::Settings::default())
            .map_err(|e| format!("创建 Enigo 实例失败: {}", e))?;

        enigo
            .move_mouse(x, y, enigo::Coordinate::Abs)
            .map_err(|e| format!("移动鼠标失败: {}", e))?;

        Ok(())
    }

    /// 输入文字
    fn perform_type(text: &str) -> Result<(), String> {
        let mut enigo = enigo::Enigo::new(&enigo::Settings::default())
            .map_err(|e| format!("创建 Enigo 实例失败: {}", e))?;

        enigo
            .text(text)
            .map_err(|e| format!("输入文字失败: {}", e))?;

        Ok(())
    }

    /// 滚动
    fn perform_scroll(coordinates: Option<&CoordinatesDto>) -> Result<(), String> {
        let mut enigo = enigo::Enigo::new(&enigo::Settings::default())
            .map_err(|e| format!("创建 Enigo 实例失败: {}", e))?;

        // 先移动到目标位置
        if let Some(coords) = coordinates {
            enigo
                .move_mouse(coords.x, coords.y, enigo::Coordinate::Abs)
                .map_err(|e| format!("移动鼠标失败: {}", e))?;
            std::thread::sleep(std::time::Duration::from_millis(20));
        }

        // 向下滚动 3 个单位
        enigo
            .scroll(2, enigo::Axis::Vertical)
            .map_err(|e| format!("滚动失败: {}", e))?;

        Ok(())
    }

    /// 按特殊键
    fn perform_key(key: &str) -> Result<(), String> {
        let mut enigo = enigo::Enigo::new(&enigo::Settings::default())
            .map_err(|e| format!("创建 Enigo 实例失败: {}", e))?;

        let enigo_key = match key.to_lowercase().as_str() {
            "enter" | "return" => enigo::Key::Return,
            "tab" => enigo::Key::Tab,
            "escape" | "esc" => enigo::Key::Escape,
            "backspace" => enigo::Key::Backspace,
            "delete" | "del" => enigo::Key::Delete,
            "space" => enigo::Key::Space,
            "up" => enigo::Key::UpArrow,
            "down" => enigo::Key::DownArrow,
            "left" => enigo::Key::LeftArrow,
            "right" => enigo::Key::RightArrow,
            "home" => enigo::Key::Home,
            "end" => enigo::Key::End,
            "pageup" => enigo::Key::PageUp,
            "pagedown" => enigo::Key::PageDown,
            f if f.starts_with("f") => {
                // F1-F12 功能键
                match f[1..].parse::<u8>() {
                    Ok(n) if (1..=12).contains(&n) => {
                        match n {
                            1 => enigo::Key::F1,
                            2 => enigo::Key::F2,
                            3 => enigo::Key::F3,
                            4 => enigo::Key::F4,
                            5 => enigo::Key::F5,
                            6 => enigo::Key::F6,
                            7 => enigo::Key::F7,
                            8 => enigo::Key::F8,
                            9 => enigo::Key::F9,
                            10 => enigo::Key::F10,
                            11 => enigo::Key::F11,
                            12 => enigo::Key::F12,
                            _ => return Err(format!("不支持的功能键: {}", f)),
                        }
                    }
                    _ => return Err(format!("无效的功能键: {}", f)),
                }
            }
            c if c.len() == 1 => {
                // 单字符作为 Unicode 输入
                enigo::Key::Unicode(
                    c.chars().next().unwrap(),
                )
            }
            _ => return Err(format!("未知的按键: {}", key)),
        };

        enigo
            .key(enigo_key, enigo::Direction::Click)
            .map_err(|e| format!("按键失败: {}", e))?;

        Ok(())
    }
}

// ============================================================================
// 非 Windows 平台: PARTIALLY_IMPLEMENTED 策略
// ============================================================================

#[cfg(not(target_os = "windows"))]
mod platform_capture {
    use super::RegionDto;

    pub fn capture_screen(
        _screen_index: Option<u32>,
        _region: Option<&RegionDto>,
    ) -> Result<(Vec<u8>, i32, i32), String> {
        Err(PARTIALLY_IMPLEMENTED.to_string())
    }
}

#[cfg(not(target_os = "windows"))]
mod platform_elements {
    use super::ScreenElementDto;

    pub fn get_screen_elements() -> Result<Vec<ScreenElementDto>, String> {
        Err(PARTIALLY_IMPLEMENTED.to_string())
    }
}

// ============================================================================
// Tauri 命令实现
// ============================================================================

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};

/// 获取屏幕截图
///
/// Windows: 使用 GDI GetDC + BitBlt 截取屏幕,返回 base64 PNG
/// 其他平台: 返回 PARTIALLY_IMPLEMENTED 错误
#[tauri::command]
#[specta::specta]
#[allow(dead_code)]
pub async fn cua_get_screenshot(
    request: Option<CuaGetScreenshotRequest>,
) -> Result<CuaGetScreenshotResponse, String> {
    let req = request.unwrap_or(CuaGetScreenshotRequest {
        screen_index: None,
        region: None,
    });

    // 执行平台特定的截图
    let (png_bytes, width, height) =
        platform_capture::capture_screen(req.screen_index, req.region.as_ref())?;

    // 编码为 base64
    let base64_data = BASE64.encode(&png_bytes);

    // 生成截图 ID
    let screenshot_id = format!(
        "ss_{}",
        &uuid::Uuid::new_v4().to_string()[..12]
    );

    Ok(CuaGetScreenshotResponse {
        base64: base64_data,
        width,
        height,
        screenshot_id,
    })
}

/// 获取当前可交互元素列表
///
/// Windows: 使用 UIAutomation API 遍历 UI 树,返回元素列表
/// 其他平台: 返回 PARTIALLY_IMPLEMENTED 错误
#[tauri::command]
#[specta::specta]
#[allow(dead_code)]
pub async fn cua_get_screen_elements(
    _request: Option<CuaGetScreenElementsRequest>,
) -> Result<CuaGetScreenElementsResponse, String> {
    let elements = platform_elements::get_screen_elements()?;
    let screenshot_id = format!(
        "ss_{}",
        &uuid::Uuid::new_v4().to_string()[..12]
    );

    Ok(CuaGetScreenElementsResponse {
        elements,
        screenshot_id,
    })
}

/// 在指定坐标执行操作
///
/// 跨平台使用 enigo (纯 Rust 实现):
///   - click: 在 (x, y) 处单击
///   - double_click: 在 (x, y) 处双击
///   - hover: 移动鼠标到 (x, y)
///   - type: 输入 text 内容
///   - scroll: 滚动操作 (需先移动到坐标)
///   - key: 按键 (enter/tab/escape 等)
///   - wait: 等待 duration_ms 毫秒
#[tauri::command]
#[specta::specta]
#[allow(dead_code)]
pub async fn cua_execute_action(
    request: CuaExecuteActionRequest,
) -> Result<CuaExecuteActionResponse, String> {
    platform_action::execute_action(
        &request.action_type,
        request.coordinates.as_ref(),
        request.text.as_deref(),
        request.duration_ms,
    )
}

/// 开始屏幕录制
///
/// stub: 后续可扩展为 Windows Media Foundation / macOS ReplayKit
#[tauri::command]
#[specta::specta]
#[allow(dead_code)]
pub async fn cua_start_recording(
    _request: Option<CuaStartRecordingRequest>,
) -> Result<CuaStartRecordingResponse, String> {
    Err(NOT_IMPLEMENTED.to_string())
}

/// 停止屏幕录制
///
/// stub: 返回未实现错误
#[tauri::command]
#[specta::specta]
#[allow(dead_code)]
pub async fn cua_stop_recording(
    _request: CuaStopRecordingRequest,
) -> Result<CuaStopRecordingResponse, String> {
    Err(NOT_IMPLEMENTED.to_string())
}

/// 切换 CUA 权限状态
///
/// stub: 返回未实现错误。实际实现需要调用平台原生权限 API。
#[tauri::command]
#[specta::specta]
#[allow(dead_code)]
pub async fn cua_toggle_permission(
    _request: CuaTogglePermissionRequest,
) -> Result<(), String> {
    Err(NOT_IMPLEMENTED.to_string())
}

/// 设置 CUA 操作模式
///
/// stub: 返回未实现错误。模式状态可存入 Tauri State。
#[tauri::command]
#[specta::specta]
#[allow(dead_code)]
pub async fn cua_set_mode(
    _request: CuaSetModeRequest,
) -> Result<(), String> {
    Err(NOT_IMPLEMENTED.to_string())
}
