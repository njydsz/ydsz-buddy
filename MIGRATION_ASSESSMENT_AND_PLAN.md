# Remi Code 迁移评估与补充计划

## 1. 整体结论

**迁移状态：核心框架已搭建，但存在显著能力缺失**

Remi Code 在接口层面（52个RPC方法）已对齐 Peak Code，但后端存在多个模块完全缺失或不完整，实际后端迁移完成度约 **60-70%**。

---

## 2. 前端迁移情况

### 2.1 文件覆盖（精确对比）

**核心应用代码 (src/)**
- **PeakCode 前端**：340 个 TypeScript 文件
- **Remi Code 前端**：340 个 TypeScript 文件
- **覆盖率**：**100%** - 文件数量完全一致

**目录结构对比**
```
components/          PeakCode: 63  |  Remi: 63  ✅
components/chat/     PeakCode: 62  |  Remi: 62  ✅
components/ui/       PeakCode: 40  |  Remi: 40  ✅
components/terminal/ PeakCode: 12  |  Remi: 12  ✅
lib/                 PeakCode: 49  |  Remi: 50  ✅ (Remi 新增 tauri-bridge.ts)
hooks/               PeakCode: 20  |  Remi: 20  ✅
routes/              PeakCode: 11  |  Remi: 11  ✅
whatsNew/            PeakCode: 6   |  Remi: 6   ✅
i18n/                PeakCode: 4   |  Remi: 4   ✅
theme/               PeakCode: 2   |  Remi: 2   ✅
notifications/       PeakCode: 2   |  Remi: 2   ✅
```

**共享库代码 (libs/)**
- **PeakCode (packages/)**：57 个文件
  - contracts/: 21 个文件 ✅
  - shared/: 26 个文件 ✅
  - effect-acp/: 10 个文件 ❌ **缺失**
  
- **Remi Code (remi-app/libs/)**：46 个文件
  - contracts/: 21 个文件 ✅
  - shared/: 25 个文件 ✅
  - remi-acp/: 3 个文件 (Rust ACP 后端实现)

**差异分析**
- 缺失的 10 个文件来自 `effect-acp` 包（TypeScript ACP 协议客户端库）
- `effect-acp` 包含：protocol.ts, schema.ts, errors.ts, stdio.ts, shared.ts 等
- 这是**前端** ACP 客户端实现，用于与后端 ACP 服务通信
- Remi 的 `remi-acp`（3个文件）是**后端** Rust ACP 实现，不是前端的替代品
- **结论**：前端可能缺少 ACP 客户端功能，需要确认是否需要迁移 `effect-acp`

### 2.2 模块能力
- ✅ 所有页面、组件、Hook、Store 已 100% 迁移
- ✅ 框架替换完成（Electron → Tauri，React 体系保留）
- ✅ WebSocket RPC 客户端契约定义完整
- ✅ 新增 Tauri 桥接层（tauri-bridge.ts）

### 2.3 类型正确性
- ❌ `remi-app` 存在 TypeScript typecheck 错误
  - 缺少模块："vitest/browser"、"msw" 等
  - 属性未找到："tauriBridge"、"isMaxLength" 等
  - 类型不匹配问题
  - **注意**：这是类型定义问题，不是功能缺失

---

## 3. 后端迁移情况

### 3.1 逐模块对比

| 模块 | PeakCode (TS) | Remi (Rust) | 状态 | 说明 |
|------|--------------|-------------|------|------|
| orchestration | 9 服务 + decider/projector/handoff 等 | 9 文件 | ✅ 完成 | CQRS/Event Sourcing 完整实现 |
| provider (adapters) | 8 适配器 + ProviderService 等 | 15 文件 (8 适配器) | ✅ 完成 | Claude/Codex/Cursor/Gemini/Grok/Kilo/Pi/OpenCode |
| provider (acp) | 17 个 ACP 文件 | 0 文件 | ❌ 缺失 | ACP协议支持，Cursor/Grok集成 |
| provider (高级) | DiscoveryService/SessionDirectory/Reaper/Logger | 部分 | ⚠️ 不完整 | 缺少自动发现、会话目录、事件日志 |
| git | 5 服务 + TextGeneration 等 | 5 文件 | ✅ 完成 | GitCore/GitManager/GitStatusBroadcaster |
| terminal | 2 服务 + PTY 封装 | 4 文件 | ✅ 完成 | Manager + PTY |
| workspace | 3 服务 + managedWorktree | 4 文件 | ✅ 完成 | Entries/FileSystem/Paths |
| auth | 6 服务 | 7 文件 | ✅ 完成 | 会话/配对码/密钥存储 |
| checkpointing | 3 服务 + Diffs/Utils | 4 文件 | ✅ 完成 | 检查点存储和差异处理 |
| persistence (核心) | 15 投影表 + EventStore | 8 文件 | ⚠️ 不完整 | 缺少 PendingApprovals/ThreadSessions/Turns 等投影表 |
| persistence (迁移) | 37 个独立迁移脚本 | 1 个 migrations.rs | ⚠️ 大幅简化 | 无法增量升级数据库 |
| environment | 1 服务 (ServerEnvironment) | 0 文件 | ❌ 缺失 | 运行时环境变量管理 |
| project | 1 服务 (FaviconResolver) | 0 文件 | ❌ 缺失 | 项目图标解析 |
| stream | 1 服务 | 0 文件 | ⚠️ 可能内联 | 流数据收集，可能已内联到其他模块 |
| telemetry | 1 服务 | 4 文件 | ✅ 完成 | 分析服务和指标追踪 |
| server | RPC + WebSocket + 生命周期 | 18 文件 | ✅ 完成 | 52个RPC方法全部注册 |

