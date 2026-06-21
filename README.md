<p align="center">
  <img src="./remi-app/public/remi-claw.png" alt="Remi Claw" width="128" />
</p>

<h1 align="center">Remi Claw</h1>

<p align="center">
  <strong>双模式 AI 桌面助手 — 一个桌面，两种工作模式一键切换</strong><br />
  <code>Work 模式</code> 任务驱动的数字员工 · <code>Code 模式</code> 仓库内的程序员副驾
</p>

<p align="center">
  <a href="#-核心特性">核心特性</a> •
  <a href="#-快速开始">快速开始</a> •
  <a href="#-技术架构">技术架构</a> •
  <a href="#-开发指南">开发指南</a> •
  <a href="#-路线图">路线图</a> •
  <a href="#-贡献指南">贡献指南</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.2.0-blue" alt="version" />
  <img src="https://img.shields.io/badge/Rust-1.75+-orange" alt="rust" />
  <img src="https://img.shields.io/badge/React-19-blue" alt="react" />
  <img src="https://img.shields.io/badge/Tauri-2.x-green" alt="tauri" />
  <img src="https://img.shields.io/badge/license-MIT-lightgrey" alt="license" />
</p>

---

## 🎯 产品定位

**Remi Claw** 是一个**双模式、本地优先的 AI 桌面助手**，使用 Rust + Tauri + React 构建。在一个统一外壳内同时承载两种工作流：

| 模式 | 定位 | 典型场景 | 对标产品 |
|------|------|----------|----------|
| **Work 模式** | 任务驱动的"数字员工" | 文档处理、浏览器自动化、长任务编排、日常办公 | Kimi Work、Trea Work、Qoder Work、WorkBuddy、QClaw、MimoClaw |
| **Code 模式** | 仓库内代码理解的"程序员副驾" | 代码检索、编辑、Diff、Review、构建/调试 | ZCode、CodeX、OpenCode、Qoder IDE、Trea IDE、Kilo Code、Pi Code |

两种模式共用同一套 Provider 适配层、Orchestration 引擎、Skill / Plugin 体系和 Tauri 桌面壳，通过 Thread 上的 `runtime-mode` 字段做运行时分发，通过 `interaction-mode` 区分 Work / Code 的交互范式。

---

## ✨ 核心特性

### 🚀 极致性能

基于 Rust 构建，采用现代化技术栈：
- **启动时间**：~1s
- **内存占用**：~50MB
- **RPC 响应**：~10ms
- **安装包大小**：~50MB

### 🔒 本地优先

所有数据和服务运行在本地，保护代码与办公内容隐私。基于 SQLite WAL 模式实现高性能本地存储。

### 🧩 双模式一体

Work / Code 一个桌面、一份会话历史、一套 Skills 体系，按场景无缝切换。

### 🛠️ 多代理统一

无缝切换 8 家 AI 编程提供商：

| Provider | 适配器 | 通信方式 | 状态 |
|----------|--------|----------|------|
| Claude Code | `ClaudeAdapter` | Claude Agent SDK | ✅ 支持 |
| Codex (OpenAI) | `CodexAdapter` | JSON-RPC over stdio | ✅ 支持 |
| Cursor | `CursorAdapter` | ACP | ✅ 支持 |
| Gemini | `GeminiAdapter` | ACP | ✅ 支持 |
| Grok | `GrokAdapter` | ACP | ✅ 支持 |
| Kilo Code | `KiloAdapter` | OpenCode 协议 | ✅ 支持 |
| OpenCode | `OpenCodeAdapter` | OpenCode SDK | ✅ 支持 |
| Pi | `PiAdapter` | Pi Agent SDK | ✅ 支持 |

### 🪄 可扩展 Skill

内置 Work / Code 各自的本地 Skills，支持插件式扩展。Skill 按 `mode` 分组（`work` / `code` / `shared`）。

### 📦 轻量桌面

基于 Tauri 2.x 构建，安装包体积相比 Electron 方案减少 60-70%。

### 🌍 跨平台支持

- **Windows**: Windows 10/11 (x64, ARM64)
- **macOS**: macOS 12+ (Intel, Apple Silicon)
- **Linux**: Ubuntu 20.04+, Fedora 38+, Debian 12+ (x64, ARM64)

---

## 🚀 快速开始

### 环境要求

