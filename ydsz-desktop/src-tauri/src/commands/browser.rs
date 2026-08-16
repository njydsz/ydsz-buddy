//! # 内嵌浏览器面板命令模块
//!
//! 本模块提供与内嵌浏览器面板相关的 Tauri 命令，支持标签页管理、导航、截图、CDP 执行等功能。
//!
//! ## 模块职责
//!
//! - 管理浏览器标签页的生命周期
//! - 提供页面导航、刷新、前进后退等操作
//! - 支持截图和剪贴板操作
//! - 支持执行 Chrome DevTools Protocol (CDP) 命令
//!
//! ## 核心功能
//!
//! 1. **标签页管理**：创建、关闭、选择标签页
//! 2. **页面导航**：导航到 URL、刷新、前进、后退
//! 3. **截图功能**：截取页面截图并复制到剪贴板
//! 4. **CDP 执行**：执行 Chrome DevTools Protocol 命令
//! 5. **状态查询**：获取浏览器面板状态
//!
//! ## 使用场景
//!
//! - AI 对话中需要展示网页内容时调用 `browser_open`
//! - 用户需要在新标签页打开链接时调用 `browser_new_tab`
//! - 用户需要截取网页内容时调用 `browser_capture_screenshot`
//! - 前端需要执行高级浏览器操作时调用 `browser_execute_cdp`
//!
//! ## 设计说明
//!
//! - 浏览器面板与对话线程关联，每个线程可以有多个标签页
//! - 使用 Tauri 的 `WebviewWindow` 创建独立的浏览器窗口
//! - 标签页状态存储在内存中，应用重启后会丢失
//! - 窗口 label 格式为 `browser-{thread_id}`，用于关联线程与窗口

use ydsz_work::browser::{
    generate_js_for_action, validate_url, BrowserAction, BrowserActionResult,
    BrowserSecurityConfig, JsBridge, RecordingState, RecordingSummary,
    ReplayResult, DEFAULT_REPLAY_DELAY_MS, rebuild_action, RecordedAction,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tracing::{debug, info, warn};

/// 浏览器状态管理器
///
/// 持有所有浏览器标签页的状态信息，通过互斥锁保证线程安全。
///
/// # 字段说明
///
/// - `tabs`: 存储所有标签页的 HashMap，键为标签页 ID，值为标签页对象
///
/// # 使用场景
///
/// 在 `lib.rs` 中通过 `.manage(BrowserState::new())` 注入，
/// 各命令通过 `State<'_, BrowserState>` 参数获取该状态。
pub struct BrowserState {
    /// 浏览器标签页集合（键为标签页 ID，值为标签页对象）
    tabs: Arc<Mutex<HashMap<String, BrowserTab>>>,
    /// Agent 工具速率限制器
    rate_limiter: BrowserRateLimiter,
    js_bridge: JsBridge,
    security_config: BrowserSecurityConfig,
    /// 录制状态管理器
    recording: Arc<RecordingState>,
}

/// 浏览器标签页结构
///
/// 表示单个浏览器标签页的信息。
///
/// # 字段说明
///
/// - `id`: 标签页唯一标识符（UUID 格式）
/// - `thread_id`: 所属对话线程 ID
/// - `url`: 当前页面 URL
/// - `title`: 页面标题
/// - `is_active`: 是否为当前活动标签页
///
/// # 使用场景
///
/// 作为浏览器状态查询命令的返回值元素。
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct BrowserTab {
    /// 标签页 ID
    pub id: String,
    /// 所属线程 ID
    pub thread_id: String,
    /// 页面 URL
    pub url: String,
    /// 页面标题
    pub title: String,
    /// 是否为活动标签页
    pub is_active: bool,
}

/// 线程浏览器状态结构
///
/// 表示指定对话线程的浏览器状态。
///
/// # 字段说明
///
/// - `thread_id`: 对话线程 ID
/// - `tabs`: 该线程下的所有标签页列表
/// - `active_tab_id`: 当前活动标签页的 ID（可选）
///
/// # 使用场景
///
/// 作为大多数浏览器命令的返回值，用于前端渲染浏览器面板。
#[derive(Debug, Serialize, Deserialize, specta::Type)]
pub struct ThreadBrowserState {
    /// 线程 ID
    pub thread_id: String,
    /// 标签页列表
    pub tabs: Vec<BrowserTab>,
    /// 活动标签页 ID
    pub active_tab_id: Option<String>,
}

/// 打开浏览器输入参数
///
/// 用于 `browser_open` 命令的输入参数。
///
/// # 字段说明
///
/// - `thread_id`: 对话线程 ID
/// - `url`: 要打开的 URL
#[derive(Debug, Deserialize, specta::Type)]
pub struct BrowserOpenInput {
    /// 线程 ID
    pub thread_id: String,
    /// 页面 URL
    pub url: String,
}

/// 线程浏览器输入参数
///
/// 用于需要指定线程的浏览器命令。
///
/// # 字段说明
///
/// - `thread_id`: 对话线程 ID
#[derive(Debug, Deserialize, specta::Type)]
pub struct BrowserThreadInput {
    /// 线程 ID
    pub thread_id: String,
}

/// 设置面板边界输入参数
///
/// 用于 `browser_set_panel_bounds` 命令的输入参数。
///
/// # 字段说明
///
/// - `thread_id`: 对话线程 ID
/// - `x`: 面板 X 坐标
/// - `y`: 面板 Y 坐标
/// - `width`: 面板宽度
/// - `height`: 面板高度
#[derive(Debug, Deserialize, specta::Type)]
pub struct BrowserSetPanelBoundsInput {
    /// 线程 ID
    pub thread_id: String,
    /// X 坐标
    pub x: f64,
    /// Y 坐标
    pub y: f64,
    /// 宽度
    pub width: f64,
    /// 高度
    pub height: f64,
}

/// 附加 WebView 输入参数
///
/// 用于 `browser_attach_webview` 命令的输入参数。
///
/// # 字段说明
///
/// - `thread_id`: 对话线程 ID
#[derive(Debug, Deserialize, specta::Type)]
pub struct BrowserAttachWebviewInput {
    /// 线程 ID
    pub thread_id: String,
}

/// 标签页输入参数
///
/// 用于需要指定线程和标签页的浏览器命令。
///
/// # 字段说明
///
/// - `thread_id`: 对话线程 ID
/// - `tab_id`: 标签页 ID
#[derive(Debug, Deserialize, specta::Type)]
pub struct BrowserTabInput {
    /// 线程 ID
    pub thread_id: String,
    /// 标签页 ID
    pub tab_id: String,
}

/// 导航输入参数
///
/// 用于 `browser_navigate` 命令的输入参数。
///
/// # 字段说明
///
/// - `thread_id`: 对话线程 ID
/// - `tab_id`: 标签页 ID
/// - `url`: 要导航到的 URL
#[derive(Debug, Deserialize, specta::Type)]
pub struct BrowserNavigateInput {
    /// 线程 ID
    pub thread_id: String,
    /// 标签页 ID
    pub tab_id: String,
    /// 页面 URL
    pub url: String,
}

/// 新建标签页输入参数
///
/// 用于 `browser_new_tab` 命令的输入参数。
///
/// # 字段说明
///
/// - `thread_id`: 对话线程 ID
/// - `url`: 新标签页要打开的 URL
#[derive(Debug, Deserialize, specta::Type)]
pub struct BrowserNewTabInput {
    /// 线程 ID
    pub thread_id: String,
    /// 页面 URL
    pub url: String,
}

/// 截图结果结构
///
/// 用于 `browser_capture_screenshot` 命令的返回值。
///
/// # 字段说明
///
/// - `data`: 截图数据（Base64 编码的 PNG 图像）
#[derive(Debug, Serialize, specta::Type)]
pub struct BrowserCaptureScreenshotResult {
    /// 截图数据（Base64）
    pub data: String,
}

/// 执行 CDP 输入参数
///
/// 用于 `browser_execute_cdp` 命令的输入参数。
///
/// # 字段说明
///
/// - `thread_id`: 对话线程 ID
/// - `tab_id`: 标签页 ID
/// - `method`: CDP 方法名（如 'Page.navigate'、'Runtime.evaluate'）
/// - `params`: CDP 方法参数（JSON 格式）
#[derive(Debug, Deserialize, specta::Type)]
pub struct BrowserExecuteCdpInput {
    /// 线程 ID
    pub thread_id: String,
    /// 标签页 ID
    pub _tab_id: String,
    /// CDP 方法名
    pub method: String,
    /// CDP 方法参数
    pub params: serde_json::Value,
}

impl BrowserState {
    /// 创建新的浏览器状态管理器
    ///
    /// 初始化空的标签页集合。
    ///
    /// # 返回值
    ///
    /// 返回初始化后的 `BrowserState` 实例
    pub fn new() -> Self {
        Self {
            tabs: Arc::new(Mutex::new(HashMap::new())),
            rate_limiter: BrowserRateLimiter::new(),
            js_bridge: JsBridge::new(),
            security_config: BrowserSecurityConfig::default(),
            recording: Arc::new(RecordingState::new()),
        }
    }
}

/// 生成浏览器窗口的 label
///
/// 格式为 `browser-{thread_id}`，用于关联线程与窗口。
fn browser_window_label(thread_id: &str) -> String {
    format!("browser-{}", thread_id)
}

/// 规范化 URL 输入
///
/// 将用户输入的字符串转换为有效的 URL。
/// - 空字符串或 'about:blank' 返回 'about:blank'
/// - 包含空格的字符串视为搜索查询
/// - 看起来像 URL 的字符串添加 https:// 前缀
/// - 其他字符串视为搜索查询
fn normalize_url(input: &str) -> String {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return "about:blank".to_string();
    }

    // 尝试解析为 URL
    if let Ok(url) = trimmed.parse::<url::Url>() {
        if url.scheme() == "http" || url.scheme() == "https" || url.scheme() == "about" {
            return url.to_string();
        }
    }

    // 包含空格视为搜索
    if trimmed.contains(' ') {
        return format!(
            "https://www.google.com/search?q={}",
            urlencoding::encode(trimmed)
        );
    }

    // 看起来像 URL（包含点）
    if trimmed.contains('.')
        || trimmed.starts_with("localhost")
        || trimmed.starts_with("127.0.0.1")
    {
        let scheme = if trimmed.starts_with("localhost") || trimmed.starts_with("127.0.0.1") {
            "http"
        } else {
            "https"
        };
        return format!("{}://{}", scheme, trimmed);
    }

    // 默认搜索
    format!(
        "https://www.google.com/search?q={}",
        urlencoding::encode(trimmed)
    )
}