### 3.2 缺失能力汇总

**完全缺失（3个模块）：**
- ❌ **ACP协议支持** — Agent Communication Protocol，支持 Cursor/Grok 等编辑器集成（17个文件）
- ❌ **Environment 模块** — 运行时环境变量配置管理
- ❌ **Project 模块** — 项目图标解析等辅助功能

**不完整（3个模块）：**
- ⚠️ **数据库迁移系统** — PeakCode 37个迁移脚本 → Remi 仅1个文件，无法增量升级
- ⚠️ **Persistence 投影层** — 缺少 PendingApprovals、ThreadSessions、Turns、Activities、ProposedPlans、CommandReceipts 等投影表
- ⚠️ **Provider 高级功能** — 缺少 ProviderDiscoveryService、ProviderSessionDirectory、EventNdjsonLogger

### 3.3 接口覆盖
- ✅ 后端注册了 52 个 RPC 方法，与前端 `WS_METHODS` 定义完全一致

### 3.4 测试稳定性
- ❌ `remi-persistence` 测试失败（checkpoint_store 外键约束、migrations 断言错误）

---

## 4. 最终判断

| 维度 | 状态 | 说明 |
|------|------|------|
| 前端核心代码 (src/) | ✅ 完成 | 340 个文件完全一致，目录结构 100% 匹配 |
| 前端共享库 (libs/) | ⚠️ 部分完成 | 缺少 effect-acp 包的 10 个文件，需确认架构设计 |
| 前端类型/依赖正确性 | ❌ 未完成 | TypeScript typecheck 失败 |
| 后端核心模块迁移 | ✅ 完成 | orchestration/provider/git/terminal/workspace/auth/checkpoint/server |
| 后端缺失模块 | ❌ 未完成 | ACP/Environment/Project 三个模块完全缺失 |
| 后端不完整模块 | ⚠️ 未完成 | 迁移系统(37→1)、投影层、Provider高级功能 |
| 前后端接口对齐 | ✅ 完成 | 52个RPC方法完全匹配 |
| 后端测试稳定性 | ❌ 未完成 | persistence 测试失败 |

**实际迁移完成度：**
- 前端核心代码：**100%**（src/ 目录）
- 前端共享库：**81%**（46/57，缺少 effect-acp）
- 后端模块：**60-70%**（存在 3 个缺失模块 + 3 个不完整模块）

---

## 5. 补充迁移计划

### 阶段一：核心能力补全（高优先级，第1-4周）

#### 1.1 ACP协议支持系统（第1-2周）

**目标**: 实现 Agent Communication Protocol，支持 Cursor 等编辑器集成

```
remi-acp/
├── src/
│   ├── lib.rs
│   ├── core/
│   │   ├── mod.rs
│   │   ├── runtime_events.rs     # AcpCoreRuntimeEvents
│   │   ├── session.rs            # AcpSessionRuntime
│   │   └── adapter_support.rs    # AcpAdapterSupport
│   ├── adapters/
│   │   ├── mod.rs
│   │   ├── cursor/
│   │   │   ├── mod.rs
│   │   │   ├── cli_probe.rs      # CursorAcpCliProbe
│   │   │   ├── command.rs        # CursorAcpCommand
│   │   │   ├── extension.rs      # CursorAcpExtension
│   │   │   └── support.rs        # CursorAcpSupport
│   │   └── grok/
│   │       ├── mod.rs
│   │       └── support.rs        # GrokAcpSupport
│   ├── rpc/
│   │   ├── mod.rs
│   │   └── jsonrpc.rs            # AcpJsonRpcConnection
│   ├── model/
│   │   ├── mod.rs
│   │   └── runtime.rs            # AcpRuntimeModel
│   └── logging/
│       ├── mod.rs
│       └── native.rs             # AcpNativeLogging
└── Cargo.toml
```

