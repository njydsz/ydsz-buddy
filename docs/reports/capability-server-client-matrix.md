# 云顶数字工作台 — 服务端 vs 客户端能力归属矩阵

> **日期：** 2026-10-21
> **依据：** 项目源码（src/ydsz/）+ 截图功能清单
> **核心原则：** 客户端只做渲染和 IO，服务端拥有全部业务逻辑和数据

---

## 一、判定原则

| 原则 | 说明 |
|------|------|
| **数据持久化** | 所有数据归服务端，客户端只缓存展示用副本 |
| **业务逻辑** | 所有决策（模型选择、权限校验、任务调度）归服务端 |
| **外部调用** | 所有第三方调用（LLM API、IM Webhook、MCP 网关）归服务端 |
| **原生能力** | 客户端独享：语音采集、系统通知、剪贴板、文件拖拽、全局快捷键 |
| **状态管理** | 服务端是 Single Source of Truth，客户端是 View 层 |

---

## 二、服务端能力（全部在 `src/ydsz/infra/` + `src/ydsz/api/` 层）

### 2.1 核心引擎

| 能力 | 模块路径 | 说明 | 三种模式 |
|------|---------|------|:--------:|
| **Agent 运行时** | `infra/agents/manager.py` | HarnessAgent 生命周期、对话执行、模型调用 | L/C/H |
| **多 Agent 协作（AgentTeams）** | `infra/agents/teams/` | 多专家协作调度、子 Agent 分发、结果聚合 | L/C/H |
| **专家系统（Experts）** | `infra/agents/experts/` | 专家定义、启动/停止、健康检查 | L/C/H |
| **子代理（SubAgents）** | `infra/agents/subagents/` | 子代理编排、任务委托 | L/C/H |
| **Skill 引擎** | `infra/skills/` | 技能包加载、执行、热更新 | L/C/H |
| **连接器 MCP 网关** | `infra/connectors/` | 第三方工具协议适配、OAuth 令牌管理 | L/C/H |
| **知识库/RAG** | `infra/knowledge/` | 向量检索、文档解析、分块嵌入 | L/C/H |
| **IM 通道引擎** | `infra/gateway/` | 飞书/钉钉/微信/QQ/企业微信 Webhook 接入与消息路由 | L/C/H |
| **定时任务 Cron** | `infra/cron/` | 定时调度、执行历史、失败重试 | L/C/H |
| **主动推送（Proactive Care）** | `infra/proactive/` | 主动消息推送触发、推送队列 | L/C/H |
| **浏览器自动化** | `infra/browser/` | Playwright 浏览器实例、页面操作、DOM 解析 | L/C/H |
| **远程桌面服务** | `infra/desktop/` | 桌面捕获（H264 编码）、远程输入注入 | L/C/H |
| **移动端控制** | `infra/mobile/` | ADB 交互、屏幕录制、触控注入、Agent 控制 | L/C/H |
| **语音处理** | `infra/voice/`、`infra/providers/voice/` | TTS 合成、语音识别、语音克隆 | L/C/H |

### 2.2 数据与持久化

| 能力 | 模块路径 | 说明 | 三种模式 |
|------|---------|------|:--------:|
| **SQLite/PostgreSQL** | `infra/db/` | 所有业务数据持久化 | L/C/H |
| **会话与历史** | `infra/history/` | 消息版本化、对话轨迹、Token 用量统计 | L/C/H |
| **文件工作区** | `infra/backend/` | agent workspace 读写、沙箱隔离 | L/C/H |
| **设置存储** | `infra/db/repos/` | 用户偏好、系统配置、模型配置 | L/C/H |
| **插件存储** | `infra/plugins/` | 插件注册、安装、启停 | L/C/H |

### 2.3 模型与 AI 服务

