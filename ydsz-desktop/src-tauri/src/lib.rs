//! # ydsz-buddy Tauri 应用核心库
//!
//! 本模块是 ydsz-buddy 桌面应用的核心库 crate，负责将 Tauri 框架与系统命令模块进行组装和启动。
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
//!              ├─ 启动嵌入式 ydsz-provider（bootstrap_embedded）
//!              ├─ 注册插件（shell/dialog/fs/clipboard/notification/updater/process）
//!              ├─ 注入状态（Terminal/Browser/Update/Server）
//!              ├─ 绑定命令（greet + 所有 commands 模块导出的命令）
//!              └─ 启动事件循环
//! ```

// 兼容 Rust 1.78+ 在 2021 edition 下对 never type fallback 的硬错误，
// Tauri 2 的 #[tauri::command] 宏展开会触发该 lint。
#![allow(dependency_on_unit_never_type_fallback)]

// 兼容 Rust 2024 edition 对"宏导出的 macro_export 不能再以 crate:: 绝对路径引用"的硬错误。
// tauri-specta 的 collect_commands! 宏会把 #[tauri::command] / #[specta::specta]
// 标注的函数以 crate::xxx 形式收集，宏展开后触发该 lint。
#![allow(macro_expanded_macro_exports_accessed_by_absolute_paths)]

// 命令模块导出
// 所有子模块均通过 `pub mod` 暴露，供 Tauri invoke_handler 引用
mod commands;

// 端到端 IPC 绑定生成器：被 tests/commands_gen.rs 调用，
// 把 #[tauri::command] #[specta::specta] 标注的命令导出为 commands.ts。
pub mod commands_gen;

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
    browser_use_pipe::*, // 浏览器使用管道服务器
    scheduler::*,      // 定时任务调度命令
    office::*,         // Office 文档处理命令
    lsp::*,            // LSP 集成命令
    indexer::*,        // 仓库语义检索命令
    audit_export::*,   // 审计日志导出命令
    repo_wiki::*,      // Repo Wiki 知识引擎命令
    plan_export::*,    // Plan 文档导出命令
    checkpoint::*,     // 任务崩溃恢复 Checkpoint
    mcp::*,            // MCP (Model Context Protocol) 客户端
    project_rules::*,  // 项目规则加载（AGENTS.md / CLAUDE.md / .ydsz/rules/）
    push::*,           // 移动端推送（桌面端 ↔ 移动端）
    diagnostics::*,    // 诊断日志打包与上报
    skills::*,         // Skill 模块（SKILL.md / 注册表 / 市场索引 / 安装器）
    goal::*,           // Goal Mode 目标模式命令
    failover::*,       // Provider 故障转移（P1-4 后端化）
    coding_plan_oauth::*, // 国产 Coding Plan 订阅 OAuth Device Flow（P1-5）
    idle_lock::*,      // 离座锁定 / 隐私屏（P2-1）
    ocr::*,            // 截图 OCR（P2-2:macOS Vision / Windows OCR / Tesseract 兜底）
    ollama::*,         // Ollama 本地模型服务发现（P2-4:走 Rust 绕开浏览器 CORS 拦截）
    team_rules::*,     // 团队共享规则（P2-5:~/.ydsz-buddy/team-rules/）
    ssh::*,            // SSH 远程连接（P1-C:russh 真集成）
    search::*,          // Web 搜索与 URL 内容抓取
    runner::*,          // Agent 命令执行器
    sandbox::*,         // 数据分析沙箱
    multi_edit::*,      // 多文件协调编辑
    tool_registry::*,   // 工具注册表与模式过滤
    fs::*,              // 文件系统管理工具
    semantic::*,        // 语义搜索
    build_runner::*,    // Build/Test Runner
    permissions::*,     // 工具权限白名单
    credential_store::*, // OS Keyring 凭证存储（P0-2）
    review_comments::*,  // 行级 Review Comment 后端持久化（P2-2）
    code_sandbox::*,     // Agent 代码执行沙箱(P2-8)
    extensions::*,       // Extension 扩展系统(P1-1: 安装/管理/启用/禁用 UI)
};

