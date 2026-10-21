# 云顶数字工作台 — 服务端/客户端拆分策略与商业化路径（v0.4 最终版）

> **定位：** 会思考、会干活、陪企业成长的智能伙伴
>
> **核心原则：**
> - **客户端统一且轻量**：一种客户端（Web PWA + 桌面壳 + Mobile 共享代码）
> - **模式差异由服务端配置决定**：`--mode local | cloud | hybrid`
> - **能力发现协议**：客户端通过 `/api/v1/capabilities` 动态适配 UI
>
> **竞品对标：** 妙手 CatPaw、WorkBuddy、Kimi Work、小浣熊 Raccoon Work、OpenCode、DeepSeek Harness
>
> **日期：** 2026-10-21 · v0.4

---

## 一、架构一句话总结

**客户端只渲染和 IO，服务端拥有全部业务逻辑和数据。三种模式的差异 = 服务端启动参数，客户端自动适配。**

---

## 二、能力归属矩阵

### 2.1 服务端（50+ 项能力）

| 类别 | 能力项 | 文件路径 | 说明 |
|------|--------|---------|------|
| **Agent 引擎** | 多 Agent 运行时 | `infra/agents/manager.py` | HarnessAgent 生命周期、模型调用、结果聚合 |
| | 专家系统 | `infra/agents/experts/` | 定义、启动/停止、健康检查 |
| | 子代理编排 | `infra/agents/subagents/` | 任务委托、结果汇总 |
| | 技能引擎 | `infra/skills/` | 加载、执行、热更新 |
| | MCP 网关 | `infra/connectors/` | OAuth 令牌、API 适配 |
| **IM 通道** | 飞书/钉钉/微信/QQ/企微 | `infra/gateway/` | Webhook 接收、消息路由 |
| **知识/RAG** | 向量检索/分块嵌入 | `infra/knowledge/` | 文档解析、检索排序 |
| **调度引擎** | 定时任务 Cron | `infra/cron/` | 调度、执行、失败重试 |
| | 主动推送 | `infra/proactive/` | 触发条件、推送队列 |
| **自动化** | 浏览器自动化 | `infra/browser/` | Playwright、DOM 操作 |
| | 远程桌面（H264 编码端） | `infra/desktop/` | 屏幕捕获、输入注入 |
| | 移动端控制 | `infra/mobile/` | ADB、屏幕录制、触控 |
| **模型服务** | 模型提供者管理 | `infra/agents/providers/` | 健康检查、协议适配 |
| | **模型 Relay（新增）** | `cloud/model_relay.py` | 智能路由、Token 计费 |
| | 媒体生成 | `infra/providers/media/` | 图片生成、语音合成 |
| | 本地OLLAMA | `infra/utils/ollama/` | 本地模型发现、推理 |
| | ONNX 推理 | `onnx_models/` | 本地隐私模式推理 |
| **安全认证** | JWT 认证 | `infra/auth/jwt/` | 签发、刷新、撤销 |
| | LDAP/SSO/OAuth | `infra/auth/` | 企业目录/第三方登录 |
| | 用户/角色管理 | `infra/users/` | CRUD、权限、密码 |
| | HITL 审批 | `infra/agents/security/hitl_session.py` | 敏感操作人工暂停 |
| | 工具执行守卫 | `infra/agents/security/` | 命令白名单、沙箱策略 |
| | TLS 证书 | `infra/setup/tls/` | Let's Encrypt、自动续期 |
| | **审计日志（新增）** | `cloud/audit_log.py` | 全链路审计追溯 |
| **持久化** | SQLite/PostgreSQL | `infra/db/` | 用户/Agent/历史/配置全部持久化 |
| | 会话历史 | `infra/history/` | 消息版本化、Token 统计 |
| | 工作区文件 | `infra/backend/` | 沙箱隔离读写 |
| **云端增值** | **配置同步（新增）** | `cloud/sync_service.py` | 跨设备配置和历史同步 |
| | **Bridge Agent（新增）** | `cloud/bridge_agent.py` | 企业混合安全隧道 |
| | **计费系统（新增）** | `cloud/billing.py` | Quota、账单、订阅 |
| | **多租户（新增）** | `cloud/tenant.py` | 资源隔离 |
| | **设备管理（新增）** | `cloud/device_manager.py` | 多设备注册、在线状态 |
| | 技能市场 | `api/routers/skills.py` + `marketplace.py` | UGC 上架、分佣 |