**必需**：
- Rust 1.75+
- Node.js 22+
- pnpm 或 bun
- Git 2.30+

**可选**：
- Tauri CLI (`cargo install tauri-cli`)
- Rust Analyzer (VS Code 插件)

### 克隆项目

```bash
git clone https://github.com/remiopen/remi-claw.git
cd remi-claw
```

### 后端开发（Rust）

```bash
# 构建所有 Rust 模块
cargo build

# 运行测试
cargo test

# 运行 CLI
cargo run --bin remi-cli -- --help

# 启动服务器
cargo run --bin remi-cli -- serve --port 3773
```

### 前端开发（TypeScript）

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建生产版本
pnpm build

# 类型检查
pnpm typecheck
```

### Tauri 桌面应用

```bash
# 启动开发环境
cargo tauri dev

# 构建生产版本
cargo tauri build
```

### 代码规范

**Rust**：
```bash
cargo fmt        # 格式化代码
cargo clippy     # 静态分析
cargo test       # 运行测试
```

**TypeScript**：
```bash
pnpm lint        # ESLint 检查
pnpm typecheck   # 类型检查
pnpm test        # 运行测试
```

---

## 🏗️ 技术架构

### 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                   Tauri 前端 (React + Vite)                      │
│         Tauri Commands • Event System • Stores • Hooks           │
└─────────────────────────────┬───────────────────────────────────┘
                              │ Tauri IPC
┌─────────────────────────────▼───────────────────────────────────┐
│                   Rust 后端 (Tokio + Axum)                       │
│  ┌──────────┐ ┌──────────────┐ ┌────────────┐ ┌─────────────┐  │
│  │ WebSocket│ │ Orchestration│ │ Provider   │ │ Git         │  │
│  │ Server   │ │ Engine       │ │ Service    │ │ Service     │  │
│  └──────────┘ └──────────────┘ └────────────┘ └─────────────┘  │
│  ┌──────────┐ ┌──────────────┐ ┌────────────┐ ┌─────────────┐  │
│  │ Terminal │ │ Workspace    │ │ Auth       │ │ Persistence │  │
│  │ Manager  │ │ Service      │ │ Service    │ │ (SQLite)    │  │
│  └──────────┘ └──────────────┘ └────────────┘ └─────────────┘  │
└─────────────────────────────┬───────────────────────────────────┘
                              │ JSON-RPC over stdio / CLI spawn
┌─────────────────────────────▼───────────────────────────────────┐
│              AI Provider Runtimes                                │
│   Codex CLI │ Claude Agent SDK │ Cursor ACP │ Gemini │ Grok │…  │
└───────────────────────────────────────────────────────────────────┘
```

### 技术栈

| 层次 | 技术 | 职责 |
|------|------|------|
| **表现层** | React 19 + Vite 8 | UI 组件、状态管理、路由 |
| **应用层** | Tauri 2.x | 桌面壳、IPC 通信、原生 API |
| **领域层** | Rust (remi-*) | 业务逻辑、领域模型、事件处理 |
| **基础设施层** | Rust (remi-*) | 数据库、文件系统、进程管理 |

### 设计模式

- **CQRS / Event Sourcing**：编排引擎采用命令-查询职责分离和事件溯源
- **Provider Adapter**：统一的 ProviderAdapter trait 适配多种 AI 提供商
- **Reactor Pattern**：使用 Reactor 模式处理异步事件流
- **Layer/Service 分离**：清晰的服务接口和实现分离

### 技术优势

- **运行时**：Rust 多线程架构，性能卓越
- **框架**：Axum + Tokio，现代化异步框架
- **桌面壳**：Tauri 2.x，轻量级跨平台方案
- **内存管理**：所有权系统，无 GC 停顿
- **并发模型**：async/await，真正的多线程并发
- **类型系统**：Rust 强类型，编译期保证类型安全

---

## 📂 项目结构

### 目录结构

