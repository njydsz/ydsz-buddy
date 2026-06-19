//! # 命令模块聚合导出
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
//! | `git` | Git 版本控制操作（状态查询、分支管理、提交、推送等） |
//! | `workspace` | 工作区/项目管理（项目列表、文件读写） |
//! | `settings` | 应用设置持久化（读取、保存用户配置） |
//! | `orchestration` | AI 编排引擎（对话线程、消息发送、历史记录） |
//! | `provider` | AI 模型提供商管理（模型列表、API Key 配置） |
//! | `browser` | 内嵌浏览器面板（标签页管理、导航、截图、CDP 执行） |
//! | `update` | 应用自动更新（版本检查、下载、安装） |
//! | `window` | 窗口主题、系统交互（主题切换、文件管理器定位、外部链接打开） |
//! | `context_menu` | 右键上下文菜单 |
//!
//! ## 使用场景
//!
//! 在 `lib.rs` 中通过 `use commands::*;` 导入所有子模块的公开项，
//! 然后在 `tauri::generate_handler!` 宏中注册为前端可调用的命令。

// 命令模块导出
// 所有子模块均声明为 `pub mod`，确保其公开项可被外部访问
pub mod dialog;        // 系统对话框命令
pub mod terminal;      // 终端会话命令
pub mod git;           // Git 版本控制命令
pub mod workspace;     // 工作区管理命令
pub mod settings;      // 应用设置命令
pub mod orchestration; // AI 编排引擎命令
pub mod provider;      // AI 模型提供商命令
pub mod browser;       // 内嵌浏览器命令
pub mod update;        // 自动更新命令
pub mod window;        // 窗口/系统命令
pub mod context_menu;  // 右键菜单命令
pub mod voice;
