//! 命令模块聚合导出
//!
//! 本模块是 ydsz-buddy Tauri 应用所有命令子模块的聚合入口。
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
pub mod browser_use_pipe;       // Codex 兼容的浏览器使用管道服务器

// === Sprint 2 扩展命令 ===
pub mod lsp;                    // LSP 语言服务器集成
pub mod office;                 // Office 文档处理（docx/xlsx/pdf）
pub mod scheduler;              // 定时任务调度命令
pub mod indexer;                // 仓库语义检索命令
pub mod audit_export;           // 审计日志导出
pub mod repo_wiki;              // Repo Wiki 知识引擎
pub mod plan_export;            // Plan 文档导出
pub mod checkpoint;             // 任务崩溃恢复 Checkpoint
pub mod mcp;                    // MCP (Model Context Protocol) 客户端
pub mod project_rules;          // 项目规则加载（AGENTS.md / CLAUDE.md / .ydsz/rules/）
pub mod push;                   // 移动端推送（桌面端 ↔ 移动端）
pub mod diagnostics;            // 诊断日志打包与上报
pub mod skills;                 // Skill 模块（SKILL.md / 注册表 / 市场索引 / 安装器）
pub mod goal;                   // Goal Mode 目标模式命令
pub mod failover;               // Provider 故障转移（P1-4 后端化）
pub mod coding_plan_oauth;      // 国产 Coding Plan 订阅 OAuth Device Flow（P1-5）
pub mod idle_lock;              // 离座锁定 / 隐私屏（P2-1）
pub mod ocr;                    // 截图 OCR（P2-2:macOS Vision / Windows OCR / Tesseract 兜底）
pub mod ollama;                 // Ollama 本地模型服务发现（P2-4:避免浏览器 CORS 拦截）
pub mod team_rules;              // 团队共享规则（~/.ydsz-buddy/team-rules/,P2-5）
pub mod ssh;                    // SSH 远程连接（P1-C:russh 真集成）
pub mod search;                  // Web 搜索与 URL 内容抓取
pub mod runner;                  // Agent 命令执行器
pub mod sandbox;                 // 数据分析沙箱
pub mod multi_edit;              // 多文件协调编辑
pub mod tool_registry;           // 工具注册表与模式过滤
pub mod fs;                      // 文件系统管理工具
pub mod semantic;                // 语义搜索
pub mod build_runner;            // Build/Test Runner
pub mod permissions;            // 工具权限白名单
pub mod credential_store;      // OS Keyring 凭证存储（P0-2）
pub mod review_comments;        // 行级 Review Comment 后端持久化（P2-2）
pub mod code_sandbox;           // Agent 代码执行沙箱（P2-8）
pub mod extensions;             // Extension 扩展系统（P1-1: 安装/管理/启用/禁用 UI）
pub mod image_gen;              // AI 文生图（DALL-E 3 / FLUX / SD / 通义万相 / 混元）

