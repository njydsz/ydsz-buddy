//! # Remi Claw Tauri 应用核心库
//!
//! 本模块是 Remi Claw 桌面应用的核心库 crate，负责将 Tauri 框架与系统命令模块进行组装和启动。
//!
//! ## 模块职责
//!
//! - 导入并聚合系统命令子模块（dialog、terminal、browser 等）
//! - 初始化 Tauri Builder，注册所有插件（shell、dialog、fs、clipboard、notification、updater、process）
//! - 管理全局应用状态（TerminalState、BrowserState、UpdateState 等）
//! - 注册所有 Tauri 命令（invoke_handler），供前端通过 `window.__TAURI__.invoke()` 调用
//! - 启动 Tauri 事件循环
//!
//! ## 核心功能
//!
//! 1. **插件注册**：集成 Tauri 官方插件生态，提供文件对话框、剪贴板、系统通知、自动更新等原生能力
//! 2. **状态管理**：通过 `.manage()` 注入全局状态，各命令通过 `State<>` 参数获取
//! 3. **命令绑定**：将 Rust 函数暴露为前端可调用的 IPC 命令
//! 4. **应用启动**：调用 `.run(tauri::generate_context!())` 进入主事件循环
//!
//! ## 使用场景
//!
//! - 前端通过 `invoke('command_name', { ...args })` 调用后端能力
//! - 应用启动时自动执行 `run()` 函数完成初始化
//!
//! ## 架构说明
//!
//! ```text
//! main.rs → lib.rs::run()
//!              ├─ 启动嵌入式 remi-server（bootstrap_embedded）
//!              ├─ 注册插件（shell/dialog/fs/clipboard/notification/updater/process）
//!              ├─ 注入状态（Terminal/Browser/Update/Server）
//!              ├─ 绑定命令（greet + 所有 commands 模块导出的命令）
//!              └─ 启动事件循环
//! ```

// 命令模块导出
// 所有子模块均通过 `pub mod` 暴露，供 Tauri invoke_handler 引用
mod commands;

// 从各命令子模块中通配导入所有公开项（struct、fn、enum 等）
// 这些项在下方 `tauri::generate_handler!` 宏中被注册为前端可调用的命令
use commands::{
    context_menu::*,   // 右键上下文菜单命令
    dialog::*,         // 文件对话框、消息对话框相关命令
    terminal::*,       // 终端会话管理命令
    browser::*,        // 内嵌浏览器面板命令
    update::*,         // 应用自动更新命令
    window::*,         // 窗口主题、系统交互命令
    voice::*,          // 语音识别命令
};

use std::net::SocketAddr;
use std::sync::Arc;
use remi_config::ServerConfig;
use remi_server::{bootstrap_embedded, BootstrapResult, WebSocketServer};
use tracing::{info, error};
use tauri::Emitter;

/// 嵌入式服务器状态
///
/// 保存嵌入式 remi-server 的运行时信息，供前端获取 WebSocket 服务器地址
#[derive(Clone)]
pub struct ServerState {
    /// WebSocket 服务器地址
    pub addr: SocketAddr,
    /// 引导结果（包含 Reactor 句柄等）
    pub bootstrap_result: Arc<BootstrapResult>,
}

impl ServerState {
    /// 创建新的服务器状态
    pub fn new(addr: SocketAddr, bootstrap_result: Arc<BootstrapResult>) -> Self {
        Self {
            addr,
            bootstrap_result,
        }
    }

    /// 获取 WebSocket 服务器 URL
    pub fn ws_url(&self) -> String {
        format!("ws://{}", self.addr)
    }
}

/// 获取 WebSocket 服务器地址
///
/// 前端通过此命令获取嵌入式 remi-server 的 WebSocket 地址
#[tauri::command]
fn get_server_ws_url(state: tauri::State<ServerState>) -> String {
    state.ws_url()
}

/// 示例问候命令（Tauri 脚手架生成的默认命令）
///
/// 该命令仅用于演示 Tauri IPC 机制，前端可通过 `invoke('greet', { name: 'xxx' })` 调用。
///
/// # 参数
///
/// - `name`: 用户名称字符串
///
/// # 返回值
///
/// 返回格式化的问候字符串
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// ==================== Sprint 1-D 桌面补齐 Tauri 命令 ====================