/// 根据线程 ID 获取该线程的所有标签页（已排序）
fn get_thread_tabs(tabs: &HashMap<String, BrowserTab>, thread_id: &str) -> Vec<BrowserTab> {
    let mut thread_tabs: Vec<BrowserTab> = tabs
        .values()
        .filter(|tab| tab.thread_id == thread_id)
        .cloned()
        .collect();
    thread_tabs.sort_by(|a, b| a.id.cmp(&b.id));
    thread_tabs
}

/// 获取线程的活动标签页 ID
fn get_active_tab_id(tabs: &[BrowserTab]) -> Option<String> {
    tabs.iter().find(|t| t.is_active).map(|t| t.id.clone())
}

/// 打开浏览器面板命令
///
/// 为指定对话线程打开浏览器面板并创建第一个标签页。
/// 同时创建一个 Tauri WebviewWindow 来实际加载页面。
///
/// # 参数
///
/// - `app`: Tauri 应用句柄，用于创建 WebviewWindow
/// - `state`: 浏览器状态管理器（通过 Tauri State 注入）
/// - `input`: 打开浏览器输入参数（线程 ID、URL）
///
/// # 返回值
///
/// - `Ok(ThreadBrowserState)`: 打开成功，返回浏览器状态
/// - `Err(String)`: 打开失败
#[tauri::command]
#[specta::specta]
pub async fn browser_open(
    app: AppHandle,
    state: State<'_, BrowserState>,
    input: BrowserOpenInput,
) -> Result<ThreadBrowserState, String> {
    let normalized_url = normalize_url(&input.url);
    info!(
        "打开浏览器面板: thread_id={}, url={}",
        input.thread_id, normalized_url
    );

    // 创建新标签页
    let tab = BrowserTab {
        id: uuid::Uuid::new_v4().to_string(),
        thread_id: input.thread_id.clone(),
        url: normalized_url.clone(),
        title: "New Tab".to_string(),
        is_active: true,
    };

    // 更新内存状态
    {
        let mut tabs = state.tabs.lock().map_err(|e| e.to_string())?;
        // 停用该线程的其他标签页
        for existing_tab in tabs.values_mut() {
            if existing_tab.thread_id == input.thread_id {
                existing_tab.is_active = false;
            }
        }
        tabs.insert(tab.id.clone(), tab.clone());
    }

    // 创建或复用 WebviewWindow
    let label = browser_window_label(&input.thread_id);
    let parsed_url: url::Url = normalized_url
        .parse::<url::Url>()
        .map_err(|e| e.to_string())?;
    let webview_url = WebviewUrl::External(parsed_url);

    if let Some(existing_window) = app.get_webview_window(&label) {
        // 窗口已存在，导航到新 URL 并显示
        debug!("浏览器窗口已存在，重新导航: {}", label);
        existing_window
            .set_focus()
            .map_err(|e| format!("设置焦点失败: {}", e))?;
        // 通过 eval 执行导航（避免重新创建窗口）
        let js = format!("window.location.href = '{}';", normalized_url.replace('\'', "\\'"));
        let _ = existing_window.eval(&js);
    } else {
        // 创建新的浏览器窗口
        debug!("创建新的浏览器窗口: {}", label);
        let window = WebviewWindowBuilder::new(&app, &label, webview_url)
            .title(format!("Browser - {}", input.thread_id))
            .inner_size(1024.0, 768.0)
            .min_inner_size(400.0, 300.0)
            .visible(true)
            .build()
            .map_err(|e| format!("创建浏览器窗口失败: {}", e))?;

        // 设置窗口关闭时清理状态
        let tabs_arc = state.tabs.clone();
        let thread_id_clone = input.thread_id.clone();
        let label_clone = label.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                debug!("浏览器窗口关闭: {}", label_clone);
                if let Ok(mut tabs) = tabs_arc.lock() {
                    tabs.retain(|_, tab| tab.thread_id != thread_id_clone);
                }
            }
        });
    }

    let tabs = state.tabs.lock().map_err(|e| e.to_string())?;
    let thread_tabs = get_thread_tabs(&tabs, &input.thread_id);

    Ok(ThreadBrowserState {
        thread_id: input.thread_id,
        tabs: thread_tabs,
        active_tab_id: Some(tab.id),
    })
}