| 能力 | 模块路径 | 说明 | 三种模式 |
|------|---------|------|:--------:|
| **模型提供者管理** | `infra/agents/providers/` | OpenAI/DeepSeek/Qwen/GLM/Kimi 配置与健康检查 | L/C/H |
| **模型 Relay（托管调用）** | `cloud/model_relay.py` ← 新增 | 平台统一调用 LLM、Token 计费、智能路由 | C |
| **媒体生成** | `infra/providers/media/` | 图片生成（DALL·E 等）、语音合成 | L/C/H |
| **OLLAMA 本地模型** | `infra/utils/ollama/` | 本地模型发现、启动、推理 | L/H |
| **ONNX 模型** | `onnx_models/` | 本地 ONNX 推理（隐私模式） | L/H |

### 2.4 认证安全与合规

| 能力 | 模块路径 | 说明 | 三种模式 |
|------|---------|------|:--------:|
| **JWT 认证** | `infra/auth/jwt/` | Token 签发、刷新、撤销 | L/C/H |
| **LDAP 认证** | `infra/auth/ldap/` | 企业目录服务集成 | H |
| **OAuth/OIDC** | `infra/auth/sso/` | 第三方 SSO（企微/飞书/Google） | C/H |
| **用户管理** | `infra/users/` | 用户 CRUD、角色权限、密码哈希 | L/C/H |
| **邀请机制** | `api/routers/invites.py` | 注册邀请码、审批流 | C/H |
| **HITL（人工干预）** | `infra/agents/security/hitl_session.py` | 敏感操作人工审批 | L/C/H |
| **工具执行守卫** | `infra/agents/security/` | 命令白名单/黑名单、沙箱策略 | L/C/H |
| **审计日志** | `cloud/audit_log.py` ← 新增 | 操作全链路审计、管理员追溯 | H |
| **TLS/HTTPS** | `infra/setup/tls/` | Let's Encrypt 证书、自动续期 | L/H |

### 2.5 同步、计费与云端增值

| 能力 | 模块路径 | 说明 | 三种模式 |
|------|---------|------|:--------:|
| **云同步（原生）** | `cloud/sync_service.py` ← 新增 | 配置、会话历史、工作区跨设备同步 | C |
| **云同步（桥接）** | `cloud/sync_service.py` ← 新增 | Bridge 代理同步（不上传明文数据） | L(可选)/H |
| **Bridge Agent** | `cloud/bridge_agent.py` ← 新增 | 企业本地 ↔ 云端管控面的安全隧道 | H |
| **计费系统** | `cloud/billing.py` ← 新增 | Token 配额、订阅管理、使用统计 | C |
| **多租户隔离** | `cloud/tenant.py` ← 新增 | cloud 模式下用户资源隔离 | C |
| **设备管理** | `cloud/device_manager.py` ← 新增 | 多设备注册、在线状态、远程唤醒 | C/H |
| **Marketplace 市场** | `api/routers/skills.py` + `marketplace.py` | 技能/专家/Connector 市场 + 交易分佣 | L/C/H |

---

## 三、客户端能力（`dashboard/` Web SPA + `desktop/` Wails 壳 + Mobile App）

### 3.1 UI 与渲染

| 能力 | 所在文件 | 说明 |
|------|---------|------|
| **React Dashboard** | `dashboard/src/` | 全部页面：对话、Agent管理、专家团、技能包、连接器、知识库、自动化、设置 |
| **对话 UI** | `src/components/Markdown/` | 消息气泡、代码高亮、SVG 渲染、流式输出 |
| **专家配置 UI** | `dashboard/src/pages/Agent/` | 创建/编辑专家、MBTI personality 配置 |
| **Connector 配置 UI** | `dashboard/src/pages/Settings/sections/connectors.tsx` | 第三方连接器配置表单 |
| **知识库管理 UI** | `dashboard/src/pages/KnowledgeBases/` | 文档上传、分块配置、检索测试 |
| **通道管理 UI** | `dashboard/src/pages/Settings/sections/channels.tsx` | 飞书/钉钉等通道配置 |
| **定时任务 UI** | `dashboard/src/pages/Control/cron/` | 定时任务配置、执行日志查看 |
| **令牌统计 UI** | `dashboard/src/components/TokenCountInput.tsx` + 统计页 | Token 用量、费用展示 |
| **远程桌面 Viewer** | `browser/stream/` | 远程画面解码显示（H264 解码由服务端编码） |
| **浏览器 AI 面板** | `BrowserAiPanel.tsx` | 页面内嵌 AI 对话框 |
| **移动端 AI 面板** | `MobileAiPanel.tsx` | 移动web端对话框 |

