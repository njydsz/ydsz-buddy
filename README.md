<p align="center">
  <img src="./remi-app/public/peakcode.png" alt="Remi Code" width="128" />
</p>

<h1 align="center">Remi Code</h1>

<p align="center">
  <strong>高性能 AI 编程助手桌面应用</strong><br />
  基于 Peak Code 迁移至 Rust + Tauri 技术栈，统一管理 Claude、Codex、Gemini、Grok 等 AI 代理
</p>

<p align="center">
  <a href="#-快速开始">快速开始</a> •
  <a href="#-核心特性">核心特性</a> •
  <a href="#-技术架构">技术架构</a> •
  <a href="#-核心模块">核心模块</a> •
  <a href="#-开发指南">开发指南</a> •
  <a href="#-迁移计划">迁移计划</a>
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
- [附录](#附录)

---

## 一、项目概述

### 1.1 项目定位

**Remi Code** 是一个高性能、本地优先的 AI 编程助手桌面应用，基于 Peak Code 项目完整迁移至 Rust 技术栈。它提供了一个统一的界面来管理多个 AI 编程代理（Claude Code、Codex、Gemini、Grok、OpenCode 等），让开发者可以高效地与 AI 协作编程。

### 1.2 核心价值

- 🚀 **极致性能**：Rust 后端带来卓越的性能表现，启动时间 < 1 秒，内存占用 < 50MB
- 🔒 **本地优先**：所有数据和服务运行在本地，保护代码隐私
- 🎨 **统一界面**：一个界面管理多个 AI 提供商，无缝切换
- 🛠️ **完整功能**：Git 集成、终端管理、文件浏览器、差异对比等完整开发工具链
- 📦 **轻量桌面**：基于 Tauri 2.x 构建，安装包体积减少 60-70%

### 1.3 与 Peak Code 的关系

Remi Code 是 Peak Code 的 Rust 迁移版本，目标是：

- **后端完全重写**：从 Node.js + Effect-TS 迁移到 Rust + Tokio
- **前端适配**：从 Electron 迁移到 Tauri，保持 React 技术栈
- **协议兼容**：WebSocket RPC 协议完全兼容，前端零改动
- **性能提升**：充分利用 Rust 的性能优势，突破 Node.js 单线程瓶颈

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

| 层次 | Peak Code | Remi Code | 改进点 |
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
│   │   ├── sqlite.rs            # SQLite 客户端封装
│   │   ├── migrations.rs        # 数据库迁移
│   │   ├── event_store.rs       # 事件存储
│   │   └── projection.rs        # 投影存储
│   └── Cargo.toml
│
├── remi-orchestration/           # 编排引擎（CQRS/ES）
│   ├── src/
│   │   ├── lib.rs
│   │   ├── engine.rs            # 编排引擎核心
│   │   ├── projector.rs         # 投影器
│   │   ├── reactor.rs           # 命令反应器
│   │   └── query.rs             # 读模型查询
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
│   │
│   └── remi-acp/               # ACP 协议实现
│       ├── src/
│       │   ├── client.ts
│       │   ├── agent.ts
│       │   ├── protocol.ts
│       │   └── ...
│       └── package.json
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

**命令体系**（30+ 种命令）：
- 项目管理：`project.create`, `project.meta.update`, `project.delete`
- 线程管理：`thread.create`, `thread.delete`, `thread.archive`
- 消息交互：`thread.turn.start`, `thread.turn.interrupt`
- 审批流程：`thread.approval.respond`, `thread.user-input.respond`
- 检查点：`thread.checkpoint.revert`, `thread.conversation.rollback`

**事件类型**（26 种事件）：
- 项目事件：`project.created`, `project.meta-updated`, `project.deleted`
- 线程事件：`thread.created`, `thread.deleted`, `thread.archived`
- 消息事件：`thread.message-sent`
- Turn 事件：`thread.turn-started`, `thread.turn-interrupted`
- 检查点事件：`thread.checkpoint-reverted`, `thread.turn-diff-completed`

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

**RPC 方法**（60+ 方法）：
- 编排方法（12 个）：`orchestration.dispatchCommand`, `orchestration.getSnapshot`
- Git 方法（18 个）：`git.pull`, `git.status`, `git.listBranches`
- 终端方法（7 个）：`terminal.open`, `terminal.write`, `terminal.resize`
- 服务器方法（14 个）：`server.getConfig`, `server.getSettings`
- Provider 方法（9 个）：`provider.listModels`, `provider.listCommands`

**推送通道**（10 个）：
- `server.welcome`：初始欢迎
- `orchestration.domainEvent`：编排领域事件
- `orchestration.shellEvent`：Shell 流事件
- `orchestration.threadEvent`：线程详情流事件
- `terminal.event`：终端输出事件
- `git.actionProgress`：Git 操作进度

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
git clone https://github.com/remi-code/remi-code.git
cd remi-code
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
pnpm test --filter=@remi-code/contracts

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

### 8.1 后端迁移阶段

Remi Code 的后端迁移分为 10 个阶段，按模块逐步推进：

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

| 指标 | Peak Code (Node.js) | Remi Code (Rust) 目标 | 提升幅度 |
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

## 许可证

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

### B. 相关链接

- [Peak Code 原项目](https://github.com/PeakCode-AI/PeakCode)
- [Tauri 官方文档](https://tauri.app/)
- [Rust 官方文档](https://www.rust-lang.org/)
- [Effect-TS 文档](https://effect.website/)

### C. 联系方式

- GitHub Issues: [报告问题](https://github.com/remi-code/remi-code/issues)
- GitHub Discussions: [讨论区](https://github.com/remi-code/remi-code/discussions)

---

**文档版本**: v0.1.0  
**最后更新**: 2026-06-19  
**维护者**: Remi Code Team
