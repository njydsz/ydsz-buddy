//! 命令模块聚合导出
//!
//! 本模块是 Remi Code Tauri 应用所有命令子模块的聚合入口。
//!
//! ## 模块职责
//!
//! - 统一导出所有命令子模块，供 `lib.rs` 通过通配符导入
//! - 每个子模块对应一个业务领域，提供该领域的 Tauri IPC 命令
//!
//! ## 模块清单
//!
//! | 模块名 | 职责说明 |
//! |--------|----------|
//! | `dialog` | 文件对话框、消息对话框、确认对话框等系统对话框操作 |
//! | `terminal` | 终端会话管理（创建、写入、调整大小、关闭） |
//! | `browser` | 内嵌浏览器面板（标签页管理、导航、截图、CDP 执行） |
//! | `update` | 应用自动更新（版本检查、下载、安装） |
//! | `window` | 窗口主题、系统交互（主题切换、文件管理器定位、外部链接打开） |
//! | `context_menu` | 右键上下文菜单 |
//! | `voice` | 语音识别命令 |
//!
//! ## 使用场景
//!
//! 在 `lib.rs` 中通过 `use commands::*;` 导入所有子模块的公开项，
//! 然后在 `tauri::generate_handler!` 宏中注册为前端可调用的命令。

// 命令模块导出
// 所有子模块均声明为 `pub mod`，确保其公开项可被外部访问
pub mod dialog;        // 系统对话框命令
pub mod terminal;      // 终端会话命令
pub mod browser;       // 内嵌浏览器命令
pub mod update;        // 自动更新命令
pub mod window;        // 窗口/系统命令
pub mod context_menu;  // 右键菜单命令
pub mod voice;         // 语音识别命令

// === Sprint 1-D 桌面补齐 ===
pub mod backend_readiness;       // 嵌入式后端就绪状态
pub mod server_listening_detector; // 端口轮询/等待
pub mod desktop_user_data_profile;  // 桌面端用户画像
pub mod sync_shell_environment;    // shell 环境同步
pub mod media_permissions;        // 媒体权限查询/请求
pub mod rotating_file_sink;       // 带轮转的文件日志落地
pub mod runtime_arch;             // 运行时 CPU/OS 信息
pub mod initial_backend_window_open; // 启动后窗口打开策略
pub mod menu_shortcuts;           // 菜单/快捷键声明式模型