use std::net::SocketAddr;
use std::sync::Arc;
use ydsz_shared::config::ServerConfig;
use ydsz_server::{bootstrap_embedded, BootstrapResult, WebSocketServer};
use tracing::{info, error};
use tauri::Emitter;

/// 嵌入式服务器状态
///
/// 保存嵌入式 ydsz-server 的运行时信息，供前端获取 WebSocket 服务器地址
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
/// 前端通过此命令获取嵌入式 ydsz-server 的 WebSocket 地址
#[tauri::command]
#[specta::specta]
async fn get_server_ws_url(state: tauri::State<'_, ServerState>) -> Result<String, String> {
    Ok(state.ws_url())
}

/// 浏览器使用管道服务器状态
///
/// 保存 Codex 兼容的浏览器使用管道服务器地址，
/// 供外部 CLI 工具通过 TCP 与内嵌浏览器通信
#[derive(Clone)]
pub struct BrowserUsePipeState {
    /// 管道服务器实际监听地址
    pub addr: SocketAddr,
}

/// 获取浏览器使用管道服务器地址
///
/// 前端通过此命令获取 Codex 兼容管道的 TCP 地址，
/// 可将其传递给外部 Codex CLI 工具
#[tauri::command]
#[specta::specta]
async fn get_browser_use_pipe_addr(state: tauri::State<'_, BrowserUsePipeState>) -> Result<String, String> {
    Ok(state.addr.to_string())
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
#[specta::specta]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// ==================== Sprint 1-D 桌面补齐 Tauri 命令 ====================

/// 获取当前运行时架构信息（CPU 架构 / OS / 平台位数）
#[tauri::command]
#[specta::specta]
async fn get_runtime_arch() -> commands::runtime_arch::RuntimeArch {
    commands::runtime_arch::detect()
}

/// 查询所有媒体权限状态（麦克风 / 摄像头 / 屏幕 / 通知）
#[tauri::command]
#[specta::specta]
async fn get_media_permissions() -> Vec<commands::media_permissions::MediaPermission> {
    commands::media_permissions::query_all()
}

/// 查询单个媒体权限状态
#[tauri::command]
#[specta::specta]
async fn get_media_permission(
    kind: commands::media_permissions::MediaKind,
) -> commands::media_permissions::MediaPermissionStatus {
    commands::media_permissions::query(kind)
}

/// 请求单个媒体权限（当前为占位实现，返回 NotDetermined 让前端走浏览器流）
#[tauri::command]
#[specta::specta]
async fn request_media_permission(
    kind: commands::media_permissions::MediaKind,
) -> commands::media_permissions::MediaPermissionStatus {
    commands::media_permissions::request(kind)
}

/// 获取默认菜单定义（File / Edit / View / Help）
#[tauri::command]
#[specta::specta]
async fn get_default_menu() -> Vec<commands::menu_shortcuts::MenuGroup> {
    commands::menu_shortcuts::default_menu()
}

/// 单次探测嵌入式后端端口是否可达
#[tauri::command]
#[specta::specta]
async fn probe_backend_port(addr: String) -> bool {
    if let Ok(a) = addr.parse() {
        commands::server_listening_detector::probe_once(a)
    } else {
        false
    }
}

/// 阻塞等待嵌入式后端端口可达（带超时，毫秒）
#[tauri::command]
#[specta::specta]
async fn wait_backend_ready(addr: String, timeout_ms: u64) -> bool {
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
#[specta::specta]
async fn sync_shell_env(
    shell: Option<commands::sync_shell_environment::ShellFlavor>,
) -> commands::sync_shell_environment::ShellEnvSync {
    commands::sync_shell_environment::sync(shell.unwrap_or_default())
}

/// 获取启动后窗口打开策略（供前端决定是否显示 splash）
#[tauri::command]
#[specta::specta]
async fn get_window_open_strategy() -> commands::initial_backend_window_open::InitialWindowOpen {
    let args: Vec<String> = std::env::args().collect();
    commands::initial_backend_window_open::InitialWindowOpen::from_cli_args(&args)
}

/// 加载或初始化桌面端用户画像（指定 base_dir）
#[tauri::command]
#[specta::specta]
async fn load_user_profile(base_dir: String) -> Result<commands::desktop_user_data_profile::DesktopUserProfile, String> {
    let p = std::path::PathBuf::from(base_dir).join("profile.json");
    Ok(commands::desktop_user_data_profile::DesktopUserProfile::load_or_init(&p))
}

/// 保存桌面端用户画像
#[tauri::command]
#[specta::specta]
async fn save_user_profile(
    base_dir: String,
    profile: commands::desktop_user_data_profile::DesktopUserProfile,
) -> Result<(), String> {
    let p = std::path::PathBuf::from(base_dir).join("profile.json");
    profile.save(&p).map_err(|e| e.to_string())
}

/// 启动 ydsz-buddy Tauri 桌面应用
///
/// 本函数是整个应用的核心初始化入口，完成以下工作：
///
/// 1. **启动嵌入式 ydsz-provider**：调用 `bootstrap_embedded` 启动 WebSocket 服务器
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

    // 桌面端性能/调试:YDSZ_BUDDY_DEVTOOLS=1 时为 WebView2 启用
    // --remote-debugging-port=9222,通过外部 Chrome DevTools (chrome://inspect)
    // 或 Edge DevTools 连接到 webview 渲染进程,实时查看 console 与 call stack。
    // 该环境变量仅在 debug 模式下生效,release 构建自动忽略避免安全风险。
    #[cfg(debug_assertions)]
    if std::env::var("YDSZ_BUDDY_DEVTOOLS")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
    {
        // WebView2 通过环境变量 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS 接收参数
        // (Tauri 2 的 additionalBrowserArgs 在某些版本会被忽略)
        if std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").is_err() {
            std::env::set_var(
                "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
                "--remote-debugging-port=9222",
            );
            info!("已为 WebView2 启用远程调试端口 9222");
        }
    }

    info!("启动 ydsz-buddy Tauri 应用");

    // 创建 Tokio 运行时
    let runtime = tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime");

    // 启动嵌入式 ydsz-provider
    info!("启动嵌入式 ydsz-provider...");
    // 优先使用 YDSZ_BUDDY_HOME 环境变量，fallback 到用户主目录
    let base_dir = std::env::var("YDSZ_BUDDY_HOME")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| {
            let home_dir = dirs::home_dir().expect("Failed to get home directory");
            home_dir.join(".2. 环境变量 YDSZ_BOOTSTRAP_TOKEN")
        });
    let config = ServerConfig::default()
        .with_base_dir(base_dir)
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

    // 启动浏览器使用管道服务器
    let pipe_addr = SocketAddr::from(([127, 0, 0, 1], 0));
    let pipe_server = BrowserUsePipeServer::new(pipe_addr);
    let pipe_bound_addr = runtime
        .block_on(pipe_server.start())
        .expect("Failed to start browser use pipe server");
    info!("浏览器使用管道地址: {}", pipe_bound_addr);

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
        //   YDSZ_UPDATER_ENDPOINTS：逗号分隔的 endpoint URL 列表
        //   YDSZ_UPDATER_PUBKEY：签名校验公钥（为空则跳过校验）
        .plugin({
            // tauri-plugin-updater v2 默认从 tauri.conf.json 读取 endpoints/pubkey 配置
            // 如果需要通过环境变量覆盖，可在此扩展 Builder 接口
            tauri_plugin_updater::Builder::new().build()
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
        .manage(BrowserUsePipeState { addr: pipe_bound_addr }) // 浏览器管道服务器状态
        .manage(commands::lsp::LspState::new())     // LSP 客户端状态
        .manage(commands::indexer::IndexerState::new()) // 代码索引状态
        .manage(commands::checkpoint::CheckpointStore::default()) // 任务崩溃恢复 Checkpoint
        .manage(commands::project_rules::ProjectRulesState::new()) // 项目规则缓存
        .manage(commands::skills::SkillState::new())           // Skill 注册表 + Marketplace 索引
        .manage(commands::failover::FailoverState::new())       // Provider 故障转移状态（P1-4）
        .manage(commands::coding_plan_oauth::CodingPlanOAuthState::new()) // Coding Plan OAuth 状态（P1-5）
        .manage(commands::idle_lock::IdleLockState::new())       // 离座锁定 / 隐私屏状态（P2-1）
.manage(commands::search::SearchState::new())               // Web 搜索状态
.manage(commands::runner::RunnerState::new())               // Agent 命令执行器状态
.manage(commands::tool_registry::ToolRegistryState::new())  // 工具注册表状态
.manage(commands::semantic::SemanticState::new())            // 语义搜索状态 (TF-IDF)
        .manage(commands::semantic::EmbeddingState::new())           // 语义搜索状态 (Embedding)
.manage(commands::build_runner::BuildRunnerState::new())      // Build/Test Runner 状态
.manage(commands::permissions::PermissionsState::new())      // 工具权限白名单状态
.manage(McpState::new())                          // MCP 客户端状态(P1-B4: 升级至库级 McpState 含 reconnect/health_check 能力)
.manage(commands::code_sandbox::CodeSandboxState::new()) // Agent 代码执行沙箱状态（P2-8）
.manage(commands::extensions::ExtState::new())       // Extension 扩展系统状态（P1-1）

        // ========== 无边框窗口初始化 ==========
        // Windows / Linux：移除原生标题栏（min/max/close），由前端自定义标题栏按钮承担
        //   （tauri.conf.json 的 decorations 为全局开关，会同时影响 macOS 交通灯按钮，
        //    因此在运行时按平台分别处理）
        // macOS：保留 decorations，配合 titleBarStyle = 'Overlay' 绘制交通灯按钮
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

            // 启动时如果用户未接受条款,注入 localStorage 预接受
            // 仅在环境变量 YDSZ_BUDDY_SKIP_TERMS=1 时生效(开发/沙箱场景),
            // 避免桌面端 webview 事件链异常时无法进入主界面
            if std::env::var("YDSZ_BUDDY_SKIP_TERMS")
                .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
                .unwrap_or(false)
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    let ts = chrono::Utc::now().to_rfc3339();
                    let script = format!(
                        "try {{ localStorage.setItem('ydsz-buddy:terms-accepted', JSON.stringify({{ termsAcceptedAt: '{}' }})); }} catch (e) {{ console.warn('skip-terms inject failed:', e); }}",
                        ts
                    );
                    let _ = window.eval(&script);
                    info!("已通过 YDSZ_BUDDY_SKIP_TERMS 注入条款接受状态");
                }
            }

            // 桌面端 webview 性能开关:YDSZ_BUDDY_MIN_HOOKS=1 时给主窗口 URL 追加
            // ?__ydszMin=1,跳过 IdleLockGate/useFrameRateMonitor 等每秒触发 setState
            // 的组件(在 WebView2 dev 模式下会持续抢占主线程,导致整个 UI 卡死)。
            // 浏览器端不卡,只是 desktop webview 独有的性能问题。生产构建自动跳过。
            #[cfg(debug_assertions)]
            if std::env::var("YDSZ_BUDDY_MIN_HOOKS")
                .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
                .unwrap_or(false)
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    let script = r#"
                        (function() {
                            try {
                                var u = new URL(window.location.href);
                                if (u.searchParams.get('__ydszMin') !== '1') {
                                    u.searchParams.set('__ydszMin', '1');
                                    window.location.replace(u.toString());
                                }
                            } catch (e) { console.warn('min-hooks redirect failed:', e); }
                        })();
                    "#;
                    let _ = window.eval(script);
                    info!("已通过 YDSZ_BUDDY_MIN_HOOKS 启用 webview 性能降级模式");
                }
            }
            // 启动时从磁盘加载历史 Checkpoint,确保应用重启后
            // 还能识别上次未完成的任务。
            {
                use tauri::Manager;
                if let Ok(path) = commands::checkpoint::CheckpointStore::store_path(app) {
                    let store = app.state::<commands::checkpoint::CheckpointStore>();
                    if let Err(error) = (*store).load_from_path(&path) {
                        tracing::warn!(?error, "启动时加载 Checkpoint 失败,使用空列表");
                    }
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
            browser_click,                   // Agent tool: click element
            browser_fill,                    // Agent tool: fill input
            browser_extract,                 // Agent tool: extract content
            browser_wait,                    // Agent tool: wait for element
            browser_resolve_js,              // JsBridge: resolve JS execution result
            browser_scroll,                  // Agent tool: scroll to position/element
            browser_get_title,               // Agent tool: get page title
            browser_get_url,                 // Agent tool: get current URL
            browser_press_key,               // Agent tool: press key
            browser_select_option,           // Agent tool: select dropdown option
            browser_get_attribute,           // Agent tool: get element attribute
            browser_get_element_info,        // Agent tool: get element info
            // 录制与回放命令
            browser_start_recording,         // 开始录制浏览器操作
            browser_stop_recording,          // 停止录制
            browser_get_recording_status,    // 查询录制状态
            browser_export_recording,        // 导出录制为 JSON
            browser_replay_actions,          // 回放录制操作
            browser_record_navigation,       // 录制并执行导航

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

            // 浏览器使用管道命令
            get_browser_use_pipe_addr,       // 获取浏览器管道服务器地址

            // 定时任务调度命令
            scheduler_task_create,           // 创建定时任务
            scheduler_task_update,           // 更新定时任务
            scheduler_task_delete,           // 删除定时任务
            scheduler_task_set_enabled,      // 启用/禁用定时任务
            scheduler_task_trigger,          // 立即触发定时任务
            scheduler_task_list,             // 列出定时任务

            // Office 文档处理命令
            office_docx_read,                // 读取 docx 文件
            office_docx_write,               // 写入 docx 文件
            office_docx_write_rich,          // 写入富 docx 文件(支持表格/标题/样式)
            office_xlsx_read,                // 读取 xlsx 文件
            office_xlsx_write,               // 写入 xlsx 文件
            office_xlsx_write_typed,         // 写入类型化 xlsx 文件(支持公式/数值/布尔/日期)
            office_pdf_extract,              // 提取 pdf 文本
            office_pptx_generate,           // 生成 pptx 文件

            // LSP 集成命令
            lsp_start_server,                // 启动 LSP 服务器
            lsp_stop_server,                 // 停止 LSP 服务器（多语言并发管理）
            lsp_goto_definition,             // 跳转定义
            lsp_references,                  // 查找引用
            lsp_hover,                       // 悬浮提示
            lsp_rename,                      // 重命名符号
            lsp_completion,                  // 代码补全
            lsp_code_action,                 // 快速修复 / 重构建议
            lsp_signature_help,              // 函数参数提示
            lsp_formatting,                  // 代码格式化
            lsp_diagnostics,                 // 获取文件诊断
            lsp_did_open,                    // 通知服务器打开文件
            lsp_did_change,                  // 通知服务器文件变更
            lsp_did_save,                    // 通知服务器文件保存
            lsp_list_presets,                // 列出语言预设

            // 行级 Review Comment 后端持久化（P2-2）
            review_comment_list,             // 列出评论（可按 thread/turn 过滤）
            review_comment_add,              // 新增评论
            review_comment_update_body,      // 更新评论正文
            review_comment_set_status,       // 切换评论状态
            review_comment_delete,           // 删除评论
            review_comment_clear_for_thread, // 清空线程评论
            review_comment_clear_for_turn,   // 清空 turn 评论

            // 仓库语义检索命令
            indexer_build,                   // 构建代码索引
            indexer_search_symbols,          // 搜索符号
            indexer_search_text,             // 全文本搜索
            // W2 AST-Grep / Hashline 命令暂未实装 IPC 序列化（RewriteResult 等 DTO 待补），
            // 暂从 generate_handler 中移除以保持 dev 启动通路；W2 完成时再补回。

            // 审计日志导出命令
            audit_export,                    // 导出审计日志

            // Repo Wiki 知识引擎命令
            repo_wiki_generate,              // 生成项目 Wiki
            repo_wiki_generate_incremental,  // 增量生成 Wiki
            repo_wiki_search,                // 搜索 Wiki 条目
            repo_wiki_list,                  // 列出所有 Wiki 条目
            repo_wiki_get,                   // 按模块名获取 Wiki 条目
            repo_wiki_status,                // Wiki 元数据状态(目录 + 最后生成时间)
            repo_wiki_stats,                 // Wiki 统计信息
            repo_wiki_export,                // 导出全量 Wiki
            repo_wiki_outline,               // 模块文档大纲 (TOC)
            repo_wiki_dependencies,          // 模块依赖图

            // Plan 文档导出命令
            plan_export_to_disk,             // 导出 Plan 到磁盘
            plan_list_exported,              // 列出已导出的 Plan

            // 任务崩溃恢复 Checkpoint 命令
            checkpoint_save,                 // 创建/覆盖 Checkpoint
            checkpoint_update,               // 刷新 Checkpoint 心跳
            checkpoint_complete,             // 标记 Checkpoint 完成
            checkpoint_resume,               // 标记 Checkpoint 恢复中
            checkpoint_cancel,               // 取消 Checkpoint
            checkpoint_inspect,              // 获取 Checkpoint 详情
            checkpoint_list_pending,         // 列出未完成的 Checkpoint
            checkpoint_cleanup_old,          // 清理旧 Checkpoint

            // MCP 集成命令
            mcp_list_servers,                // 列出工作区 MCP 服务器
            mcp_add_server,                  // 添加 MCP 服务器
            mcp_update_server,               // 更新 MCP 服务器
            mcp_remove_server,               // 删除 MCP 服务器
            mcp_test_connection,             // 测试 MCP 连接
            mcp_list_presets,                // 列出 MCP 内置预设
            mcp_list_tools,                  // 列出 MCP 工具
            mcp_call_tool,                   // 调用 MCP 工具(P1-2 新增)

            // 移动端推送命令
            push_dispatch_approval,          // 推送待审批到移动端
            push_dispatch_task_update,       // 推送任务状态到移动端
            push_list_mobile_devices,        // 列出已绑定移动设备
            push_unregister_mobile_device,   // 撤销移动设备
            push_cleanup_expired_devices,    // 清理过期设备
            push_get_dry_run_status,         // 查询 dry_run 状态
            push_get_config_status,          // 查询推送通道配置状态（P2-4）
            push_test_jpush_connection,      // 测试极光推送连接（P2-4）
            push_test_umeng_connection,      // 测试友盟推送连接（P2-4）
            push_update_credentials,         // 运行时更新推送凭证（P1-2 联调）

            // 项目规则加载命令
            project_rules_load,              // 扫描 AGENTS.md / CLAUDE.md / .ydsz/rules/ 等

            // Skill 模块命令
            skill_init,                      // 初始化 Skill 注册表
            skill_list,                      // 列出已安装 skill
            skill_get,                       // 按名查询已安装 skill
            skill_install,                   // 安装 skill（local/github/marketplace URI）
            skill_uninstall,                 // 卸载 skill
            skill_search_marketplace,        // 搜索 marketplace 索引
            skill_marketplace_lookup,        // 查 marketplace 单条
            skill_marketplace_refresh,       // 刷新 marketplace 索引
            skill_validate_deps,             // 校验依赖完整性
            skill_load_body,                 // 加载 skill 的 prompt body

            // Extension 扩展系统命令
            extension_init,                   // 初始化扩展注册表
            extension_list,                   // 列出已安装扩展
            extension_get,                    // 获取扩展详情
            extension_activate,               // 激活扩展
            extension_deactivate,             // 停用扩展
            extension_uninstall,              // 卸载扩展
            extension_install_from_path,      // 从本地路径安装
            extension_install_from_github,    // 从 GitHub 仓库安装
            extension_list_commands,           // 列出已激活扩展贡献的命令
            extension_trigger_startup,         // 触发 OnStartup 激活

            // 诊断日志打包与上报命令
            diagnostics_get_logs,            // 获取近期日志条目
            diagnostics_clear_logs,          // 清空日志缓冲区（no-op）
            diagnostics_export_zip,          // 导出诊断包
            diagnostics_report_issue,        // 生成 GitHub Issue URL
            diagnostics_reveal_in_folder,    // 在系统文件管理器中打开诊断包

            // Goal Mode 目标模式命令
            goal_start,                      // 启动长期目标
            goal_abort,                      // 中止目标
            goal_list_active,                // 列出活跃目标
            goal_get,                        // 获取目标详情
            goal_cleanup,                    // 清理已完成目标

            // Provider 故障转移命令（P1-4 后端化）
            failover_get_state,              // 获取故障转移快照
            failover_record_failure,         // 记录一次失败
            failover_record_success,         // 记录一次成功
            failover_pick_fallback,          // 推荐备用 Provider
            failover_set_config,             // 更新配置
            failover_switch_to,              // 手动切换
            failover_reset,                  // 重置

            // 国产 Coding Plan OAuth Device Flow 命令（P1-5）
            coding_plan_request_device_code, // 申请 device_code
            coding_plan_poll_device_token,    // 轮询 access_token
            coding_plan_current_grant,        // 查询当前进行中的 grant
            coding_plan_cancel_grant,         // 取消授权

            // 离座锁定 / 隐私屏命令（P2-1）
            idle_lock_get_state,              // 获取锁定快照
            idle_lock_set_config,             // 更新配置（超时/PIN 哈希）
            idle_lock_arm,                    // 启动监听
            idle_lock_disarm,                 // 停止监听
            idle_lock_now,                    // 立即锁定
            idle_lock_unlock,                 // 验证 PIN 解锁
            idle_lock_set_pin,                // 设置 / 更新 PIN
            idle_lock_record_activity,        // 记录一次活跃事件
            idle_lock_tick,                   // 心跳推进（检查是否超时）

            // 截图 OCR 命令（P2-2）
            ocr_list_providers,               // 列出可用 OCR provider
            ocr_recognize_text,               // 识别图像中的文字
            ocr_recognize_from_path,           // Agent 简化版 OCR（路径直接识别）

            // Ollama 本地模型服务发现命令（P2-4:走 Rust 绕开浏览器 CORS）
            indexer_ollama_discover,          // 探测 Ollama 服务（version + tags）

            // 团队共享规则命令（P2-5:~/.ydsz-buddy/team-rules/）
            team_rules_resolve_base_dir,       // 解析团队规则根目录
            team_rules_list,                   // 列出所有团队规则
            team_rules_read,                   // 读取单条规则
            team_rules_save,                   // 创建 / 更新一条规则
            team_rules_delete,                 // 删除一条规则
            team_rules_save_manifest,          // 写入 manifest

            // SSH 远程连接命令（P1-C:russh 真集成）
            ssh_connect,                       // 建立 SSH 连接
            ssh_disconnect,                    // 断开 SSH 连接
            ssh_get_status,                    // 获取连接状态
            ssh_list_connections,              // 列出所有连接
            ssh_read_file,                     // 读取远程文件
            ssh_write_file,                    // 写入远程文件
            ssh_delete_file,                   // 删除远程文件
            ssh_list_directory,                // 列出远程目录
            ssh_create_directory,              // 创建远程目录
            ssh_delete_directory,              // 删除远程目录
            ssh_exec,                          // 执行远程命令

            // Web 搜索与 URL 内容抓取命令
            search_web,                       // 执行网页搜索
            search_web_with_engine,           // 使用指定搜索引擎搜索
            search_fetch_url,                 // 抓取 URL 内容（纯文本）
            search_fetch_url_summary,         // 抓取 URL 内容（结构化摘要）

            // Agent 命令执行器命令
            runner_execute,                    // 执行单条命令
            runner_execute_batch,              // 批量执行命令

            // 数据分析沙箱命令
            sandbox_analyze_csv,               // 分析 CSV 文件
            sandbox_analyze_csv_content,       // 分析 CSV 内容字符串
            sandbox_analyze_json,              // 分析 JSON 数据
            sandbox_transform_csv,             // 转换 CSV 数据
            sandbox_generate_chart,            // 生成图表规格

            // 多文件协调编辑命令
            multi_edit_execute,                // 执行批量编辑
            multi_edit_preview,                // 预览编辑结果

            // 工具注册表命令
            tool_registry_list,               // 列出所有工具
            tool_registry_filter,             // 按模式过滤工具
            tool_registry_check,              // 检查工具可用性

            // 文件系统管理命令
            fs_list_directory,                 // 列出目录内容
            fs_read_file,                      // 读取文件内容
            fs_write_file,                     // 写入文件
            fs_search_files,                   // 搜索文件名
            fs_file_info,                      // 获取文件信息

            // 语义搜索命令
            semantic_build_index,              // 构建语义索引 (TF-IDF)
            semantic_search,                   // 语义搜索 (TF-IDF)
            semantic_build_embedding_index,    // 构建语义索引 (Embedding)
            semantic_search_embedding,         // 语义搜索 (Embedding)
            semantic_add_file_embedding,       // 增量添加文件到 Embedding 索引
            semantic_get_indexed_files,        // 获取已索引的文件列表

            // Build/Test Runner 命令
            build_runner_detect,               // 检测项目类型
            build_runner_build,                // 执行构建
            build_runner_test,                 // 执行测试
            build_runner_lint,                 // 执行 lint
            build_runner_format_check,         // 执行格式化检查
            build_runner_run_custom,           // 执行自定义命令
            build_runner_run_all,              // 一键全流程

            // 工具权限白名单命令
            permissions_get,                  // 获取权限配置
            permissions_set_mode,             // 设置权限模式
            permissions_allow,                // 添加白名单
            permissions_block,                // 添加黑名单
            permissions_check,                // 检查权限
            permissions_filter,               // 过滤允许的工具
            permissions_load_preset,          // 加载预设模板

            // OS Keyring 凭证存储命令（P0-2）
            credential_store_set,             // 写入凭证到 OS Keyring
            credential_store_get,             // 从 OS Keyring 读取凭证
            credential_store_delete,          // 从 OS Keyring 删除凭证
            credential_store_exists,          // 检查凭证是否存在

            // Agent 代码执行沙箱 + 细粒度目录授权命令（P0-3）
            code_sandbox_execute_command,     // 执行 shell 命令（沙箱内）
            code_sandbox_execute_code,        // 执行代码片段（沙箱内）
            code_sandbox_get_policy,          // 获取当前沙箱策略
            code_sandbox_set_level,           // 设置沙箱安全层级
            code_sandbox_add_authorized_dir,  // 添加授权目录
            code_sandbox_remove_authorized_dir, // 移除授权目录
            code_sandbox_check_path,          // 检查路径是否在授权范围内
        ])
        // 生成 Tauri 上下文并启动事件循环
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

