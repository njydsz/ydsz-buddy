<p align="center">
  <img src="./remi-app/public/remicode.png" alt="Remi Claw" width="128" />
</p>

<h1 align="center">Remi Claw</h1>

<p align="center">
  <strong>面向开发者与办公场景的双模式 AI 桌面助手</strong><br />
  <code>Work 模式</code> 对标 Trea Work / Qoder Work / Kimi Work / WorkBuddy / QClaw / MimoClaw<br />
  <code>Code 模式</code> 对标 ZCode / OpenCode / Trea IDE SOLO 模式
</p>

<p align="center">
  <a href="#-一项目概述">项目概述</a> •
  <a href="#-十一work--code-双模式">双模式</a> •
  <a href="#-十二竞品能力对比与差距分析">竞品对比</a> •
  <a href="#-十三下一步完善计划">完善计划</a> •
  <a href="#-核心特性">核心特性</a> •
  <a href="#-技术架构">技术架构</a>
</p>

---

## 目录

- [一、项目概述](#一项目概述)
- [二、核心特性](#二核心特性)
- [三、技术架构](#三技术架构)
- [四、项目结构](#四项目结构)
- [五、核心模块](#五核心模块)
- [六、技术栈](#六技术栈)
- [七、开发指南](#七开发指南)
- [八、迁移计划](#八迁移计划)
- [九、性能指标](#九性能指标)
- [十、贡献指南](#十贡献指南)
- [十一、Work / Code 双模式](#十一work--code-双模式)
- [十二、竞品能力对比与差距分析](#十二竞品能力对比与差距分析)
- [十三、下一步完善计划](#十三下一步完善计划)
- [附录](#附录)

---

## 一、项目概述

### 1.1 项目定位

**Remi Claw**（原 Remi Code 完成品牌升级后正式名称）是一个**双模式、本地优先的 AI 桌面助手**，使用 Rust + Tauri 构建。它在一个统一外壳内同时承载两种工作流：

- **Work 模式** —— 任务驱动的"数字员工"形态，覆盖本地文档处理、浏览器自动化、长任务编排、日常办公场景，对标 Trea Work / Qoder Work / Kimi Work / WorkBuddy / QClaw / MimoClaw。
- **Code 模式** —— 仓库内代码理解、编辑、构建、调试的"程序员副驾"形态，对标 ZCode / OpenCode / Trea IDE SOLO 模式。

两种模式共用同一套 Provider 适配层、Orchestration 引擎、Skill / Plugin 体系和 Tauri 桌面壳，通过 Thread 上的 `runtime-mode` 字段做运行时分发，通过 `interaction-mode` 区分 Work / Code 的交互范式。

### 1.2 核心价值

- 🚀 **极致性能**：Rust 后端带来卓越的性能表现，启动时间 < 1 秒，内存占用 < 50MB
- 🔒 **本地优先**：所有数据和服务运行在本地，保护代码与办公内容隐私
- 🧩 **双模式一体**：Work / Code 一个桌面、一份会话历史、一套 Skills 体系，按场景无缝切换
- 🛠️ **多代理统一**：Claude、Codex、Gemini、Grok、OpenCode、Cursor、Kilo、Pi 等 Provider 统一接入
- 🪄 **可扩展 Skill**：内置 Work / Code 各自的本地 Skills，支持插件式扩展
- 📦 **轻量桌面**：基于 Tauri 2.x 构建，安装包体积相比 Electron 方案减少 60-70%

### 1.3 项目演进

Remi Claw 由原 Remi Code 完成品牌与产品形态升级，目标是：

- **后端完全重写**：从 Node.js + Effect-TS 迁移到 Rust + Tokio
- **前端适配**：从 Electron 迁移到 Tauri，保持 React 技术栈
- **产品形态扩展**：从"纯代码副驾"扩展为"双模式桌面助手"，Work / Code 两种模式并存
- **协议兼容**：WebSocket RPC 协议保持兼容，前端可在最小改动下接入新模式
- **性能与隐私**：充分利用 Rust 的性能优势，突破 Node.js 单线程瓶颈

### 1.4 双模式快速对照

| 维度 | Work 模式 | Code 模式 |
|------|-----------|-----------|
| 主要竞品 | Trea Work、Qoder Work、Kimi Work、WorkBuddy、QClaw、MimoClaw | ZCode、OpenCode、Trea IDE SOLO |
| 典型载体 | 本地文件夹、Office 文档、浏览器标签、桌面应用 | 本地 Git 仓库、编辑器、终端、构建系统 |
| 核心能力 | 文档读写、浏览器自动化、长任务计划、办公协作 | 代码检索、编辑、Diff、Review、构建/调试 |
| 交互范式 | 多步任务、待办列表、用户输入轮询 | Turn 驱动的代码修改闭环 |
| 关键约束 | 不破坏本地文件结构；操作可回滚 | 不破坏构建/测试；Diff 必须可审查 |
| 默认 Provider | Claude / Kimi 类长上下文模型 | Codex / Claude Code / Cursor |

---

## 二、核心特性

### 2.1 多代理统一管理

无缝切换多个 AI 编程提供商，无需改变工作流：

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

### 2.2 实时流式响应

实时观看 AI 代理工作——代码生成、工具调用、结果呈现，无延迟、无轮询。

### 2.3 Git 集成

内置版本控制功能：分支管理、暂存、提交、推送、差异对比——全部在同一界面完成。

### 2.4 终端管理

嵌入式终端，支持多标签、线程关联、实时输出，无需离开应用即可执行命令。

### 2.5 会话持久化

会话支持重启恢复。智能检查点捕获对话状态，可以从断点继续。

### 2.6 跨平台支持

基于 Tauri 2.x 构建，支持：
- **Windows**: Windows 10/11 (x64, ARM64)
- **macOS**: macOS 12+ (Intel, Apple Silicon)
- **Linux**: Ubuntu 20.04+, Fedora 38+, Debian 12+ (x64, ARM64)

---

## 三、技术架构

### 3.1 整体架构图

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

### 3.2 架构层次

| 层次 | 技术 | 职责 |
|------|------|------|
| **表现层** | React 19 + Vite 8 | UI 组件、状态管理、路由 |
| **应用层** | Tauri 2.x | 桌面壳、IPC 通信、原生 API |
| **领域层** | Rust (remi-*) | 业务逻辑、领域模型、事件处理 |
| **基础设施层** | Rust (remi-*) | 数据库、文件系统、进程管理 |

### 3.3 设计模式

- **CQRS / Event Sourcing**：编排引擎采用命令-查询职责分离和事件溯源
- **Provider Adapter**：统一的 ProviderAdapter trait 适配多种 AI 提供商
- **Reactor Pattern**：使用 Reactor 模式处理异步事件流
- **Layer/Service 分离**：清晰的服务接口和实现分离

### 3.4 技术栈对比

| 层次 | 原方案 | Remi Code | 改进点 |
|------|-----------|-----------|--------|
| **运行时** | Node.js (单线程) | Rust (多线程) | 性能提升 80%+ |
| **框架** | Effect-TS | Axum + Tokio | 学习曲线降低 |
| **桌面壳** | Electron | Tauri | 体积减少 60-70% |
| **内存管理** | GC | 所有权系统 | 无 GC 停顿 |
| **并发模型** | 事件循环 | async/await | 真正的多线程并发 |
| **类型系统** | TypeScript | Rust | 编译期保证类型安全 |

---

## 四、项目结构

### 4.1 目录结构

```
remi-code/
├── Cargo.toml                    # Rust Workspace 配置
├── package.json                  # Node.js Workspace 配置
├── tsconfig.base.json            # TypeScript 基础配置
│
├── remi-core/                    # 核心领域模型与合约
│   ├── src/
│   │   ├── lib.rs
│   │   ├── models.rs            # 领域实体定义
│   │   ├── events.rs            # 事件类型定义
│   │   ├── commands.rs          # 命令类型定义
│   │   ├── provider.rs          # Provider 相关类型
│   │   └── error.rs             # 错误类型定义
│   └── Cargo.toml
│
├── remi-config/                  # 配置管理
│   ├── src/
│   │   └── lib.rs               # 配置解析、环境变量、路径派生
│   └── Cargo.toml
│
├── remi-persistence/             # 持久化层（SQLite）
│   ├── src/
│   │   ├── lib.rs
│   │   ├── sqlite_client.rs     # SQLite 客户端封装
│   │   ├── migrations.rs        # 数据库迁移
│   │   ├── event_store.rs       # 事件存储
│   │   ├── projection_repo.rs   # 投影存储
│   │   ├── checkpoint_store.rs  # 检查点存储
│   │   └── pairing_store.rs     # 配对链接存储
│   └── Cargo.toml
│
├── remi-orchestration/           # 编排引擎（CQRS/ES）
│   ├── src/
│   │   ├── lib.rs
│   │   ├── engine.rs            # 编排引擎核心
│   │   ├── projector.rs         # 投影器
│   │   ├── reactor.rs           # 命令反应器
│   │   ├── query.rs             # 读模型查询
│   │   └── runtime_receipt_bus.rs # 运行时凭证总线
│   └── Cargo.toml
│
├── remi-provider/                # AI Provider 管理
│   ├── src/
│   │   ├── lib.rs
│   │   ├── adapter.rs           # Provider 适配器 trait
│   │   ├── service.rs           # Provider 服务门面
│   │   ├── health.rs            # 健康检查
│   │   └── adapters/            # 具体适配器实现
│   │       ├── codex.rs
│   │       ├── claude.rs
│   │       ├── cursor.rs
│   │       ├── gemini.rs
│   │       ├── grok.rs
│   │       ├── kilo.rs
│   │       ├── opencode.rs
│   │       └── pi.rs
│   └── Cargo.toml
│
├── remi-git/                     # Git 服务
│   ├── src/
│   │   ├── lib.rs
│   │   ├── core.rs              # 底层 Git 命令封装
│   │   ├── manager.rs           # 高级 Git 操作
│   │   ├── status.rs            # Git 状态广播
│   │   └── github.rs            # GitHub CLI 集成
│   └── Cargo.toml
│
├── remi-terminal/                # 终端管理
│   ├── src/
│   │   ├── lib.rs
│   │   ├── manager.rs           # 终端会话管理
│   │   └── pty.rs               # PTY 封装
│   └── Cargo.toml
│
├── remi-workspace/               # 工作空间与文件系统
│   ├── src/
│   │   ├── lib.rs
│   │   ├── service.rs           # 文件系统操作
│   │   └── search.rs            # 文件搜索
│   └── Cargo.toml
│
├── remi-auth/                    # 认证与授权
│   ├── src/
│   │   ├── lib.rs
│   │   ├── service.rs           # 认证服务
│   │   ├── session.rs           # 会话管理
│   │   └── secret.rs            # 密钥存储
│   └── Cargo.toml
│
├── remi-checkpoint/              # 检查点管理
│   ├── src/
│   │   ├── lib.rs
│   │   ├── store.rs             # 检查点存储
│   │   └── diff.rs              # Diff 查询
│   └── Cargo.toml
│
├── remi-telemetry/               # 遥测与分析
│   ├── src/
│   │   ├── lib.rs
│   │   └── analytics.rs         # 分析数据收集
│   └── Cargo.toml
│
├── remi-server/                  # WebSocket 服务器
│   ├── src/
│   │   ├── lib.rs
│   │   ├── server.rs            # 服务器实现
│   │   ├── rpc.rs               # RPC 方法路由
│   │   └── push.rs              # 推送通道管理
│   └── Cargo.toml
│
├── remi-cli/                     # CLI 入口
│   ├── src/
│   │   └── main.rs              # 命令行入口
│   └── Cargo.toml
│
├── remi-app/                     # Tauri 桌面应用
│   ├── src/                      # 前端源码（React）
│   │   ├── main.tsx             # 应用入口
│   │   ├── components/          # UI 组件
│   │   │   ├── chat/           # 聊天组件
│   │   │   ├── terminal/       # 终端组件
│   │   │   ├── ui/             # 基础 UI 组件
│   │   │   ├── diff/           # 差异对比组件
│   │   │   ├── git/            # Git 操作组件
│   │   │   ├── project/        # 项目管理组件
│   │   │   ├── settings/       # 设置组件
│   │   │   ├── plugins/        # 插件组件
│   │   │   └── browser/        # 浏览器面板
│   │   ├── hooks/               # React Hooks
│   │   ├── lib/                 # 工具库
│   │   │   ├── tauri-bridge.ts # Tauri 桥接层
│   │   │   └── ...
│   │   ├── stores/              # 状态管理
│   │   ├── routes/              # 路由配置
│   │   ├── i18n/                # 国际化
│   │   └── types/               # TypeScript 类型
│   ├── package.json
│   ├── vite.config.ts
│   └── tauri.conf.json          # Tauri 配置
│
├── packages/                     # 共享包
│   ├── contracts/               # 类型契约
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── orchestration.ts
│   │   │   ├── provider.ts
│   │   │   ├── terminal.ts
│   │   │   ├── git.ts
│   │   │   └── ...
│   │   └── package.json
│   │
│   ├── shared/                  # 共享工具
│   │   ├── src/
│   │   │   ├── model.ts
│   │   │   ├── git.ts
│   │   │   ├── chatThreads.ts
│   │   │   └── ...
│   │   └── package.json
│
├── BACKEND_MIGRATION_FULL_PLAN.md    # 后端迁移全案
├── MIGRATION_AND_ITERATION_PLAN.md   # 前端迁移与迭代计划
└── README.md                         # 本文档
```

### 4.2 模块依赖关系

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

## 五、核心模块

### 5.1 编排引擎 (remi-orchestration)

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

### 5.2 Provider 服务 (remi-provider)

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

### 5.3 持久化层 (remi-persistence)

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

### 5.4 Git 服务 (remi-git)

Git 服务提供完整的版本控制功能。

**核心能力**：
- 分支管理：创建、切换、列表、删除
- Worktree 管理：创建、移除、路径管理
- Stash 操作：stash、checkout、drop、info
- Diff 操作：工作树 diff、diff 摘要
- PR 流程：准备 PR 线程、解析 PR
- 线程交接：将线程工作交接至 Git 分支

### 5.5 终端管理 (remi-terminal)

终端管理提供 PTY 终端会话管理。

**核心功能**：
- 终端打开/关闭/重启/清除
- 写入输入、调整大小
- 事件订阅（输出流广播）
- 线程关联终端抽屉

### 5.6 WebSocket 服务器 (remi-server)

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

## 六、技术栈

### 6.1 后端技术栈（Rust）

| 层次 | 技术 | 版本 | 用途 |
|------|------|------|------|
| **异步运行时** | Tokio | 1.x | 高性能异步运行时 |
| **Web 框架** | Axum | 0.7 | 类型安全的 Web 框架 |
| **WebSocket** | tokio-tungstenite | 0.21 | WebSocket 实现 |
| **序列化** | serde + serde_json | 1.x | 类型安全的序列化 |
| **数据库** | rusqlite | 0.31 | SQLite 绑定 |
| **进程管理** | tokio::process | - | 异步子进程管理 |
| **PTY** | portable-pty | 0.8 | 跨平台伪终端 |
| **日志** | tracing | 0.1 | 结构化日志 |
| **配置** | config-rs | 0.14 | 多源配置管理 |
| **错误处理** | thiserror + anyhow | - | 类型化错误处理 |
| **CLI** | clap | 4.x | 命令行参数解析 |

### 6.2 前端技术栈（TypeScript）

| 层次 | 技术 | 版本 | 用途 |
|------|------|------|------|
| **桌面框架** | Tauri | 2.x | 轻量级桌面应用框架 |
| **前端框架** | React | 19 | UI 组件库 |
| **构建工具** | Vite | 8 | 快速构建工具 |
| **状态管理** | Zustand | 5.x | 轻量级状态管理 |
| **数据获取** | TanStack Query | 5.x | 异步状态管理 |
| **路由** | TanStack Router | 1.x | 类型安全路由 |
| **UI 组件** | Base UI + Tailwind CSS 4 | - | 无样式组件库 + CSS 框架 |
| **终端** | xterm.js | 6.x | 终端模拟器 |
| **测试** | Vitest | 4.x | 单元测试框架 |

---

## 七、开发指南

### 7.1 环境要求

**必需**：
- Rust 1.75+
- Node.js 22+
- pnpm 或 bun
- Git 2.30+

**可选**：
- Tauri CLI (`cargo install tauri-cli`)
- Rust Analyzer (VS Code 插件)

### 7.2 快速开始

#### 克隆项目

```bash
git clone https://github.com/remi-claw/remi-claw.git
cd remi-claw
```

#### 后端开发（Rust）

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

#### 前端开发（TypeScript）

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

#### Tauri 桌面应用

```bash
# 启动开发环境
cargo tauri dev

# 构建生产版本
cargo tauri build
```

### 7.3 代码规范

**Rust**：
```bash
# 格式化代码
cargo fmt

# 静态分析
cargo clippy

# 运行测试
cargo test
```

**TypeScript**：
```bash
# ESLint 检查
pnpm lint

# Prettier 格式化
pnpm fmt

# 类型检查
pnpm typecheck

# 运行测试
pnpm test
```

### 7.4 测试

**Rust 测试**：
```bash
# 运行所有测试
cargo test

# 运行特定模块测试
cargo test -p remi-orchestration

# 运行集成测试
cargo test --test '*'
```

**TypeScript 测试**：
```bash
# 运行所有测试
pnpm test

# 运行特定包测试
pnpm --filter @remi-code/desktop test

# 生成覆盖率报告
pnpm test -- --coverage
```

### 7.5 文档生成

```bash
# 生成 Rust 文档
cargo doc --no-deps --open

# 查看特定模块文档
cargo doc -p remi-orchestration --open
```

---

## 八、迁移计划

### 8.0 产品形态升级（品牌与双模式）

品牌从 **Remi Code** 升级为 **Remi Claw**，并新增 **Work 模式**。迁移包含：

- ✅ 文档、Logo、命名空间全部刷新为 Remi Claw
- ⏳ `branding.ts` 中 `APP_BASE_NAME` 同步为 `Remi Claw`（待代码层落地）
- ⏳ Thread 模型新增 `runtime-mode ∈ {work, code}`、`interaction-mode ∈ {chat, plan, agent, review}`
- ⏳ Sidebar / ChatHeader 增加模式切换器与模式徽标
- ⏳ Composer 命令菜单按模式分别提供 Work / Code 专属 Slash 命令
- ⏳ Skill 库按 `mode` 字段分组（work / code / shared）

### 8.1 后端迁移阶段

Remi Claw 的后端迁移分为 10 个阶段，按模块逐步推进：

| 阶段 | 模块 | 优先级 | 状态 |
|------|------|--------|------|
| **阶段 1** | remi-core + remi-config | 基础 | 🔄 进行中 |
| **阶段 2** | remi-persistence | 核心 | ⏳ 待开始 |
| **阶段 3** | remi-orchestration | 核心 | ⏳ 待开始 |
| **阶段 4** | remi-provider | 核心 | ⏳ 待开始 |
| **阶段 5** | remi-git | 重要 | ⏳ 待开始 |
| **阶段 6** | remi-terminal | 重要 | ⏳ 待开始 |
| **阶段 7** | remi-workspace | 重要 | ⏳ 待开始 |
| **阶段 8** | remi-auth | 重要 | ⏳ 待开始 |
| **阶段 9** | remi-checkpoint + remi-telemetry | 辅助 | ⏳ 待开始 |
| **阶段 10** | remi-server + remi-cli | 集成 | ⏳ 待开始 |

### 8.2 前端迁移

前端迁移从 Electron 到 Tauri，保持 React 技术栈不变：

- ✅ 项目结构搭建
- ✅ Tauri 桥接层设计
- ✅ 环境检测适配
- ✅ 路由历史模式调整
- ✅ 原生 API 适配
- ⏳ 组件迁移与适配
- ⏳ 状态管理适配
- ⏳ 集成测试

### 8.3 详细文档

- [后端迁移全案](./BACKEND_MIGRATION_FULL_PLAN.md) - Rust 后端架构设计与迁移方案
- [前端迁移与迭代计划](./MIGRATION_AND_ITERATION_PLAN.md) - Tauri 前端迁移与开发计划

---

## 九、性能指标

### 9.1 目标性能

| 指标 | 原方案 (Node.js) | Remi Code (Rust) 目标 | 提升幅度 |
|------|---------------------|----------------------|----------|
| 启动时间 | ~5s | ~1s | 80% |
| 内存占用 | ~300MB | ~50MB | 83% |
| RPC 响应时间 | ~50ms | ~10ms | 80% |
| 并发连接数 | ~50 | ~100+ | 100% |
| 安装包大小 | ~150MB | ~50MB | 67% |

### 9.2 性能优化策略

**后端优化**：
- 异步 I/O：所有 I/O 操作使用 async/await
- 连接池：SQLite 使用连接池提升并发性能
- 任务并行：使用 tokio::spawn 并行执行独立任务
- 流式处理：大文件读取、事件流使用 Stream

**前端优化**：
- 虚拟滚动：长消息列表使用虚拟滚动
- 代码分割：按需加载组件
- 懒加载：图片、组件懒加载
- React 优化：使用 memo、useMemo、useCallback

---

## 十、贡献指南

### 10.1 贡献流程

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

### 10.2 提交规范

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

### 10.3 代码审查

所有提交都需要经过代码审查：
- 至少 1 个 approving review
- 所有 CI 检查通过
- 无合并冲突

### 10.4 行为准则

- 尊重所有参与者
- 接受建设性批评
- 关注对社区最有利的事情
- 展现同理心

---

## 十一、Work / Code 双模式

### 11.1 设计目标

Remi Claw 的核心定位是 **"一个桌面，两种脑回路"**：

- 同一个 Thread 可以在两种模式间切换，模式切换不破坏会话历史；
- 同一套 Provider 适配层、Orchestration 引擎、Skill / Plugin 体系被两种模式共享；
- 模式决定了**默认 Skill 集、Composer 工具、风险控制策略、UI 布局**，但**不**决定模型本身（用户可自由选择）。

### 11.2 Work 模式

**对标产品**：Trea Work、Qoder Work、Kimi Work、WorkBuddy、QClaw、MimoClaw。

**典型场景**：

- 整理本地文件夹（批量重命名、分类、摘要）
- 处理 Office / Markdown / PDF 文档（提取、翻译、改写、审校）
- 浏览器自动化（表单填写、信息抓取、跨站点工作流）
- 长任务调度（"下周前每天跑一次报表"）
- 与办公生态（邮件、日历、IM）联动

**模式特征**：

| 维度 | 描述 |
|------|------|
| `runtime-mode` | `work` |
| `interaction-mode` | `task` / `chat`（默认 `task`） |
| 任务粒度 | 多步、长时、可被调度 |
| 用户参与 | 高频「确认 / 补充输入」轮询 |
| 上下文 | 文件系统 + 浏览器 + Office + 日历/邮件 |
| 默认 Skill | `filesystem.batch`, `doc.rewrite`, `browser.act`, `mail.draft`, `schedule.cron` |
| 风险控制 | 写入类操作默认 Dry-Run；批量操作要求二次确认 |
| 状态展示 | 任务时间线 + 待办列表 + 用户输入请求面板 |

### 11.3 Code 模式

**对标产品**：ZCode、OpenCode、Trea IDE SOLO 模式。

**典型场景**：

- 在 Git 仓库内做特性开发、Bug 修复、重构
- 阅读陌生代码、生成/补全代码、提交 PR
- 终端命令执行、构建/调试/Test 闭环
- Code Review、架构解释、依赖升级

**模式特征**：

| 维度 | 描述 |
|------|------|
| `runtime-mode` | `code` |
| `interaction-mode` | `agent` / `plan` / `review`（默认 `agent`） |
| 任务粒度 | 单 Turn 内代码修改闭环 |
| 用户参与 | 审批 Diff、审批命令执行 |
| 上下文 | 仓库 + 终端 + 编辑器 + Diff |
| 默认 Skill | `repo.search`, `file.edit`, `git.commit`, `shell.run`, `test.run` |
| 风险控制 | 写入类操作进入审批队列；危险命令强制二次确认 |
| 状态展示 | Turn 时间线 + Diff 视图 + 终端抽屉 + 检查点回滚 |

### 11.4 模式切换与共存

- **全局默认**：应用首启时默认进入 **Code 模式**（沿袭 Remi Code 习惯）；用户可在 Settings 切换默认。
- **Thread 级模式**：每个 Thread 持久化自己的 `runtime-mode`，切换 Thread 时自动恢复。
- **运行时切换**：在 ChatHeader 通过下拉切换模式，模式变更不中断 Turn（已开始的 Turn 沿用旧模式至结束）。
- **混合 Thread**：允许同一 Thread 内不同 Turn 处于不同模式（向后兼容，单条 Turn 的 `runtime-mode` 是权威）。
- **统一体验**：Composer、Sidebar、Skill 选择器、Provider 选择器在两种模式中复用；只有"默认 Skill 集"和"风险控制档位"会随模式变化。

### 11.5 命令协议层（已有体系）

Remi Code 已具备的编排命令可直接支撑双模式，差异在 `runtime-mode` / `interaction-mode` 字段值：

| 命令 | 双模式语义 |
|------|-----------|
| `thread.runtime-mode.set` | `work` 或 `code` |
| `thread.interaction-mode.set` | `chat` / `plan` / `agent` / `review` / `task` |
| `thread.create` | 默认 `code + agent`；Work 入口创建时使用 `work + task` |
| `thread.turn.start` | 复用，按 `runtime-mode` 加载默认 Skill 集 |
| `thread.approval.respond` | 两种模式共用，UI 呈现不同 |
| `thread.checkpoint.revert` | 两种模式共用，Work 模式快照粒度更大（按任务快照） |

---

## 十二、竞品能力对比与差距分析

> 评分标准：✅ 已具备 ｜ 🟡 部分具备 / 受限 ｜ ❌ 缺失

### 12.1 Work 模式能力矩阵

| 能力 | Trea Work | Qoder Work | Kimi Work | WorkBuddy | QClaw | MimoClaw | **Remi Claw（当前）** |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 本地文件系统批量操作 | ✅ | ✅ | 🟡 | ✅ | 🟡 | 🟡 | 🟡（Provider 受限） |
| 浏览器自动化面板 | ✅ | ✅ | ❌ | ✅ | 🟡 | ✅ | 🟡（`BrowserPanel` 已存在，缺 Work 调度） |
| 长任务 / Cron 调度 | ✅ | 🟡 | ❌ | ✅ | ✅ | 🟡 | ❌ |
| Office 文档读写（docx/xlsx/pdf） | ✅ | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ❌ |
| 邮件 / 日历 集成 | 🟡 | 🟡 | ❌ | ✅ | ✅ | ❌ | ❌ |
| 多步骤 Plan + 用户输入轮询 | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | 🟡（已有 ComposerPendingUserInputPanel） |
| 本地 Skill（work 域） | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡（`SkillsView` 存在，未按 mode 分组） |
| 任务时间线 / 待办 UI | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | 🟡（`ActiveTaskListCard` 已有） |
| 数字员工（Scheduled Agent） | ✅ | 🟡 | ❌ | ✅ | ✅ | 🟡 | ❌ |

### 12.2 Code 模式能力矩阵

| 能力 | ZCode | OpenCode | Trea IDE SOLO | **Remi Claw（当前）** |
|------|:---:|:---:|:---:|:---:|
| 多 Provider 适配（Claude/Codex/Gemini/Grok/Cursor/...） | 🟡 | ✅ | ✅ | 🟡（8 家适配器已写，但 Provider 运行时未注册完整） |
| Plan / Proposed Plan 流程 | 🟡 | ✅ | ✅ | 🟡（`proposed-plan` 投影已存在） |
| Diff 渲染（行内 / Side-by-side） | ✅ | ✅ | ✅ | 🟡（`@pierre/diffs` 已集成） |
| 终端 + 任务关联 | ✅ | ✅ | ✅ | ✅（`ThreadTerminalDrawer`） |
| Worktree / Branch 隔离 | ✅ | 🟡 | ✅ | 🟡（`worktreeCleanup` 已存在） |
| Checkpoint 回滚 | 🟡 | ✅ | ✅ | 🟡（`remi-checkpoint` 已具备，UI 待接通） |
| 仓库语义检索 | ✅ | 🟡 | ✅ | ❌ |
| Build/Test/Run 闭环 | ✅ | ✅ | ✅ | 🟡（依赖外部 CI） |
| PR Review / PR Thread | 🟡 | ❌ | ✅ | 🟡（`PullRequestThreadDialog` 已有） |
| RateLimit / 用量可视化 | 🟡 | 🟡 | ✅ | 🟡（`ProviderUsagePanelContent` 已有） |
| 插件 / Marketplace | ✅ | 🟡 | 🟡 | 🟡（`PluginLibrary` 存在，Marketplace 未做） |
| Skills 库 | ✅ | ✅ | 🟡 | 🟡（`SkillsView` 存在） |

### 12.3 跨模式 / 平台级能力

| 能力 | Trea Work | Qoder Work | Kimi Work | WorkBuddy | QClaw | MimoClaw | ZCode | OpenCode | Trea IDE SOLO | **Remi Claw** |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 本地优先 / 离线可启动 | 🟡 | 🟡 | ❌ | 🟡 | ❌ | ❌ | 🟡 | ✅ | 🟡 | ✅ |
| 跨平台桌面（Win/macOS/Linux） | ✅ | ✅ | ❌ | ✅ | ❌ | 🟡 | ✅ | ✅ | ✅ | ✅（Tauri 2.x） |
| 多 Provider 并存 | ✅ | ✅ | ❌ | 🟡 | 🟡 | 🟡 | 🟡 | ✅ | ✅ | 🟡 |
| WebSocket / RPC 协议开放 | 🟡 | 🟡 | 🟡 | ❌ | 🟡 | ❌ | 🟡 | ✅ | ✅ | ✅ |
| 账号 / 团队协作 | ✅ | 🟡 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | 🟡 | ❌ |
| 模式切换 / 双模并存 | ✅ | ✅ | ❌ | 🟡 | ❌ | ❌ | ❌ | ❌ | ✅ | ⏳（进行中） |

### 12.4 关键能力差距（按优先级）

| 优先级 | 能力差距 | 受影响模式 | 竞品参照 |
|:---:|------|:---:|------|
| **P0** | Work 模式：定时 / Cron 调度器（Scheduled Agent） | Work | Trea Work、WorkBuddy、QClaw |
| **P0** | Work 模式：Office 文档读写（docx/xlsx/pdf） | Work | Trea Work、Kimi Work、QClaw |
| **P0** | Code 模式：补齐 Provider 运行时注册 + RPC 打通（首屏冷启动可用） | Code | OpenCode、Trea IDE SOLO |
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

## 十三、下一步完善计划

> 计划按四阶段推进，每阶段以"能跑通、可演示、可发布"为关门标准。

### 13.1 阶段 1：双模式骨架（P0，2 周）

- 在 `remi-core` 领域模型中增加 `RuntimeMode ∈ {Work, Code}`、`InteractionMode ∈ {Chat, Plan, Agent, Review, Task}`，落到 Thread 元数据。
- 在 `remi-orchestration` 增加 `thread.runtime-mode.set` / `thread.interaction-mode.set` 既有命令的语义补全（默认值、迁移策略）。
- 在 `remi-server` RPC 注册以上命令的 query 端点，前端可读。
- 前端：`branding.ts` → `Remi Claw`；Sidebar / ChatHeader 模式徽标 + 切换器。
- **验收**：新建 Thread 时可选 Work / Code；已有 Thread 显示模式徽标；切换 Thread 时 UI 同步。

### 13.2 阶段 2：Code 模式可用化（P0，3 周）

- 注册全部 8 家 Provider Adapter 到运行时（`remi-provider::service`）。
- 打通 `ProviderDiscoveryService`，前端可看到动态模型列表与能力位。
- 补齐 `ProviderAdapter` trait 的 `capabilities` / `discover_models` / `list_tools`。
- 跑通 Code 模式下的"打开仓库 → 提问 → 编辑 → Diff → 提交"全链路。
- **验收**：在 8 家 Provider 中至少 3 家（Codex / Claude / OpenCode）可以端到端完成一次 Turn。

### 13.3 阶段 3：Work 模式核心能力（P1，4 周）

- 实现 `scheduler::CronScheduler`，Thread 上可挂"周期任务"，使用 Tokio interval。
- 实现 `office` Skill 集合：docx 读/写、xlsx 读/写、pdf 文本提取（先本地 crate 后再考虑云端）。
- 打通 `BrowserPanel` 与 Work 任务的事件总线：Work 任务可触发"打开标签 → 执行脚本 → 回填结果"。
- 实现 `filesystem.batch` Skill：批量重命名 / 分类 / 摘要，强制 Dry-Run + 二次确认。
- **验收**：演示场景"每周一拉取报表 → 用 docx Skill 摘要 → 邮件草稿入站"可完成。

### 13.4 阶段 4：双模式打磨与生态（P1+P2，4 周）

- Skill 库按 `mode ∈ {work, code, shared}` 分组；前端 Skill 浏览器按模式过滤。
- 仓库语义检索（先用 ripgrep + tree-sitter 索引，后续替换为 tantivy）。
- 插件 / Marketplace 雏形：本地插件市场 + 一键安装。
- 团队协作：Shared Thread（只读分享 + 评论）。
- **验收**：发布 Remi Claw 0.2.0（双模式 + 调度 + Office Skill + 仓库语义检索 + 插件雏形）。

### 13.5 阶段 5：竞品对标攻坚（P2，迭代）

- 数字员工模板市场（Work 模式 Scheduled Agent 模板）
- 邮件 / 日历原生集成
- Marketplace 上架流程 + 审核后台
- 团队空间、权限分级、计费闸门

### 13.6 风险与依赖

| 风险项 | 描述 | 缓解 |
|--------|------|------|
| Provider 协议变更 | 第三方 CLI 协议（如 Codex、OpenCode）迭代快 | Provider Adapter 抽象 + 协议版本探测 |
| Office 解析精度 | docx/xlsx 解析存在兼容性 | 先覆盖 docx + xlsx + pdf 文本，再做样式保留 |
| 浏览器自动化稳定性 | 不同站点 DOM 差异大 | 优先结构化抽取，复杂场景回到用户操作 |
| 双模式 UI 复杂度 | 同一界面承载两种脑回路 | 模式切换器 + 显式模式徽标；不引入"自动判断" |
| 本地 Skill 安全 | 任意代码执行风险 | Skill 沙箱 + 危险 API 二次确认 + 审计日志 |

---

本项目采用 MIT 许可证。详见 [LICENSE](./LICENSE) 文件。

---

## 附录

### A. 术语表

| 术语 | 说明 |
|------|------|
| **Provider** | AI 编程代理（如 Claude、Codex、Gemini） |
| **Thread** | 聊天线程，包含一组相关的对话 |
| **Turn** | 一次用户-AI 交互回合 |
| **Checkpoint** | 检查点，用于回滚和恢复 |
| **Projection** | 投影，从事件流构建的读模型 |
| **Worktree** | Git 工作树，用于并行开发 |
| **Work 模式** | 任务驱动的"数字员工"形态（对标 Trea Work / WorkBuddy / QClaw） |
| **Code 模式** | 仓库内代码副驾形态（对标 ZCode / OpenCode / Trea IDE SOLO） |
| **`runtime-mode`** | Thread 的运行时分发字段，取值 `work` / `code` |
| **`interaction-mode`** | Thread 的交互范式字段，取值 `chat` / `plan` / `agent` / `review` / `task` |
| **Skill** | 可被 Provider 调用的本地能力单元，按 `mode` 分组（`work` / `code` / `shared`） |

### B. 相关链接

- [原项目参考](https://github.com/RemiCode-AI/RemiCode)
- [Tauri 官方文档](https://tauri.app/)
- [Rust 官方文档](https://www.rust-lang.org/)
- [Effect-TS 文档](https://effect.website/)
- [竞品参考：Trea Work](https://work.trea.com/)
- [竞品参考：Qoder Work](https://qoder.com/work)
- [竞品参考：Kimi Work](https://kimi.moonshot.cn/)
- [竞品参考：WorkBuddy](https://workbuddy.ai/)
- [竞品参考：ZCode](https://zcode.ai/)
- [竞品参考：OpenCode](https://opencode.ai/)
- [竞品参考：Trea IDE](https://trea.com/)

### C. 联系方式

- GitHub Issues: [报告问题](https://github.com/remi-claw/remi-claw/issues)
- GitHub Discussions: [讨论区](https://github.com/remi-claw/remi-claw/discussions)
- 内部反馈: 内部 Slack `#remi-claw-product`

---

**文档版本**: v0.2.0（品牌升级 + Work/Code 双模式版）  
**最后更新**: 2026-06-21  
**维护者**: Remi Claw Team