### 2.2 客户端（28 项能力）

| 类别 | 能力项 | 文件路径 | 说明 |
|------|--------|---------|------|
| **UI 渲染** | React Dashboard | `dashboard/src/` | 全部页面（对话/Cron/通道/知识库/专家团） |
| | 对话气泡/Markdown | `src/components/Markdown/` | 代码高亮、SVG 渲染 |
| | 远程桌面 Viewer | `browser/stream/` | H264 解码显示（编码服务端做） |
| **Native 壳** | 系统托盘 | `desktop/src/main.go` | 自启、菜单 |
| | 全局快捷键 | `desktop/src/` | 唤起语音、发送消息 |
| | 系统通知 | `desktop/src/` | 新消息推送 |
| | 窗口管理 | `desktop/src/window_chrome.go` | 置顶、无边框 |
| | 防休眠 | `desktop/src/preventsleep_*.go` | 任务执行时通知客户端触发 |
| | URL Scheme | `desktop/src/openurl.go` | ydzs:// 协议唤起 |
| | 应用自动更新 | `desktop/src/download.go` | OTA 升级 |
| **IO/媒体** | 语音采集 | `dashboard/src/hooks/useVoiceInput.ts` | MediaRecorder API |
| | 语音播放 | `dashboard/src/hooks/useVoiceOutput.ts` | <audio> 播放 TTS 音频 |
| | PCM 前处理 | `dashboard/public/pcm-processor.js` | Web Audio 实时降噪 AGC |
| | 剪贴板/拖放 | `dashboard/src/hooks/` | 文件拖放、截图粘贴 |
| **状态缓存** | JWT 缓存 | `AuthContext` | localStorage |
| | 会话缓存 | `useAgentThreadChat.ts` | 最近 N 条本地副本 |
| | UI 偏好 | `appearanceStorage.ts` | 主题、字号、侧边栏 |
| | i18n | `locales/` | 前端翻译包 |
| | **能力发现缓存（新增）** | `useServerCapabilities.ts` | 缓存 capabilities 响应 |
| **连接管理** | HTTP/SSO 登录 | `api/request.ts` | 自动重连、Token 刷新 |
| | SSE 流管理 | `request.ts` | 对话流订阅 |
| | 健康探针 | `api/probeHealth.ts` | 服务端在线检测 |

### 2.3 桌面壳 Go 层分类决策

| Go 模块 | 决策 | 理由 |
|---------|:----:|------|
| `main.go` (systray) | ✅ 保留 | macOS/Windows 系统托盘必需 |
| `window_chrome.go` | ✅ 保留 | 窗口外观控制 |
| `settings_window.go` | ✅ 保留 | 独立设置窗口 |
| `download.go` (应用更新) | ✅ 保留 | 壳本体 OTA |
| `preventsleep_*.go` | ✅ 保留 | 需服务端通知触发（防长任务休眠） |
| `filedrop.go` | ✅ 保留 | 拖放文件上传 |
| `openurl.go` | ✅ 保留 | ydzs:// URL Scheme |
| `dock_reopen_darwin.go` | ✅ 保留 | macOS Dock 集成 |
| `icons_darwin.go` | ✅ 保留 | 应用图标 |
| **`embed_portable*.go`** | ❌ 移除 | 不再嵌入 Python 运行时 |
| **`desktop_copy.go`** | ❌ 移除 | 不再内置绿色运行时 |
| **`process.go`** | ❌ 移除 | 不再管理本地 ydzz-worker 子进程 |
| **`download.go`（模型）** | ❌ 移除 | 模型下载改为服务端自行拉取 |

→ **桌面壳 Go 代码净缩减 ~60%，包体积从 500MB+ 降至 ~80MB**

---

## 二（附录）：能力归属完整明细表

下表逐项列出所有能力的代码路径归属，作为 v0.4 方案设计的依据。

### A. 服务端能力（~58 项）