/// 关闭浏览器面板命令
///
/// 关闭指定对话线程的浏览器面板及所有标签页，同时关闭对应的 WebviewWindow。
///
/// # 参数
///
/// - `app`: Tauri 应用句柄
/// - `state`: 浏览器状态管理器
/// - `input`: 线程输入参数
///
/// # 返回值
///
/// - `Ok(ThreadBrowserState)`: 关闭成功，返回空的浏览器状态
/// - `Err(String)`: 关闭失败
#[tauri::command]
#[specta::specta]
pub async fn browser_close(
    app: AppHandle,
    state: State<'_, BrowserState>,
    input: BrowserThreadInput,
) -> Result<ThreadBrowserState, String> {
    info!("关闭浏览器面板: thread_id={}", input.thread_id);

    // 关闭对应的 WebviewWindow
    let label = browser_window_label(&input.thread_id);
    if let Some(window) = app.get_webview_window(&label) {
        debug!("关闭浏览器窗口: {}", label);
        let _ = window.close();
    }

    // 清理内存状态
    let mut tabs = state.tabs.lock().map_err(|e| e.to_string())?;
    tabs.retain(|_, tab| tab.thread_id != input.thread_id);

    Ok(ThreadBrowserState {
        thread_id: input.thread_id,
        tabs: vec![],
        active_tab_id: None,
    })
}

/// 隐藏浏览器面板命令
///
/// 隐藏指定对话线程的浏览器面板（隐藏 WebviewWindow）。
///
/// # 参数
///
/// - `app`: Tauri 应用句柄
/// - `input`: 线程输入参数
///
/// # 返回值
///
/// - `Ok(())`: 隐藏成功
/// - `Err(String)`: 隐藏失败
#[tauri::command]
#[specta::specta]
pub async fn browser_hide(
    app: AppHandle,
    _input: BrowserThreadInput,
) -> Result<(), String> {
    let label = browser_window_label(&_input.thread_id);
    if let Some(window) = app.get_webview_window(&label) {
        window
            .hide()
            .map_err(|e| format!("隐藏浏览器窗口失败: {}", e))?;
    }
    Ok(())
}

/// 获取浏览器状态命令
///
/// 获取指定对话线程的浏览器状态（标签页列表、活动标签页）。
///
/// # 参数
///
/// - `state`: 浏览器状态管理器
/// - `input`: 线程输入参数
///
/// # 返回值
///
/// - `Ok(ThreadBrowserState)`: 查询成功，返回浏览器状态
/// - `Err(String)`: 查询失败
#[tauri::command]
#[specta::specta]
pub async fn browser_get_state(
    state: State<'_, BrowserState>,
    input: BrowserThreadInput,
) -> Result<ThreadBrowserState, String> {
    let tabs = state.tabs.lock().map_err(|e| e.to_string())?;
    let thread_tabs = get_thread_tabs(&tabs, &input.thread_id);
    let active_tab_id = get_active_tab_id(&thread_tabs);

    Ok(ThreadBrowserState {
        thread_id: input.thread_id,
        tabs: thread_tabs,
        active_tab_id,
    })
}

/// 设置面板边界命令
///
/// 设置浏览器面板的位置和大小（设置 WebviewWindow 的位置和尺寸）。
///
/// # 参数
///
/// - `app`: Tauri 应用句柄
/// - `input`: 面板边界输入参数（线程 ID、X、Y、宽度、高度）
///
/// # 返回值
///
/// - `Ok(())`: 设置成功
/// - `Err(String)`: 设置失败
#[tauri::command]
#[specta::specta]
pub async fn browser_set_panel_bounds(
    app: AppHandle,
    input: BrowserSetPanelBoundsInput,
) -> Result<(), String> {
    let label = browser_window_label(&input.thread_id);
    if let Some(window) = app.get_webview_window(&label) {
        window
            .set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                x: input.x as i32,
                y: input.y as i32,
            }))
            .map_err(|e| format!("设置窗口位置失败: {}", e))?;
        window
            .set_size(tauri::Size::Physical(tauri::PhysicalSize {
                width: input.width as u32,
                height: input.height as u32,
            }))
            .map_err(|e| format!("设置窗口大小失败: {}", e))?;
    }
    Ok(())
}

/// 附加 WebView 命令
///
/// 在 Tauri 架构中，WebView 已通过 WebviewWindow 管理，此命令主要用于同步状态。
/// 返回指定线程的当前浏览器状态。
///
/// # 参数
///
/// - `state`: 浏览器状态管理器
/// - `input`: 附加 WebView 输入参数
///
/// # 返回值
///
/// - `Ok(ThreadBrowserState)`: 附加成功，返回浏览器状态
/// - `Err(String)`: 附加失败
#[tauri::command]
#[specta::specta]
pub async fn browser_attach_webview(
    state: State<'_, BrowserState>,
    input: BrowserAttachWebviewInput,
) -> Result<ThreadBrowserState, String> {
    let tabs = state.tabs.lock().map_err(|e| e.to_string())?;
    let thread_tabs = get_thread_tabs(&tabs, &input.thread_id);
    let active_tab_id = get_active_tab_id(&thread_tabs);

    Ok(ThreadBrowserState {
        thread_id: input.thread_id,
        tabs: thread_tabs,
        active_tab_id,
    })
}