/// 获取当前运行时架构信息（CPU 架构 / OS / 平台位数）
#[tauri::command]
fn get_runtime_arch() -> commands::runtime_arch::RuntimeArch {
    commands::runtime_arch::detect()
}

/// 查询所有媒体权限状态（麦克风 / 摄像头 / 屏幕 / 通知）
#[tauri::command]
fn get_media_permissions() -> Vec<commands::media_permissions::MediaPermission> {
    commands::media_permissions::query_all()
}

/// 查询单个媒体权限状态
#[tauri::command]
fn get_media_permission(
    kind: commands::media_permissions::MediaKind,
) -> commands::media_permissions::MediaPermissionStatus {
    commands::media_permissions::query(kind)
}

/// 请求单个媒体权限（当前为占位实现，返回 NotDetermined 让前端走浏览器流）
#[tauri::command]
fn request_media_permission(
    kind: commands::media_permissions::MediaKind,
) -> commands::media_permissions::MediaPermissionStatus {
    commands::media_permissions::request(kind)
}

/// 获取默认菜单定义（File / Edit / View / Help）
#[tauri::command]
fn get_default_menu() -> Vec<commands::menu_shortcuts::MenuGroup> {
    commands::menu_shortcuts::default_menu()
}

/// 单次探测嵌入式后端端口是否可达
#[tauri::command]
fn probe_backend_port(addr: String) -> bool {
    if let Ok(a) = addr.parse() {
        commands::server_listening_detector::probe_once(a)
    } else {
        false
    }
}

/// 阻塞等待嵌入式后端端口可达（带超时，毫秒）
#[tauri::command]
fn wait_backend_ready(addr: String, timeout_ms: u64) -> bool {
    if let Ok(a) = addr.parse() {
        commands::server_listening_detector::wait_until_ready(
            a,
            std::time::Duration::from_millis(timeout_ms),
        )
    } else {
        false
    }
}

/// 同步 shell 环境变量到当前进程（解决跨平台 PATH 不一致）
#[tauri::command]
fn sync_shell_env(
    shell: Option<commands::sync_shell_environment::ShellFlavor>,
) -> commands::sync_shell_environment::ShellEnvSync {
    commands::sync_shell_environment::sync(shell.unwrap_or_default())
}

/// 获取启动后窗口打开策略（供前端决定是否显示 splash）
#[tauri::command]
fn get_window_open_strategy() -> commands::initial_backend_window_open::InitialWindowOpen {
    let args: Vec<String> = std::env::args().collect();
    commands::initial_backend_window_open::InitialWindowOpen::from_cli_args(&args)
}

/// 加载或初始化桌面端用户画像（指定 base_dir）
#[tauri::command]
fn load_user_profile(base_dir: String) -> Result<commands::desktop_user_data_profile::DesktopUserProfile, String> {
    let p = std::path::PathBuf::from(base_dir).join("profile.json");
    Ok(commands::desktop_user_data_profile::DesktopUserProfile::load_or_init(&p))
}

/// 保存桌面端用户画像
#[tauri::command]
fn save_user_profile(
    base_dir: String,
    profile: commands::desktop_user_data_profile::DesktopUserProfile,
) -> Result<(), String> {
    let p = std::path::PathBuf::from(base_dir).join("profile.json");
    profile.save(&p).map_err(|e| e.to_string())
}

