<h1 align="center">云顶数字工作台（Ydsz Worker）</h1>

<p align="center">
  <strong>会思考，会干活，陪企业成长的智能伙伴</strong>
</p>

<p align="center">
  <a href="https://www.python.org/downloads/"><img alt="Python 3.12+" src="https://img.shields.io/badge/python-3.12%2B-blue?logo=python&logoColor=white" /></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green" /></a>
  <a href="https://pypi.org/project/ydsz-worker/"><img src="https://img.shields.io/pypi/v/ydsz-worker" alt="PyPI" /></a>
  <a href="https://github.com/astral-sh/ruff"><img alt="Code Style: Ruff" src="https://img.shields.io/badge/code%20style-ruff-000000?logo=ruff&logoColor=white" /></a>
</p>

<p align="center">
  <a href="#-亮点">亮点</a> ·
  <a href="#-概述">概述</a> ·
  <a href="#-核心技术">核心技术</a> ·
  <a href="#-功能特性">功能特性</a> ·
  <a href="#-规划">规划</a> ·
  <a href="#-快速开始">快速开始</a> ·
  <a href="#-目录">目录</a>
</p>

<p align="center">
  <a href="README.md">English</a> · <b>中文</b>
</p>

---

**云顶数字工作台（Ydsz Worker）** 是一个开源、自托管的企业级 AI 助手平台。它不仅是工具，更是可并行运作的智能伙伴——通过多 Agent 架构，为团队和企业构建既独立又协作的数字工作环境。对话即操作，配置即能力，所有数据完全留存在你自己的机器上。

借助飞书、钉钉、企业微信、QQ、微信等 IM 平台与 Agent 对话；通过**专家库**一键创建专业角色，通过 **Connector**（OAuth + MCP）接入外部服务，通过 **ACP** 与 IDE / 终端 AI 工具双向协作。

## ✨ 亮点

| | 特性 | 说明 |
|---|------|------|
| 🧠 | **会思考** | 内置 RAG 知识库与长期记忆，对话锚定私有数据，理解企业上下文 |
| 🛠️ | **会干活** | 浏览器自动化、终端操控、远程桌面、定时任务——不只是聊天，更能动手做事 |
| 📈 | **陪企业成长** | 自进化能力将日常对话沉淀为可复用技能，知识库与专家配置随业务积累持续增值 |
| 👥 | **多用户多 Agent 专家团** | 一人管理，多人共用；内置专家库，按场景切换专业角色 |
| 🤝 | **云端协作** | 将本机 云顶数字工作台 连接到另一实例，可浏览对端专家并跨实例协作 |
| 🎭 | **MBTI 人格** | 16 种人格模板与互动测试，为每个 Agent 赋予鲜明性格 |
| 🎯 | **AgentTeams** *（Beta）* | 协调者调度多位专家协作完成多步骤任务；[详见](docs/expert-teams.md) |
| 🔒 | **安全可控** | JWT 多用户隔离、工具审批、Shell 命令防护与敏感信息脱敏，数据留在本地 |
| 🔌 | **Connector 拓展体系** | 一键接入腾讯文档、Notion、飞书、企业微信等，OAuth 与 MCP 网关轻松扩展 — [支持的连接器](docs/connectors.md) |
| 💾 | **可插拔工作区后端** | 本地目录、Docker 沙箱、PostgreSQL 或 COS/S3 存放 Agent 文件 — 与控制面数据库分离 |
| 📚 | **知识库** | 基于文档的 RAG 检索；支持同实例共享语料，让回答锚定私有知识 |
| 🧩 | **插件** | 支持第三方插件扩展；内置插件随安装注入，按需一键启用 |
| ↔️ | **ACP 双向集成** | IDE / 终端 AI 双向协作：既可把外部 Agent 接进来，也可以把任务委派出去 |
| 💻 | **终端 AI+** | 浏览器内交互式 Shell，AI 辅助命令执行与排障 |
| 🌐 | **浏览器 AI+** | 基于 Chromium 的无头浏览器会话，支持网页自动化、截图与远程操控 |
| 🖥️ | **远程桌面** | 控制台内实时看屏与键鼠操控，跨 Linux / Windows / macOS |
| 🪟 | **桌面客户端** | Windows / macOS / Linux 原生应用，另有飞牛（FnOS）安装包 |
| 🏠 | **完全自托管** | 一条命令运行控制台、CLI、IM 通道与定时任务，所有数据在你手中 |