| 类别 | 能力项 | 文件路径 | 说明 | L | C | H |
|------|--------|---------|------|:---:|:---:|:---:|
| **Agent 引擎** | Agent 运行时 | `infra/agents/manager.py` | HarnessAgent 生命周期、模型调用 | ✅ | ✅ | ✅ |
| | 专家系统 | `infra/agents/experts/` | 定义、启动/停止、健康检查 | ✅ | ✅ | ✅ |
| | 子代理编排 | `infra/agents/subagents/` | 任务委托、结果汇总 | ✅ | ✅ | ✅ |
| | 技能引擎 | `infra/skills/` | 加载、执行、热更新 | ✅ | ✅ | ✅ |
| | MCP 网关 | `infra/connectors/` | OAuth 令牌、API 适配 | ✅ | ✅ | ✅ |
| | 多 Agent 协作 | `infra/agents/teams/` | 多专家协作调度 | ✅ | ✅ | ✅ |
| **IM 通道** | 飞书/钉钉/微信/QQ/企微 | `infra/gateway/` | Webhook 接收、消息路由 | ✅ | ✅ | ✅ |
| **知识/RAG** | 向量检索/分块嵌入 | `infra/knowledge/` | 文档解析、检索排序 | ✅ | ✅ | ✅ |
| **调度引擎** | 定时任务 Cron | `infra/cron/` | 调度、执行、失败重试 | ✅ | ✅ | ✅ |
| | 主动推送 | `infra/proactive/` | 触发条件、推送队列 | ✅ | ✅ | ✅ |
| **自动化** | 浏览器自动化 | `infra/browser/` | Playwright、DOM 操作 | ✅ | ✅ | ✅ |
| | 远程桌面编码端 | `infra/desktop/` | 屏幕捕获、输入注入 | ✅ | ✅ | ✅ |
| | 移动端控制 | `infra/mobile/` | ADB、屏幕录制、触控 | ✅ | ✅ | ✅ |
| | 语音处理 | `infra/voice/` | TTS 合成、语音识别 | ✅ | ✅ | ✅ |
| **模型服务** | 模型提供者管理 | `infra/agents/providers/` | OpenAI/DeepSeek/Qwen/GLM/Kimi 配置 | ✅ | ✅ | ✅ |
| | 模型 Relay（新增） | `cloud/model_relay.py` | 智能路由、Token 计费 | | ✅ | |
| | 媒体生成 | `infra/providers/media/` | 图片生成（DALL·E 等） | ✅ | ✅ | ✅ |
| | OLLAMA 本地 | `infra/utils/ollama/` | 本地模型发现、推理 | ✅ | | ✅ |
| | ONNX 推理 | `onnx_models/` | 本地隐私推理 | ✅ | | ✅ |
| **安全认证** | JWT 认证 | `infra/auth/jwt/` | 签发、刷新、撤销 | ✅ | ✅ | ✅ |
| | LDAP | `infra/auth/ldap/` | 企业目录服务 | | | ✅ |
| | OAuth/OIDC | `infra/auth/sso/` | 第三方 SSO | | ✅ | ✅ |
| | 用户/角色管理 | `infra/users/` | CRUD、权限、密码 | ✅ | ✅ | ✅ |
| | 邀请机制 | `api/routers/invites.py` | 注册邀请码 | | ✅ | ✅ |
| | HITL 审批 | `infra/agents/security/hitl_session.py` | 敏感操作人工暂停 | ✅ | ✅ | ✅ |
| | 工具执行守卫 | `infra/agents/security/` | 命令白名单、沙箱 | ✅ | ✅ | ✅ |
| | TLS 证书 | `infra/setup/tls/` | Let's Encrypt | ✅ | | ✅ |
| | 审计日志（新增） | `cloud/audit_log.py` | 全链路审计 | | | ✅ |
| **持久化** | SQLite/PostgreSQL | `infra/db/` | 全部业务数据 | ✅ | ✅ | ✅ |
| | 会话历史 | `infra/history/` | 消息版本化、Token 统计 | ✅ | ✅ | ✅ |
| | 工作区文件 | `infra/backend/` | 沙箱隔离 | ✅ | ✅ | ✅ |
| | 插件存储 | `api/routers/plugins.py` | 注册、安装、启停 | ✅ | ✅ | ✅ |
| **云端增值** | 配置同步原生（新增） | `cloud/sync_service.py` | 跨设备配置和历史同步 | | ✅ | |
| | 配置同步桥接（新增） | `cloud/sync_service.py` | 不上传明文同步 | ✅* | | ✅ |
| | Bridge Agent（新增） | `cloud/bridge_agent.py` | 安全隧道 | | | ✅ |
| | 计费系统（新增） | `cloud/billing.py` | Quota、账单 | | ✅ | |
| | 多租户（新增） | `cloud/tenant.py` | 资源隔离 | | ✅ | |
| | 设备管理（新增） | `cloud/device_manager.py` | 多设备注册 | | ✅ | ✅ |
| | 技能市场 | `api/routers/skills.py` + `marketplace.py` | UGC 上架、分佣 | ✅ | ✅ | ✅ |
| **新增模块** | Capability Registry | `api/v1/capabilities.py` | 能力发现注册 | ✅ | ✅ | ✅ |
| | Feature Flags | `api/v1/feature_flags.py` | 灰度开关 | ✅ | ✅ | ✅ |