/// 启动 Remi Claw Tauri 桌面应用
///
/// 本函数是整个应用的核心初始化入口，完成以下工作：
///
/// 1. **启动嵌入式 remi-server**：调用 `bootstrap_embedded` 启动 WebSocket 服务器
/// 2. **创建 Tauri Builder**：使用默认配置初始化构建器
/// 3. **注册插件**：
///    - `tauri_plugin_shell`：提供系统 Shell 能力（如打开外部链接）
///    - `tauri_plugin_dialog`：提供文件选择、保存、消息对话框
///    - `tauri_plugin_fs`：提供文件系统访问能力
///    - `tauri_plugin_clipboard_manager`：提供剪贴板读写
///    - `tauri_plugin_notification`：提供系统通知
///    - `tauri_plugin_updater`：提供应用自动更新
///    - `tauri_plugin_process`：提供进程管理
/// 4. **注入全局状态**：通过 `.manage()` 将各模块的状态对象注入 Tauri 运行时
/// 5. **注册命令**：通过 `invoke_handler` 将所有 Rust 命令暴露给前端
/// 6. **启动事件循环**：调用 `.run()` 进入 Tauri 主事件循环，阻塞直到应用退出
///
/// # Panics
///
/// 如果 Tauri 应用启动失败（如窗口创建失败、上下文生成失败），将 panic 并输出错误信息。
///
/// # 使用场景
///
/// 由 `main.rs` 中的 `main()` 函数调用，不应在其他位置重复调用。
pub fn run() {
    // 初始化日志系统
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    info!("启动 Remi Claw Tauri 应用");

    // 创建 Tokio 运行时
    let runtime = tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime");

    // 启动嵌入式 remi-server
    info!("启动嵌入式 remi-server...");
    let home_dir = dirs::home_dir().expect("Failed to get home directory");
    let config = ServerConfig::default()
        .with_base_dir(home_dir.join(".remi-claw"))
        .expect("Failed to derive server paths");
    let bootstrap_result = runtime.block_on(bootstrap_embedded(&config))
        .expect("Failed to bootstrap embedded server");

    // 在后台启动 WebSocket 服务器，并获取实际分配的监听地址
    let rpc_router = bootstrap_result.rpc_router.clone();
    let server_config = std::sync::Arc::new(config.clone());
    let http_state = bootstrap_result.services.http_state.clone();
    let server = WebSocketServer::new(bootstrap_result.server_addr, rpc_router, server_config)
        .with_http_state(http_state);
    let (server_addr, serve) = runtime.block_on(server.start())
        .expect("Failed to start embedded WebSocket server");
    info!("嵌入式服务器地址: {}", server_addr);

    // 发布服务器生命周期事件
    let push_cm = bootstrap_result.services.push_channel_manager.clone();
    runtime.spawn(async move {
        push_cm.publish_lifecycle_event("welcome", serde_json::json!({
            "version": env!("CARGO_PKG_VERSION"),
            "addr": server_addr.to_string(),
        })).await;
        push_cm.publish_lifecycle_event("ready", serde_json::json!({
            "addr": server_addr.to_string(),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })).await;
        info!("已发布服务器生命周期事件: welcome, ready");
    });

    runtime.spawn(async move {
        if let Err(e) = serve.await {
            error!("WebSocket 服务器错误: {}", e);
        }
    });

    let bootstrap_result = Arc::new(bootstrap_result);

    tauri::Builder::default()
        // ========== 插件注册 ==========
        .plugin(tauri_plugin_shell::init())          // Shell 能力（打开外部 URL/文件）
        .plugin(tauri_plugin_dialog::init())         // 文件/消息对话框
        .plugin(tauri_plugin_fs::init())             // 文件系统访问
        .plugin(tauri_plugin_clipboard_manager::init()) // 剪贴板管理
        .plugin(tauri_plugin_notification::init())   // 系统通知
        .plugin(tauri_plugin_process::init())        // 进程管理
        // 应用自动更新插件
        // 支持通过环境变量覆盖 tauri.conf.json 中的静态配置：
        //   REMI_UPDATER_ENDPOINTS：逗号分隔的 endpoint URL 列表
        //   REMI_UPDATER_PUBKEY：签名校验公钥（为空则跳过校验）
        .plugin({
            let mut builder = tauri_plugin_updater::Builder::new();
            if let Ok(endpoints_env) = std::env::var("REMI_UPDATER_ENDPOINTS") {
                let endpoints: Vec<String> = endpoints_env
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                if !endpoints.is_empty() {
                    builder = builder.endpoints(endpoints);
                    info!("更新源已通过 REMI_UPDATER_ENDPOINTS 覆盖: {} 个端点", endpoints.len());
                }
            }
            if let Ok(pubkey) = std::env::var("REMI_UPDATER_PUBKEY") {
                if !pubkey.is_empty() {
                    builder = builder.pub_key(pubkey);
                    info!("更新签名公钥已通过 REMI_UPDATER_PUBKEY 设置");
                }
            }
            builder.build()
        })

        // ========== 菜单事件处理 ==========
        .on_menu_event(|app_handle, event| {
            let _ = app_handle.emit("context_menu://selected", event.id.0.clone());
        })

        // ========== 全局状态注入 ==========
        // 每个 State 对象在整个应用生命周期内唯一，各命令通过 `State<'_, XxxState>` 获取
        .manage(TerminalState::new())        // 终端会话状态（管理多个 PTY 会话）
        .manage(BrowserState::new())         // 内嵌浏览器状态（标签页管理）
        .manage(UpdateState::new())          // 自动更新状态（版本检查、下载进度）
        .manage(ServerState::new(server_addr, bootstrap_result)) // 嵌入式服务器状态

        // ========== 无边框窗口初始化 ==========
        // Windows / Linux：移除原生标题栏（min/max/close），由前端自定义标题栏按钮承担
        //   （tauri.conf.json 的 decorations 为全局开关，会同时影响 macOS 交通灯按钮，
        //    因此在运行时按平台分别处理）
        // macOS：保留 decorations，配合 titleBarStyle = "Overlay" 绘制交通灯按钮
        .setup(|app| {
            #[cfg(not(target_os = "macos"))]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_decorations(false);
                }
            }
            #[cfg(target_os = "macos")]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_decorations(true);
                }
            }
            let _ = app;
            Ok(())
        })
        // ========== 命令注册 ==========
        // 将 Rust 函数注册为前端可通过 `invoke()` 调用的 IPC 命令
        .invoke_handler(tauri::generate_handler![
            // 示例命令
            greet,

            // 服务器命令
            get_server_ws_url,               // 获取 WebSocket 服务器地址

            // 对话框命令
            pick_folder,                     // 选择文件夹
            save_file,                       // 保存文件
            show_confirm,                    // 显示确认对话框
            show_message,                    // 显示消息对话框

            // 终端命令
            create_terminal,                 // 创建终端会话
            write_terminal,                  // 向终端写入数据
            resize_terminal,                 // 调整终端尺寸
            close_terminal,                  // 关闭终端会话
            clear_terminal,                  // 清除终端屏幕
            restart_terminal,                // 重启终端会话

            // 内嵌浏览器命令
            browser_open,                    // 打开浏览器面板
            browser_close,                   // 关闭浏览器面板
            browser_hide,                    // 隐藏浏览器面板
            browser_get_state,               // 获取浏览器状态
            browser_set_panel_bounds,        // 设置面板边界
            browser_attach_webview,          // 附加 WebView
            browser_copy_screenshot_to_clipboard, // 复制截图到剪贴板
            browser_capture_screenshot,      // 截取屏幕截图
            browser_execute_cdp,             // 执行 CDP 命令
            browser_navigate,                // 导航到 URL
            browser_reload,                  // 刷新页面
            browser_go_back,                 // 后退
            browser_go_forward,              // 前进
            browser_new_tab,                 // 新建标签页
            browser_close_tab,               // 关闭标签页
            browser_select_tab,              // 选择标签页
            browser_open_dev_tools,          // 打开开发者工具

            // 自动更新命令
            get_update_state,                // 获取更新状态
            check_for_updates,               // 检查更新
            download_update,                 // 下载更新
            install_update,                  // 安装更新
            should_check_for_updates_on_foreground, // 前台重检判断

            // 窗口/系统命令
            set_theme,                       // 设置主题
            show_in_folder,                  // 在文件管理器中显示
            open_external,                   // 用外部程序打开

            // 右键菜单命令
            show_context_menu,               // 显示上下文菜单

            // 语音命令
            transcribe_voice,                // 语音转文字

            // === Sprint 1-D 桌面补齐命令 ===
            get_runtime_arch,                // 获取运行时 CPU/OS 信息
            get_media_permissions,           // 查询所有媒体权限
            get_media_permission,            // 查询单个媒体权限
            request_media_permission,        // 请求媒体权限
            get_default_menu,                // 获取默认菜单定义
            probe_backend_port,              // 探测后端端口
            wait_backend_ready,              // 等待后端就绪
            sync_shell_env,                  // 同步 shell 环境变量
            get_window_open_strategy,        // 获取窗口打开策略
            load_user_profile,               // 加载用户画像
            save_user_profile,               // 保存用户画像
        ])
        // 生成 Tauri 上下文并启动事件循环
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