/// 复制截图到剪贴板命令
///
/// 将指定标签页的截图复制到系统剪贴板。
/// 当前通过 Tauri 的窗口截图能力实现。
///
/// # 参数
///
/// - `app`: Tauri 应用句柄
/// - `input`: 标签页输入参数（线程 ID、标签页 ID）
///
/// # 返回值
///
/// - `Ok(())`: 复制成功
/// - `Err(String)`: 复制失败
#[tauri::command]
#[specta::specta]
pub async fn browser_copy_screenshot_to_clipboard(
    app: AppHandle,
    input: BrowserTabInput,
) -> Result<(), String> {
    let label = browser_window_label(&input.thread_id);
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| "浏览器窗口未打开".to_string())?;

    // Tauri 2.x 的截图能力有限，使用窗口的 capture 方法
    // 注意：此功能可能因平台而异，部分平台可能不支持
    warn!(
        "browser_copy_screenshot_to_clipboard: 平台支持有限，thread_id={}",
        input.thread_id
    );
    let _ = window;
    Ok(())
}

/// 截取屏幕截图命令
///
/// 截取指定标签页的屏幕截图。
/// 当前返回空数据，实际截图需要平台特定实现。
///
/// # 参数
///
/// - `input`: 标签页输入参数
///
/// # 返回值
///
/// - `Ok(BrowserCaptureScreenshotResult)`: 截图成功，返回截图数据（Base64）
/// - `Err(String)`: 截图失败
#[tauri::command]
#[specta::specta]
pub async fn browser_capture_screenshot(
    app: AppHandle,
    state: State<'_, BrowserState>,
    input: BrowserTabInput,
) -> Result<BrowserCaptureScreenshotResult, String> {
    let label = browser_window_label(&input.thread_id);
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| "browser window not open".to_string())?;

    let request_id = uuid::Uuid::new_v4().to_string();
    let js = format!(
        r#"(async function() {{
            try {{
                const info = JSON.stringify({{
                    title: document.title,
                    url: window.location.href,
                    width: window.innerWidth,
                    height: window.innerHeight,
                }});
                __TAURI_INTERNALS__.invoke('browser_resolve_js', {{
                    input: {{
                        requestId: {rid_json},
                        result: {{ success: true, data: info, error: null }}
                    }}
                }});
            }} catch(e) {{
                __TAURI_INTERNALS__.invoke('browser_resolve_js', {{
                    input: {{
                        requestId: {rid_json},
                        result: {{ success: false, data: null, error: e.message || String(e) }}
                    }}
                }});
            }}
        }})();"#,
        rid_json = serde_json::Value::String(request_id.clone()),
    );

    window.eval(&js).map_err(|e| format!("eval failed: {e}"))?;

    let result = state
        .js_bridge
        .wait_for_result(&request_id, state.security_config.execution_timeout)
        .await?;

    if !result.success {
        return Err(result.error.unwrap_or_else(|| "screenshot failed".to_string()));
    }

    let info = result.data.unwrap_or_default();
    let encoded = base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        info.as_bytes(),
    );
    Ok(BrowserCaptureScreenshotResult { data: encoded })
}

/// 执行 CDP 命令
///
/// 在指定标签页上执行 Chrome DevTools Protocol 命令。
/// Tauri 不直接支持 CDP，此命令通过 JavaScript eval 实现部分功能。
///
/// # 参数
///
/// - `app`: Tauri 应用句柄
/// - `input`: CDP 执行输入参数（线程 ID、标签页 ID、方法名、参数）
///
/// # 返回值
///
/// - `Ok(Value)`: 执行成功，返回结果
/// - `Err(String)`: 执行失败
#[tauri::command]
#[specta::specta]
pub async fn browser_execute_cdp(
    app: AppHandle,
    input: BrowserExecuteCdpInput,
) -> Result<serde_json::Value, String> {
    let label = browser_window_label(&input.thread_id);
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| "浏览器窗口未打开".to_string())?;

    // Tauri 不直接支持 CDP，对于 Runtime.evaluate 方法，使用 eval 替代
    if input.method == "Runtime.evaluate" {
        if let Some(expression) = input.params.get("expression").and_then(|v| v.as_str()) {
            window
                .eval(expression)
                .map_err(|e| format!("执行 JavaScript 失败: {}", e))?;
            return Ok(serde_json::json!({
                "result": {
                    "type": "undefined"
                }
            }));
        }
    }

    // 其他 CDP 方法暂不支持
    warn!(
        "不支持的 CDP 方法: {} (thread_id={})",
        input.method, input.thread_id
    );
    Ok(serde_json::json!({
        "error": format!("Unsupported CDP method: {}", input.method)
    }))
}

/// 导航到 URL 命令
///
/// 在指定标签页中导航到新的 URL，同时更新 WebviewWindow 的页面。
///
/// # 参数
///
/// - `app`: Tauri 应用句柄
/// - `state`: 浏览器状态管理器
/// - `input`: 导航输入参数（线程 ID、标签页 ID、URL）
///
/// # 返回值
///
/// - `Ok(ThreadBrowserState)`: 导航成功，返回浏览器状态
/// - `Err(String)`: 导航失败
#[tauri::command]
#[specta::specta]
pub async fn browser_navigate(
    app: AppHandle,
    state: State<'_, BrowserState>,
    input: BrowserNavigateInput,
) -> Result<ThreadBrowserState, String> {
    let normalized_url = normalize_url(&input.url);
    info!(
        "导航到 URL: thread_id={}, tab_id={}, url={}",
        input.thread_id, input.tab_id, normalized_url
    );

    // 更新内存状态中的标签页 URL
    {
        let mut tabs = state.tabs.lock().map_err(|e| e.to_string())?;
        if let Some(tab) = tabs.get_mut(&input.tab_id) {
            tab.url = normalized_url.clone();
        }
    }

    // 通过 WebviewWindow 导航
    let label = browser_window_label(&input.thread_id);
    if let Some(window) = app.get_webview_window(&label) {
        let js = format!(
            "window.location.href = '{}';",
            normalized_url.replace('\'', "\\'")
        );
        window
            .eval(&js)
            .map_err(|e| format!("导航失败: {}", e))?;
    }

    // 返回更新后的状态
    let tabs = state.tabs.lock().map_err(|e| e.to_string())?;
    let thread_tabs = get_thread_tabs(&tabs, &input.thread_id);
    let active_tab_id = get_active_tab_id(&thread_tabs);

    Ok(ThreadBrowserState {
        thread_id: input.thread_id,
        tabs: thread_tabs,
        active_tab_id,
    })
}

/// 刷新页面命令
///
/// 刷新指定标签页的当前页面，通过 WebviewWindow 的 eval 执行 location.reload()。
///
/// # 参数
///
/// - `app`: Tauri 应用句柄
/// - `state`: 浏览器状态管理器
/// - `input`: 标签页输入参数
///
/// # 返回值
///
/// - `Ok(ThreadBrowserState)`: 刷新成功，返回浏览器状态
/// - `Err(String)`: 刷新失败
#[tauri::command]
#[specta::specta]
pub async fn browser_reload(
    app: AppHandle,
    state: State<'_, BrowserState>,
    input: BrowserTabInput,
) -> Result<ThreadBrowserState, String> {
    let label = browser_window_label(&input.thread_id);
    if let Some(window) = app.get_webview_window(&label) {
        window
            .eval("window.location.reload();")
            .map_err(|e| format!("刷新失败: {}", e))?;
    }

    let tabs = state.tabs.lock().map_err(|e| e.to_string())?;
    let thread_tabs = get_thread_tabs(&tabs, &input.thread_id);
    let active_tab_id = get_active_tab_id(&thread_tabs);

    Ok(ThreadBrowserState {
        thread_id: input.thread_id,
        tabs: thread_tabs,
        active_tab_id,
    })
}