（✅* = 可选）

### B. 客户端能力（28 项）

| 类别 | 能力项 | 文件路径 | 说明 |
|------|--------|---------|------|
| **UI 渲染（Web SPA）** | Dashboard 全部页面 | `dashboard/src/pages/` | 对话/Agent/专家/技能/连接器/KB/自动化/设置 |
| | 对话气泡+Markdown | `src/components/Markdown/` | 代码高亮、SVG、流式输出 |
| | 远程桌面 Viewer | `api/routers/browser/` | H264 解码显示 |
| | 浏览器 AI 面板 | `BrowserAiPanel.tsx` | 页面内嵌对话框 |
| | 移动端 AI 面板 | `MobileAiPanel.tsx` | 移动 Web 对话框 |
| | 专家配置 UI | `dashboard/src/pages/Agent/` | 创建/编辑专家、MBTI |
| | Connector 配置 UI | `Settings/sections/connectors.tsx` | 第三方连接器配置 |
| | 知识库管理 UI | `dashboard/src/pages/KnowledgeBases/` | 上传、分块、检索 |
| | 通道管理 UI | `Settings/sections/channels.tsx` | 飞书/钉钉等通道配置 |
| | 定时任务 UI | `dashboard/src/pages/Control/cron/` | Cron 配置、执行日志 |
| | Token 统计 UI | `TokenCountInput.tsx` | 用量展示、成本计算 |
| **Native 壳（桌面壳 Go）** | 系统托盘 | `main.go` | 自启菜单 |
| | 全局快捷键 | `desktop/src/` | 唤起语音、发送消息 |
| | 系统通知 | `desktop/src/` | 新消息推送 |
| | 窗口管理 | `window_chrome.go` | 置顶、无边框 |
| | 防休眠 | `preventsleep_*.go` | 执行长任务时防休眠 |
| | URL Scheme | `openurl.go` | ydzs:// 唤起 |
| | 应用自动更新 | `download.go` | 壳本体 OTA |
| | 文件拖拽 | `filedrop.go` | 拖放文件到托盘 |
| **IO/媒体** | 语音采集 | `hooks/useVoiceInput.ts` | MediaRecorder API |
| | 语音播放 | `hooks/useVoiceOutput.ts` | <audio> 播放 TTS 音频 |
| | PCM 前处理 | `pcm-processor.js` | Web Audio 降噪 AGC |
| | 剪贴板/拖放 | `hooks/` | 截图粘贴、文件上传 |
| **状态缓存** | JWT 缓存 | `AuthContext` | localStorage |
| | 会话缓存 | `useAgentThreadChat.ts` | 最近 N 条副本 |
| | UI 偏好 | `appearanceStorage.ts` | 主题、字号、侧边栏 |
| | 能力发现缓存 | `useServerCapabilities.ts` ← 新增 | capabilities 响应缓存 |
| | SSE/SDK 连接 | `api/request.ts` | 自动重连、Token 刷新 |

### C. 桌面壳 Go 层分类决策

| Go 模块 | 决策 | 理由 |
|---------|:----:|------|
| `main.go` (systray) | ✅ 保留 | macOS/Windows 系统托盘必需 |
| `window_chrome.go` | ✅ 保留 | 窗口外观控制 |
| `settings_window.go` | ✅ 保留 | 独立设置窗口 |
| `download.go` (应用更新) | ✅ 保留 | 壳本体 OTA |
| `preventsleep_*.go` | ✅ 保留 | 防长任务休眠 |
| `filedrop.go` | ✅ 保留 | 拖放文件上传 |
| `openurl.go` | ✅ 保留 | ydzs:// URL Scheme |
| `dock_reopen_darwin.go` | ✅ 保留 | macOS Dock |
| `icons_darwin.go` | ✅ 保留 | 应用图标 |
| `settings.go` | ✅ 保留 | 托盘菜单、自启 |
| **`embed_portable*.go`** | ❌ 移除 | 不再嵌入 Python |
| **`desktop_copy.go`** | ❌ 移除 | 不再内置绿色运行时 |
| **`process.go`** | ❌ 移除 | 不再管理 ydsz-worker 子进程 |
| **`process_unix.go`** | ❌ 移除 | 同上 |
| **`process_windows.go`** | ❌ 移除 | 同上 |