```
remi-claw/
├── Cargo.toml                    # Rust Workspace 配置
├── package.json                  # Node.js Workspace 配置
│
├── remi-core/                    # 核心领域模型与合约
├── remi-config/                  # 配置管理
├── remi-persistence/             # 持久化层（SQLite）
├── remi-orchestration/           # 编排引擎（CQRS/ES）
├── remi-provider/                # AI Provider 管理
├── remi-git/                     # Git 服务
├── remi-terminal/                # 终端管理
├── remi-workspace/               # 工作空间与文件系统
├── remi-auth/                    # 认证与授权
├── remi-checkpoint/              # 检查点管理
├── remi-telemetry/               # 遥测与分析
├── remi-server/                  # WebSocket 服务器
├── remi-cli/                     # CLI 入口
│
└── remi-app/                     # Tauri 桌面应用
    ├── src/                      # 前端源码（React）
    │   ├── components/          # UI 组件
    │   ├── hooks/               # React Hooks
    │   ├── lib/                 # 工具库
    │   ├── routes/              # 路由配置
    │   ├── i18n/                # 国际化
    │   └── contracts/           # 类型契约
    ├── src-tauri/               # Tauri 后端
    └── package.json
```

### 模块依赖关系

```
remi-cli
    ├── remi-config
    └── remi-server
            ├── remi-orchestration
            │       ├── remi-persistence
            │       ├── remi-provider
            │       └── remi-core
            ├── remi-git
            ├── remi-terminal
            ├── remi-workspace
            ├── remi-auth
            ├── remi-checkpoint
            └── remi-telemetry
```

---

## 🧩 核心模块

### 编排引擎 (remi-orchestration)

编排引擎是系统的核心，采用 **CQRS + Event Sourcing** 架构模式。

**核心职责**：
- 命令分发与验证
- 事件持久化与流式处理
- 投影器构建读模型
- 状态查询与快照

**命令体系**（31 种命令）：
- 项目管理：`project.create`, `project.meta.update`, `project.delete`
- 线程管理：`thread.create`, `thread.delete`, `thread.archive`, `thread.unarchive`, `thread.meta.update`, `thread.runtime-mode.set`, `thread.interaction-mode.set`, `thread.handoff.create`, `thread.fork.create`
- 消息交互：`thread.turn.start`, `thread.turn.interrupt`, `thread.turn.dispatch-queued`
- 审批流程：`thread.approval.respond`, `thread.user-input.respond`
- 检查点：`thread.checkpoint.revert`, `thread.conversation.rollback`
- 消息操作：`thread.message.edit-and-resend`, `thread.session.stop`, `thread.activity.append`
- 内部命令：`thread.session.set`, `thread.messages.import`, `thread.message.assistant.delta`, `thread.message.assistant.complete`, `thread.proposed-plan.upsert`, `thread.turn.diff.complete`, `thread.revert.complete`, `thread.conversation.rollback.complete`

**事件类型**（26 种事件）：
- 项目事件：`project.created`, `project.meta-updated`, `project.deleted`
- 线程事件：`thread.created`, `thread.deleted`, `thread.archived`, `thread.unarchived`, `thread.meta-updated`, `thread.runtime-mode-set`, `thread.interaction-mode-set`
- 消息事件：`thread.message-sent`
- Turn 事件：`thread.turn-queued`, `thread.turn-start-requested`, `thread.turn-interrupt-requested`
- 审批事件：`thread.approval-response-requested`, `thread.user-input-response-requested`
- 检查点事件：`thread.checkpoint-revert-requested`, `thread.reverted`, `thread.turn-diff-completed`
- 回滚事件：`thread.conversation-rollback-requested`, `thread.conversation-rolled-back`
- 其他事件：`thread.message-edit-resend-requested`, `thread.session-stop-requested`, `thread.session-set`, `thread.proposed-plan-upserted`, `thread.activity-appended`

### Provider 服务 (remi-provider)

Provider 服务负责管理所有 AI 提供商的集成。

**核心接口**：
```rust
#[async_trait]
pub trait ProviderAdapter: Send + Sync {
    async fn start_session(&self, input: SessionStartInput) -> Result<ProviderSession, ProviderError>;
    async fn send_turn(&self, input: TurnInput) -> Result<TurnResult, ProviderError>;
    async fn steer_turn(&self, input: SteerInput) -> Result<TurnResult, ProviderError>;
    async fn interrupt_turn(&self, session_id: SessionId) -> Result<(), ProviderError>;
    async fn stop_session(&self, session_id: SessionId) -> Result<(), ProviderError>;
    async fn stream_events(&self) -> Result<Receiver<ProviderRuntimeEvent>, ProviderError>;
    fn capabilities(&self) -> ProviderCapabilities;
}
```

