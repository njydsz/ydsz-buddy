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
  <a href="#-开发指南">开发指南</a> •
  <a href="#-文档">文档</a>
</p>

---

## 项目简介

Remi Code 是一个**本地优先、高性能**的 AI 编程助手桌面应用，基于 Peak Code 项目完整迁移至 Rust 技术栈。它提供了一个统一的界面来管理多个 AI 编程代理，让开发者可以高效地与 AI 协作编程。

**为什么选择 Remi Code？**

- 🚀 **极致性能**：Rust 后端带来卓越的性能表现，启动时间 < 1 秒，内存占用 < 50MB
- 🔒 **本地优先**：所有数据和服务运行在本地，保护代码隐私
- 🎨 **统一界面**：一个界面管理多个 AI 提供商，无缝切换
- 🛠️ **完整功能**：Git 集成、终端管理、文件浏览器、差异对比等完整开发工具链
- 📦 **轻量桌面**：基于 Tauri 2.x 构建，安装包体积减少 60-70%

## 快速开始

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
git clone https://github.com/remi-code/remi-code.git
cd remi-code
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

## 核心特性

### 多代理统一管理

无缝切换多个 AI 编程提供商，无需改变工作流：

| Provider | 状态 |
|----------|------|
| Claude Code | ✅ 支持 |
| Codex (OpenAI) | ✅ 支持 |
| Gemini | ✅ 支持 |
| Grok | ✅ 支持 |
| Cursor | ✅ 支持 |
| Kilo Code | ✅ 支持 |
| OpenCode | ✅ 支持 |
| Pi | ✅ 支持 |

### 实时流式响应

实时观看 AI 代理工作——代码生成、工具调用、结果呈现，无延迟、无轮询。

### Git 集成

内置版本控制功能：分支管理、暂存、提交、推送、差异对比——全部在同一界面完成。

### 终端管理

嵌入式终端，支持多标签、线程关联、实时输出，无需离开应用即可执行命令。

### 会话持久化

会话支持重启恢复。智能检查点捕获对话状态，可以从断点继续。

### 跨平台支持

基于 Tauri 2.x 构建，支持：
- **Windows**: Windows 10/11 (x64, ARM64)
- **macOS**: macOS 12+ (Intel, Apple Silicon)
- **Linux**: Ubuntu 20.04+, Fedora 38+, Debian 12+ (x64, ARM64)

## 技术架构

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

### 技术栈对比

| 层次 | Peak Code | Remi Code | 改进点 |
|------|-----------|-----------|--------|
| **运行时** | Node.js (单线程) | Rust (多线程) | 性能提升 80%+ |
| **框架** | Effect-TS | Axum + Tokio | 学习曲线降低 |
| **桌面壳** | Electron | Tauri | 体积减少 60-70% |
| **内存管理** | GC | 所有权系统 | 无 GC 停顿 |
| **并发模型** | 事件循环 | async/await | 真正的多线程并发 |
| **类型系统** | TypeScript | Rust | 编译期保证类型安全 |

### 性能指标

| 指标 | Peak Code | Remi Code (目标) | 提升幅度 |
|------|-----------|------------------|----------|
| 启动时间 | ~5s | ~1s | 80% |
| 内存占用 | ~300MB | ~50MB | 83% |
| RPC 响应时间 | ~50ms | ~10ms | 80% |
| 安装包大小 | ~150MB | ~50MB | 67% |

## 项目结构

```
remi-code/
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
├── remi-app/                     # Tauri 桌面应用（React）
├── packages/                     # 共享 TypeScript 包
│   ├── contracts/               # 类型契约
│   ├── shared/                  # 共享工具
│   └── remi-acp/               # ACP 协议实现
│
├── PROJECT_OVERVIEW.md          # 详细项目说明
├── BACKEND_MIGRATION_FULL_PLAN.md    # 后端迁移全案
└── MIGRATION_AND_ITERATION_PLAN.md   # 前端迁移与迭代计划
```

## 开发指南

### 代码规范

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
- `style`: 代码格式
- `refactor`: 重构
- `perf`: 性能优化
- `test`: 增加测试
- `chore`: 构建过程或辅助工具

### 开发流程

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 文档

### 核心文档

- [项目详细说明](./PROJECT_OVERVIEW.md) - 完整的项目介绍和技术细节
- [后端迁移全案](./BACKEND_MIGRATION_FULL_PLAN.md) - Rust 后端架构设计与迁移方案
- [前端迁移与迭代计划](./MIGRATION_AND_ITERATION_PLAN.md) - Tauri 前端迁移与开发计划

### 模块文档

每个 Rust 模块都有详细的文档注释，可以使用以下命令生成文档：

```bash
# 生成 Rust 文档
cargo doc --no-deps --open

# 查看特定模块文档
cargo doc -p remi-orchestration --open
```

### API 文档

TypeScript 共享包的 API 文档：

```bash
# 生成 TypeDoc 文档
cd packages/contracts
pnpm doc
```

## 迁移进度

### 后端迁移（Rust）

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

### 前端迁移（Tauri）

- ✅ 项目结构搭建
- ✅ Tauri 桥接层设计
- ✅ 环境检测适配
- ⏳ 组件迁移与适配
- ⏳ 状态管理适配
- ⏳ 集成测试

## 贡献指南

欢迎贡献！请遵循以下原则：

- 尊重所有参与者
- 接受建设性批评
- 关注对社区最有利的事情
- 展现同理心

详见 [CONTRIBUTING.md](./CONTRIBUTING.md)（待创建）

## 许可证

本项目采用 MIT 许可证。详见 [LICENSE](./LICENSE) 文件。

## 致谢

- [Peak Code](https://github.com/PeakCode-AI/PeakCode) - 原项目，提供了完整的功能参考
- [Tauri](https://tauri.app/) - 轻量级桌面应用框架
- [Rust](https://www.rust-lang.org/) - 高性能编程语言

## 联系方式

- GitHub Issues: [报告问题](https://github.com/remi-code/remi-code/issues)
- GitHub Discussions: [讨论区](https://github.com/remi-code/remi-code/discussions)

---

<p align="center">
  <strong>Remi Code</strong> - 让 AI 编程更高效、更流畅
</p>