→ 桌面壳 Go 代码净缩减 ~60%，500MB+ → ~80MB

---

## 三、三种接入模式统一架构

### 3.1 客户端统一轻量

```
客户端（Web PWA + 桌面壳 + Mobile App 共享一套代码）
  ↓
ydsz-sdk-typescript（统一 SDK，包含 capabilities 发现）
  ↓
  ├─ 调用 GET /api/v1/capabilities → 获取当前服务端能力列表
  └─ 据此渲染对应 UI（计费/审计/团队管理 等模块按能力开关显示）
```

### 3.2 服务端三模式

```
ydsz-worker run --mode <local|cloud|hybrid>
```

| 模式 | 启用模块 | 能力暴露 | 商业模式 |
|------|---------|---------|---------|
| **local** | Agent引擎 + Cron + Channel + KB + Marketplace + 可选Sync | `model_relay=false` `billing=false` `sync=true(可选)` | 免费 + Bridge订阅增值 ¥19/月 |
| **cloud** | 全部 + ModelRelay + Billing + 多租户 | `model_relay=true` `billing=true` `sync_native=true` | 订阅 ¥49-199 + Token加价 |
| **hybrid** | 全部 + BridgeAgent + Audit + SSO + LDAP | `audit=true` `sso=true` `bridge=true` | 私有化部署 ¥5-50万/年 |

### 3.3 能力发现协议

```
GET /api/v1/capabilities → {
  "mode": "local|cloud|hybrid",
  "capabilities": {
    "agent": true,          // 三种模式都有
    "chat": true,
    "cron": true,
    "channels": true,
    "knowledge_base": true,
    "marketplace": true,
    "model_relay": false,   // 仅 cloud
    "billing": false,       // 仅 cloud
    "sync": true,           // local可选/cloud原生/hybrid桥接
    "sync_native": false,   // 仅 cloud 原生
    "audit": false,         // 仅 hybrid
    "sso": false,           // 仅 hybrid
    "max_agents": null,     // null=无限, 数字=按套餐
    "max_team_members": null,
  }
}
```

客户端根据 capabilities 动态渲染：
- `billing=true` → 显示订阅状态、Token余额
- `model_relay=false` → 显示"自备API Key配置"卡片
- `audit=true` → 显示"审计日志"管理员面板

---

## 四、首次启动流程（统一客户端）

```
┌──────────────────────────────────────────────────────────────┐
│  ① 启动客户端（安装 PWA / 桌面壳 / Mobile App）              │
│                 │                                             │
│                 ▼                                             │
│  ② 服务发现                                                  │
│     · mDNS 搜索本地 :8088                                  │
│     · 或用户手动输入 IP                                     │
│     · 或选择 cloud.ydsz.ai                                  │
│                 │                                             │
│                 ▼                                             │
│  ③ 能力协商  GET /api/v1/capabilities                       │
│                 │                                             │
│                 ▼                                             │
│  ④ 登录（自动判断）                                          │
│     · mode=local  → 本地账号登录                              │
│     · mode=cloud  → 云端 JWT 登录                             │
│     · mode=hybrid → LDAP/SSO 跳转                             │
│                 │                                             │
│                 ▼                                             │
│  ⑤ UI 自适应渲染                                             │
│     · 根据 capabilities 显示/隐藏功能                         │
│     · 进入正常使用                                            │
└──────────────────────────────────────────────────────────────┘
```

---

## 五、交互流程举例

### 5.1 用户发一条消息

```
客户端（纯UI）                API层                   服务端引擎
─────────                  ────────                  ──────────
1. 语音采集+PCM ─┐
2. 文本/fetch ───► 3. JWT校验 ─────► 4. 加载Agent+Workspace
                   5. 返回 SSE ◄─── 6. 调用LLM（模型选择）
7. 流式渲染  ◄──── 8. 返回tokens ── 9. 持久化+更新统计
                                          10. 异步推送通知
```

### 5.2 用户配置飞书通道

```
客户端                             服务端
─────────                         ──────────
1. 填 AppID/Secret
2. POST /api/v1/channels ────────► 3. 加密存储凭证
                                   4. 注册 Webhook URL
                                   5. 测试发送验证
                                   6. 返回状态 ◄────────
7. 显示成功/失败
```