### 持久化层 (remi-persistence)

持久化层使用 SQLite 作为存储引擎，支持事件溯源和投影查询。

**核心表结构**：

| 表 | 职责 |
|----|------|
| `orchestration_events` | 事件存储（Event Sourcing） |
| `projection_projects` | 项目投影数据 |
| `projection_threads` | 线程投影数据（含消息、活动、检查点） |
| `projection_state` | 投影器游标（最后应用序列号） |
| `auth_sessions` | 认证会话 |
| `auth_pairing_links` | 配对链接 |

**关键特性**：
- WAL 模式提升并发读性能
- 自动迁移系统
- 事务保证原子性

### Git 服务 (remi-git)

Git 服务提供完整的版本控制功能。

**核心能力**：
- 分支管理：创建、切换、列表、删除
- Worktree 管理：创建、移除、路径管理
- Stash 操作：stash、checkout、drop、info
- Diff 操作：工作树 diff、diff 摘要
- PR 流程：准备 PR 线程、解析 PR
- 线程交接：将线程工作交接至 Git 分支

### 终端管理 (remi-terminal)

终端管理提供 PTY 终端会话管理。

**核心功能**：
- 终端打开/关闭/重启/清除
- 写入输入、调整大小
- 事件订阅（输出流广播）
- 线程关联终端抽屉

### WebSocket 服务器 (remi-server)

WebSocket 服务器提供与前端通信的 RPC 接口。

**RPC 方法**（8 大类方法）：
- 编排方法：`orchestration.dispatchCommand`, `orchestration.getSnapshot`
- Git 方法：`git.pull`, `git.status`, `git.listBranches`
- 终端方法：`terminal.open`, `terminal.write`, `terminal.resize`
- 工作空间方法：`workspace.browse`, `workspace.readFile`, `workspace.writeFile`
- Provider 方法：`provider.listModels`, `provider.sendTurn`
- 认证方法：`auth.login`, `auth.validateToken`
- 检查点方法：`checkpoint.create`, `checkpoint.revert`
- 服务器方法：`server.getConfig`, `server.getSettings`

**推送通道**（8 个）：
- `server.welcome`：初始欢迎
- `orchestration.domainEvent`：编排领域事件
- `orchestration.shellEvent`：Shell 流事件
- `orchestration.threadEvent`：线程详情流事件
- `terminal.event`：终端输出事件
- `git.actionProgress`：Git 操作进度
- `provider.event`：Provider 运行时事件
- `checkpoint.event`：检查点事件

---

## 🗺️ 路线图

### 阶段 1：双模式骨架（P0，2 周）

- ⏳ Thread 模型新增 `runtime-mode ∈ {work, code}`、`interaction-mode ∈ {chat, plan, agent, review}`
- ⏳ Sidebar / ChatHeader 模式切换器与模式徽标
- ⏳ Composer 命令菜单按模式分别提供 Work / Code 专属 Slash 命令
- ⏳ Skill 库按 `mode` 字段分组（work / code / shared）

**验收**：新建 Thread 时可选 Work / Code；已有 Thread 显示模式徽标；切换 Thread 时 UI 同步。

### 阶段 2：Code 模式可用化（P0，3 周）

- ⏳ 注册全部 8 家 Provider Adapter 到运行时
- ⏳ 打通 `ProviderDiscoveryService`，前端可看到动态模型列表与能力位
- ⏳ 补齐 `ProviderAdapter` trait 的 `capabilities` / `discover_models` / `list_tools`
- ⏳ 跑通 Code 模式下的"打开仓库 → 提问 → 编辑 → Diff → 提交"全链路

**验收**：在 8 家 Provider 中至少 3 家（Codex / Claude / OpenCode）可以端到端完成一次 Turn。

### 阶段 3：Work 模式核心能力（P1，4 周）

- ⏳ 实现 `scheduler::CronScheduler`，Thread 上可挂"周期任务"
- ⏳ 实现 `office` Skill 集合：docx 读/写、xlsx 读/写、pdf 文本提取
- ⏳ 打通 `BrowserPanel` 与 Work 任务的事件总线
- ⏳ 实现 `filesystem.batch` Skill：批量重命名 / 分类 / 摘要，强制 Dry-Run + 二次确认