### 3.2 原生客户端能力（桌面壳独享）

| 能力 | 所在文件 | 说明 |
|------|---------|------|
| **系统托盘** | `desktop/src/main.go` (systray) | 开机自启、快捷入口 |
| **全局快捷键** | `desktop/src/` | 唤起语音输入、发送消息 |
| **系统通知** | `desktop/src/` | 新消息推送、任务完成通知 |
| **窗口管理** | `desktop/src/window_chrome.go` | 窗口大小、置顶、无边框 |
| **自动更新** | `desktop/src/download.go` | 应用升级检查和静默更新 |
| **文件拖拽** | `dashboard/src/hooks/useDesktopStream.ts` | 拖入文件到对话框 |
| **Dock 菜单** | `desktop/src/dock_reopen_darwin.go` | macOS Dock 菜单 |
| **防休眠** | `desktop/src/preventsleep_*.go` | 任务执行时防止系统休眠 |
| **URL Scheme** | `desktop/src/openurl.go` | ydzs:// 协议唤起应用 |
| **便携版升级** | `desktop/portable/` | 免安装版升级逻辑 |

### 3.3 语音与媒体（客户端 IO）

| 能力 | 所在文件 | 说明 |
|------|---------|------|
| **语音输入** | `dashboard/src/hooks/useVoiceInput.ts` | 浏览器 MediaRecorder API 采集 |
| **语音输出（播放）** | `dashboard/src/hooks/useVoiceOutput.ts` | <audio> 元素播放服务端 TTS 音频 |
| **Wit.ai 语音识别** | `infra/voice/stt/` | ← 新增：服务端 STT 处理，客户端只采集 PCM |
| **PCM 前处理** | `dashboard/public/pcm-processor.js` | Web Audio API 实时降噪/AGC（ worker 中运行） |

### 3.4 客户端状态与缓存

| 能力 | 所在文件 | 说明 |
|------|---------|------|
| **Auth 令牌缓存** | `dashboard/src/context/AuthContext.tsx` | JWT 存储（localStorage/secure store） |
| **会话列表缓存** | `dashboard/src/hooks/useAgentThreadChat.ts` | 最近对话列表本地缓存 |
| **UI 偏好缓存** | `dashboard/src/styles/appearanceStorage.ts` | 主题、侧边栏状态、字号 |
| **i18n 语言包** | `dashboard/src/locales/` | 前端翻译（与服务端 i18n 双轨） |
| **能力发现缓存** | `dashboard/src/hooks/useServerCapabilities.ts` ← 新增 | 服务端 capabilities 缓存 |
| **健康状态探针** | `dashboard/src/api/probeHealth.ts` | 服务端是否在线、是否可连接 |
| **SSE 连接管理** | `dashboard/src/api/request.ts` | 自动重连、超时处理 |

---

## 四、关键交互流程中的职责划分

### 4.1 用户发送一条消息

```
客户端                              服务端
─────────                          ─────────
1. 语音采集 + PCM 降噪             
2. 文本/fetch 发送 ───────────────► 3. JWT 校验 + 权限检查
                                    4. 加载 Agent + Workspace
                                    5. 调用 LLM API（模型选择）
                                    6. 流式 Token 返回 ◄────────┐
7. 流式渲染 + 代码高亮 ◄────────────┘
                                    8. 持久化消息 + 写历史
                                    9. 异步更新 Token 统计
10. 更新未读计数 ◄───────────────── 11. 推送通知（如有其他设备）
```

### 4.2 用户配置一个飞书通道