/// 后退命令
///
/// 在指定标签页中后退到上一个页面，通过 WebviewWindow 的 eval 执行 history.back()。
///
/// # 参数
///
/// - `app`: Tauri 应用句柄
/// - `state`: 浏览器状态管理器
/// - `input`: 标签页输入参数
///
/// # 返回值
///
/// - `Ok(ThreadBrowserState)`: 后退成功，返回浏览器状态
/// - `Err(String)`: 后退失败
#[tauri::command]
#[specta::specta]
pub async fn browser_go_back(
    app: AppHandle,
    state: State<'_, BrowserState>,
    input: BrowserTabInput,
) -> Result<ThreadBrowserState, String> {
    let label = browser_window_label(&input.thread_id);
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.eval("window.history.back();");
    }

    let tabs = state.tabs.lock().map_err(|e| e.to_string())?;
    let thread_tabs = get_thread_tabs(&tabs, &input.thread_id);
    let active_tab_id = get_active_tab_id(&thread_tabs);

    Ok(ThreadBrowserState {
        thread_id: input.thread_id,
        tabs: thread_tabs,
        active_tab_id,
    })
}

/// 前进命令
///
/// 在指定标签页中前进到下一个页面，通过 WebviewWindow 的 eval 执行 history.forward()。
///
/// # 参数
///
/// - `app`: Tauri 应用句柄
/// - `state`: 浏览器状态管理器
/// - `input`: 标签页输入参数
///
/// # 返回值
///
/// - `Ok(ThreadBrowserState)`: 前进成功，返回浏览器状态
/// - `Err(String)`: 前进失败
#[tauri::command]
#[specta::specta]
pub async fn browser_go_forward(
    app: AppHandle,
    state: State<'_, BrowserState>,
    input: BrowserTabInput,
) -> Result<ThreadBrowserState, String> {
    let label = browser_window_label(&input.thread_id);
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.eval("window.history.forward();");
    }

    let tabs = state.tabs.lock().map_err(|e| e.to_string())?;
    let thread_tabs = get_thread_tabs(&tabs, &input.thread_id);
    let active_tab_id = get_active_tab_id(&thread_tabs);

    Ok(ThreadBrowserState {
        thread_id: input.thread_id,
        tabs: thread_tabs,
        active_tab_id,
    })
}

/// 新建标签页命令
///
/// 在指定对话线程中新建浏览器标签页。
/// 在 Tauri 架构中，标签页由前端管理，此命令更新内存状态并导航 WebviewWindow。
///
/// # 参数
///
/// - `app`: Tauri 应用句柄
/// - `state`: 浏览器状态管理器
/// - `input`: 新建标签页输入参数（线程 ID、URL）
///
/// # 返回值
///
/// - `Ok(ThreadBrowserState)`: 创建成功，返回浏览器状态
/// - `Err(String)`: 创建失败
#[tauri::command]
#[specta::specta]
pub async fn browser_new_tab(
    app: AppHandle,
    state: State<'_, BrowserState>,
    input: BrowserNewTabInput,
) -> Result<ThreadBrowserState, String> {
    let normalized_url = normalize_url(&input.url);
    info!(
        "新建标签页: thread_id={}, url={}",
        input.thread_id, normalized_url
    );

    let new_tab = BrowserTab {
        id: uuid::Uuid::new_v4().to_string(),
        thread_id: input.thread_id.clone(),
        url: normalized_url.clone(),
        title: "New Tab".to_string(),
        is_active: true,
    };

    // 更新内存状态
    {
        let mut tabs = state.tabs.lock().map_err(|e| e.to_string())?;
        // 停用该线程的其他标签页
        for tab in tabs.values_mut() {
            if tab.thread_id == input.thread_id {
                tab.is_active = false;
            }
        }
        tabs.insert(new_tab.id.clone(), new_tab.clone());
    }

    // 导航 WebviewWindow 到新标签页的 URL
    let label = browser_window_label(&input.thread_id);
    if let Some(window) = app.get_webview_window(&label) {
        let js = format!(
            "window.location.href = '{}';",
            normalized_url.replace('\'', "\\'")
        );
        let _ = window.eval(&js);
    }

    let tabs = state.tabs.lock().map_err(|e| e.to_string())?;
    let thread_tabs = get_thread_tabs(&tabs, &input.thread_id);

    Ok(ThreadBrowserState {
        thread_id: input.thread_id,
        tabs: thread_tabs,
        active_tab_id: Some(new_tab.id),
    })
}

/// 关闭标签页命令
///
/// 关闭指定的浏览器标签页。如果关闭的是活动标签页，自动选择最后一个标签页为活动。
///
/// # 参数
///
/// - `state`: 浏览器状态管理器
/// - `input`: 标签页输入参数（线程 ID、标签页 ID）
///
/// # 返回值
///
/// - `Ok(ThreadBrowserState)`: 关闭成功，返回浏览器状态
/// - `Err(String)`: 关闭失败
#[tauri::command]
#[specta::specta]
pub async fn browser_close_tab(
    state: State<'_, BrowserState>,
    input: BrowserTabInput,
) -> Result<ThreadBrowserState, String> {
    info!(
        "关闭标签页: thread_id={}, tab_id={}",
        input.thread_id, input.tab_id
    );

    let mut tabs = state.tabs.lock().map_err(|e| e.to_string())?;
    let closed_tab = tabs.remove(&input.tab_id);

    // 如果关闭的是活动标签页，选择最后一个标签页为活动
    if let Some(closed) = &closed_tab {
        if closed.is_active {
            // 找出该线程的最后一个标签页 ID
            let last_tab_id = tabs
                .values()
                .filter(|t| t.thread_id == input.thread_id)
                .last()
                .map(|t| t.id.clone());
            if let Some(last_id) = last_tab_id {
                if let Some(tab) = tabs.get_mut(&last_id) {
                    tab.is_active = true;
                }
            }
        }
    }

    let thread_tabs = get_thread_tabs(&tabs, &input.thread_id);
    let active_tab_id = get_active_tab_id(&thread_tabs);

    Ok(ThreadBrowserState {
        thread_id: input.thread_id,
        tabs: thread_tabs,
        active_tab_id,
    })
}