**要点**: 基于JSON-RPC实现ACP协议通信，支持Cursor CLI探测和命令执行，会话运行时管理

#### 1.2 数据库迁移系统重构（第3周）

**目标**: 实现完整的增量迁移系统，支持37个历史迁移

```
remi-persistence/src/migrations/
├── mod.rs                # 迁移管理器
├── runner.rs             # 迁移执行器
├── version.rs            # 版本管理
└── scripts/
    ├── mod.rs
    ├── m001_orchestration_events.rs
    ├── m002_orchestration_command_receipts.rs
    ├── m003_checkpoint_diff_blobs.rs
    ├── ...（共37个迁移脚本）
    └── m037_snapshot_cap_indexes.rs
```

**要点**: 每个迁移脚本独立模块，支持事务执行和回滚，兼容已有数据库增量升级

#### 1.3 Persistence投影层补全（第4周）

**目标**: 补全所有投影表

```
remi-persistence/src/projections/
├── mod.rs
├── pending_approvals.rs  # ProjectionPendingApprovals
├── thread_sessions.rs    # ProjectionThreadSessions
├── turns.rs              # ProjectionTurns
├── activities.rs         # ProjectionThreadActivities
├── proposed_plans.rs     # ProjectionThreadProposedPlans
└── command_receipts.rs   # OrchestrationCommandReceipts
```

### 阶段二：功能增强（中优先级，第5周）

#### 2.1 Environment配置管理模块

```
remi-environment/
├── src/
│   ├── lib.rs
│   ├── environment.rs    # ServerEnvironment
│   ├── label.rs          # ServerEnvironmentLabel
│   └── error.rs
└── Cargo.toml
```

#### 2.2 Provider高级功能

```
remi-provider/src/
├── discovery.rs          # ProviderDiscoveryService
├── session_directory.rs  # ProviderSessionDirectory
├── session_reaper.rs     # ProviderSessionReaper (增强)
└── event_logger.rs       # EventNdjsonLogger
```

### 阶段三：辅助功能（低优先级，第6周）

#### 3.1 Project模块

```
remi-project/
├── src/
│   ├── lib.rs
│   ├── favicon_resolver.rs  # ProjectFaviconResolver
│   └── error.rs
└── Cargo.toml
```

---

## 6. 实施路线图

| 周次 | 任务 | 产出 |
|------|------|------|
| 第1-2周 | ACP协议核心 + JSON-RPC通信层 + Cursor适配器 | remi-acp crate |
| 第3周 | 迁移管理器重构 + 前10个迁移脚本 | 完整迁移框架 |
| 第4周 | 剩余27个迁移脚本 + 投影层补全 | persistence 完整 |
| 第5周 | Environment模块 + Provider高级功能 | 功能增强 |
| 第6周 | Project模块 + 性能优化 + 集成测试 | 全部完成 |

---

## 7. 验收标准

### ACP协议
- [ ] 支持与Cursor编辑器建立ACP连接
- [ ] 能够发送和接收ACP消息
- [ ] 会话生命周期管理正常

### 数据库迁移
- [ ] 支持从空数据库执行所有37个迁移
- [ ] 支持增量迁移（已有数据库）
- [ ] 迁移失败时能够回滚

### 投影层
- [ ] 所有投影表能够正确接收事件
- [ ] 查询性能 < 100ms
- [ ] 数据一致性验证通过

### Environment / Provider / Project
- [ ] 环境变量读取和验证正常
- [ ] Provider自动发现已安装的实例
- [ ] 会话目录管理和过期清理正常
- [ ] 项目图标解析正常

---

## 8. 风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| ACP协议文档不完整，实现难度大 | 参考PeakCode实现，必要时与Cursor团队沟通 |
| 迁移脚本与现有数据不兼容 | 提供数据备份和恢复机制，充分测试 |
| 大量投影表影响性能 | 使用索引优化，异步更新投影 |

---

**文档版本**: v2.0
**创建日期**: 2026-06-20
**最后更新**: 2026-06-20