### 5.3 用户升级 Pro（触发计费能力）

```
客户端                             服务端
─────────                         ──────────
1. 点击"升级 Pro"
2. POST /api/v1/billing/subscribe ► 3. 创建订阅记录
                                    4. 调用支付网关
                                    5. Quota 提升 ◄────────
                                    6. capabilities 更新推送
7. UI自动刷新（模型Relay开关打开）
```

---

## 六、服务端技术方案

### 6.1 模块加载逻辑

```python
# server.py

class YdszServer:
    def __init__(self, config):
        # ===== 三种模式共享（infra/ 全部保留）=====
        self.agent_manager = AgentManager()
        self.channel_engine = Gateway()
        self.cron_engine = CronManager()
        self.kb_manager = KnowledgeBaseManager()
        self.expert_registry = ExpertRegistry()
        self.marketplace = MarketplaceService()

        # ===== 模式差异（mode 配置开关）=====
        if config.mode == "cloud":
            self.model_relay = ModelRelay()        # 模型 Relay
            self.billing_service = BillingService() # 计费
            self.sync_service = NativeSyncService() # 原生同步
            self.quota_manager = QuotaManager()     # 配额管理
            self.tenant_manager = TenantManager()   # 多租户

        if config.mode in ("local", "hybrid"):
            if config.cloud_sync.enabled:
                self.sync_service = BridgeSyncService()  # 桥接同步

        if config.mode == "hybrid":
            self.bridge_agent = BridgeAgent()   # Bridge Agent
            self.audit_logger = AuditLogger()   # 审计日志
            self.sso_provider = SSOProvider()   # SSO/LDAP
            self.policy_engine = PolicyEngine() # 策略引擎

        # ===== 统一能力发现 =====
        self.capability_registry = CapabilityRegistry(self)
```

### 6.2 认证双轨

```python
# api/v1/auth.py

POST /api/v1/auth/login
  ├─ mode=local   → POST /auth/local/login  (argon2 verify)
  ├─ mode=cloud   → POST /auth/cloud/login  (JWT签发)
  └─ mode=hybrid  → POST /auth/sso/callback (LDAP/OAuth)
```

### 6.3 路由新增清单

| 新增路由 | 归属模式 | 说明 |
|---------|:--------:|------|
| `GET  /api/v1/capabilities` | L/C/H | 能力发现（三种模式都响应，返回不同能力列表） |
| `POST /api/v1/auth/{local\|cloud\|sso}/login` | L/C/H | 按模式自动分发 |
| `GET  /api/v1/billing/subscription` | C | 当前用户订阅状态 |
| `POST /api/v1/billing/subscribe` | C | 创建订阅 |
| `GET  /api/v1/sync/status` | L(可选)/C/H | 同步状态 |
| `POST /api/v1/sync/trigger` | L(可选)/C/H | 手动触发同步 |
| `GET  /api/v1/admin/audit` | H | 审计日志查询 |
| `POST /api/v1/admin/policy` | H | 管理员下发策略 |
| `GET  /api/v1/admin/devices` | H | 设备管理 |
| `POST /api/v1/marketplace/purchase` | L/C/H | 技能/专家购买 |
| `GET  /api/v1/feature-flags` | L/C/H | Feature flags（灰度开关） |

---

## 七、客户端技术方案

### 7.1 SDK 抽取

```
ydsz-sdk-typescript（独立 npm 包，三端共享）
  │
  ├─ core/
  │   ├─ capabilities.ts     # GET /api/v1/capabilities 调用 + 缓存
  │   ├─ client.ts           # HTTP 客户端 + 自动重连 + Token 刷新
  │   ├─ ws.ts               # WebSocket 客户端 + 事件订阅
  │   └─ auth.ts             # 认证三轨分发
  │
  ├─ modules/
  │   ├─ agents.ts
  │   ├─ chat.ts
  │   ├─ cron.ts
  │   ├─ channels.ts
  │   ├─ knowledge.ts
  │   ├─ marketplace.ts
  │   ├─ sync.ts             # 同步模块
  │   ├─ billing.ts          # 计费模块
  │   └─ admin.ts            # 企业管理
  │
  └─ platforms/
      ├─ web/          # Web PWA 入口
      ├─ wails/        # Wails 绑定
      └─ flutter/      # Flutter 移动端绑定
```

### 7.2 Dashboard 改造