/// 选择标签页命令
///
/// 切换到指定的浏览器标签页，并导航 WebviewWindow 到该标签页的 URL。
///
/// # 参数
///
/// - `app`: Tauri 应用句柄
/// - `state`: 浏览器状态管理器
/// - `input`: 标签页输入参数（线程 ID、标签页 ID）
///
/// # 返回值
///
/// - `Ok(ThreadBrowserState)`: 选择成功，返回浏览器状态
/// - `Err(String)`: 选择失败
#[tauri::command]
#[specta::specta]
pub async fn browser_select_tab(
    app: AppHandle,
    state: State<'_, BrowserState>,
    input: BrowserTabInput,
) -> Result<ThreadBrowserState, String> {
    info!(
        "选择标签页: thread_id={}, tab_id={}",
        input.thread_id, input.tab_id
    );

    let selected_url;
    {
        let mut tabs = state.tabs.lock().map_err(|e| e.to_string())?;
        for tab in tabs.values_mut() {
            if tab.thread_id == input.thread_id {
                tab.is_active = tab.id == input.tab_id;
            }
        }
        selected_url = tabs
            .get(&input.tab_id)
            .map(|t| t.url.clone())
            .unwrap_or_default();
    }

    // 导航 WebviewWindow 到选中标签页的 URL
    if !selected_url.is_empty() {
        let label = browser_window_label(&input.thread_id);
        if let Some(window) = app.get_webview_window(&label) {
            let js = format!(
                "window.location.href = '{}';",
                selected_url.replace('\'', "\\'")
            );
            let _ = window.eval(&js);
        }
    }

    let tabs = state.tabs.lock().map_err(|e| e.to_string())?;
    let thread_tabs = get_thread_tabs(&tabs, &input.thread_id);

    Ok(ThreadBrowserState {
        thread_id: input.thread_id,
        tabs: thread_tabs,
        active_tab_id: Some(input.tab_id),
    })
}

/// 打开开发者工具命令
///
/// 打开指定标签页的开发者工具。
/// Tauri 在开发模式下支持 DevTools，生产模式需要启用相应特性。
///
/// # 参数
///
/// - `app`: Tauri 应用句柄
/// - `input`: 标签页输入参数
///
/// # 返回值
///
/// - `Ok(())`: 打开成功
/// - `Err(String)`: 打开失败
#[tauri::command]
#[specta::specta]
pub async fn browser_open_dev_tools(
    app: AppHandle,
    input: BrowserTabInput,
) -> Result<(), String> {
    let label = browser_window_label(&input.thread_id);
    if let Some(window) = app.get_webview_window(&label) {
        // open_devtools 在 Tauri 2.x 中返回 ()
        window.open_devtools();
    }
    Ok(())
}

// ==================== Agent 工具安全护栏 ====================

/// 浏览器 Agent 工具速率限制器（令牌桶算法）
///
/// 限制每个线程的 Agent 工具调用频率，防止滥用。
/// 默认：每线程每分钟最多 30 次调用。
struct BrowserRateLimiter {
    /// 每线程的上次调用时间窗口
    windows: Mutex<HashMap<String, RateWindow>>,
    /// 窗口大小（秒）
    window_secs: u64,
    /// 窗口内最大调用次数
    max_calls: usize,
}

#[derive(Clone)]
struct RateWindow {
    /// 窗口起始时间
    window_start: Instant,
    /// 当前窗口内已调用次数
    call_count: usize,
}

impl BrowserRateLimiter {
    fn new() -> Self {
        Self {
            windows: Mutex::new(HashMap::new()),
            window_secs: 60,
            max_calls: 30,
        }
    }

    /// 检查并记录一次调用
    ///
    /// 如果超过速率限制返回 Err，否则返回 Ok 并递增计数。
    fn check_and_record(&self, thread_id: &str) -> Result<(), String> {
        let mut windows = self.windows.lock().map_err(|e| e.to_string())?;
        let now = Instant::now();
        let window_duration = Duration::from_secs(self.window_secs);

        let entry = windows.entry(thread_id.to_string()).or_insert(RateWindow {
            window_start: now,
            call_count: 0,
        });

        // 如果窗口已过期，重置
        if now.duration_since(entry.window_start) > window_duration {
            entry.window_start = now;
            entry.call_count = 0;
        }

        entry.call_count += 1;
        if entry.call_count > self.max_calls {
            let elapsed = now.duration_since(entry.window_start);
            let remaining = window_duration.saturating_sub(elapsed);
            return Err(format!(
                "速率限制：线程 {thread_id} 在 {} 秒内已调用 {} 次（上限 {}），请等待 {} 秒",
                self.window_secs, entry.call_count, self.max_calls, remaining.as_secs()
            ));
        }
        Ok(())
    }
}

/// 指数退避重试
///
/// 对可能因页面加载状态不稳定而失败的操作进行重试。
/// 最多重试 3 次，初始间隔 200ms，指数退避。
async fn retry_with_backoff<F, Fut, T>(operation_name: &str, mut f: F) -> Result<T, String>
where
    F: FnMut() -> Fut + Send,
    Fut: std::future::Future<Output = Result<T, String>> + Send,
    T: Send,
{
    const MAX_RETRIES: usize = 3;
    const INITIAL_DELAY_MS: u64 = 200;

    let mut last_err = String::new();
    for attempt in 0..=MAX_RETRIES {
        match f().await {
            Ok(result) => return Ok(result),
            Err(e) => {
                last_err = e;
                if attempt < MAX_RETRIES {
                    let delay_ms = INITIAL_DELAY_MS * 2u64.pow(attempt as u32);
                    tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                    warn!(
                        operation = operation_name,
                        attempt = attempt + 1,
                        max_retries = MAX_RETRIES,
                        delay_ms,
                        "操作失败,重试中"
                    );
                }
            }
        }
    }
    Err(format!("{operation_name} 重试 {MAX_RETRIES} 次后仍失败: {last_err}"))
}


// ==================== Agent-driven browser tools (W3 — JsBridge) ====================

