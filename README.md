<div align="center">

<img src="./ydsz-desktop/public/ydsz-buddy.png" alt="云顶数字 Buddy" width="128" />

# ydsz-buddy

### 一台桌面，Work + Code + Design 三引擎；17 家 AI Provider 自由切换；全部跑在本地 Rust 后端。

**AI 原生工作台 —— Work 模式做自动化办公，Code 模式做智能体开发，Design 模式做 UI 分析与原型生成**

<br />

<a href="https://github.com/njydsz/ydsz-buddy/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-22c55e?style=for-the-badge" /></a>
<a href="https://github.com/njydsz/ydsz-buddy/releases"><img alt="Version" src="https://img.shields.io/badge/version-0.3.0--beta-3b82f6?style=for-the-badge" /></a>
<a href="https://www.rust-lang.org/"><img alt="Rust" src="https://img.shields.io/badge/Rust-1.75%2B-f75035?style=for-the-badge&logo=rust&logoColor=white" /></a>
<a href="https://react.dev/"><img alt="React" src="https://img.shields.io/badge/React-18-61dafb?style=for-the-badge&logo=react&logoColor=black" /></a>
<a href="https://v2.tauri.app/"><img alt="Tauri" src="https://img.shields.io/badge/Tauri-2.x-24c8db?style=for-the-badge&logo=tauri&logoColor=white" /></a>
<a href="https://tauri.app/"><img alt="Platform" src="https://img.shields.io/badge/platform-Win%20%7C%20macOS%20%7C%20Linux-8b5cf6?style=for-the-badge" /></a>

<br />

