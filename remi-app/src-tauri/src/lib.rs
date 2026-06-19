//! # Remi Code Tauri 应用核心库
//!
//! 本模块是 Remi Code 桌面应用的核心库 crate，负责将 Tauri 框架与所有业务命令模块进行组装和启动。
//!
//! ## 模块职责
//!
//! - 导入并聚合所有命令子模块（dialog、terminal、git、workspace 等）
//! - 初始化 Tauri Builder，注册所有插件（shell、dialog、fs、clipboard、notification、updater、process）
//! - 管理全局应用状态（TerminalState、WorkspaceState、SettingsState 等）
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
//!              ├─ 注册插件（shell/dialog/fs/clipboard/notification/updater/process）
//!              ├─ 注入状态（Terminal/Workspace/Settings/Orchestration/Provider/Browser/Update/Git）
//!              ├─ 绑定命令（greet + 所有 commands 模块导出的命令）
//!              └─ 启动事件循环
//! ```

// 命令模块导出
// 所有子模块均通过 `pub mod` 暴露，供 Tauri invoke_handler 引用
mod commands;

// 从各命令子模块中通配导入所有公开项（struct、fn、enum 等）
// 这些项在下方 `tauri::generate_handler!` 宏中被注册为前端可调用的命令
use commands::{
    dialog::*,         // 文件对话框、消息对话框相关命令
    terminal::*,       // 终端会话管理命令
    git::*,            // Git 版本控制命令
    workspace::*,      // 工作区/项目管理命令
    settings::*,       // 应用设置读写命令
    orchestration::*,  // AI 编排引擎（对话线程、消息）命令
    provider::*,       // AI 模型提供商管理命令
    browser::*,        // 内嵌浏览器面板命令
    update::*,         // 应用自动更新命令
    window::*,         // 窗口主题、系统交互命令
    context_menu::*,   // 右键上下文菜单命令
    voice::*,          // 语音识别命令
};

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

/// 启动 Remi Code Tauri 桌面应用
///
/// 本函数是整个应用的核心初始化入口，完成以下工作：
///
/// 1. **创建 Tauri Builder**：使用默认配置初始化构建器
/// 2. **注册插件**：
///    - `tauri_plugin_shell`：提供系统 Shell 能力（如打开外部链接）
///    - `tauri_plugin_dialog`：提供文件选择、保存、消息对话框
///    - `tauri_plugin_fs`：提供文件系统访问能力
///    - `tauri_plugin_clipboard_manager`：提供剪贴板读写
///    - `tauri_plugin_notification`：提供系统通知
///    - `tauri_plugin_updater`：提供应用自动更新
///    - `tauri_plugin_process`：提供进程管理
/// 3. **注入全局状态**：通过 `.manage()` 将各模块的状态对象注入 Tauri 运行时
/// 4. **注册命令**：通过 `invoke_handler` 将所有 Rust 命令暴露给前端
/// 5. **启动事件循环**：调用 `.run()` 进入 Tauri 主事件循环，阻塞直到应用退出
///
/// # Panics
///
/// 如果 Tauri 应用启动失败（如窗口创建失败、上下文生成失败），将 panic 并输出错误信息。
///
/// # 使用场景
///
/// 由 `main.rs` 中的 `main()` 函数调用，不应在其他位置重复调用。
pub fn run() {
    tauri::Builder::default()
        // ========== 插件注册 ==========
        .plugin(tauri_plugin_shell::init())          // Shell 能力（打开外部 URL/文件）
        .plugin(tauri_plugin_dialog::init())         // 文件/消息对话框
        .plugin(tauri_plugin_fs::init())             // 文件系统访问
        .plugin(tauri_plugin_clipboard_manager::init()) // 剪贴板管理
        .plugin(tauri_plugin_notification::init())   // 系统通知
        .plugin(tauri_plugin_updater::init())        // 自动更新
        .plugin(tauri_plugin_process::init())        // 进程管理

        // ========== 全局状态注入 ==========
        // 每个 State 对象在整个应用生命周期内唯一，各命令通过 `State<'_, XxxState>` 获取
        .manage(TerminalState::new())        // 终端会话状态（管理多个 PTY 会话）
        .manage(WorkspaceState::new())       // 工作区状态（管理项目列表）
        .manage(SettingsState::new())        // 设置状态（持久化用户配置）
        .manage(OrchestrationState::new())   // AI 编排引擎状态（对话线程、消息流）
        .manage(ProviderState::new())        // AI 模型提供商状态（API Key 管理）
        .manage(BrowserState::new())         // 内嵌浏览器状态（标签页管理）
        .manage(UpdateState::new())          // 自动更新状态（版本检查、下载进度）
        .manage(GitState::new())             // Git 状态（仓库操作、状态广播）

        // ========== 命令注册 ==========
        // 将 Rust 函数注册为前端可通过 `invoke()` 调用的 IPC 命令
        .invoke_handler(tauri::generate_handler![
            // 示例命令
            greet,

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

            // Git 命令
            git_status,                      // 获取 Git 状态
            git_list_branches,               // 列出分支
            git_checkout,                    // 切换分支
            git_commit,                      // 提交更改
            git_push,                        // 推送当前分支
            git_pull,                        // 拉取当前分支
            git_diff,                        // 获取差异
            git_log,                         // 获取提交日志
            git_create_branch,               // 创建分支
            git_stash,                       // 暂存更改
            git_stash_pop,                   // 恢复暂存

            // 工作区命令
            list_projects,                   // 列出项目
            add_project,                     // 添加项目
            remove_project,                  // 移除项目
            read_file,                       // 读取文件内容
            write_file,                      // 写入文件内容

            // 设置命令
            get_settings,                    // 获取设置
            save_settings,                   // 保存设置

            // AI 编排命令
            create_thread,                   // 创建对话线程
            send_message,                    // 发送消息
            list_threads,                    // 列出线程
            delete_thread,                   // 删除线程
            rename_thread,                   // 重命名线程

            // AI 模型提供商命令
            list_models,                     // 列出可用模型
            set_api_key,                     // 设置 API Key
            get_provider_status,             // 获取提供商状态

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

            // 窗口/系统命令
            set_theme,                       // 设置主题
            show_in_folder,                  // 在文件管理器中显示
            open_external,                   // 用外部程序打开

            // 右键菜单命令
            show_context_menu,               // 显示上下文菜单
        ])
        // 生成 Tauri 上下文并启动事件循环
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
