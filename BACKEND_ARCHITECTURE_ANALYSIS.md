# Peak Code 后端架构摸底分析报告

> 基于 Peak Code 项目（D:\Code\github\PeakCode）后端架构的全量深度分析

**版本**: v1.0  
**日期**: 2026-06-19  
**状态**: 已确认

---

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

---

## 七、迁移改造重点总结

| 改造维度 | 原架构 | 迁移目标 |
|----------|--------|----------|
| 运行时 | Node.js (单线程) | Rust (多线程、零成本抽象) |
| 框架 | Effect-TS | Axum/Actix + Tokio |
| 持久化 | SQLite (单文件) | SQLite (rusqlite) 或可升级方案 |
| WebSocket | ws + Effect RPC | tokio-tungstenite |
| 进程管理 | child_process + node-pty | tokio::process + portable-pty |
| 类型系统 | TypeScript + Effect Schema | Rust 类型系统 + serde |
| 并发模型 | 事件循环 + Fiber | async/await + Tokio |
| 内存管理 | GC | 所有权系统 |

---

**文档版本**: v1.0  
**最后更新**: 2026-06-19  
**负责人**: 技术负责人  
**审批人**: 待确认
