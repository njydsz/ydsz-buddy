//! 命令模块聚合导出
//!
//! 本模块是 ydsz-buddy Tauri 应用所有命令子模块的聚合入口。

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
pub mod push;                   // 移动端推送（桌面端 <-> 移动端）
pub mod diagnostics;            // 诊断日志打包与上报
pub mod skills;                 // Skill 模块（SKILL.md / 注册表 / 市场索引 / 安装器）
pub mod goal;                   // Goal Mode 目标模式命令
pub mod failover;               // Provider 故障转移（P1-4 后端化）
pub mod coding_plan_oauth;      // 国产 Coding Plan 订阅 OAuth Device Flow（P1-5）
pub mod idle_lock;              // 离座锁定 / 隐私屏（P2-1）
pub mod ocr;                    // 截图 OCR（P2-2:macOS Vision / Windows OCR / Tesseract 兜底）
pub mod ollama;                 // Ollama 本地模型服务发现（P2-4:避开浏览器 CORS 拦截）
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
pub mod turn;                   // Turn 生命周期管理（取消/中断）
pub mod artifacts;              // 产物批量导出

// === 竞品差距补齐（P0/P1/P2）===
pub mod missing;                // 补齐缺失命令（env_get / fs_exists / fs_which / preset.list / image_gen.list_providers）
pub mod event_store_ext;        // 事件存储追加/查询（P0-3 审计事件持久化）
pub mod knowledge;              // 知识库 RAG Phase A（P1-4）
pub mod hitl;                   // HITL 审批（P1-5: Human-in-the-Loop）
pub mod thread_persist;         // Thread 会话持久化（P1-6: SQLite CRUD）
pub mod connectors;             // 开发者连接器（P2-8: Jira / GitHub Issues / Sentry / Grafana / Webhook）
pub mod telemetry;              // 遥测与指标（计数器 + 事件环形缓冲区）

// === G8-P1 / G12-P2 / G16-P1 / G18-P2: 跨能力框架 ===
pub mod evolution;              // 自进化能力框架 (G18-P2)
pub mod connector_presets;      // Connector 预置实例（G16-P1: GitHub/Notion/Slack）
pub mod personas;               // MBTI 人格模板（G12-P2）
pub mod workflow;               // 动态工作流引擎（P0-1）
pub mod bot;                    // 多通道 Bot 集成（P0-4）
pub mod memory;                 // 项目记忆系统（P1-2）
pub mod backup;                 // 备份与恢复（G8-P1）
pub mod session_share;          // 会话共享（P1-1）
pub mod custom_command;         // 自定义命令系统（P2-11）
pub mod feedback;               // 反馈系统（P2-6）
pub mod storage_cleaner;        // 存储扫描与清理工具（P2-9）
pub mod offpeak;                // 低谷任务调度（P1-3）
pub mod browser_recorder;       // 浏览器录制（P1-5）

// === G3-P0: RBAC 多用户认证 ===
pub mod auth_commands;
pub mod audit_bridge;            // ToolPipeline → Event Sourcing 审计桥接
pub mod audit_integrity;         // 审计日志 tamper-proof 默克尔校验
pub mod token_tracking;          // Provider Token 强制追踪 + AI 占比分析
pub mod ssh_hostkey;             // SSH known_hosts 严格校验

// === G4-P1: IM Channel Integration Framework ===
pub mod im_channel;

// === G10-P1: ACP Bidirectional Integration Framework ===
pub mod acp;

// === G11-P2: Expert Marketplace ===
pub mod expert_market;