```
客户端                              服务端
─────────                          ─────────
1. 填写 AppID/AppSecret
2. POST /api/channels ───────────► 3. 存储凭证（加密）
                                    4. 注册 Webhook URL
                                    5. 测试发送验证消息
                                    6. 返回 channel 状态 ◄──────┐
7. 显示配置成功/失败 ◄──────────────┘
```

### 4.3 用户订阅 Pro（触发计费能力）

```
客户端                              服务端
─────────                          ─────────
1. 点击"升级 Pro"
2. POST /api/v1/billing/subscribe ► 3. 创建订阅记录
                                    4. 调用支付网关（Stripe/LianLian）
                                    5. 更新配额上限 ◄────────────┐
                                    6. capabilities 刷新推送     │
7. 订阅状态 UI 更新 ◄───────────────┘
```

---

## 五、desktop/ Wails 壳的定位

### 5.1 现状 vs 目标

```
现在（胖壳）：
┌──────────────────────────────────────────┐
│  Wails 壳                                │
│   ├─ Go 层（托盘、下载、休眠、URL）       │ ← Native 能力
│   ├─ 内嵌 Python 完整 ydsz-worker 进程    │ ← 整个服务端
│   └─ WebView 加载 React SPA              │ ← UI
└──────────────────────────────────────────┘
             │
             └── 问题：分不清哪些是"壳"哪些是"服务端"

目标（统一轻壳）：
┌──────────────────────────────────────────┐
│  统一客户端（桌面壳）                     │
│   ├─ Go 层（托盘、通知、快捷键、URL）    │ ← 纯 Native 壳
│   └─ WebView 加载 React SPA              │ ← UI 层
│        └─ 连接 localhost 或云端          │ ← 通过 SDK 连服务端
└──────────────────────────────────────────┘
                                      │
                                      │ HTTP/WSS
                                      ▼
                          ┌──────────────────────┐
                          │   Ydsz Server        │
                          │   （可本地可云端）    │
                          └──────────────────────┘
```

### 5.2 Go 层需要保留的能力

| Go 模块 | 放到 | 理由 |
|---------|:----:|------|
| `main.go` (systray) | 🖥️ 客户端 | macOS/Windows 系统托盘是 Native 必需 |
| `window_chrome.go` | 🖥️ 客户端 | 窗口外观控制（最小化、置顶、无边框） |
| `settings_window.go` | 🖥️ 客户端 | 独立设置窗口（可选保留，也可用 WebView 替代） |
| `download.go` | 🖥️ 客户端 | 应用本体自动更新下载 |
| `desktop_copy.go` | 🖥️ 客户端 | 应用内置运行时文件复制 |
| `embed_portable*.go` | ❌ 移除 | 不再嵌入式运行，移除 Python 集成 |
| `settings.go` | 🖥️ 客户端 | 托盘菜单、开机自启配置 |
| `tray_click.go` | 🖥️ 客户端 | 托盘菜单事件 |
| `dock_reopen_darwin.go` | 🖥️ 客户端 | macOS Dock 集成 |
| `openurl.go` | 🖥️ 客户端 | URL Scheme 唤起 |
| `filedrop.go` | 🖥️ 客户端 | 拖放文件到托盘 |
| `preventsleep_*.go` | 🖥️ 客户端 | 防休眠（任务执行时由服务端通知客户端触发） |
| `icons_darwin.go` | 🖥️ 客户端 | 应用图标 |
| `process.go` | ❌ 移除 | 不再需要管理本地 ydsz-worker 子进程 |
| `download.go` | 🖥️ 客户端 | 应用更新下载（与模型下载分离） |

---

## 六、能力归属总表（扫码用）