**验收**：演示场景"每周一拉取报表 → 用 docx Skill 摘要 → 邮件草稿入站"可完成。

### 阶段 4：双模式打磨与生态（P1+P2，4 周）

- ⏳ Skill 库按 `mode ∈ {work, code, shared}` 分组
- ⏳ 仓库语义检索（先用 ripgrep + tree-sitter 索引，后续替换为 tantivy）
- ⏳ 插件 / Marketplace 雏形：本地插件市场 + 一键安装
- ⏳ 团队协作：Shared Thread（只读分享 + 评论）

**验收**：发布 Remi Claw 0.2.0（双模式 + 调度 + Office Skill + 仓库语义检索 + 插件雏形）。

### 阶段 5：竞品对标攻坚（P2，迭代）

- ⏳ 数字员工模板市场（Work 模式 Scheduled Agent 模板）
- ⏳ 邮件 / 日历原生集成
- ⏳ Marketplace 上架流程 + 审核后台
- ⏳ 团队空间、权限分级、计费闸门

---

## 📊 竞品对比

### Work 模式能力矩阵

| 能力 | Kimi Work | Trea Work | Qoder Work | WorkBuddy | QClaw | MimoClaw | **Remi Claw** |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 本地文件系统批量操作 | 🟡 | ✅ | ✅ | ✅ | 🟡 | 🟡 | 🟡 |
| 浏览器自动化面板 | ❌ | ✅ | ✅ | ✅ | 🟡 | ✅ | 🟡 |
| 长任务 / Cron 调度 | ❌ | ✅ | 🟡 | ✅ | ✅ | 🟡 | ❌ |
| Office 文档读写 | ✅ | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ❌ |
| 邮件 / 日历 集成 | ❌ | 🟡 | 🟡 | ✅ | ✅ | ❌ | ❌ |
| 多步骤 Plan + 用户输入轮询 | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 |
| 本地 Skill（work 域） | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 |
| 任务时间线 / 待办 UI | 🟡 | ✅ | 🟡 | ✅ | ✅ | ✅ | 🟡 |
| 数字员工（Scheduled Agent） | ❌ | ✅ | 🟡 | ✅ | ✅ | 🟡 | ❌ |

### Code 模式能力矩阵

| 能力 | ZCode | CodeX | OpenCode | Qoder IDE | Trea IDE | Kilo Code | Pi Code | **Remi Claw** |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 多 Provider 适配 | 🟡 | ✅ | ✅ | 🟡 | ✅ | ✅ | 🟡 | 🟡 |
| Plan / Proposed Plan 流程 | 🟡 | ✅ | ✅ | 🟡 | ✅ | 🟡 | 🟡 | 🟡 |
| Diff 渲染 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 |
| 终端 + 任务关联 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Worktree / Branch 隔离 | ✅ | 🟡 | 🟡 | ✅ | ✅ | 🟡 | 🟡 | 🟡 |
| Checkpoint 回滚 | 🟡 | ✅ | ✅ | 🟡 | ✅ | 🟡 | 🟡 | 🟡 |
| 仓库语义检索 | ✅ | 🟡 | 🟡 | ✅ | ✅ | 🟡 | 🟡 | ❌ |
| Build/Test/Run 闭环 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 |
| PR Review / PR Thread | 🟡 | ❌ | ❌ | 🟡 | ✅ | 🟡 | 🟡 | 🟡 |
| RateLimit / 用量可视化 | 🟡 | ✅ | 🟡 | 🟡 | ✅ | 🟡 | 🟡 | 🟡 |
| 插件 / Marketplace | ✅ | 🟡 | 🟡 | ✅ | 🟡 | ✅ | 🟡 | 🟡 |
| Skills 库 | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ | 🟡 |

### 关键能力差距（按优先级）