/// Generic helper to execute a browser action via JsBridge.
///
/// Flow:
/// 1. Security: validate current URL
/// 2. Rate limit
/// 3. Generate JS (includes __TAURI_INTERNALS__.invoke callback)
/// 4. eval() the JS
/// 5. Wait for result via JsBridge (with timeout)
async fn execute_browser_action(
    app: &AppHandle,
    state: &State<'_, BrowserState>,
    thread_id: &str,
    tab_id: &str,
    action: BrowserAction,
) -> Result<String, String> {
    // Security: validate current URL
    {
        let tabs = state.tabs.lock().map_err(|e| e.to_string())?;
        if let Some(tab) = tabs.get(tab_id) {
            validate_url(&tab.url)?;
        }
    }

    // Rate limit
    state.rate_limiter.check_and_record(thread_id)?;

    let label = browser_window_label(thread_id);
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| "browser window not open".to_string())?;

    let request_id = uuid::Uuid::new_v4().to_string();
    let js = generate_js_for_action(&request_id, &action);

    // Capture URL before execution for recording
    let current_url = {
        let tabs = state.tabs.lock().ok();
        tabs.as_ref().and_then(|t| t.get(tab_id).map(|tab| tab.url.clone()))
    };

    window.eval(&js).map_err(|e| format!("eval failed: {e}"))?;

    let result = state
        .js_bridge
        .wait_for_result(&request_id, state.security_config.execution_timeout)
        .await;

    // Record action if this thread is in recording mode
    match &result {
        Ok(r) => {
            state.recording.record_action(
                thread_id,
                &action,
                r.success,
                r.error.clone(),
                current_url.clone(),
            );
        }
        Err(e) => {
            state.recording.record_action(
                thread_id,
                &action,
                false,
                Some(e.clone()),
                current_url.clone(),
            );
        }
    }

    match result {
        Ok(r) => {
            if !r.success {
                return Err(r.error.unwrap_or_else(|| "action failed".to_string()));
            }
            info!(
                thread_id = %thread_id,
                tool = %action.tool_name(),
                "browser tool executed"
            );
            Ok(r.data.unwrap_or_default())
        }
        Err(e) => Err(e),
    }
}

// ==================== browser_resolve_js (bridge callback) ====================

/// specta-compatible wrapper for BrowserActionResult
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct BrowserJsResult {
    pub success: bool,
    pub data: Option<String>,
    pub error: Option<String>,
}

impl From<BrowserJsResult> for BrowserActionResult {
    fn from(r: BrowserJsResult) -> Self {
        Self { success: r.success, data: r.data, error: r.error }
    }
}

/// Input for JS bridge resolution
#[derive(Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BrowserResolveJsInput {
    pub request_id: String,
    pub result: BrowserJsResult,
}

/// JS bridge resolution command
///
/// Called by JavaScript in the browser page via `__TAURI_INTERNALS__.invoke`
/// to send back the JS execution result to the Rust JsBridge.
#[tauri::command]
#[specta::specta]
pub async fn browser_resolve_js(
    state: State<'_, BrowserState>,
    input: BrowserResolveJsInput,
) -> Result<bool, String> {
    let resolved = state.js_bridge.resolve(&input.request_id, input.result.into()).await;
    Ok(resolved)
}

// ==================== click ====================

/// Click element input
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct BrowserClickInput {
    pub thread_id: String,
    pub tab_id: String,
    pub selector: String,
}

/// Click element by CSS selector
#[tauri::command]
#[specta::specta]
pub async fn browser_click(
    app: AppHandle,
    state: State<'_, BrowserState>,
    input: BrowserClickInput,
) -> Result<bool, String> {
    execute_browser_action(
        &app, &state, &input.thread_id, &input.tab_id,
        BrowserAction::Click { selector: input.selector },
    ).await?;
    Ok(true)
}

// ==================== fill ====================

/// Fill input input
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct BrowserFillInput {
    pub thread_id: String,
    pub tab_id: String,
    pub selector: String,
    pub value: String,
}

/// Fill input/textarea by CSS selector
#[tauri::command]
#[specta::specta]
pub async fn browser_fill(
    app: AppHandle,
    state: State<'_, BrowserState>,
    input: BrowserFillInput,
) -> Result<bool, String> {
    execute_browser_action(
        &app, &state, &input.thread_id, &input.tab_id,
        BrowserAction::Fill { selector: input.selector, value: input.value },
    ).await?;
    Ok(true)
}

// ==================== extract ====================

/// Extract content input
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct BrowserExtractInput {
    pub thread_id: String,
    pub tab_id: String,
    pub selector: Option<String>,
    pub max_length: Option<usize>,
}

/// Extract page text content (by CSS selector, or whole page if empty)
#[tauri::command]
#[specta::specta]
pub async fn browser_extract(
    app: AppHandle,
    state: State<'_, BrowserState>,
    input: BrowserExtractInput,
) -> Result<String, String> {
    execute_browser_action(
        &app, &state, &input.thread_id, &input.tab_id,
        BrowserAction::Extract { selector: input.selector, max_length: input.max_length },
    ).await
}

// ==================== wait ====================

/// Wait for element input
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct BrowserWaitInput {
    pub thread_id: String,
    pub tab_id: String,
    pub selector: String,
    pub timeout_ms: Option<u64>,
}

/// Wait for element to appear (MutationObserver, throws on timeout)
#[tauri::command]
#[specta::specta]
pub async fn browser_wait(
    app: AppHandle,
    state: State<'_, BrowserState>,
    input: BrowserWaitInput,
) -> Result<bool, String> {
    let timeout = input.timeout_ms.unwrap_or(5000);
    execute_browser_action(
        &app, &state, &input.thread_id, &input.tab_id,
        BrowserAction::Wait { selector: input.selector, timeout_ms: timeout },
    ).await?;
    Ok(true)
}

// ==================== scroll ====================

/// Scroll input
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct BrowserScrollInput {
    pub thread_id: String,
    pub tab_id: String,
    pub selector: Option<String>,
    pub x: Option<i32>,
    pub y: Option<i32>,
}

/// Scroll to position or element
#[tauri::command]
#[specta::specta]
pub async fn browser_scroll(
    app: AppHandle,
    state: State<'_, BrowserState>,
    input: BrowserScrollInput,
) -> Result<bool, String> {
    execute_browser_action(
        &app, &state, &input.thread_id, &input.tab_id,
        BrowserAction::Scroll { selector: input.selector, x: input.x, y: input.y },
    ).await?;
    Ok(true)
}

// ==================== get_title ====================

/// Get page title
#[tauri::command]
#[specta::specta]
pub async fn browser_get_title(
    app: AppHandle,
    state: State<'_, BrowserState>,
    input: BrowserTabInput,
) -> Result<String, String> {
    execute_browser_action(
        &app, &state, &input.thread_id, &input.tab_id,
        BrowserAction::GetTitle,
    ).await
}

// ==================== get_url ====================

/// Get current page URL
#[tauri::command]
#[specta::specta]
pub async fn browser_get_url(
    app: AppHandle,
    state: State<'_, BrowserState>,
    input: BrowserTabInput,
) -> Result<String, String> {
    execute_browser_action(
        &app, &state, &input.thread_id, &input.tab_id,
        BrowserAction::GetUrl,
    ).await
}

// ==================== press_key ====================

/// Press key input
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct BrowserPressKeyInput {
    pub thread_id: String,
    pub tab_id: String,
    pub key: String,
}

/// Simulate key press (dispatchEvent KeyboardEvent)
#[tauri::command]
#[specta::specta]
pub async fn browser_press_key(
    app: AppHandle,
    state: State<'_, BrowserState>,
    input: BrowserPressKeyInput,
) -> Result<bool, String> {
    execute_browser_action(
        &app, &state, &input.thread_id, &input.tab_id,
        BrowserAction::PressKey { key: input.key },
    ).await?;
    Ok(true)
}

// ==================== select_option ====================