[**快速开始**](#-快速开始) · [**架构**](#-架构) · [**特性矩阵**](#-核心特性) · [**Roadmap**](#-路线图) · [**竞品对比**](./COMPETITOR_ANALYSIS.md) · [**完善计划**](./DEVELOPMENT_PLAN.md)

<br />

[English](./README.md) · **简体中文**（本文件）

</div>

---

## 📑 目录

- [Ask ydsz](#-为什么是-2. 环境变量 YDSZ_BOOTSTRAP_TOKEN)
- [核心特性](#-核心特性)
- [项目截图](#-项目截图)
- [典型场景](#-典型场景)
- [多端布局](#-多端布局)
- [架构](#-架构)
- [技术栈](#-技术栈)
- [快速开始](#-快速开始)
- [项目结构](#-项目结构)
- [路线图](#-路线图)
- [性能指标](#-性能指标)
- [安全与隐私](#-安全与隐私)
- [贡献指南](#-贡献指南)
- [社区与支持](#-社区与支持)
- [常见问题 FAQ](#-常见问题-faq)
- [致谢](#-致谢)
- [许可证](#-许可证)

---

## 💡 Ask ydsz

2026 年 AI Agent 赛道出现明显收敛 —— Work Buddy、TRAE Work 等头部产品纷纷切向 **Work + Code + Design 三域合一**。但它们的"三模式"本质是按任务类型分入口、文件分散管理，且**重度依赖云端执行**。ydsz-buddy 的差异在于——

> **把"用 AI 写代码""用 AI 做办公""用 AI 做设计"放进同一个本地优先桌面工作台、同一套 CQRS + Event Sourcing 审计体系、同一套 Rust 后端进程，让 Agent 真正变成你的"数字员工"——而不是三个割裂的聊天窗口。**

| 行业现状 | ydsz-buddy 怎么做 |
|---|---|
| 头部产品（Work Buddy / TRAE Work）按模式分入口、文件分散 | ✅ **同一会话自由混用**，Work + Code + Design 无需切换窗口 |
| 竞品三模式**重度依赖云端执行**，文件需上传处理 | ✅ **本地 Rust 后端**执行，数据零上传、断网可用 |
| Agent 是黑盒，**不可回放、不可回滚、不可审计** | ✅ **CQRS + Event Sourcing**，31 类事件全链路可审计、可回放 |
| 各家只锁自家 1–5 家模型 | ✅ **17 家 Provider 统一接口**（国际 8 家 + 国产 9 家，自由切换） |
| 桌面工具吃资源（200–400MB） | ✅ **Tauri + Rust 后端**：启动 < 1.5s、内存 < 200MB、包体 ~10MB |
| 失败任务无人兜底 | ✅ **FailedTaskQueue + 95% 自动重试 + 熔断器** |
| 移动端缺位 | 🟡 移动端已开发（18+ 页面），推送网关对接中（[路线图](#-路线图)） |

> 想看详细的"竞品做不到但我们能做到"的对比，请阅读 [COMPETITOR_ANALYSIS.md](./COMPETITOR_ANALYSIS.md)。

---

## ✨ 核心特性

### 🤖 AI & 编排

- **17 家 AI Provider 统一适配** — 国际 8 家（Claude / Codex / Cursor / Gemini / Grok / Kilo / OpenCode / Pi）+ 国产 9 家（GLM / DeepSeek / Moonshot / Qwen / Mimo / MiniMax / Doubao / Ernie / Hunyuan），统一会话历史、统一上下文窗口计量。
- **CQRS + Event Sourcing 编排引擎** — 31 类领域事件、Checkpoint 快照、任意时刻回放与回滚，**行业唯一**。
- **5 态 InteractionMode** — `Chat` / `Plan` / `Agent` / `Review` / `Task` 共存，按对话/线程粒度自由切换。
- **Worktree 自动托管** — 多 Agent 并行开发，自动生命周期管理，**对比 Codex/Claude Code/OpenCode 是显著差异化**。
- **Review 模式（InteractionMode 独有）** — 围绕 diff 评审的专用交互，Code 域审阅效率提升。

### 🛠 能力 & 工具

- **Composer Skill 提及节点** — `@office` / `@scheduler` / `@browser` / `@lsp` / `@indexer` 一键触发。
- **Office 全套** — docx / xlsx / pdf / pptx 读写；**PPT 自动版式生成**、**HTML 原型生成**。
- **浏览器自动化 + Design Mode** — 内置多 Tab 浏览器（CDP）+ 截图注入 Composer + **UI 元素检查 + CSS 提取** 注入 Agent 改代码。
- **HTML 原型生成** — `ydsz-code/src/html_proto/mod.rs` 根据对话描述生成可运行前端原型。
- **定时任务（Scheduler）** — CRON 表达式 + 内置 3 个常用模板（日报/周报/数据同步）。
- **代码语义索引（Indexer）** — 跨工程符号检索 + `@codebase` 提及 + AST-Grep 结构化搜索（✅ 已实现）。
- **LSP 集成** — TypeScript / Python / Rust / Go / Java / C# / C++ 七语言预置 ✅，IDE 级跳转 / 引用 / 重命名 / 补全 / 格式化。
- **Git Worktree 隔离** — 同一项目多线程隔离，并行开发互不干扰。

### 🎨 Design 域（🟡 已有基础，文生图待补齐 P0）

- **Browser Design Mode** — 浏览器内嵌设计检查模式，抓取元素样式 → 注入 Agent 对话进行 UI 分析和代码修改。
- **HTML Prototype 生成** — 对话描述需求 → Agent 生成可运行 HTML 原型文件。
- **设计 Skill 市场** — 规划中：海报生成、Logo 设计、PPT 配图等 Skill 模板（见 [COMPETITOR_ANALYSIS.md](./COMPETITOR_ANALYSIS.md) D1 缺口）。

### 📦 交付物 & 审计

- **产物审查面板（ArtifactsPanel）** — Spec / Diff / Preview / Terminal / Files 五件套一站式审阅。
- **Plan 文档落盘** — `spec.md` / `plan.md` 自动写盘到 `.ydsz/plans/`，支持版本管理。
- **审计导出（行业首创）** — 时间/线程过滤 → 导出为 JSON / CSV / Markdown，**事件溯源能力产品化**（✅ 前后端均已实现）。
- **对话回滚** — 任意轮次回退，含文件状态 + 上下文状态。
- **事件回放** — 慢动作播放器式逐步回放（Play/Pause/Step/速度档位/进度条）。
- **跨线程上下文交接（Handoff）** — 跨线程搬运上下文与产物。

### 🖥 桌面体验

- **本地优先** — 全本地 SQLite WAL 存储，启动 < 1.5s，空闲内存 < 200MB，**断网可用**。
- **完整可达性** — 快捷键面板 / 高对比度主题 / 屏幕阅读友好（v0.5 目标 100%）。
- **失败兜底** — `ErrorBoundary` + `FailedTaskQueue` + 智能重试。
- **空状态/骨架屏** — 15+ 空状态组件 + 5 类骨架屏，新手 5 分钟跑通首任务。
- **首次启动引导** — 5 步 OnboardingTour。
- **多语言** — 中文 / English 双语 i18n。
- **主题/字体** — `ThemePackEditor` + 多字体支持。
- **What\'s New 流** — 内置版本更新公告面板。
- **语音输入** — `ComposerVoiceButton` 录音 + 转写。

### 🔌 生态 & 扩展

- **MCP 协议** — stdio 传输 ✅ + SSE 传输 ✅ + 前端配置面板 ✅。
- **插件系统** — 沙箱化插件运行时（`PluginsView` / `PluginLibrary`）。
- **技能市场（Skill Market）** — 本地 Skill 扫描 + GitHub/Marketplace 一键安装 ✅（前端浏览页接入中）。
- **Repo Wiki / 知识引擎** — 项目级知识沉淀 ✅（后端完整，前端接入中）。
- **自定义 Provider BYOK** — 接入任何兼容 OpenAI/Anthropic 协议的私有部署 ✅（adapter 已实现，配置 UI 待补齐）。

---

## 📸 项目截图

> 以下截图来自 `ydsz-desktop` 桌面端实际界面，存放在 [`docs/screenshots`](./docs/screenshots)。

### Work 模式

| Work 首页 | Work 首页（细节） |
|---|---|
| ![Work 首页](./docs/screenshots/home-work.png) | ![Work 首页细节](./docs/screenshots/home-work-01.png) |

### Code 模式

| Code 首页 | Code 首页（细节） |
|---|---|
| ![Code 首页](./docs/screenshots/home-code.png) | ![Code 首页细节](./docs/screenshots/home-code-02.png) |

### Design 模式

| Browser Design Mode | HTML 原型生成 |
|---|---|
| 浏览器内嵌设计检查 → 元素 + CSS 注入 Agent | 自然语言描述 → 可运行 HTML 原型文件 |

### Skill 与设置

| Skill 面板 | 设置（中文） | 设置（English） |
|---|---|---|
| ![Skill 面板](./docs/screenshots/homo-skill.png) | ![设置（中文）](./docs/screenshots/setting-zh.png) | ![设置（English）](./docs/screenshots/setting-en.png) |

---

## 🎬 典型场景

| 场景 | 一句话描述 | 涉及能力 |
|---|---|---|
| **AI 写周报** | 选文件夹 → `@office pdf` → 一键生成含数据图表的 PDF 周报 | Skill 提及 + Office + Indexer |
| **会议纪要转 PPT** | 拖入会议录音转写稿 → `@office pptx` → 自动版式 PPT | Skill 提及 + PPT 自动版式 + Worktree |
| **跨工程代码评审** | 选仓库 → `Review` 模式 → 跨服务定位调用方 + 输出评审报告 | InteractionMode::Review + Indexer + LSP + Worktree |
| **UI 分析 → 代码修改** | Browser Design Mode 选中元素 → 注入 Agent → 一键改代码 | Browser + Design Mode + LSP |
| **自然语言生成 HTML 原型** | "帮我做一个登录页" → Agent 生成可运行 HTML 原型文件 | HTML Prototype Generator |
| **24h 监控任务** | 配 CRON → Agent 循环抓数据 → 自动写周报发飞书 | Scheduler + Browser + Office + 推送（v0.5） |
| **团队知识沉淀** | 跑完一批任务 → Repo Wiki 自动汇总"项目规则 / 常见坑 / 决策记录" | Repo Wiki（v0.5） |
| **多 Agent 并行修 Bug** | 同一项目 5 个 Worktree 并行修 5 个 Bug，AI 自动 commit / push / 提 PR | Git Worktree + GitHub CLI + AI commit message |
| **远程审批** | 手机推送 → 一键通过/拒绝 Plan 审批（v0.6 移动端） | 推送网关 + 移动端 |

---

## 🧩 多端布局

ydsz-buddy 采用 **"桌面端为主、移动端为辅"** 的双端产品形态。**所有 AI 推理、文件操作、终端、Git Worktree 等重活跑在桌面端的 Rust 后端**；移动端不重复实现业务逻辑，定位为 **"桌面端的远程驾驶舱"**。

| 端 | 包名 | 形态 | 主要职责 | 状态 |
|---|---|---|---|---|
| **桌面端** | `ydsz-desktop` | Tauri 2.x 桌面应用 | 完整 Work/Code 双模式 + 全部能力 | ✅ P0 主线 |
| **移动端** | `ydsz-mobile` | Tauri Mobile (iOS + Android) | 会话/审批/定时/时间线/远程轻量操作 | 🟡 P3 规划（v0.6 立项） |
| **后端** | `ydsz-provider` | Rust 二进制 | WebSocket JSON-RPC 2.0 服务，**双端共享** | ✅ 共享 |
| **CLI** | `ydsz-work` | Rust 命令行 | 启动后端、运维、脚本化 | ✅ 共享 |

> **代码共享策略**：移动端与桌面端**完全不共享代码**，各自独立实现。后端通过 WebSocket JSON-RPC 协议与两端通信，协议层由 `ydsz-provider` 严格定义。

---

## 🏗 架构

```
┌──────────────────────────┐         ┌──────────────────────────┐
│  ydsz-desktop (Tauri 2.x)│         │   ydsz-mobile (Tauri     │
│  React 18 + Vite 5       │         │   Mobile, iOS + Android) │
│  Work + Code + Design    │         │   会话/审批/定时/时间线   │
└────────────┬─────────────┘         └──────────────┬───────────┘
             │ Tauri IPC                              │ Tauri IPC
             ▼                                         ▼
┌────────────────────────────────────────────────────────────────┐
│                 Rust 后端 (Tokio + Axum)                       │
│  ├── WebSocket Server (JSON-RPC 2.0) — 双端共享                │
│  ├── Orchestration Engine (CQRS + Event Sourcing)              │
│  │     └── 31 类领域事件 + Checkpoint + 可回放                  │
│  ├── Provider Service (17 家 Adapter, 国际 8 + 国产 9)         │
│  ├── Git Service (Worktree + PR + AI commit message)           │
│  ├── Terminal Manager (PTY + xterm.js)                         │
│  ├── Browser Manager (CDP + browser-use pipe + Design Mode)    │
│  ├── LSP / Indexer / Repo Wiki / Scheduler / Office            │
│  ├── HTML Prototype Generator (html_proto)                     │
│  ├── Push Gateway (国内厂商: 极光/友盟)                         │
│  └── Persistence (SQLite WAL)                                  │
│              │  JSON-RPC / stdio                                │
│              ▼                                                 │
│  AI Provider Runtimes (Claude / Codex / Cursor / Gemini / …)   │
└────────────────────────────────────────────────────────────────┘
```

### 技术栈

| 层 | 技术 |
|---|---|
| 桌面端前端 | React 18、Vite 5、TanStack Router、TanStack Query、Tailwind CSS 4、shadcn/ui、xterm.js、Lexical |
| 桌面壳 | Tauri 2.x（WebView2 / WKWebView / WebKitGTK） |
| 移动端 | Tauri Mobile（iOS WebKit + Android WebView），与桌面端**不共享代码** |
| 推送 | 极光 / 友盟 等国内厂商（推送到达率优先） |
| 后端 | Rust、Tokio、Axum、rusqlite、reqwest |
| 架构 | CQRS、Event Sourcing、Adapter Pattern、Reactor Pattern |
| 测试 | Vitest（前端）、cargo test + insta（Rust）、Playwright（端到端） |

### 项目结构（v0.3.0 收敛后 8 crate）

```
ydsz-buddy/
├── ydsz-core/        核心领域模型（RuntimeMode / InteractionMode / 事件 / 命令）
├── ydsz-server/      共享基础设施（persistence / config / auth / terminal / workspace / telemetry）
├── ydsz_core:/        编排引擎（CQRS + Event Sourcing + Checkpoint）
├── ydsz-flow/    AI Provider 适配（8 家 Adapter + ProviderService）
├── ydsz-code/        Code 域能力（git / lsp / indexer / repo_wiki / pptx / html_proto）
├── ydsz-shared/        Work 域能力（scheduler / office / browser）
├── ydsz-provider/      WebSocket JSON-RPC 服务器 + 15 类 RPC 方法（双端共享）
├── ydsz-work/         CLI 入口
├── ydsz-desktop/     Tauri 2.x 桌面应用（前端 + 壳）
└── ydsz-mobile/      Tauri Mobile 移动端 — 规划中 (P3)
```

---

## 🚀 快速开始

### 系统要求

| 项 | 要求 | 说明 |
|---|---|---|
| **操作系统** | Windows 10+ / macOS 12+ / Ubuntu 22.04+ | 桌面端三端同构 |
| **Rust** | 1.75+ | 安装 [rustup](https://rustup.rs) |
| **Node.js** | 22+ | 推荐使用 [fnm](https://github.com/Schniz/fnm) 或 [nvm](https://github.com/nvm-sh/nvm) |
| **包管理器** | pnpm 9+ | `npm i -g pnpm` |
| **Git** | 2.30+ | Worktree 功能依赖 |
| **磁盘空间** | 至少 2 GB 可用 | 含 Rust 工具链 + 依赖 |
| **内存** | 建议 8 GB+ | 桌面端运行约 200 MB |

### 安装

```bash
# 1. 克隆仓库
git clone https://github.com/njydsz/2. 环境变量 YDSZ_BOOTSTRAP_TOKEN.git
cd ydsz-claw

# 2. 安装前端依赖
pnpm install

# 3. 编译后端（首次需要 5–10 分钟）
cargo build --release
```

### 启动开发模式

```bash
# 终端 1：启动 Rust 后端（带热重载）
cargo run --bin ydsz-work -- serve --port 3773

# 终端 2：启动桌面应用（Tauri 自动连接后端）
cargo tauri dev
```

### 平台特定说明

<details>
<summary><b>🪟 Windows</b></summary>

- 推荐使用 **PowerShell 7+** 或 **Windows Terminal**
- 安装 [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)（Win11 预装）
- 如需 LSP 预置：Node.js（TS LSP）、Python 3.10+（Pyright）、Rust toolchain（rust-analyzer）、Go 1.21+

</details>

<details>
<summary><b>🍎 macOS</b></summary>

- 需要 Xcode Command Line Tools：`xcode-select --install`
- Apple Silicon 与 Intel 同构
- 如遇"未签名"提示：系统设置 → 隐私与安全性 → 仍要打开

</details>

<details>
<summary><b>🐧 Linux</b></summary>

- 依赖：`libwebkit2gtk-4.1-dev`、`libssl-dev`、`libgtk-3-dev`、`libayatana-appindicator3-dev`、`librsvg2-dev`
- Ubuntu 一键安装：

  ```bash
  sudo apt install -y libwebkit2gtk-4.1-dev libssl-dev libgtk-3-dev \
      libayatana-appindicator3-dev librsvg2-dev pkg-config build-essential
  ```

</details>

### 验证安装

```bash
# 运行 Rust 单元测试
cargo test --workspace

# 运行前端测试
pnpm test

# 类型检查
pnpm typecheck
```

构建桌面端发行包：

```bash
cargo tauri build
# 产物路径：ydsz-desktop/src-tauri/target/release/bundle/
```

---

## 🛣 路线图

当前版本 **v0.4.0 Beta**，整体完成度约 88%（架构 95%、后端功能 92%、前端 UI 90%），P0 三件套已全部清零。详细分周排期见 [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md)。

### 版本节奏

| 版本 | 时间 | 主题 | 关键里程碑 |
|---|---|---|---|
| **v0.4** | W1–W8（2026.07–08） | 产品化空缺补齐 + 壁垒放大 | 审计导出 ✅ / 事件时间线 ✅ / Plan 落盘 ✅ / 产物面板 ✅ / 子任务侧栏 ✅ / MCP stdio + SSE ✅ / 5 Skill 注册 ✅ / 3 Provider e2e ✅ / **P0 三件套全部清零（Edit Prediction + OS Keyring + 细粒度目录授权）** / Skill Marketplace 前端 ✅ / Repo Wiki 前端 ✅ / Goal+Quest 前端 ✅ / Review Mode ✅ / AST-Grep 卡片 ✅ / DAP 调试器前端 ✅ / BYOK 配置 UI ✅ |
| **v0.5** | W9–W20（2026.09–11） | Work 域质量打磨 + Code 域生态 + **Design 域补齐** | Office 模板库 / PPT 高级版式透出 / Word 表格样式 / Excel 公式图表 / **文生图能力（P0）** / Extension 前端管理 UI / 推送网关真机联调 / SSH known_hosts / 大规模向量库 HNSW |
| **v0.6** | W21–W32（2026.12–2027.02） | 多端 + 生态 | 移动端 TestFlight/商店双发 / 移动端 SchedulerPage 远程编辑 / 浏览器自动化录制回放 / Extended Thinking 适配 |

### v0.4 核心任务（8 周，2026.07–08）

| 线 | 任务 | 周 | 优先级 |
|---|---|---|---|
| 集成 | ✅ 调度器 / LSP / Indexer / Office / Browser 接入 ServiceContainer + 编排引擎事件闭环 | W1–W2 | 🔴 P0 |
| Skill | ✅ 5 个能力注册为 Skill（Office / LSP / Indexer / Scheduler / Browser），Composer 提及节点全打通 | W2 | 🔴 P0 |
| 验证 | ✅ Provider 三家 e2e Turn 回归（Claude / DeepSeek / Gemini）+ 性能压测 | W3–W4 | 🔴 P0 |
| 差异化 | ✅ 事件时间线 Tab + 任意回放 + 审计导出（ES 产品化，头号壁垒） | W5–W6 | 🟡 P0 |
| 生态 | ✅ MCP Client Rust 端 stdio + SSE 传输 + 前端配置 UI | W5–W6 | 🟡 P0 |
| 收口 | 端到端冒烟 + 公开 Beta（Windows/macOS/Linux 三端） | W7–W8 | 🟡 P0 |

### 移动端进度（`ydsz-mobile`）

| 阶段 | 任务 | 状态 |
|---|---|---|
| 立项 | `ydsz-mobile/` 脚手架（Tauri Mobile 2.x） | ✅ 已完成 |
| 协议 | 复用 `ydsz-provider` WebSocket JSON-RPC，移动端只读 RPC 子集 | ✅ 已完成 |
| 页面 | 会话列表 + 消息查看 + 审批 + 定时任务 + 事件时间线 + Handoff + Terminal + Diff 等 18+ 页面 | ✅ 已完成 |
| 配对 | QR Pairing 配对服务（code + token + service） | ✅ 已完成 |
| 推送 | 桌面端 → 极光/友盟 → 移动端 推送网关 | 🟡 框架已搭建，实际对接中 |
| 发布 | TestFlight / 国内安卓商店双发 | 🔲 待完成 |

### 当前状态

| 已完成 | 进行中 | 待开发 |
|---|---|---|
调度器 / Office / LSP / Indexer / Browser (Tauri 命令)、17 Provider 适配（国际 8 + 国产 9）、Diff 面板、终端、Git Worktree、检查点、浏览器面板、Plan/审批、Composer、Skill 扫描、TaskSidebar、ArtifactsPanel、FailedTaskQueue、ErrorBoundary、OnboardingTour、空状态组件库、骨架屏、ProviderDiscovery、WorkspaceClassifier、undoManager、DiagnosticsPanel、事件时间线 + 事件回放、审计导出（JSON/CSV/Markdown）、MCP stdio + SSE 客户端 + 前端配置面板、5 Skill 注册（office/scheduler/browser/lsp/indexer）、Provider e2e 回归测试（Claude/DeepSeek/Gemini）、AST-Grep 结构化搜索 + Composer 卡片、Repo Wiki 前端接入、Plan 文档落盘、Checkpoint 崩溃恢复、代码编辑器 LSP 集成（hover/定义/引用/重命名/补全/格式化）、LSP 七语言预置（TS/Python/Rust/Go/Java/C#/C++）、向量嵌入前端存储（IndexedDB）、后端 Embedding API 客户端、Office PPT 自动版式增强、DataSandbox 数据可视化、**Browser Design Mode ✅**（元素检查 + CSS 提取注入 Agent）、**HTML Prototype Generator ✅**（html_proto 模块）、**Edit Prediction 前端 Monaco 桥接（P0 ✅）**、Skill Marketplace 前端浏览页 ✅、DAP 调试器前端面板 ✅、Goal Engine + Quest Engine 前端面板 ✅、Extension 扩展系统（后端完整，前端基础）、模糊搜索、Provider 熔断器、模型注册表三层架构、Endpoint 镜像回退、移动端 18+ 路由页面、QR Pairing 配对服务、移动端推送通道框架、**Provider 凭证 OS Keyring 加密（P0 ✅）+ Settings UI 切换**、**细粒度目录授权（P0 ✅）+ SandboxAccessGuardHost 全链路**、代码执行沙箱（3 级安全策略）、Web 搜索前端深度集成、文件系统工具、项目规则 + 团队规则加载器、多文件协调编辑、Build/Test Runner、语音文本润色、**BYOK 配置 UI ✅**、Review Mode Diff 专用视图 ✅、本地 Background Agent | **文生图能力 🔴 P0**（对齐 Work Buddy Ardot + TRAE Work Design）、Office 模板库、PPT TwoColumn/Table 版式透出、Extension 前端管理 UI 完善、大规模向量库 HNSW 升级、SSH known_hosts 校验、Linear API Key 持久化、推送网关真机联调、Design Skill 市场（海报/Logo/PPT 配图）| 极光/友盟推送实际对接、Extension 前端完善、Extended Thinking 适配、端到端冒烟测试三端、公开 Beta 发布、移动端 TestFlight/商店双发、Background Agent 云端形态、协作编辑、Cloud Agent |

---

## 📊 性能指标

> 数据来自 `v0.3.0-beta` 在 macOS Apple M2 / 16 GB 设备上的本地基准测试。

| 指标 | v0.3 现状 | v0.4 目标 | v0.5 目标 |
|---|---|---|---|
| 启动到可交互 | ~1.2 s | < 1.2 s | **< 1.0 s** |
| 空闲内存占用 | ~200 MB | < 180 MB | **< 150 MB** |
| Diff 计算（P95） | < 600 ms | < 500 ms | **< 300 ms** |
| 帧率（P95） | 58 fps | 60 fps | **60 fps 稳定** |
| Tauri 命令 P99 | 200 ms | 150 ms | **< 100 ms** |
| 失败任务自动恢复率 | 90% | 95% | **98%** |
| 离线可用度 | 100% | 100% | **100%** |

详细性能规划与压测脚本见 [DEVELOPMENT_PLAN.md §4](./DEVELOPMENT_PLAN.md)。

---

## 🤖 AI 生产占比指标

> **指标定义**(v0.5 起) — 衡量"当前 workspace 中,代码归属在多大比例上由 AI 产出"。

### 公式

```text
ai_lines      = Σ turn.stats.ai_authored_additions     where turn.completed_at within window
human_lines   = Σ turn.stats.human_authored_additions   where turn.completed_at within window
mixed_lines   = Σ turn.stats.mixed_authored_additions   where turn.completed_at within window
total_lines   = ai_lines + human_lines + mixed_lines
ai_share      = ai_lines / total_lines                  (无数据时 = null)
```

### 落地位置

| 端 | 入口 | 展示 |
|---|---|---|
| 桌面端 | `ThreadStatusBar` / `Settings → Analytics` | 24h / 7d / 30d 三窗口进度条 + AI 占比徽标 |
| 移动端 | `ProviderUsagePage` 顶部 AI Share 卡片 | 24h / 7d / 30d 三窗口进度条,30s 拉服务端快照 |
| 后端 | `orchestration.getTurnAiShareSnapshot` RPC | 返回 `TurnAiShareSnapshot { windows, generatedAtMs, isEmpty }` |

### 大厂基线

- **数据源**:`ydsz_core:::checkpoint::query::CheckpointDiffQuery::list_turn_diff_summaries_with_timestamps`
  一次性返回每个 turn 的 `(created_at_ms, DiffStats)`,避免重复扫 git
- **缓存**:服务端 30s TTL,客户端 60s 拉一次,与 `provider_usage_snapshot` 一致
- **错误降级**:任一 thread 出错时跳过,不影响整体聚合
- **P2 兜底语义**:在 `CheckpointFile.author` 接通 review 流程之前,所有新增行默认归 AI;
  后续会在 P3 接 `user` / `mixed` 细分(参考 [`ydsz-core/src/models.rs`](./ydsz-core/src/models.rs)
  的 `normalize_checkpoint_file_author`)
- **埋点**:移动端在快照更新时通过 `monitor.captureMetric` 上报
  `turnAiShare.30d.share` / `turnAiShare.30d.aiLines` / `turnAiShare.30d.totalLines`

---

## 🔐 安全与隐私

- **本地优先** — 数据默认存储于本机 SQLite（路径：`%APPDATA%/ydsz-buddy/`），不上传云端。
- **数据沙箱** — 启动时一次性授权目录范围，跨目录访问需用户确认（v0.5 起细粒度授权）。
- **审计导出** — 全链路事件可审计、可回放、可导出。
- **Provider 凭证** — 仅存于本地，使用 OS Keyring 加密（v0.5 起）。
- **崩溃数据** — 默认不上传崩溃日志，可在 `Settings → Privacy` 中开启。
- **第三方依赖** — 全部走 `pnpm` / `cargo` 官方源，无私有镜像注入。

详细安全策略与漏洞披露流程见 [GitHub Security Advisories](https://github.com/njydsz/ydsz-buddy/security/advisories)（首次披露前请勿公开 Issue）。

---

## 🤝 贡献指南

我们欢迎所有形式的贡献：功能、修复、文档、设计、Issue 反馈。ydsz-buddy 采用 **大厂风格的"清单 + 自动化"流程**：

### 开发流程

1. **Fork 仓库** → 创建 feature 分支（命名：`feat/<scope>-<short-desc>`，如 `feat/skill-market`）
2. **提交代码** → 遵循 [Conventional Commits](https://www.conventionalcommits.org/)（**中文提交信息**）
3. **本地自检**：

   ```bash
   # Rust
   cargo fmt && cargo clippy -- -D warnings && cargo test

   # 前端
   pnpm lint && pnpm typecheck && pnpm test
   ```

4. **提交 PR** → 使用 [PULL_REQUEST_TEMPLATE.md](./.github/PULL_REQUEST_TEMPLATE.md) 描述变更
5. **CI 全绿** → 等待 Code Review
6. **合并** → Squash Merge，PR 标题作为 commit 标题

### Issue 模板

- 🐛 [Bug 报告](./.github/ISSUE_TEMPLATE/bug_report.md)
- 💡 [功能建议](./.github/ISSUE_TEMPLATE/feature_request.md)

### 行为准则

- 尊重他人、就事论事、保持技术导向
- 拒绝任何形式的歧视、骚扰、不当言论
- 详细见 [Contributor Covenant 2.1](https://www.contributor-covenant.org/zh-cn/version/2/1/code_of_conduct/)

### 提交信息规范（中文）

根据项目根目录 `.trae/rules/git-commit-message.md` 规则，**使用中文生成提交信息**：

```
<type>(<scope>): <中文摘要>

<中文正文：为什么改、改了什么、影响范围>

<中文页脚：关联 Issue / Breaking Change>
```

常用 type：`feat` / `fix` / `refactor` / `docs` / `test` / `chore` / `perf` / `style` / `build` / `ci`

### 模块 Owner

详见 [CODEOWNERS](./.github/CODEOWNERS)。

---

## 💬 社区与支持

| 渠道 | 用途 | 响应时间 |
|---|---|---|
| 🐛 [GitHub Issues](https://github.com/njydsz/ydsz-buddy/issues) | Bug 报告、功能建议 | 1–3 个工作日 |
| 💬 [GitHub Discussions](https://github.com/njydsz/ydsz-buddy/discussions) | 用法讨论、Show and Tell | 社区驱动 |
| 🔒 [Security Advisories](https://github.com/njydsz/ydsz-buddy/security/advisories) | 安全漏洞披露 | 24 小时内 |
| 📧 Email | 商务合作 | 1 周 |

---

## ❓ 常见问题 FAQ

<details>
<summary><b>ydsz-buddy 和 Codex / Claude Code 是什么关系？</b></summary>

ydsz-buddy 是**面向桌面端的统一工作台**，可以**同时**接入 Codex / Claude / Cursor / Gemini / Grok / Kilo / OpenCode / Pi 八家 Provider。Codex 是 OpenAI 出品的纯 CLI / SDK；Claude Code 是 Anthropic 出品的纯 CLI；ydsz-buddy 的差异化是**统一抽象 + Work/Code 双域 + 本地优先 + 事件可审计**。
</details>

<details>
<summary><b>和 Work Buddy / TRAE Work / Kimi Work / Qoder 相比有什么不同？</b></summary>

**Work Buddy**（腾讯）月访问 2097 万，背靠腾讯生态，支持移动端全覆盖 + Claw 远程控制 + Ardot 设计集成；**TRAE Work**（字节跳动）从 TRAE IDE 拆出独立办公版，内置 40 万字工作知识库。ydsz-buddy 的差异：

- **本地优先**：竞品三模式重度依赖云端，ydsz 全部 Rust 后端本地执行、**零上传**
- **三域自由混用**：竞品按模式分入口，ydsz 同一会话内 Work + Code + Design 自由切换
- **事件审计**：竞品不具备，ydsz 的 CQRS + Event Sourcing 是**行业唯一**
- **17 家 Provider**：Work Buddy 5+ 家、TRAE Work 4+ 家，均无法自由切换国际主流模型
- **Worktree 自动托管**：多 Agent 并行开发自动生命周期管理

详细对比见 [COMPETITOR_ANALYSIS.md](./COMPETITOR_ANALYSIS.md)。
</details>

<details>
<summary><b>Design 模式能做什么？和 Work Buddy 的设计创意模式有什么区别？</b></summary>

ydsz-buddy 当前提供两种 Design 能力：

1. **Browser Design Mode**：在内置浏览器中检查 UI 元素、提取 CSS → 注入对话让 Agent 帮你改代码
2. **HTML Prototype 生成**：用自然描述需求（如"做一个登录页"），Agent 直接生成可运行的 HTML 原型文件

**与 Work Buddy 设计创意模式的区别**：Work Buddy 集成了 Ardot 设计平台 + Miora AI 创意工作室，支持文生图、海报生成、Logo 设计、品牌 IP 全案等"从零出图"场景（9 大方向）。ydsz 目前更侧重"分析现有 UI → 改代码"的开发者工作流，文生图/UI 出图已列入 P0 待补齐（见 [COMPETITOR_ANALYSIS.md](./COMPETITOR_ANALYSIS.md) D1 缺口）。

简而言之：Work Buddy 设计 = "从零到视觉稿"，ydsz-buddy 设计 = "从视觉分析到可运行代码"。补完文生图后两者会进一步收窄差距。
</details>

<details>
<summary><b>断网能用吗？</b></summary>

**能**。除 AI 推理外（需联网），所有功能（Composer、Skill 库、文件操作、终端、Git、Diff、产物审查、审计导出、任务调度）均**完全离线可用**。详见 [DEVELOPMENT_PLAN.md §4](./DEVELOPMENT_PLAN.md) 的 `useNetworkStatus` 实现。
</details>

<details>
<summary><b>数据存哪里？安全吗？</b></summary>

数据默认存储在本地 SQLite（路径：`%APPDATA%/ydsz-buddy/` 或 `~/Library/Application Support/ydsz-buddy/`），**完全本地、零上传**。所有 AI Provider 凭证仅存在 OS Keyring，**加密保存**。v0.5 起支持导出全链路审计。
</details>

<details>
<summary><b>是否支持私有化部署？</b></summary>

v0.6 起支持 **BYOK（Bring Your Own Key）** 与 **自定义 Provider** 配置，可对接任何兼容 OpenAI / Anthropic 协议的私有部署。
</details>

<details>
<summary><b>License 是？商用可以吗？</b></summary>

本项目采用 **MIT License**，**可以商用**。详见 [LICENSE](./LICENSE)。
</details>

<details>
<summary><b>为什么不用 Electron？</b></summary>

Tauri 2.x 用 Rust + 系统 WebView，**包体积比 Electron 小 80%+、内存占用低 70%+、启动快 3 倍**。这是 云顶数字 Buddy browser"启动 < 1.5s、内存 < 200MB"的关键。
</details>

<details>
<summary><b>怎么从 v0.3 升级到 v0.4？</b></summary>

v0.3 → v0.4 不涉及数据库 schema breaking change，自动迁移。如遇问题请发 Issue，附 `app.log` 与 `migrations.log`。
</details>

---

## 🙏 致谢

ydsz-buddy 的诞生离不开以下开源项目与灵感来源：

### 技术底座

- [Tauri](https://tauri.app/) — Rust 桌面应用运行时
- [React](https://react.dev/) · [Vite](https://vitejs.dev/) · [TanStack Router/Query](https://tanstack.com/) — 前端三件套
- [shadcn/ui](https://ui.shadcn.com/) · [Tailwind CSS](https://tailwindcss.com/) — UI 设计体系
- [Rust](https://www.rust-lang.org/) · [Tokio](https://tokio.rs/) · [Axum](https://github.com/tokio-rs/axum) — 后端基础
- [xterm.js](https://xtermjs.org/) · [Lexical](https://lexical.dev/) — 富文本与终端
- [rusqlite](https://github.com/rusqlite/rusqlite) — 嵌入式数据库

### 设计灵感

- [OpenAI Codex](https://openai.com/blog/openai-codex) · [Anthropic Claude Code](https://www.anthropic.com/claude-code) — Code 域对标
- [OpenCode](https://github.com/sst/opencode) — 开源多 Provider 范式
- [Kimi Work](https://kimi.moonshot.cn/) · [TRAE Work](https://www.trae.ai/) · [Qoder](https://qoder.com/) · [Work Buddy](https://workbuddy.qq.com/) — Work + Code + Design 三域对标
- [Zed](https://zed.dev/) · [Lapce](https://lapce.dev/) — 高性能桌面编辑器思路
- [VS Code](https://code.visualstudio.com/) · [JetBrains](https://www.jetbrains.com/) — 产品打磨细节
- [Ardot](https://www.ardot.ai/) · [Midjourney](https://www.midjourney.com/) · [FLUX](https://blackforestlabs.ai/) — Design 域视觉生成灵感（规划中）

### 团队

云顶数字 Buddy 在整个 为什么是 云顶数字 Buddy维护，**感谢所有 [contributors](https://github.com/njydsz/ydsz-buddy/graphs/contributors) 的贡献**。

---

## 📄 许可证

[MIT](./LICENSE) © 2026 云顶数字

```
MIT License — 自由使用、修改、分发、商用，但请保留版权与许可声明。
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
```

---

<div align="center">

**[⬆ 回到顶部](#2. 环境变量 YDSZ_BOOTSTRAP_TOKEN)**

如果 ydsz-buddy 对你有帮助，请点一个 ⭐️ 支持我们！

由 云顶数字团队 用心打造.

</div>
