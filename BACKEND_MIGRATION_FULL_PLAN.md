# Remi Code 后端架构迁移全案

> 基于 Peak Code 后端架构的全量深度分析 + Rust 全新架构设计 + 分模块精细化迁移方案

**版本**: v1.0  
**日期**: 2026-06-19  
**状态**: 待确认

---

## 目录

- [第一部分：Peak Code 后端架构摸底分析](#第一部分peak-code-后端架构摸底分析)
  - [一、系统总体架构概览](#一系统总体架构概览)
  - [二、技术栈分析](#二技术栈分析)
  - [三、后端核心模块深度拆解](#三后端核心模块深度拆解)
  - [四、WebSocket 通信协议分析](#四websocket-通信协议分析)
  - [五、数据模型分析](#五数据模型分析)
  - [六、架构优势与短板分析](#六架构优势与短板分析)
- [第二部分：Rust 全新后端架构设计](#第二部分rust-全新后端架构设计)
  - [七、架构设计原则](#七架构设计原则)
  - [八、模块化工程架构](#八模块化工程架构)
  - [九、技术选型](#九技术选型)
  - [十、接口规范设计](#十接口规范设计)
  - [十一、性能优化策略](#十一性能优化策略)
- [第三部分：分模块精细化迁移方案](#第三部分分模块精细化迁移方案)
  - [十二、迁移总体策略](#十二迁移总体策略)
  - [十三、阶段 1：remi-core + remi-config](#十三阶段-1remi-core--remi-config)
  - [十四、阶段 2：remi-persistence](#十四阶段-2remi-persistence)
  - [十五、阶段 3：remi-orchestration](#十五阶段-3remi-orchestration)
  - [十六、阶段 4：remi-provider](#十六阶段-4remi-provider)
  - [十七、阶段 5：remi-git](#十七阶段-5remi-git)
  - [十八、阶段 6：remi-terminal](#十八阶段-6remi-terminal)
  - [十九、阶段 7：remi-workspace](#十九阶段-7remi-workspace)
  - [二十、阶段 8：remi-auth](#二十阶段-8remi-auth)
  - [二十一、阶段 9：remi-checkpoint + remi-telemetry](#二十一阶段-9remi-checkpoint--remi-telemetry)
  - [二十二、阶段 10：remi-server + remi-cli](#二十二阶段-10remi-server--remi-cli)
- [第四部分：质量保障与风险管控](#第四部分质量保障与风险管控)
  - [二十三、质量验收标准](#二十三质量验收标准)
  - [二十四、风险预判与应对](#二十四风险预判与应对)
  - [二十五、后续迭代优化规划](#二十五后续迭代优化规划)

---

# 第一部分：Peak Code 后端架构摸底分析

## 一、系统总体架构概览

### 1.1 系统定位

Peak Code 是一个 AI 编程助手平台，后端作为 **Node.js WebSocket 服务器**运行，包装多个 AI Provider（Codex、Claude、Cursor、Gemini、Grok、Kilo、OpenCode、Pi）的 CLI/SDK，通过 JSON-RPC over stdio 与 Provider 运行时通信，向上层前端提供 WebSocket + HTTP 服务。

### 1.2 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                   Browser / Desktop (React)                      │
│         WsTransport • Typed push decode • Stores • Hooks         │
└─────────────────────────────┬───────────────────────────────────┘
                              │ ws://localhost:3773/ws
┌─────────────────────────────▼───────────────────────────────────┐
│                   apps/server (Node.js + Effect-TS)              │
│  ┌──────────┐ ┌──────────────┐ ┌────────────┐ ┌─────────────┐  │
│  │ HTTP     │ │ WebSocket RPC│ │ Auth       │ │ Server      │  │
│  │ Routes   │ │ (wsRpc.ts)   │ │ Middleware │ │ Lifecycle   │  │
│  └──────────┘ └──────┬───────┘ └────────────┘ └─────────────┘  │
│                      │                                           │
│  ┌───────────────────▼──────────────────────────────────────┐   │
│  │              Orchestration Engine (CQRS/ES)               │   │
│  │  ┌────────────┐ ┌────────────┐ ┌──────────────────────┐  │   │
│  │  │ Command    │ │ Event      │ │ Projector            │  │   │
│  │  │ Dispatch   │ │ Store      │ │ (Read Model Build)   │  │   │
│  │  └────────────┘ └────────────┘ └──────────────────────┘  │   │
│  │  ┌────────────────┐ ┌──────────────┐ ┌────────────────┐  │   │
│  │  │ Provider       │ │ Checkpoint   │ │ Runtime        │  │   │
│  │  │ CommandReactor │ │ Reactor      │ │ ReceiptBus     │  │   │
│  │  └────────────────┘ └──────────────┘ └────────────────┘  │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ Provider   │ │ Git      │ │ Terminal │ │ Workspace        │  │
│  │ Service    │ │ Service  │ │ Manager  │ │ Service          │  │
│  │ (Adapters) │ │          │ │          │ │                  │  │
│  └─────┬──────┘ └──────────┘ └──────────┘ └──────────────────┘  │
│        │                                                          │
│  ┌─────▼──────────────────────────────────────────────────────┐  │
│  │           Persistence (SQLite via @effect/sql-sqlite-bun)   │  │
│  │  Events │ Projections │ Auth │ Checkpoints │ Settings       │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────┬───────────────────────────────────┘
                              │ JSON-RPC over stdio / CLI spawn
┌─────────────────────────────▼───────────────────────────────────┐
│              AI Provider Runtimes                                │
│   Codex CLI │ Claude Agent SDK │ Cursor ACP │ Gemini │ Grok │…  │
└───────────────────────────────────────────────────────────────────┘
```

### 1.3 Monorepo 结构

| 包名 | 路径 | 职责 |
|------|------|------|
| `@peakcode/server` | `apps/server` | Node.js 后端主服务 |
| `@peakcode/web` | `apps/web` | React 前端 |
| `@peakcode/desktop` | `apps/desktop` | Electron 桌面壳 |
| `@peakcode/contracts` | `packages/contracts` | 共享 Schema、TypeScript 类型合约 |
| `@peakcode/shared` | `packages/shared` | 共享运行时工具（DrainableWorker、Net 等） |

---

## 二、技术栈分析

### 2.1 核心技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| **Node.js** | >=22.16 | 运行时 |
| **Effect-TS** | catalog | 核心框架（DI、错误处理、并发、流） |
| **TypeScript** | catalog | 类型系统 |
| **SQLite** (via `@effect/sql-sqlite-bun`) | - | 持久化存储 |
| **ws** | ^8.18.0 | WebSocket 实现 |
| **node-pty** | ^1.1.0 | 伪终端管理 |
| **Effect HTTP** | unstable | HTTP 路由与服务 |
| **Effect RPC** | unstable | WebSocket RPC 框架 |
| **Effect CLI** | unstable | CLI 参数解析 |

### 2.2 架构模式特征

1. **Effect-TS 依赖注入**：所有服务通过 `ServiceMap.Service` 定义服务标签，通过 `Layer` 组合依赖
2. **CQRS / Event Sourcing**：编排引擎采用命令分发 -> 事件持久化 -> 投影器构建读模型
3. **Provider Adapter 模式**：统一的 `ProviderAdapter` 接口适配 8 种 AI Provider
4. **Reactor 模式**：`ProviderCommandReactor`、`CheckpointReactor`、`OrchestrationReactor` 等响应式处理器
5. **队列化 Worker**：`DrainableWorker` 确保异步任务有序执行和确定性测试

---

## 三、后端核心模块深度拆解

### 3.1 模块总览

| 模块 | 路径 | 核心职责 |
|------|------|----------|
| **Server Core** | `src/main.ts`, `src/effectServer.ts`, `src/config.ts` | 启动引导、配置解析、HTTP/WS 服务器生命周期 |
| **Orchestration** | `src/orchestration/` | 命令分发、事件存储、投影器、读模型查询 |
| **Provider** | `src/provider/` | AI Provider 适配器、会话管理、健康检查、ACP 协议 |
| **Persistence** | `src/persistence/` | SQLite 数据库、迁移、投影存储 |
| **Git** | `src/git/` | Git 操作、分支管理、worktree、状态广播 |
| **Terminal** | `src/terminal/` | PTY 终端管理、会话生命周期 |
| **Workspace** | `src/workspace/` | 文件系统浏览、目录搜索、文件操作 |
| **Auth** | `src/auth/` | 认证、会话凭证、配对链接、密钥存储 |
| **Checkpointing** | `src/checkpointing/` | Git 检查点存储、Diff 查询 |
| **Telemetry** | `src/telemetry/` | 分析数据收集 |
| **WebSocket RPC** | `src/wsRpc.ts` | WebSocket RPC 路由、所有客户端方法实现 |

### 3.2 Server Core（服务器核心）

**文件结构**：
- `main.ts` -- CLI 入口，配置解析，Layer 组装
- `effectServer.ts` -- HTTP 服务器创建、路由挂载、启动就绪管理
- `config.ts` -- `ServerConfig` 服务定义，路径派生
- `serverLayers.ts` -- 运行时服务 Layer 组合（核心依赖图）
- `serverLifecycleEvents.ts` -- 服务器生命周期事件发布
- `serverRuntimeStartup.ts` -- 命令就绪门控
- `serverSettings.ts` -- 运行时设置管理
- `serverRuntimeState.ts` -- 持久化运行时状态

**关键设计**：
- `ServerConfig` 通过 Effect Config 从环境变量 + CLI 参数解析
- `serverLayers.ts` 的 `makeServerRuntimeServicesLayer()` 是核心依赖图，组合了所有运行时服务
- 启动流程：CLI 解析 -> 配置构建 -> Layer 组装 -> HTTP 服务器 -> 路由挂载 -> 编排订阅 -> 生命周期事件

**路径体系**（`ServerDerivedPaths`）：
```
baseDir/
├── userdata/ (or dev/)
│   ├── state.sqlite          -- 主数据库
│   ├── settings.json         -- 用户设置
│   ├── keybindings.json      -- 快捷键配置
│   ├── server-runtime.json   -- 运行时状态
│   ├── anonymous-id          -- 匿名标识
│   ├── environment-id        -- 环境标识
│   ├── secrets/              -- 密钥存储
│   ├── attachments/          -- 附件存储
│   └── logs/
│       ├── server.log
│       ├── provider/events.log
│       └── terminals/
└── worktrees/                -- Git worktree 存储
```

### 3.3 Orchestration（编排引擎）

**架构模式**：CQRS + Event Sourcing

**核心组件**：

| 组件 | 类型 | 职责 |
|------|------|------|
| `OrchestrationEngineService` | Service | 命令分发、事件读取、读模型查询、状态修复 |
| `ProjectionSnapshotQuery` | Service | 投影快照只读查询（完整/Shell/详情） |
| `OrchestrationReactor` | Service | 事件流订阅、反应式处理 |
| `ProviderRuntimeIngestion` | Service | Provider 运行时事件 -> 编排事件转换 |
| `ProviderCommandReactor` | Service | 编排命令 -> Provider 调用桥接 |
| `CheckpointReactor` | Service | 检查点事件处理 |
| `ThreadDeletionReactor` | Service | 线程删除时的资源清理 |
| `RuntimeReceiptBus` | Service | 异步完成信号发布 |

**命令体系**（`OrchestrationCommand`）：

**客户端可分发命令**：
- `project.create` / `project.meta.update` / `project.delete`
- `thread.create` / `thread.delete` / `thread.archive` / `thread.unarchive`
- `thread.handoff.create` / `thread.fork.create`
- `thread.meta.update` / `thread.runtime-mode.set` / `thread.interaction-mode.set`
- `thread.turn.start` / `thread.turn.interrupt` / `thread.turn.dispatch-queued`
- `thread.approval.respond` / `thread.user-input.respond`
- `thread.checkpoint.revert` / `thread.conversation.rollback`
- `thread.message.edit-and-resend` / `thread.session.stop`
- `thread.activity.append`

**内部命令**：
- `thread.session.set` / `thread.messages.import`
- `thread.message.assistant.delta` / `thread.message.assistant.complete`
- `thread.proposed-plan.upsert` / `thread.turn.diff.complete`
- `thread.revert.complete` / `thread.conversation.rollback.complete`

**事件类型**（26 种）：
- 项目事件：`project.created` / `project.meta-updated` / `project.deleted`
- 线程事件：`thread.created` / `thread.deleted` / `thread.archived` / `thread.unarchived` / `thread.meta-updated`
- 运行时事件：`thread.runtime-mode-set` / `thread.interaction-mode-set`
- 消息事件：`thread.message-sent`
- Turn 事件：`thread.turn-queued` / `thread.turn-start-requested` / `thread.turn-interrupt-requested`
- 审批事件：`thread.approval-response-requested` / `thread.user-input-response-requested`
- 检查点事件：`thread.checkpoint-revert-requested` / `thread.reverted` / `thread.turn-diff-completed`
- 回滚事件：`thread.conversation-rollback-requested` / `thread.conversation-rolled-back`
- 其他：`thread.message-edit-resend-requested` / `thread.session-stop-requested` / `thread.session-set` / `thread.proposed-plan-upserted` / `thread.activity-appended`

**读模型**（`OrchestrationReadModel`）：
```
{
  snapshotSequence: number,
  projects: OrchestrationProject[],
  threads: OrchestrationThread[],
  updatedAt: ISODateTime
}
```

**投影机制**：
- 事件持久化后，投影器（Projector）消费事件流，更新投影表
- `ProjectionState` 跟踪每个投影器的最后应用序列号
- 支持 Shell 快照（轻量）和完整快照（含消息/活动/检查点）

### 3.4 Provider（AI Provider 管理）

**核心组件**：

| 组件 | 职责 |
|------|------|
| `ProviderService` | 跨 Provider 门面：会话启动/恢复、Turn 发送/中断/转向、事件流 |
| `ProviderAdapterRegistry` | 适配器注册表，按 ProviderKind 路由 |
| `ProviderHealth` | Provider 健康检查、CLI 探针、状态缓存 |
| `ProviderSessionReaper` | 过期会话清理 |
| `ProviderDiscoveryService` | 命令/技能/插件/模型/代理发现 |

**支持的 Provider**（8 种）：

| Provider | 适配器 | 通信方式 |
|----------|--------|----------|
| Codex | `CodexAdapter` | JSON-RPC over stdio |
| Claude Agent | `ClaudeAdapter` | Claude Agent SDK |
| Cursor | `CursorAdapter` | ACP (Agent Communication Protocol) |
| Gemini | `GeminiAdapter` | ACP |
| Grok | `GrokAdapter` | ACP |
| Kilo | `KiloAdapter` | OpenCode 协议 |
| OpenCode | `OpenCodeAdapter` | OpenCode SDK |
| Pi | `PiAdapter` | Pi Agent SDK |

**ProviderService 核心接口**：
```typescript
interface ProviderServiceShape {
  startSession(threadId, input): ProviderSession
  sendTurn(input): ProviderTurnStartResult
  steerTurn(input): ProviderTurnStartResult    // 重定向运行中的 Turn
  startReview(input): ProviderTurnStartResult   // 原生代码审查
  forkThread?(input): ProviderForkThreadResult  // 原生线程分叉
  interruptTurn(input): void
  respondToRequest(input): void                 // 审批响应
  respondToUserInput(input): void               // 结构化用户输入响应
  stopSession(input): void
  listSessions(): ProviderSession[]
  getCapabilities(provider): ProviderAdapterCapabilities
  rollbackConversation(input): void
  compactThread(input): void                    // 上下文压缩
  streamEvents: Stream<ProviderRuntimeEvent>    // 统一事件流
}
```

**Provider 健康检查**：
- 从磁盘缓存种子状态 -> CLI 探针刷新 -> 不阻塞启动
- 每种 Provider 有独立的探针逻辑（`checkCodexProviderStatus`、`checkClaudeProviderStatus` 等）

### 3.5 Persistence（持久化层）

**数据库**：SQLite（通过 `@effect/sql-sqlite-bun`）

**核心表**：

| 表 | 服务 | 职责 |
|----|------|------|
| `orchestration_events` | - | 事件存储（Event Sourcing） |
| `projection_projects` | `ProjectionProjects` | 项目投影数据 |
| `projection_threads` | `ProjectionThreads` | 线程投影数据（含消息、活动、检查点） |
| `projection_state` | `ProjectionState` | 投影器游标（最后应用序列号） |
| `auth_sessions` | `AuthSessions` | 认证会话 |
| `auth_pairing_links` | `AuthPairingLinks` | 配对链接 |

**迁移策略**：
- `Migrations.ts` 管理版本控制
- `005_Projections.ts` 为投影表迁移
- 启动时自动执行未应用的迁移

**Layer/Service 分离模式**：
- `Services/` -- 定义服务接口（ServiceMap.Service）
- `Layers/` -- 提供具体实现（Layer）

### 3.6 Git 模块

**核心组件**：

| 组件 | 职责 |
|------|------|
| `GitCore` | 底层 Git 命令封装（pull、branch、worktree、stash、checkout、init） |
| `GitManager` | 高级 Git 操作（stacked action、diff 摘要、worktree 管理、PR 准备、线程交接） |
| `GitStatusBroadcaster` | Git 状态缓存与广播 |
| `GitHubCli` | GitHub CLI 集成 |
| `TextGeneration` | 基于 AI 的文本生成（Codex/Cursor/OpenCode 多种实现） |

**关键能力**：
- 分支管理：创建、切换、列表
- Worktree 管理：创建（含 detached）、移除
- Stash 操作：stash + checkout、drop、info
- Diff 操作：工作树 diff、diff 摘要
- Stacked Action：带进度报告的复合 Git 操作
- PR 流程：准备 PR 线程、解析 PR
- 线程交接：将线程工作交接至 Git 分支

### 3.7 Terminal 模块

**核心组件**：

| 组件 | 职责 |
|------|------|
| `TerminalManager` | 终端会话生命周期管理 |
| `PTY` | PTY 抽象（支持 NodePTY 和 BunPTY） |

**能力**：
- 终端打开/关闭/重启/清除
- 写入输入、调整大小
- 事件订阅（输出流广播）
- 线程关联终端抽屉

### 3.8 Workspace 模块

**核心组件**：

| 组件 | 职责 |
|------|------|
| `WorkspaceEntries` | 目录列表、条目搜索、本地搜索、文件系统浏览 |
| `WorkspaceFileSystem` | 文件写入操作 |
| `WorkspacePaths` | 路径解析与验证 |

### 3.9 Auth 模块

**核心组件**：

| 组件 | 职责 |
|------|------|
| `ServerAuth` | 认证门面：HTTP 请求认证、WS 升级认证、Bootstrap 凭证交换、会话管理 |
| `ServerAuthPolicy` | 认证策略 |
| `ServerSecretStore` | 密钥安全存储 |
| `BootstrapCredentialService` | Bootstrap 凭证服务 |
| `SessionCredentialService` | 会话凭证管理（Cookie/Bearer） |
| `AuthControlPlane` | 认证控制面（配对链接管理） |

**认证流程**：
1. Bootstrap：客户端提交凭证 -> 交换会话 Token（Cookie 或 Bearer）
2. WebSocket：Token 认证 或 HTTP 升级认证
3. 配对：Owner 会话可创建配对凭证，其他客户端通过配对链接接入
4. 会话管理：列出/撤销客户端会话

### 3.10 Checkpointing 模块

**核心组件**：

| 组件 | 职责 |
|------|------|
| `CheckpointStore` | Git 检查点存储（基于 Git stash/commit） |
| `CheckpointDiffQuery` | Turn Diff / Full Thread Diff 查询 |

### 3.11 Telemetry 模块

**核心组件**：

| 组件 | 职责 |
|------|------|
| `AnalyticsService` | 分析事件记录（启动心跳等） |
| `Identify` | 匿名身份标识 |

---

## 四、WebSocket 通信协议分析

### 4.1 协议设计

- **传输层**：WebSocket（`ws://localhost:3773/ws`）
- **序列化**：JSON
- **模式**：请求/响应 + 服务端推送（Push）
- **框架**：Effect RPC（`RpcServer.toHttpEffectWebsocket`）

### 4.2 请求/响应格式

```typescript
// 请求
{ id: string, body: TaggedUnion }

// 响应
{ id: string, result?: unknown, error?: { message: string } }
```

### 4.3 RPC 方法清单（60+ 方法）

**编排方法**（12 个）：
- `orchestration.dispatchCommand` / `orchestration.importThread`
- `orchestration.getSnapshot` / `orchestration.getShellSnapshot`
- `orchestration.repairState` / `orchestration.getTurnDiff` / `orchestration.getFullThreadDiff`
- `orchestration.replayEvents`
- `orchestration.subscribeShell` / `orchestration.unsubscribeShell`
- `orchestration.subscribeThread` / `orchestration.unsubscribeThread`

**项目方法**（5 个）：
- `projects.listDirectories` / `projects.searchEntries` / `projects.searchLocalEntries` / `projects.writeFile`
- `filesystem.browse`

**Git 方法**（18 个）：
- `git.pull` / `git.status` / `git.readWorkingTreeDiff` / `git.summarizeDiff`
- `git.runStackedAction` / `git.listBranches`
- `git.createWorktree` / `git.createDetachedWorktree` / `git.removeWorktree`
- `git.createBranch` / `git.checkout`
- `git.stashAndCheckout` / `git.stashDrop` / `git.stashInfo`
- `git.removeIndexLock` / `git.init`
- `git.handoffThread` / `git.resolvePullRequest` / `git.preparePullRequestThread`

**终端方法**（7 个）：
- `terminal.open` / `terminal.write` / `terminal.resize` / `terminal.clear` / `terminal.restart` / `terminal.close`
- `terminal.subscribeEvents`

**服务器方法**（14 个）：
- `server.getConfig` / `server.getEnvironment` / `server.getSettings` / `server.updateSettings`
- `server.refreshProviders` / `server.updateProvider` / `server.listWorktrees`
- `server.getProviderUsageSnapshot` / `server.getDiagnostics` / `server.transcribeVoice`
- `server.upsertKeybinding`
- `server.subscribeLifecycle` / `server.subscribeConfig` / `server.subscribeProviderStatuses` / `server.subscribeSettings`

**Provider 发现方法**（9 个）：
- `provider.getComposerCapabilities` / `provider.compactThread`
- `provider.listCommands` / `provider.listSkills` / `provider.listPlugins` / `provider.readPlugin`
- `provider.listModels` / `provider.listAgents`
- `skills.listLocal`

**编辑器方法**（1 个）：
- `shell.openInEditor`

### 4.4 推送通道（10 个）

| 通道 | 数据 |
|------|------|
| `server.welcome` | 初始欢迎（cwd、homeDir、projectName、bootstrapProjectId、bootstrapThreadId） |
| `server.maintenanceUpdated` | 生命周期事件 |
| `server.configUpdated` | 配置更新 |
| `server.providerStatusesUpdated` | Provider 状态更新 |
| `server.settingsUpdated` | 设置更新 |
| `git.actionProgress` | Git 操作进度 |
| `terminal.event` | 终端输出事件 |
| `orchestration.domainEvent` | 编排领域事件 |
| `orchestration.shellEvent` | Shell 流事件（项目/线程 upsert/remove） |
| `orchestration.threadEvent` | 线程详情流事件 |

---

## 五、数据模型分析

### 5.1 核心实体关系

```
Project (1) ---- (N) Thread
                      │
                      ├── Message (N)
                      ├── Activity (N)
                      ├── Checkpoint (N)
                      ├── ProposedPlan (N)
                      ├── Session (0..1)
                      └── LatestTurn (0..1)
```

### 5.2 核心数据模型

**OrchestrationProject**：
- id, kind, title, workspaceRoot, defaultModelSelection, scripts[], createdAt, updatedAt, deletedAt

**OrchestrationThread**：
- id, projectId, title, modelSelection, runtimeMode, interactionMode, envMode
- branch, worktreePath, associatedWorktree{Path,Branch,Ref}
- isPinned, parentThreadId, subagent{AgentId,Nickname,Role}
- forkSourceThreadId, sidechatSourceThreadId, lastKnownPr
- latestTurn, latestUserMessageAt
- hasPendingApprovals, hasPendingUserInput, hasActionableProposedPlan
- messages[], proposedPlans[], activities[], checkpoints[], session
- createdAt, updatedAt, archivedAt, deletedAt, handoff

**OrchestrationMessage**：
- id, role(user/assistant/system), text, attachments[], skills[], mentions[]
- dispatchMode, turnId, streaming, source, createdAt, updatedAt

**OrchestrationSession**：
- threadId, status(idle/starting/running/ready/interrupted/stopped/error)
- providerName, runtimeMode, activeTurnId, lastError, updatedAt

**ModelSelection**（Tagged Union，8 种 Provider）：
- provider: codex | claudeAgent | cursor | gemini | grok | kilo | opencode | pi
- model: string
- options: Provider-specific options

---

## 六、架构优势与短板分析

### 6.1 优势

1. **Effect-TS 类型安全**：全链路类型安全，错误类型明确
2. **Event Sourcing**：完整的审计日志、可重放、可修复
3. **Provider 抽象**：统一接口适配 8 种 AI Provider，扩展性好
4. **Layer 依赖注入**：清晰的依赖关系、可测试性强
5. **有序推送**：`ServerPushBus` 保证推送顺序
6. **队列化 Worker**：异步任务有序、确定性测试

### 6.2 短板与迁移改造重点

1. **Node.js 性能瓶颈**：单线程模型限制并发，GC 压力影响延迟
2. **Effect-TS 复杂度**：学习曲线陡峭，Layer 组合复杂
3. **SQLite 并发限制**：写锁竞争影响高并发场景
4. **进程管理**：大量子进程（Provider CLI）管理复杂
5. **TypeScript 运行时开销**：Schema 验证、序列化/反序列化性能
6. **内存占用**：Node.js 基线内存较高

### 6.3 迁移改造维度总结

| 改造维度 | 原架构 | 迁移目标 |
|----------|--------|----------|
| 运行时 | Node.js (单线程) | Rust (多线程、零成本抽象) |
| 框架 | Effect-TS | Axum + Tokio |
| 持久化 | SQLite (单文件) | SQLite (rusqlite) |
| WebSocket | ws + Effect RPC | tokio-tungstenite |
| 进程管理 | child_process + node-pty | tokio::process + portable-pty |
| 类型系统 | TypeScript + Effect Schema | Rust 类型系统 + serde |
| 并发模型 | 事件循环 + Fiber | async/await + Tokio |
| 内存管理 | GC | 所有权系统 |

---

# 第二部分：Rust 全新后端架构设计

## 七、架构设计原则

### 7.1 核心目标

1. **高性能**：利用 Rust 零成本抽象和多线程优势，突破 Node.js 单线程瓶颈
2. **内存安全**：编译期保证内存安全，无 GC 停顿
3. **桌面端优化**：针对本地运行场景优化，减少网络开销
4. **模块化清晰**：remi-* 系列模块职责独立，便于维护迭代
5. **接口兼容**：保持与现有桌面前端的 WebSocket RPC 协议完全兼容

### 7.2 设计约束

- **无 Web 端**：仅考虑桌面端（Tauri）场景，移除 HTTP 服务器相关逻辑
- **本地优先**：所有服务本地运行，无需远程服务器
- **协议兼容**：WebSocket RPC 协议与 Peak Code 完全一致，前端零改动
- **渐进式迁移**：按模块分阶段迁移，每阶段可独立验证

---

## 八、模块化工程架构

### 8.1 模块划分

```
remi-code/
├── Cargo.toml                    # Workspace 根配置
├── remi-core/                    # 核心领域模型与合约
├── remi-config/                  # 配置管理
├── remi-persistence/             # 持久化层（SQLite）
├── remi-orchestration/           # 编排引擎（CQRS/ES）
├── remi-provider/                # AI Provider 管理
├── remi-git/                     # Git 操作服务
├── remi-terminal/                # 终端管理
├── remi-workspace/               # 工作空间与文件系统
├── remi-auth/                    # 认证与授权
├── remi-checkpoint/              # 检查点管理
├── remi-telemetry/               # 遥测与分析
├── remi-server/                  # WebSocket 服务器（桌面端）
└── remi-cli/                     # CLI 入口
```

### 8.2 模块职责定义

#### remi-core（核心合约）

**职责**：定义跨模块共享的领域模型、事件、命令、错误类型

**核心内容**：
```rust
// 领域实体
pub struct Project { id, kind, title, workspace_root, ... }
pub struct Thread { id, project_id, title, model_selection, ... }
pub struct Message { id, role, text, attachments, ... }
pub struct Session { thread_id, status, provider_name, ... }

// 事件定义（26 种）
pub enum OrchestrationEvent {
    ProjectCreated(ProjectCreatedPayload),
    ThreadCreated(ThreadCreatedPayload),
    ThreadMessageSent(ThreadMessageSentPayload),
    // ... 其他事件
}

// 命令定义（30+ 种）
pub enum OrchestrationCommand {
    ProjectCreate(ProjectCreateCommand),
    ThreadCreate(ThreadCreateCommand),
    ThreadTurnStart(ThreadTurnStartCommand),
    // ... 其他命令
}

// Provider 相关
pub enum ProviderKind { Codex, ClaudeAgent, Cursor, Gemini, Grok, Kilo, OpenCode, Pi }
pub struct ModelSelection { provider: ProviderKind, model: String, options: ProviderOptions }

// 错误类型
pub enum CoreError { ValidationError(String), NotFoundError(String), ... }
```

**依赖**：serde, chrono, uuid

---

#### remi-config（配置管理）

**职责**：服务器配置解析、环境变量、CLI 参数、路径派生

**核心内容**：
```rust
pub struct ServerConfig {
    pub mode: RuntimeMode,           // Desktop
    pub port: u16,
    pub host: Option<String>,
    pub base_dir: PathBuf,
    pub state_dir: PathBuf,
    pub db_path: PathBuf,
    pub secrets_dir: PathBuf,
    pub logs_dir: PathBuf,
    pub attachments_dir: PathBuf,
    pub worktrees_dir: PathBuf,
    pub settings_path: PathBuf,
    pub auth_token: Option<String>,
    pub log_provider_events: bool,
    pub log_websocket_events: bool,
}

pub enum RuntimeMode { Desktop }

impl ServerConfig {
    pub fn from_args_and_env(args: CliArgs) -> Result<Self, ConfigError>;
    pub fn derive_paths(base_dir: &Path) -> Result<DerivedPaths, ConfigError>;
}
```

**依赖**：config-rs, clap, remi-core

---

#### remi-persistence（持久化层）

**职责**：SQLite 数据库管理、迁移、事件存储、投影存储

**核心内容**：
```rust
// 数据库客户端
pub struct SqliteClient {
    conn: rusqlite::Connection,
}

impl SqliteClient {
    pub fn new(db_path: &Path) -> Result<Self, PersistenceError>;
    pub fn run_migrations(&self) -> Result<(), PersistenceError>;
    pub fn execute<T>(&self, sql: &str, params: &[&dyn ToSql]) -> Result<T, PersistenceError>;
}

// 事件存储
pub trait EventStore: Send + Sync {
    fn append_event(&self, event: &OrchestrationEvent) -> Result<Sequence, PersistenceError>;
    fn read_events(&self, from_sequence: Sequence) -> Result<Vec<OrchestrationEvent>, PersistenceError>;
}

// 投影存储
pub trait ProjectionRepository: Send + Sync {
    fn save_project(&self, project: &Project) -> Result<(), PersistenceError>;
    fn save_thread(&self, thread: &Thread) -> Result<(), PersistenceError>;
    fn get_project(&self, id: ProjectId) -> Result<Option<Project>, PersistenceError>;
    fn get_thread(&self, id: ThreadId) -> Result<Option<Thread>, PersistenceError>;
    fn list_projects(&self) -> Result<Vec<Project>, PersistenceError>;
    fn list_threads(&self) -> Result<Vec<Thread>, PersistenceError>;
}
```

**数据库表结构**：
```sql
-- 事件存储
CREATE TABLE orchestration_events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    aggregate_kind TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    payload TEXT NOT NULL,  -- JSON
    occurred_at TEXT NOT NULL,
    command_id TEXT,
    metadata TEXT
);

-- 项目投影
CREATE TABLE projection_projects (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    workspace_root TEXT NOT NULL,
    default_model_selection TEXT,
    scripts TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

-- 线程投影
CREATE TABLE projection_threads (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    model_selection TEXT NOT NULL,
    runtime_mode TEXT NOT NULL,
    interaction_mode TEXT NOT NULL,
    env_mode TEXT NOT NULL,
    branch TEXT,
    worktree_path TEXT,
    -- ... 其他字段
    messages TEXT NOT NULL,
    activities TEXT NOT NULL,
    checkpoints TEXT NOT NULL,
    session TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY (project_id) REFERENCES projection_projects(id)
);

-- 投影器游标
CREATE TABLE projection_state (
    projector_name TEXT PRIMARY KEY,
    last_applied_sequence INTEGER NOT NULL
);

-- 认证会话
CREATE TABLE auth_sessions (
    session_id TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- 配对链接
CREATE TABLE auth_pairing_links (
    id TEXT PRIMARY KEY,
    credential_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    revoked_at TEXT
);
```

**依赖**：rusqlite, serde_json, remi-core

---

#### remi-orchestration（编排引擎）

**职责**：命令分发、事件持久化、投影器、读模型查询、Reactor 模式

**核心内容**：
```rust
// 编排引擎服务
pub struct OrchestrationEngine {
    event_store: Arc<dyn EventStore>,
    projection_repo: Arc<dyn ProjectionRepository>,
    command_queue: mpsc::Sender<CommandMessage>,
}

impl OrchestrationEngine {
    pub async fn dispatch(&self, command: OrchestrationCommand) -> Result<Sequence, OrchestrationError>;
    pub async fn read_events(&self, from_sequence: Sequence) -> Result<Vec<OrchestrationEvent>, OrchestrationError>;
    pub async fn get_snapshot(&self) -> Result<OrchestrationReadModel, OrchestrationError>;
    pub async fn get_shell_snapshot(&self) -> Result<OrchestrationShellSnapshot, OrchestrationError>;
    pub async fn stream_domain_events(&self) -> broadcast::Receiver<OrchestrationEvent>;
}

// 投影器
pub struct Projector { /* 事件消费、投影更新 */ }

// Provider 命令反应器
pub struct ProviderCommandReactor { /* 编排命令 -> Provider 调用 */ }

// 检查点反应器
pub struct CheckpointReactor { /* 检查点事件处理 */ }

// 读模型查询服务
pub struct ProjectionSnapshotQuery { /* 只读查询 */ }
```

**依赖**：tokio, remi-core, remi-persistence, remi-provider

---

#### remi-provider（Provider 管理）

**职责**：AI Provider 适配器、会话管理、健康检查、ACP 协议

**核心内容**：
```rust
// Provider 适配器 trait
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

// Provider 服务（门面）
pub struct ProviderService {
    adapters: HashMap<ProviderKind, Arc<dyn ProviderAdapter>>,
    session_directory: SessionDirectory,
    event_bus: broadcast::Sender<ProviderRuntimeEvent>,
}

// 具体适配器：CodexAdapter, ClaudeAdapter, CursorAdapter, GeminiAdapter,
//              GrokAdapter, KiloAdapter, OpenCodeAdapter, PiAdapter

// Provider 健康检查
pub struct ProviderHealth { /* CLI 探针、状态缓存 */ }

// Provider 会话清理
pub struct ProviderSessionReaper { /* 过期会话清理 */ }
```

**依赖**：tokio, async-trait, remi-core

---

#### remi-git（Git 服务）

**职责**：Git 命令封装、分支管理、worktree、状态广播

```rust
pub struct GitCore { /* 底层 Git 命令封装 */ }
pub struct GitManager { /* 高级 Git 操作 */ }
pub struct GitStatusBroadcaster { /* 状态缓存与广播 */ }
```

**依赖**：tokio, tokio::process, remi-core

---

#### remi-terminal（终端管理）

**职责**：PTY 终端会话管理

```rust
pub struct TerminalManager {
    sessions: RwLock<HashMap<TerminalId, TerminalSession>>,
    event_tx: broadcast::Sender<TerminalEvent>,
}
// 方法：open, write, resize, clear, restart, close, subscribe
```

**依赖**：tokio, portable-pty, remi-core

---

#### remi-workspace（工作空间）

**职责**：文件系统浏览、目录搜索、文件操作

```rust
pub struct WorkspaceService { /* list_directories, search_entries, browse, write_file */ }
```

**依赖**：tokio, walkdir, globset, remi-core

---

#### remi-auth（认证授权）

**职责**：认证、会话凭证、配对链接、密钥存储

```rust
pub struct AuthService { /* 认证门面 */ }
pub struct SecretStore { /* 密钥安全存储 */ }
```

**依赖**：tokio, sha2, hmac, remi-core, remi-persistence

---

#### remi-checkpoint（检查点管理）

**职责**：Git 检查点存储、Diff 查询

```rust
pub struct CheckpointStore { /* Git 检查点 */ }
pub struct CheckpointDiffQuery { /* Turn Diff / Full Thread Diff */ }
```

**依赖**：tokio, remi-core, remi-git, remi-orchestration

---

#### remi-telemetry（遥测）

**职责**：分析数据收集

```rust
pub struct AnalyticsService { /* 分析事件记录 */ }
```

**依赖**：tokio, reqwest, remi-core

---

#### remi-server（WebSocket 服务器）

**职责**：WebSocket RPC、服务器生命周期、推送订阅

```rust
pub struct Server {
    config: Arc<ServerConfig>,
    orchestration_engine: Arc<OrchestrationEngine>,
    provider_service: Arc<ProviderService>,
    // ... 所有服务引用
}
```

**依赖**：axum, tokio-tungstenite, tower, 及所有 remi-* 模块

---

#### remi-cli（CLI 入口）

**职责**：命令行参数解析、服务器启动

```rust
#[tokio::main]
async fn main() {
    // CLI 解析 -> 配置构建 -> 服务层初始化 -> 服务器启动 -> 等待关闭
}
```

**依赖**：clap, tokio, tracing, remi-config, remi-server

---

### 8.3 依赖关系图

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

## 九、技术选型

### 9.1 核心技术栈

| 层次 | 技术 | 版本 | 选型理由 |
|------|------|------|----------|
| **运行时** | Tokio | 1.x | 异步运行时，高性能并发 |
| **Web 框架** | Axum | 0.7 | 类型安全、基于 Tower、生态成熟 |
| **WebSocket** | tokio-tungstenite | 0.21 | 异步 WebSocket 实现 |
| **序列化** | serde + serde_json | 1.x | 高性能序列化，类型安全 |
| **数据库** | rusqlite | 0.31 | SQLite 绑定，支持并发读 |
| **进程管理** | tokio::process | - | 异步子进程管理 |
| **PTY** | portable-pty | 0.8 | 跨平台伪终端 |
| **日志** | tracing | 0.1 | 结构化日志，性能优秀 |
| **配置** | config-rs | 0.14 | 多源配置管理 |
| **错误处理** | thiserror + anyhow | - | 类型化错误 + 便捷错误 |
| **CLI** | clap | 4.x | 命令行参数解析 |

---

## 十、接口规范设计

### 10.1 WebSocket RPC 协议

保持与 Peak Code 完全兼容的协议格式：

```rust
// 请求
#[derive(Serialize, Deserialize)]
struct WebSocketRequest {
    id: String,
    body: WebSocketRequestBody,
}

// 响应
#[derive(Serialize, Deserialize)]
struct WebSocketResponse {
    id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<RpcError>,
}

// 推送
#[derive(Serialize, Deserialize)]
struct WebSocketPush {
    #[serde(rename = "type")]
    push_type: String,
    sequence: u64,
    channel: String,
    data: serde_json::Value,
}
```

### 10.2 RPC 方法清单（保持兼容）

完整迁移 Peak Code 的 60+ RPC 方法，方法名和参数结构保持一致：

```rust
// 编排方法（12 个）
const ORCHESTRATION_METHODS: &[&str] = &[
    "orchestration.dispatchCommand",
    "orchestration.importThread",
    "orchestration.getSnapshot",
    "orchestration.getShellSnapshot",
    "orchestration.repairState",
    "orchestration.getTurnDiff",
    "orchestration.getFullThreadDiff",
    "orchestration.replayEvents",
    "orchestration.subscribeShell",
    "orchestration.unsubscribeShell",
    "orchestration.subscribeThread",
    "orchestration.unsubscribeThread",
];

// Git 方法（18 个）
const GIT_METHODS: &[&str] = &[
    "git.pull", "git.status", "git.readWorkingTreeDiff", "git.summarizeDiff",
    "git.runStackedAction", "git.listBranches",
    "git.createWorktree", "git.createDetachedWorktree", "git.removeWorktree",
    "git.createBranch", "git.checkout",
    "git.stashAndCheckout", "git.stashDrop", "git.stashInfo",
    "git.removeIndexLock", "git.init",
    "git.handoffThread", "git.resolvePullRequest", "git.preparePullRequestThread",
];

// 终端方法（7 个）
const TERMINAL_METHODS: &[&str] = &[
    "terminal.open", "terminal.write", "terminal.resize",
    "terminal.clear", "terminal.restart", "terminal.close",
    "terminal.subscribeEvents",
];

// 服务器方法（14 个）
const SERVER_METHODS: &[&str] = &[
    "server.getConfig", "server.getEnvironment", "server.getSettings", "server.updateSettings",
    "server.refreshProviders", "server.updateProvider", "server.listWorktrees",
    "server.getProviderUsageSnapshot", "server.getDiagnostics", "server.transcribeVoice",
    "server.upsertKeybinding",
    "server.subscribeLifecycle", "server.subscribeConfig",
    "server.subscribeProviderStatuses", "server.subscribeSettings",
];

// Provider 方法（9 个）
const PROVIDER_METHODS: &[&str] = &[
    "provider.getComposerCapabilities", "provider.compactThread",
    "provider.listCommands", "provider.listSkills", "provider.listPlugins", "provider.readPlugin",
    "provider.listModels", "provider.listAgents",
    "skills.listLocal",
];
```

### 10.3 推送通道（保持兼容，10 个）

```rust
const PUSH_CHANNELS: &[&str] = &[
    "server.welcome",
    "server.maintenanceUpdated",
    "server.configUpdated",
    "server.providerStatusesUpdated",
    "server.settingsUpdated",
    "git.actionProgress",
    "terminal.event",
    "orchestration.domainEvent",
    "orchestration.shellEvent",
    "orchestration.threadEvent",
];
```

---

## 十一、性能优化策略

### 11.1 并发优化

1. **异步 I/O**：所有 I/O 操作（数据库、文件、网络）使用 async/await
2. **连接池**：SQLite 使用连接池（r2d2）提升并发读性能
3. **任务并行**：使用 tokio::spawn 并行执行独立任务
4. **流式处理**：大文件读取、事件流使用 Stream 避免内存峰值

### 11.2 内存优化

1. **零拷贝**：使用 `&str` 和 `Bytes` 避免不必要的内存分配
2. **对象池**：复用频繁创建的对象（如 JSON 序列化器）
3. **延迟加载**：按需加载数据，避免一次性加载全部数据

### 11.3 启动优化

1. **延迟初始化**：非关键服务延迟初始化，加快启动速度
2. **并行初始化**：独立服务并行初始化
3. **预编译正则**：正则表达式预编译，避免运行时开销

### 11.4 性能指标目标

| 指标 | Peak Code (Node.js) | Remi Code (Rust) 目标 | 提升幅度 |
|------|---------------------|----------------------|----------|
| 启动时间 | ~5s | ~1s | 80% |
| 内存占用 | ~300MB | ~50MB | 83% |
| RPC 响应时间 | ~50ms | ~10ms | 80% |
| 并发连接数 | ~50 | ~100+ | 100% |

---

# 第三部分：分模块精细化迁移方案

## 十二、迁移总体策略

### 12.1 迁移原则

1. **功能完整性**：100% 复刻 Peak Code 后端所有功能
2. **接口兼容性**：WebSocket RPC 协议完全兼容，前端零改动
3. **渐进式迁移**：按模块分阶段迁移，每阶段可独立验证
4. **性能优先**：充分利用 Rust 性能优势，优化瓶颈
5. **桌面端优化**：针对本地运行场景优化，减少不必要的网络开销

### 12.2 迁移阶段规划

| 阶段 | 模块 | 优先级 | 验收标准 |
|------|------|--------|----------|
| **阶段 1** | remi-core + remi-config | 基础 | 领域模型定义完成，配置解析通过 |
| **阶段 2** | remi-persistence | 核心 | 数据库迁移、事件存储、投影存储通过测试 |
| **阶段 3** | remi-orchestration | 核心 | 命令分发、事件流、投影器、读模型查询通过测试 |
| **阶段 4** | remi-provider | 核心 | 8 种 Provider 适配器、会话管理、健康检查通过测试 |
| **阶段 5** | remi-git | 重要 | Git 操作、分支管理、worktree、状态广播通过测试 |
| **阶段 6** | remi-terminal | 重要 | PTY 终端管理、事件订阅通过测试 |
| **阶段 7** | remi-workspace | 重要 | 文件系统浏览、搜索、文件操作通过测试 |
| **阶段 8** | remi-auth | 重要 | 认证、会话管理、配对链接通过测试 |
| **阶段 9** | remi-checkpoint + remi-telemetry | 辅助 | 检查点管理、遥测通过测试 |
| **阶段 10** | remi-server + remi-cli | 集成 | WebSocket 服务器、RPC 方法、CLI 入口通过集成测试 |

---

## 十三、阶段 1：remi-core + remi-config

### 迁移内容

**remi-core**：
1. 定义所有领域实体（Project、Thread、Message、Session 等）
2. 定义所有事件类型（26 种 OrchestrationEvent）
3. 定义所有命令类型（30+ 种 OrchestrationCommand）
4. 定义 Provider 相关类型（ProviderKind、ModelSelection 等）
5. 定义错误类型（CoreError）

**remi-config**：
1. 实现 ServerConfig 结构体
2. 实现 CLI 参数解析（clap）
3. 实现环境变量读取
4. 实现路径派生逻辑
5. 实现配置验证

### 技术难点

1. **类型映射**：TypeScript 类型 -> Rust 类型，确保 serde 序列化兼容
2. **Tagged Union**：TypeScript 的 Tagged Union -> Rust enum，确保 JSON 格式一致
3. **可选字段**：TypeScript 的 `optional` -> Rust 的 `Option<T>`，确保默认值处理正确

### 解决方案

1. 使用 `#[serde(tag = "_tag")]` 处理 Tagged Union
2. 使用 `#[serde(default)]` 处理可选字段默认值
3. 使用 `#[serde(rename_all = "camelCase")]` 保持字段名兼容

### 验收标准

- [ ] 所有领域模型定义完成
- [ ] 所有事件类型定义完成
- [ ] 所有命令类型定义完成
- [ ] 配置解析测试通过
- [ ] 序列化/反序列化测试通过（与 Peak Code JSON 格式兼容）

---

## 十四、阶段 2：remi-persistence

### 迁移内容

1. 实现 SqliteClient（rusqlite 封装）
2. 实现数据库迁移系统
3. 实现 EventStore trait 和 SqliteEventStore
4. 实现 ProjectionRepository trait 和 SqliteProjectionRepository
5. 实现投影状态管理

### 技术难点

1. **并发控制**：SQLite 写锁竞争
2. **事务管理**：确保事件追加和投影更新的原子性
3. **迁移兼容性**：与 Peak Code 数据库格式兼容

### 解决方案

1. 使用 SQLite WAL 模式提升并发读性能
2. 使用事务确保原子性
3. 迁移脚本与 Peak Code 保持一致

### 验收标准

- [ ] 数据库连接测试通过
- [ ] 迁移系统测试通过
- [ ] 事件存储测试通过（追加、读取）
- [ ] 投影存储测试通过（保存、查询、列表）
- [ ] 并发读写测试通过

---

## 十五、阶段 3：remi-orchestration

### 迁移内容

1. 实现 OrchestrationEngine（命令分发、事件读取）
2. 实现 Projector（事件消费、投影更新）
3. 实现 ProviderCommandReactor（命令 -> Provider 调用）
4. 实现 CheckpointReactor（检查点处理）
5. 实现 ProjectionSnapshotQuery（读模型查询）
6. 实现事件流广播

### 技术难点

1. **命令序列化**：确保命令队列的有序处理
2. **事件流**：使用 tokio::broadcast 实现事件广播
3. **投影器游标**：确保投影器不重复消费事件
4. **状态修复**：实现 repairState 功能

### 解决方案

1. 使用 mpsc channel 实现命令队列
2. 使用 broadcast channel 实现事件流
3. 使用 projection_state 表跟踪游标
4. 实现投影重放逻辑

### 验收标准

- [ ] 命令分发测试通过
- [ ] 事件持久化测试通过
- [ ] 投影器测试通过（事件消费、投影更新）
- [ ] 读模型查询测试通过
- [ ] 事件流订阅测试通过
- [ ] 状态修复测试通过

---

## 十六、阶段 4：remi-provider

### 迁移内容

1. 定义 ProviderAdapter trait
2. 实现 8 种 Provider 适配器（Codex、Claude、Cursor、Gemini、Grok、Kilo、OpenCode、Pi）
3. 实现 ProviderService（门面模式）
4. 实现 ProviderHealth（健康检查）
5. 实现 ProviderSessionReaper（会话清理）
6. 实现 Provider 事件流

### 技术难点

1. **进程管理**：异步子进程管理（tokio::process）
2. **JSON-RPC**：与 Provider CLI 的 JSON-RPC 通信
3. **ACP 协议**：Cursor/Gemini/Grok 的 ACP 协议实现
4. **事件转换**：Provider 原生事件 -> OrchestrationEvent

### 解决方案

1. 使用 tokio::process 管理子进程
2. 使用 serde_json 处理 JSON-RPC
3. 参考 Peak Code 的 ACP 实现
4. 实现事件转换层

### 验收标准

- [ ] ProviderAdapter trait 定义完成
- [ ] 8 种 Provider 适配器实现完成
- [ ] ProviderService 测试通过（会话启动、Turn 发送、中断、停止）
- [ ] ProviderHealth 测试通过（健康检查、状态缓存）
- [ ] ProviderSessionReaper 测试通过
- [ ] Provider 事件流测试通过

---

## 十七、阶段 5：remi-git

### 迁移内容

1. 实现 GitCore（底层 Git 命令封装）
2. 实现 GitManager（高级 Git 操作）
3. 实现 GitStatusBroadcaster（状态缓存与广播）
4. 实现 GitHubCli（GitHub CLI 集成）

### 技术难点

1. **Git 命令**：大量 Git 命令的正确封装
2. **异步执行**：Git 命令的异步执行
3. **状态广播**：Git 状态的缓存与广播
4. **Worktree 管理**：Worktree 的创建、移除、路径管理

### 解决方案

1. 使用 tokio::process 执行 Git 命令
2. 使用 RwLock 缓存 Git 状态
3. 使用 broadcast channel 广播状态变化
4. 严格遵循 Git Worktree 规范

### 验收标准

- [ ] GitCore 测试通过（pull、status、branch、worktree、stash、checkout、init）
- [ ] GitManager 测试通过（stacked action、diff 摘要、PR 准备、线程交接）
- [ ] GitStatusBroadcaster 测试通过（状态缓存、广播）
- [ ] 并发 Git 操作测试通过

---

## 十八、阶段 6：remi-terminal

### 迁移内容

1. 实现 TerminalManager（终端会话管理）
2. 集成 portable-pty（伪终端）
3. 实现终端事件流

### 技术难点

1. **PTY 集成**：portable-pty 的异步集成
2. **事件流**：终端输出的实时广播
3. **跨平台**：Windows/macOS/Linux 兼容

### 解决方案

1. 使用 portable-pty 的异步 API
2. 使用 broadcast channel 广播终端事件
3. 使用条件编译处理平台差异

### 验收标准

- [ ] TerminalManager 测试通过（open、write、resize、clear、restart、close）
- [ ] 终端事件流测试通过
- [ ] 跨平台测试通过（Windows、macOS、Linux）

---

## 十九、阶段 7：remi-workspace

### 迁移内容

1. 实现 WorkspaceService（文件系统操作）
2. 实现目录列表、搜索、浏览
3. 实现文件写入

### 技术难点

1. **路径安全**：防止路径遍历攻击
2. **性能优化**：大目录的搜索性能
3. **符号链接**：符号链接的正确处理

### 解决方案

1. 使用 canonicalize 验证路径
2. 使用 walkdir 和 globset 优化搜索
3. 使用 follow_links 选项控制符号链接

### 验收标准

- [ ] WorkspaceService 测试通过（list_directories、search_entries、browse、write_file）
- [ ] 路径安全测试通过
- [ ] 大目录性能测试通过

---

## 二十、阶段 8：remi-auth

### 迁移内容

1. 实现 AuthService（认证门面）
2. 实现 SecretStore（密钥存储）
3. 实现 SessionStore（会话存储）
4. 实现 PairingStore（配对链接存储）
5. 实现 WebSocket 升级认证

### 技术难点

1. **密钥安全**：密钥的安全存储和加载
2. **会话管理**：会话的创建、验证、撤销
3. **配对流程**：Bootstrap 凭证交换、配对链接管理

### 解决方案

1. 使用文件系统存储密钥，设置文件权限
2. 使用 SQLite 存储会话和配对链接
3. 实现完整的认证流程

### 验收标准

- [ ] AuthService 测试通过（WebSocket 认证）
- [ ] SecretStore 测试通过（存储、加载、删除）
- [ ] SessionStore 测试通过（创建、验证、撤销）
- [ ] PairingStore 测试通过（创建、列表、撤销）
- [ ] 认证流程测试通过

---

## 二十一、阶段 9：remi-checkpoint + remi-telemetry

### 迁移内容

**remi-checkpoint**：
1. 实现 CheckpointStore（检查点存储）
2. 实现 CheckpointDiffQuery（Diff 查询）

**remi-telemetry**：
1. 实现 AnalyticsService（分析数据收集）

### 技术难点

1. **检查点**：Git stash/commit 的正确使用
2. **Diff 查询**：Turn Diff 和 Full Thread Diff 的计算

### 解决方案

1. 使用 Git stash 创建检查点
2. 使用 Git diff 计算差异

### 验收标准

- [ ] CheckpointStore 测试通过（创建、恢复）
- [ ] CheckpointDiffQuery 测试通过（Turn Diff、Full Thread Diff）
- [ ] AnalyticsService 测试通过（事件记录）

---

## 二十二、阶段 10：remi-server + remi-cli

### 迁移内容

**remi-server**：
1. 实现 WebSocket 服务器（tokio-tungstenite）
2. 实现 WebSocket RPC
3. 实现 60+ RPC 方法
4. 实现 10 个推送通道
5. 实现服务器生命周期管理

**remi-cli**：
1. 实现 CLI 入口（clap）
2. 实现服务层构建
3. 实现服务器启动和关闭

### 技术难点

1. **WebSocket RPC**：完整的 RPC 框架实现
2. **方法路由**：60+ 方法的正确路由
3. **推送订阅**：10 个推送通道的订阅管理
4. **生命周期**：服务器的优雅启动和关闭

### 解决方案

1. 使用 tokio-tungstenite 实现 WebSocket
2. 使用 match 路由 RPC 方法
3. 使用 broadcast channel 管理推送订阅
4. 使用 tokio::signal 处理关闭信号

### 验收标准

- [ ] WebSocket RPC 测试通过（60+ 方法）
- [ ] 推送订阅测试通过（10 个通道）
- [ ] 服务器生命周期测试通过（启动、关闭）
- [ ] CLI 测试通过（参数解析、服务器启动）
- [ ] **集成测试**：与桌面前端联调测试通过

---

# 第四部分：质量保障与风险管控

## 二十三、质量验收标准

### 23.1 功能完整性

- [ ] 所有 Peak Code 后端功能 100% 复刻
- [ ] 所有 RPC 方法功能一致
- [ ] 所有推送通道功能一致
- [ ] 所有数据模型结构一致

### 23.2 接口兼容性

- [ ] WebSocket RPC 协议格式完全兼容
- [ ] JSON 序列化/反序列化格式完全兼容
- [ ] 桌面前端零改动即可对接

### 23.3 性能指标

- [ ] 启动时间 < 1 秒（Peak Code 约 3-5 秒）
- [ ] 内存占用 < 50MB（Peak Code 约 150-200MB）
- [ ] RPC 方法响应时间 < 10ms（P99）
- [ ] 并发连接数 > 100

### 23.4 稳定性

- [ ] 无内存泄漏（valgrind 检测通过）
- [ ] 无数据竞争（tokio::test 并发测试通过）
- [ ] 错误处理完善（所有错误类型定义完整）
- [ ] 日志记录完整（tracing 结构化日志）

### 23.5 测试覆盖

- [ ] 单元测试覆盖率 > 80%
- [ ] 集成测试覆盖所有 RPC 方法
- [ ] 端到端测试覆盖核心流程

---

## 二十四、风险预判与应对

### 24.1 技术风险

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| **Provider 协议复杂** | 高 | 详细研究 Peak Code 实现，逐步验证 |
| **ACP 协议实现** | 高 | 参考 Peak Code 的 ACP 实现，充分测试 |
| **WebSocket RPC 兼容性** | 高 | 与 Peak Code 协议格式严格对齐，前端联调验证 |
| **SQLite 并发性能** | 中 | 使用 WAL 模式，必要时可升级到 PostgreSQL |
| **跨平台 PTY** | 中 | 使用 portable-pty，充分测试各平台 |

### 24.2 进度风险

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| **模块依赖复杂** | 中 | 严格按阶段推进，每阶段独立验证 |
| **功能遗漏** | 高 | 详细对照 Peak Code 功能清单，逐一验证 |
| **性能不达标** | 中 | 早期进行性能基准测试，及时优化 |

### 24.3 质量风险

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| **内存泄漏** | 高 | 使用 valgrind 检测，代码审查 |
| **数据竞争** | 高 | 使用 tokio::test 并发测试，代码审查 |
| **错误处理不完善** | 中 | 定义完整的错误类型，覆盖所有错误场景 |

---

## 二十五、后续迭代优化规划

### 25.1 短期优化（1-3 个月）

1. **性能调优**：根据实际使用情况进行性能调优
2. **错误处理优化**：完善错误提示和日志记录
3. **文档完善**：补充 API 文档、架构文档

### 25.2 中期优化（3-6 个月）

1. **数据库升级**：评估是否需要升级到 PostgreSQL
2. **Provider 扩展**：支持更多 AI Provider
3. **插件系统**：实现插件系统，支持扩展功能

### 25.3 长期优化（6-12 个月）

1. **分布式支持**：评估是否需要支持分布式部署
2. **云端同步**：实现云端数据同步
3. **AI 增强**：集成更多 AI 能力

---

**文档版本**: v1.0  
**最后更新**: 2026-06-19  
**负责人**: 技术负责人  
**审批人**: 待确认