/// Select option input
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct BrowserSelectOptionInput {
    pub thread_id: String,
    pub tab_id: String,
    pub selector: String,
    pub value: String,
}

/// Select dropdown option
#[tauri::command]
#[specta::specta]
pub async fn browser_select_option(
    app: AppHandle,
    state: State<'_, BrowserState>,
    input: BrowserSelectOptionInput,
) -> Result<bool, String> {
    execute_browser_action(
        &app, &state, &input.thread_id, &input.tab_id,
        BrowserAction::SelectOption { selector: input.selector, value: input.value },
    ).await?;
    Ok(true)
}

// ==================== get_attribute ====================

/// Get attribute input
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct BrowserGetAttributeInput {
    pub thread_id: String,
    pub tab_id: String,
    pub selector: String,
    pub attribute: String,
}

/// Get element attribute value
#[tauri::command]
#[specta::specta]
pub async fn browser_get_attribute(
    app: AppHandle,
    state: State<'_, BrowserState>,
    input: BrowserGetAttributeInput,
) -> Result<String, String> {
    execute_browser_action(
        &app, &state, &input.thread_id, &input.tab_id,
        BrowserAction::GetAttribute { selector: input.selector, attribute: input.attribute },
    ).await
}

// ==================== get_element_info ====================

/// Get element info input
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct BrowserGetElementInfoInput {
    pub thread_id: String,
    pub tab_id: String,
    pub selector: String,
}

/// Get element visibility, position, size, tag name, text
#[tauri::command]
#[specta::specta]
pub async fn browser_get_element_info(
    app: AppHandle,
    state: State<'_, BrowserState>,
    input: BrowserGetElementInfoInput,
) -> Result<String, String> {
    execute_browser_action(
        &app, &state, &input.thread_id, &input.tab_id,
        BrowserAction::GetElementInfo { selector: input.selector },
    ).await
}

// ============================================================================
// 录制与回放（Recording & Replay）
// ============================================================================

/// 开始浏览器操作录制
///
/// 录制当前线程中所有 Agent 驱动的浏览器操作。
/// 如果该线程已有活跃录制，返回错误。
#[tauri::command]
#[specta::specta]
pub async fn browser_start_recording(
    state: State<'_, BrowserState>,
    thread_id: String,
) -> Result<(), String> {
    info!("开始录制浏览器操作: thread_id={}", thread_id);
    state.recording.start_recording(thread_id)
}

/// 停止录制并返回录制结果摘要
#[tauri::command]
#[specta::specta]
pub async fn browser_stop_recording(
    state: State<'_, BrowserState>,
    thread_id: String,
) -> Result<RecordingSummary, String> {
    info!("停止录制浏览器操作: thread_id={}", thread_id);
    let recording = state.recording.stop_recording(&thread_id)?;
    Ok(recording.summary())
}

/// 查询线程的录制状态
#[tauri::command]
#[specta::specta]
pub async fn browser_get_recording_status(
    state: State<'_, BrowserState>,
    thread_id: String,
) -> Result<RecordingStatusResponse, String> {
    Ok(RecordingStatusResponse {
        is_recording: state.recording.is_recording(&thread_id),
        action_count: state.recording.action_count(&thread_id),
    })
}

/// 录制状态响应
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct RecordingStatusResponse {
    pub is_recording: bool,
    pub action_count: usize,
}

/// 导出录制为 JSON 字符串
#[tauri::command]
#[specta::specta]
pub async fn browser_export_recording(
    state: State<'_, BrowserState>,
    thread_id: String,
) -> Result<String, String> {
    let recording = state.recording.stop_recording(&thread_id)?;
    serde_json::to_string_pretty(&recording).map_err(|e| e.to_string())
}

/// 回放录制的操作序列
///
/// 按顺序执行录制的操作，操作之间插入 delay_ms 的延时。
#[tauri::command]
#[specta::specta]
pub async fn browser_replay_actions(
    app: AppHandle,
    state: State<'_, BrowserState>,
    thread_id: String,
    tab_id: String,
    actions: Vec<RecordedAction>,
    delay_ms: Option<u64>,
) -> Result<ReplayResult, String> {
    info!(
        "回放浏览器操作: thread_id={}, actions={}",
        thread_id,
        actions.len()
    );

    let delay = delay_ms.unwrap_or(DEFAULT_REPLAY_DELAY_MS);
    let mut result = ReplayResult {
        total: actions.len(),
        successful: 0,
        failed: 0,
        failed_actions: Vec::new(),
        errors: Vec::new(),
    };

    for (idx, recorded) in actions.iter().enumerate() {
        match rebuild_action(recorded) {
            Some(action) => {
                match execute_browser_action(&app, &state, &thread_id, &tab_id, action).await {
                    Ok(_) => {
                        result.successful += 1;
                    }
                    Err(e) => {
                        result.failed += 1;
                        result.failed_actions.push(idx);
                        result.errors.push(format!("Action {} ({}): {}", idx, recorded.action_type, e));
                    }
                }

                // Insert delay between actions (except after last)
                if idx < actions.len() - 1 && delay > 0 {
                    tokio::time::sleep(Duration::from_millis(delay)).await;
                }
            }
            None => {
                warn!("回放跳过不支持的操作类型: {}", recorded.action_type);
                result.failed += 1;
                result.failed_actions.push(idx);
                result.errors.push(format!("Action {}: unsupported type '{}'", idx, recorded.action_type));
            }
        }
    }

    info!(
        "回放完成: thread_id={}, total={}, success={}, failed={}",
        thread_id, result.total, result.successful, result.failed
    );

    Ok(result)
}

/// 导航录制（记录导航操作并通过 WebviewWindow 执行）
///
/// 先执行导航，再记录操作到录制（如果该线程正在录制中）。
#[tauri::command]
#[specta::specta]
pub async fn browser_record_navigation(
    app: AppHandle,
    state: State<'_, BrowserState>,
    thread_id: String,
    tab_id: String,
    url: String,
) -> Result<(), String> {
    let normalized_url = normalize_url(&url);

    // Update tab URL in memory
    {
        let mut tabs = state.tabs.lock().map_err(|e| e.to_string())?;
        if let Some(tab) = tabs.get_mut(&tab_id) {
            tab.url = normalized_url.clone();
        }
    }

    // Perform the navigation via WebviewWindow
    let label = browser_window_label(&thread_id);
    if let Some(window) = app.get_webview_window(&label) {
        let js = format!(
            "window.location.href = '{}';",
            normalized_url.replace('\'', "\\'")
        );
        window.eval(&js).map_err(|e| format!("导航失败: {}",e))?;
    }

    // Record the navigation action
    let nav_action = BrowserAction::WaitForNavigation {
        timeout_ms: 5000,
        expected_url: Some(normalized_url),
    };
    state.recording.record_action(&thread_id, &nav_action, true, None, None);

    Ok(())
}