## 📌 概述

云顶数字工作台（Ydsz Worker）是面向企业与团队的自托管 AI 助手平台。单进程同时提供 Web 控制台、CLI、IM 通道（飞书、钉钉、企业微信、QQ、微信等）与定时任务，共享 `~/.ydsz/` 下的控制面数据库（默认 SQLite；可选 PostgreSQL）。

> **核心理念：** 让 AI 不仅回答问题，更能动手做事。知识在对话中积累，技能在使用中沉淀，陪伴企业每一步成长。

<details>
<summary>🐾 你能用 云顶数字工作台 做什么</summary>

- **智能客服** — 接入企业微信/飞书/钉钉，结合企业知识库自动回答客户问题。
- **自动化运营** — 定时推送日报、周报、数据看板；浏览器自动化完成网页操作。
- **编程助手** — 通过 ACP 与 IDE 协作，代码审查、bug 修复、文档生成一步到位。
- **知识管理** — 团队内部文档智能检索、知识沉淀、经验复用。
- **个人助理** — 写周报、整理资料、订日程、操控本地应用。
- **远程办公** — 远程桌面 + 终端 AI+，随时随地掌控工作环境。

</details>

## 🧠 核心技术

| 层级 | 技术 |
|------|------|
| **语言** | Python 3.12+ |
| **Web 框架** | FastAPI + uvicorn |
| **Agent 运行时** | LangGraph |
| **控制平面数据库** | SQLite (WAL，默认) 或 PostgreSQL（可选） |
| **前端** | React 18 + TypeScript + Vite |
| **调度** | APScheduler |
| **ACP** | agent-client-protocol |
| **构建 / 质量** | hatchling · ruff · mypy · pytest |

云顶数字工作台将所有入口——Web UI、IM 与定时任务——通过进程内统一的消息处理管线进行路由。不依赖外部消息队列或中间件，最终呈现为一个可重启恢复的单进程：启动时整个状态都从控制面数据库重建。

## 🤔 功能特性

### 服务器与认证
- 多用户 JWT 认证，支持管理员角色
- 首次运行向导（`ydsz-worker init`）
- 交互式 API 文档：`/api/docs`（默认关闭 — 在 `config.json` 中设置 `"enable_api_docs": true` 开启）

### 专家
- 每位用户可创建多个专家；各自拥有独立工作区、供应商、通道和定时任务
- 16 种 MBTI 人格模板 + 自定义系统提示词
- 启动时扫描专家库（`infra/agents/experts/library/`）；支持专家市场与同实例专家共享
- **AgentTeams** *（Beta）* — 协调者 + 成员专家协作完成多步骤任务（[docs/expert-teams.md](docs/expert-teams.md)）
- 工作区后端（专家文件）：本地磁盘、Docker 沙箱、PostgreSQL、COS/S3 及其他远程存储 — 与控制面数据库分离

### 通道与自动化
- IM 通道：飞书、钉钉、企业微信、QQ、微信等
- 主动定时任务，支持自然语言和斜杠命令触发
- Web UI、IM、定时任务共用同一套消息处理链路

### 使用入口
- **Web 控制台** — 对话、专家 / 团队、连接器、通道、定时任务、知识库、插件、设置
- **桌面客户端** — Windows / macOS / Linux 原生应用；飞牛（FnOS）安装包
- **CLI** — `ydsz-worker run`、`ydsz-worker chats`、`ydsz-worker acp`、管理命令
- **HTTP/SSE/WebSocket API** — 完整的程序化访问能力
- **远程桌面** — 在控制台操控本机桌面会话

### 知识库与插件
- **知识库** — 基于文档的 RAG 检索；支持同实例内共享语料
- **插件** — 安装并管理第三方插件（`ydsz-worker plugin`）；内置插件随安装注入，按需在控制台一键启用

### ACP（Agent Client Protocol）

云顶数字工作台支持两个方向的 ACP 集成：

1. **入站** — 外部工具使用**你的** 云顶数字工作台 Agent
   ```bash
   ydsz-worker acp --agent main   # 为 Zed、OpenCode 等提供 stdio ACP 服务
   ```

2. **出站** — 云顶数字工作台委派给外部编程 Agent
   - 控制台 → **ACP**（`/acp`）：配置 Runner（按用户全局）
   - 为 Agent 启用 **acp_runner** 后，在对话中委派任务

内置出站 Runner 包括 OpenCode、CodeBuddy、Claude Code 和 Codex。