| 能力大类 | 服务端（infra/） | 客户端（dashboard/ + desktop/） |
|:--------:|:----------------:|:-----------------------------:|
| **AI/LLM** | 完整 Agent 运行时、模型调用、RAG、多Agent协作 | 对话 UI 渲染、流式显示 |
| **IM通道** | 飞书/钉钉/钉钉/微信/QQ Webhook 接收与路由 | 通道配置 Web 表单 |
| **定时任务** | Cron 调度引擎、触发记录 | 定时任务配置/日志查看 UI |
| **浏览器/桌面** | Playwright/DOM 操作、H264 编码、远程输入注入 | 画面显示、交互事件采集 |
| **移动端** | ADB 通信、屏幕录制、Agent 控制协议 | （未来）React Native 显示层 |
| **知识库** | 文档解析、向量嵌入、检索排序 | 文档上传配置、检索测试 UI |
| **连接器** | MCP 网关、OAuth 令牌、API 调用 | 连接器配置表单 |
| **专家市场** | 技能加载、签名校验、沙箱执行 | 市场浏览、安装 UI |
| **数据库** | SQLite/PostgreSQL 全部持久化 | 无（通过 SDK 读） |
| **认证授权** | JWT/LDAP/OAuth/SSO/HITL | Token 缓存、登录 UI |
| **模型管理** | 提供者配置、健康检查、智能路由 | 模型配置表单 |
| **计费/订阅** | Quota 计算、账单生成、订阅状态 | 订阅卡片、账单展示 |
| **配置同步** | 配置版本控制、冲突解决 | 同步状态指示、手动触发按钮 |
| **TLS/证书** | ACME 申请、自动续期 | 证书状态显示 |
| **语音处理** | TTS 合成、STT 识别、音频流 | 麦克风采集、音频播放 |
| **安全防护** | 命令守卫、沙箱隔离、审计日志 | HITL 审批 UI 弹出 |
| **系统托盘** | — | 托盘图标、菜单、开机自启 |
| **全局快捷键** | — | 唤起语音、发送消息 |
| **系统通知** | 推送事件触发 | 操作系统通知渲染 |
| **窗口外观** | — | 主题、侧边栏、字号 |
| **应用更新** | 版本清单发布 | OTA 下载安装 |
| **文件IO** | Workspace 文件读写沙箱 | 拖放上传、剪贴板粘贴 |

---

## 七、实施建议

### 7.1 第一步：API 边界硬隔离（不破坏现有功能）

```
 现状：
   dashboard/src/api/modules/agents.ts → fetch('/api/agents/...')
   dashboard/src/context/AgentContext  → 直接操作 memory/redux state

 改造后：
   dashboard/src/api/modules/agents.ts → ydzsSdk.agents.list()  [单一 SDK 入口]
   移除：任何直接 import infra 模块的地方（目前无，保偿清洁）
   新增：/api/v1/capabilities 用于模式发现
```

### 7.2 第二步：认证双轨

```
 服务端 api/v1/auth.py 同时支持：
   ├─ 本地账号（argon2 verify）--mode local
   ├─ 云端 JWT  ──mode cloud / hybrid
   └─ LDAP bind ──mode hybrid (企业)

 客户端 login 页：
   ├─ 连接 localhost → 自动用本地账号登录
   └─ 连接 cloud.ydsz.ai → 显示手机号/第三方登录
```

### 7.3 第三步：桌面壳瘦身

```
 迁移清单：
   ✅ 保留 → systray、download、preventsleep、filedrop、openURL、window_chrome
   ❌ 移除 → embed_portable、desktop_copy、process（不再嵌 Python 进程）
   🔄 改造 → 首次启动显示"连接本地 / 登录云端"选择器
```

---

## 八、待确认事项

- [ ] **能力是否完整？** 请对照此表确认是否有遗漏的功能点
- [ ] **桌面壳 Go 层瘦身范围？** 是否同意移除 Python 进程管理相关代码
- [ ] **React Native（移动端）技术栈选择？** 建议 Flutter（音频处理更强）还是 RN（React 复用）？
- [ ] **dashboard 中的 hooks 和 utils 是否需要拆分到 ydzs-sdk 包？** 当前是内联在 dashboard/ 中，建议拆为独立 SDK 供多端共享