| 优先级 | 能力差距 | 受影响模式 | 竞品参照 |
|:---:|------|:---:|------|
| **P0** | Work 模式：定时 / Cron 调度器（Scheduled Agent） | Work | Trea Work、WorkBuddy、QClaw |
| **P0** | Work 模式：Office 文档读写（docx/xlsx/pdf） | Work | Trea Work、Kimi Work、QClaw |
| **P0** | Code 模式：补齐 Provider 运行时注册 + RPC 打通 | Code | OpenCode、Trea IDE SOLO |
| **P0** | 双模：Thread 模型新增 `runtime-mode` / `interaction-mode` 字段与持久化 | 通用 | 全部 |
| **P1** | Work 模式：浏览器自动化面板与 Work 任务编排打通 | Work | Trea Work、WorkBuddy、MimoClaw |
| **P1** | Code 模式：仓库语义检索（symbol/语义级） | Code | ZCode、OpenCode |
| **P1** | Work 模式：本地文件系统批量 Skill（dry-run + 二次确认） | Work | Trea Work、Qoder Work |
| **P1** | 双模：Skill 库按 `mode` 分组与默认 Skill 集 | 通用 | 全部 |
| **P2** | Work 模式：邮件 / 日历 集成 | Work | WorkBuddy、QClaw |
| **P2** | Code 模式：插件 / Marketplace 上架流程 | Code | ZCode、OpenCode |
| **P2** | 跨模式：团队协作 / Shared Thread | 通用 | Trea Work、WorkBuddy |
| **P2** | Work 模式：数字员工（Scheduled Agent 模板市场） | Work | Trea Work、WorkBuddy |

---

## 🤝 贡献指南

### 贡献流程

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

### 提交规范

遵循 Conventional Commits 规范：

```
<type>(<scope>): <subject>

<body>

<footer>
```

**类型说明**：
- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档更新
- `style`: 代码格式（不影响代码运行的变动）
- `refactor`: 重构（既不是新增功能，也不是修改 bug 的代码变动）
- `perf`: 性能优化
- `test`: 增加测试
- `chore`: 构建过程或辅助工具的变动

### 代码审查

所有提交都需要经过代码审查：
- 至少 1 个 approving review
- 所有 CI 检查通过
- 无合并冲突

---

## 📚 术语表

| 术语 | 说明 |
|------|------|
| **Provider** | AI 编程代理（如 Claude、Codex、Gemini） |
| **Thread** | 聊天线程，包含一组相关的对话 |
| **Turn** | 一次用户-AI 交互回合 |
| **Checkpoint** | 检查点，用于回滚和恢复 |
| **Projection** | 投影，从事件流构建的读模型 |
| **Work 模式** | 任务驱动的"数字员工"形态（对标 Kimi Work / Trea Work / Qoder Work / WorkBuddy / QClaw / MimoClaw） |
| **Code 模式** | 仓库内代码副驾形态（对标 ZCode / CodeX / OpenCode / Qoder IDE / Trea IDE / Kilo Code / Pi Code） |
| **`runtime-mode`** | Thread 的运行时分发字段，取值 `work` / `code` |
| **`interaction-mode`** | Thread 的交互范式字段，取值 `chat` / `plan` / `agent` / `review` / `task` |
| **Skill** | 可被 Provider 调用的本地能力单元，按 `mode` 分组（`work` / `code` / `shared`） |

---

## 🔗 相关链接

- [Tauri 官方文档](https://tauri.app/)
- [Rust 官方文档](https://www.rust-lang.org/)
- [竞品参考：Kimi Work](https://kimi.moonshot.cn/)
- [竞品参考：Trea Work](https://work.trea.com/)
- [竞品参考：Qoder Work](https://qoder.com/work)
- [竞品参考：WorkBuddy](https://workbuddy.ai/)
- [竞品参考：ZCode](https://zcode.ai/)
- [竞品参考：CodeX](https://openai.com/index/openai-codex/)
- [竞品参考：OpenCode](https://opencode.ai/)
- [竞品参考：Qoder IDE](https://qoder.com/)
- [竞品参考：Trea IDE](https://trea.com/)
- [竞品参考：Kilo Code](https://kilo.ai/)
- [竞品参考：Pi Code](https://pi.ai/)

---

## 📧 联系方式

- GitHub Issues: [报告问题](https://github.com/remi-claw/remi-claw/issues)
- GitHub Discussions: [讨论区](https://github.com/remi-claw/remi-claw/discussions)
- 内部反馈: 内部 Slack `#remi-claw-product`

---

<p align="center">
  本项目采用 MIT 许可证。详见 <a href="./LICENSE">LICENSE</a> 文件。
</p>

<p align="center">
  <strong>Remi Claw</strong> — 一个桌面，两种脑回路<br />
  Made with ❤️ by Remi Claw Team
</p>