```typescript
// dashboard/src/App.tsx（改造后）

function App() {
  const { caps, loading } = useServerCapabilities();

  if (loading) return <ConnectingScreen />;

  return (
    <Layout>
      <Sidebar>
        <NavItem to="/chat">对话</NavItem>                    {/* 始终显示 */}
        <NavItem to="/agents">专家团</NavItem>                {/* 始终显示 */}
        <NavItem to="/cron">自动化</NavItem>                  {/* 始终显示 */}
        <NavItem to="/knowledge">知识库</NavItem>             {/* 始终显示 */}
        <NavItem to="/marketplace">技能市场</NavItem>         {/* 始终显示 */}
        {caps.audit && <NavItem to="/admin/audit">审计</NavItem>}  {/* 仅 hybrid */}
        {caps.billing && <NavItem to="/billing">订阅</NavItem>}    {/* 仅 cloud */}
      </Sidebar>
      <MainContent>
        <CapabilityGate capability="billing">                 {/* 按能力挂载路由 */}
          <Route path="/billing" element={<BillingPage />} />
        </CapabilityGate>
      </MainContent>
    </Layout>
  );
}
```

### 7.3 桌面壳瘦身

```go
// desktop/src/main.go（改造后）

func main() {
    // 1. 选择服务连接模式
    serverURL := selectServerMode()
    // - 本地自动发现：检测 localhost:8088
    // - 云端直连：api.ydsz.ai
    // - 企业手动输入：192.168.x.x:8088

    // 2. 不再启动 Python 子进程
    // ❌ 移除: embedPortable(), startPythonSubprocess()

    // 3. 启动 WebView 加载 Dashboard SPA
    wails.Start(&config{
        URL: dashboardURL(),
        Systray: true,
        Shortcuts: true,
        Notifications: true,
    })
}
```

### 7.4 桌面壳 Go 层变更清单

| 文件 | 操作 | 理由 |
|------|:----:|------|
| `main.go` | 🔧 重构 | 新增 ServerModeSelector，移除 PythonManager |
| `embed_portable.go` | ❌ 删除 | 不再嵌入 Python 运行时 |
| `embed_portable_embedded.go` | ❌ 删除 | 不再嵌入 |
| `desktop_copy.go` | ❌ 删除 | 不再 |
| `process.go` | ❌ 删除 | 不再管理 Python 子进程 |
| `process_unix.go` | ❌ 删除 | 同上 |
| `process_windows.go` | ❌ 删除 | 同上 |
| `go.sum` 中 embed 依赖 | ❌ 移除 | 清理依赖 |
| `settings.go` | 🔧 改造 | 新增"服务器地址"配置项 |
| `download.go` | 🔧 改造 | 只下载壳本体（移除模型下载部分） |
| 其余文件 | ✅ 保留 | tray、window、filedrop、URL等 |

---

## 八、商业化方案

### 8.1 一句话：为服务端能力付费

> 客户端完全免费统一（用 capabilities 展示可用能力）
> 商业模式 = 服务端运行时能力订阅

### 8.2 定价矩阵

| 套餐 | 月费 | 含能力 | 目标用户 |
|------|------|--------|---------|
| **Free** | ¥0 | 基础 Agent+Cron+Channel+KB（自备Key，20次/天） | 尝鲜 |
| **Pro** | ¥49 | 全功能 + 全模型额度 + 跨设备同步 + 10专家 | 个人重度 |
| **Pro+** | ¥99 | 全功能+优先算力+20专家+Pro模型 | 数码发烧 |
| **Team** | ¥199/人 | 全功能+共享专家池+团队配额+审计 | 小团队 |
| **Enterprise** | ¥5-50万/年 | 私有化部署+Bridge+SSO+SLA | 金融政企 |

### 8.3 Token 加价

| 模型厂商 | 加价幅度 | 备注 |
|---------|:--------:|------|
| DeepSeek | +15% | 年框折扣最优 |
| Kimi | +20% | 中文创作首选 |
| Qwen | +25% | 多模态能力 |
| GLM | +25% | 企业定制 |
| Claude/GPT | +30% | 高端任务 |

---

## 九、实施路线图

### Phase 0（M1-M3）：API 层硬隔离