完整配置：**[docs/acp.md](docs/acp.md)**。

## 🧭 规划

以下是我们的中长期规划：

**已完成**
- [x] **资源共享池** — 构建技能 / 子智能体共享池，用户在创建专家时可直接取用。
- [x] **专家共享** — 支持用户将自有专家共享给其他用户使用。
- [x] **PC 端客户端** — Windows / macOS / Linux 原生桌面应用。
- [x] **IM 通道集成** — 飞书、钉钉、企业微信、QQ、微信、Telegram、Discord 全平台覆盖。

**进行中**
- [ ] **AgentTeams** *（Beta）* — 协调者自主调度多位专家协同完成复杂多步骤任务。
- [ ] **移动端客户端** *（内测中）* — 原生移动端应用。

**规划中**
- [ ] **自进化能力** — 将日常对话自动沉淀为技能，让助手随使用不断成长。
- [ ] **企业知识大脑** — 更深层的企业级知识管理与推理能力。
- [ ] **Plugin Marketplace** — 插件市场，一键发现、安装与更新第三方插件。
- [ ] **对话式控制面** — 用对话即可操作整个控制台。
- [ ] **云边端一体** — 本地运行 + 云端弹性扩展。

## 🚀 快速开始

### 环境要求

- **macOS / Linux / Windows**
- 无需预先安装 Python — 安装脚本通过 [uv](https://docs.astral.sh/uv/) 在 `~/.ydsz/` 下创建隔离的 Python 3.12 虚拟环境
- 现代多核 CPU，并预留数 GB 内存供进程与模型/Embedding 缓存使用；磁盘需容纳数据库、Agent 工作区与文档语料

### 1. 安装

**macOS / Linux** — 一键安装（推荐）：

```bash
curl -fsSL https://install.ydsz.ai/install.sh | bash
```

**Windows（PowerShell）**：

```powershell
irm https://install.ydsz.ai/install.ps1 | iex
```

**Windows（cmd）** — 下载后运行，或从已克隆的仓库执行：

```bat
curl -fsSL https://install.ydsz.ai/install.bat -o install.bat
install.bat
```

安装完成后，请打开**新终端**，或重新加载 shell 配置。安装脚本会将 `ydsz-worker` 加入 PATH（`~/.ydsz/bin`）。

完整安装选项见 [scripts/README.md](scripts/README.md)。

**桌面客户端**（图形界面，无需终端）— 从 [Releases](https://github.com/njydsz/ydsz-worker/releases/latest) 下载对应平台的安装包：

| 平台 | 制品 |
|------|------|
| Windows | `YdszDesktop-windows-amd64-<version>.exe` / `YdszDesktop-windows-arm64-<version>.exe` |
| macOS | `YdszDesktop-darwin-arm64-<version>.dmg` / `YdszDesktop-darwin-amd64-<version>.dmg` |
| Linux | `YdszDesktop-linux-amd64-<version>.tar.gz` / `YdszDesktop-linux-arm64-<version>.tar.gz` |
| 飞牛 NAS（FnOS） | `YdszFnOS-docker-<version>.fpk` / `YdszFnOS-native-<version>.fpk` / `YdszFnOS-native-arm64-<version>.fpk` |

**备选 — PyPI**（若你已自行管理 Python 环境）：

```bash
pip install ydsz-worker
# 可选本地 Embedding：pip install "ydsz-worker[local-embedding]"
```

从源码用 uv 开发时：

```bash
uv sync --extra local-embedding
```

### 2. 初始化

```bash
ydsz-worker init
```

交互式向导会在 `~/.ydsz/` 下创建 SQLite 数据库、JWT 密钥，并引导你设置首个管理员账号。

### 3. 启动

```bash
# 前台运行（API + Web 控制台）
ydsz-worker run

# 自定义主机与端口
ydsz-worker run --host 0.0.0.0 --port 8088

# 注册为系统服务（systemd / launchd / Windows 服务）
ydsz-worker service start
```

打开 **http://127.0.0.1:8088**。

### Docker（推荐用于生产部署）

```bash
# 构建并启动
docker compose -f docker/docker-compose.yml up -d

# 国内镜像加速
docker compose -f docker/docker-compose.cn.yml up -d
```

打开 `http://localhost:8088`。

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `YDSZ_PORT` | `8088` | HTTP 监听端口 |
| `YDSZ_DEFAULT_PASSWORD` | _(未设置)_ | 首次管理员密码 |
| `YDSZ_ADMIN_USERNAME` | `admin` | 首次管理员用户名 |
| `YDSZ_DATA` | `~/.ydsz` | 宿主机数据目录 |

完整变量列表见 [`.env.example`](.env.example)。

## 📑 目录

- **[亮点](#-亮点)** — 核心特性速览
- **[概述](#-概述)** — 产品定位与使用场景
- **[核心技术](#-核心技术)** — 技术栈一览
- **[功能特性](#-功能特性)** — 详细功能列表
- **[规划](#-规划)** — 路线图
- **[快速开始](#-快速开始)** — 安装与启动指南
- **部署与使用**
  - [安装方式](#-安装方式) — 各平台安装方法
  - [配置](#️-配置) — 环境变量与 config.json
  - [CLI 参考](#-cli-参考) — 命令行工具
  - [Web 控制台](#️-web-控制台) — 控制台功能
  - [数据目录](#-数据目录) — 文件结构
- **架构与开发**
  - [架构](#️-架构) — 系统设计
  - [项目结构](#-项目结构) — 仓库布局
  - [开发](#️-开发) — 本地开发环境
- **项目信息**
  - [安全与隐私](#-安全与隐私)
  - [参与贡献](#-参与贡献)
  - [更新日志](#-更新日志)
  - [相关项目](#-相关项目)
  - [许可证](#-许可证)

## 📦 安装方式

| 方式 | 平台 | 说明 |
|------|------|------|
| 远程一键安装 | macOS / Linux | `curl …/install.sh \| bash` |
| 远程一键安装 | Windows | `irm …/install.ps1 \| iex` 或 `install.bat` |
| 本地脚本 | macOS / Linux | `bash scripts/install.sh` |
| 本地脚本 | Windows | `scripts\install.bat` 或 `install.ps1` |
| PyPI | 全平台 | `pip install ydsz-worker` |
| Docker | 全平台 | `docker/docker-compose.yml` |

### 升级

```bash
ydsz-worker update          # 获取并安装最新版，若已注册系统服务则自动重启
```

跨版本升级前请务必先备份（`ydsz-worker backup`）。

## ⚙️ 配置

```bash
# LLM 供应商与模型
ydsz-worker models
ydsz-worker provider list

# IM 通道
ydsz-worker channel list

# Skill（按 Agent）
ydsz-worker skills list --agent main

# 定时任务
ydsz-worker cron list

# 用户（管理员）
ydsz-worker user list
```

### 支持的 LLM 供应商

OpenAI 兼容 API、DashScope（千问）、Ollama 等预设 — 在控制台或通过 `ydsz-worker provider` 按 Agent 配置。

### 支持的通道

| 通道 | 所需凭证 |
|------|----------|
| **飞书** | App ID、App Secret |
| **钉钉** | App Key、 App Secret |
| **QQ** | Bot AppID、Token |
| **微信** | 扫码绑定 / 账号凭证；见 [CLI](docs/cli.md) |
| **企业微信** | Corp ID、Agent Secret |
| **Web 控制台** | 默认启用 |

### 支持的连接器

内置 OAuth / MCP 连接器包括腾讯文档、腾讯会议、Notion、滴答清单、OpenAlex、飞书 CLI、企业微信 CLI、Agent Mail、Obsidian、WeKnora、Dify 等。

详见 **[docs/connectors.md](docs/connectors.md)**。

## 📖 CLI 参考

| 命令 | 说明 |
|------|------|
| `ydsz-worker init` | 初始化 `~/.ydsz/`（数据库、管理员、JWT 密钥） |
| `ydsz-worker run` | 前台启动 |
| `ydsz-worker service start` | 安装并启动系统服务 |
| `ydsz-worker agent` | 创建、列出、启停 Agent |
| `ydsz-worker channel` | 安装与管理 IM 通道 |
| `ydsz-worker chats` | REPL 与会话管理 |
| `ydsz-worker acp` | 为 IDE 提供 stdio ACP 服务 |
| `ydsz-worker cron` | 管理定时任务 |
| `ydsz-worker models` | 供应商预设与模型解析 |
| `ydsz-worker skills` | 按 Agent 启用/禁用 Skill |
| `ydsz-worker plugin` | 安装并管理第三方插件 |
| `ydsz-worker backup` | 导出 / 恢复备份 |
| `ydsz-worker memory slim` | 记忆维护 |
| `ydsz-worker update` | 检查并安装更新 |

完整参考：**[docs/cli.md](docs/cli.md)**。

## 🖥️ Web 控制台

`ydsz-worker run` 启动后访问 **http://127.0.0.1:8088**。

<p align="center">
  <img src="docs/assets/readme-chat-zh.png" alt="Ydsz Worker Web 控制台" width="800" />
</p>

- **对话** — 与专家 / 团队实时聊天
- **专家** — 创建专家、选择专家库 / MBTI、共享或发布专家
- **AgentTeams** *（Beta）* — 协调者 + 成员专家协作多步骤任务
- **Connector** — OAuth 应用与 MCP 网关
- **通道** — IM 平台配置
- **定时任务** — 可视化 Cron 管理
- **知识库** — 管理文档语料、语义检索与共享
- **插件** — 安装、启用与配置插件
- **远程桌面** — 控制台内实时看屏与键鼠操控
- **ACP** — 配置出站编程 Agent Runner
- **设置** — 用户、安全、TLS、系统

交互式 API 文档：**http://127.0.0.1:8088/api/docs**（默认关闭）

## 📁 数据目录

```
~/.ydsz/                          ← 安装与数据根目录
├── config.json                    # 进程配置
├── ydsz.db                       # 默认 SQLite 控制面
├── secrets/                       # JWT 密钥、通道 Token
├── agents/<agent_id>/             # 各 Agent 工作区
├── security/tool_guard/           # Shell 命令允许/拒绝规则
├── logs/                          # 运行日志
├── venv/                          # uv 管理的 Python
└── bin/ydsz-worker               # PATH 包装脚本
```

控制面也可改用 PostgreSQL（`config.json` → `database`，或 `YDSZ_DATABASE_*`）。详见 [docs/configuration.md](docs/configuration.md)。

## 🏗️ 架构

```
YdszServer
 ├─ DatabasePool         SQLite (WAL) 或 PostgreSQL
 ├─ SharedServices       依赖注入根 — 所有 repo 与配置
 ├─ ExpertCatalog        启动时扫描 agents/experts/library/
 ├─ UserManager
 │   └─ AgentManager
 │       └─ AgentRuntime（per agent）
 │           ├─ HarnessAgent      Agent 运行时（LangGraph）
 │           ├─ IM/UI/Cron 入口
 │           ├─ ChannelManager    IM 连接
 │           └─ CronManager       定时任务
 └─ FastAPI app (uvicorn)
```

单进程架构。重启后从控制面数据库重建状态。

详见 [docs/architecture.md](docs/architecture.md)。

## 📁 项目结构

```
src/ydsz/
  config.py    环境变量配置
  launch.py    YdszServer 启动 + uvicorn
  infra/       业务核心（agents、gateway、cron、db、users …）
  api/         HTTP 层 — FastAPI 路由、JWT、SSE
  cli/         CLI 层 — Click 命令
  dashboard/   构建后的 React SPA（wheel 产物）

dashboard/     前端源码（Vite）— 在此编辑，运行 make build-frontend
```

## 🛠️ 开发

```bash
# 后端
make install          # pip install -e ".[dev]"
make all              # format-all + lint + typecheck + test

# 前端（另开终端）
make dev-frontend     # Vite 开发服务器 :5173
make build-frontend   # 生产构建
```

## 🔒 安全与隐私

- **本地优先**：配置、对话、工作区与凭证均存储在 `~/.ydsz/`。
- **多用户隔离**：JWT 认证，按用户隔离 Agent 与工作区。
- **敏感信息脱敏与工具审批**：离开工作区前自动脱敏；高风险工具或 Shell 命令需显式审批。
- **无厂商锁定**：可自由切换 LLM 供应商、存储后端与 IM 通道。

## 🤝 参与贡献

欢迎贡献代码：

1. Fork 本仓库
2. 创建功能分支（`git checkout -b feature/amazing-feature`）
3. 提交前运行 `make all`（后端）或 `make check-all`（全栈）
4. 发起 Pull Request

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 📋 更新日志

详见 [CHANGELOG.md](CHANGELOG.md)。

## 🔗 相关项目

| 项目 | 描述 |
|------|------|
| LangGraph | Agent 运行时框架 |
| LangChain | LLM 应用开发框架 |
| FastAPI | Web 框架 |

## 📄 许可证

本项目采用 [MIT License](LICENSE)。

## ✨ 贡献者

感谢所有为 云顶数字工作台 贡献代码的人。