```
目标：infra/层不直接暴露给客户端，新增 API 层隔离

任务清单：
  [ ] 新增 /api/v1/capabilities 接口（含 capabilities 注册机制）
  [ ] 新增 ydzs-sdk-typescript 包，抽离 dashboard/api/ 层
  [ ] api/v1/auth.py 支持 local/cloud/sso 三轨分发
  [ ] 桌面壳 Go 代码瘦身（删除 embed_portable、desktop_copy、process 子进程管理）
  [ ] Desktop 启动器重构：新增 ServerModeSelector

产出：客户端/服务端代码完全解耦，桌面壳 80MB，启动 < 5s
```

### Phase 1（M3-M4）：云端 MVP + 计费

```
目标：cloud 模式端到端跑通

任务清单：
  [ ] 新增 cloud/billing.py（订阅 + Stripe/连连支付）
  [ ] 新增 cloud/model_relay.py（DeepSeek 优先接入）
  [ ] cloud/sync_service.py（原生同步）
  [ ] API Gateway 支持多租户（tenant_id 隔离）
  [ ] 桌面/移动端 capabilities 响应 cloud 模式 UI

产出：小范围 Beta，100 付费 Pro 用户
```

### Phase 2（M4-M6）：跨设备客户端

```
目标：Mobile App 上线 + 跨设备同步闭环

任务清单：
  [ ] Mobile App（Flutter 技术栈）上线
  [ ] 云同步覆盖 配置+历史+工作区
  [ ] 桌面壳上架（含应用商店 OTA）
  [ ] PCM Worker 移至服务端（可选，保留客户端低延迟）

产出：对标小浣熊"手机发指令，云跑任务"
```

### Phase 3（M6-M8）：企业混合

```
目标：首个券商/政企 PoC

任务清单：
  [ ] cloud/bridge_agent.py（mTLS 隧道）
  [ ] cloud/audit_log.py（全链路审计 + 管理员面板）
  [ ] SSO/LDAP 集成
  [ ] 安全合规申请（SOC2 / 等保）

产出：3 家付费企业客户
```

### Phase 4（M8+）：生态

```
目标：技能市场 + 模型合作伙伴

任务清单：
  [ ] Marketplace 上架审核 + UGC 分润
  [ ] 模型合作伙伴 SDK（第三方接入标准协议）
  [ ] 企业经销商招募

产出：技能开发者可赚钱， 平台佣金收入
```

---

## 十、风险与对策

| 风险 | 对策 |
|------|------|
| API 层重构引入回归 | 现有单元/集成测试覆盖率保护 + 灰度发布 + Feature Flags |
| Token 服务商合作犹豫 | 先 DeepSeek（折扣最优），同步接触多家 |
| Mobile App 跨平台重复 Flutter 端后写 | 先做 iOS（短平快验证，用户付费意愿高） |
| 企业合规周期长 | M6 即开始 SOC2 申请，预留 9 个月 |
| 社区对云端增值部分闭源反弹 | Open Core：核心引擎永久 MIT，仅 cloud/ 增值闭源 |
| Capabilities 缓存导致 UI 刷新延迟 | TTL=60s + 长连接推送刷新事件 |

---

## 十一、待确认事项

### 11.1 架构决策

- [ ] **是否同意 client-server 硬隔离原则，客户端 .ts/.go 文件禁止 import `ydsz.infra` 下的任何模块？**
- [ ] **桌面壳 Go 代码瘦身是否直接删除 embed_portable 等 5 个文件？**
- [ ] **Capabilities 发现接口是否作为 v1.0 强制入口?（所有客户端必须先协商再渲染）**

### 11.2 技术选型

- [ ] **Mobile App 技术栈：Flutter（推荐，音频更强）vs React Native（React 复用）？**
- **ydzs-sdk 语言**：纯 TypeScript（Web + 桌面壳纯 TS）+ Dart（Flutter 端）？

### 11.3 商业化决策

- [ ] **定价锚定：Pro ¥49 / Pro+ ¥99 / Team ¥199 是否合理？**
- [ ] **首批模型 Relay 合作伙伴: DeepSeek（最低价）优先？**
- [ ] **技能市场首版开放 UGC 还是官方自营？**

### 11.4 实施激进度

- [ ] **Phase 0 是否按 M1-M3 节奏（2 人投入）推进？**
- [ ] **是否保留 ElMessage 等现有 UI 组件在 v1.0？**（可先用现有，后续替换为 ydzs-ui）
- [ ] **桌面壳瘦身是否保留 ElMessage 等现有 UI 组件在 v1.0？**（可先用现有，后续替换为 ydzs-ui）
- [ ] **桌面壳瘦身与 API 层重构串行还是并行？**（推荐并行，节省 1 个月）
