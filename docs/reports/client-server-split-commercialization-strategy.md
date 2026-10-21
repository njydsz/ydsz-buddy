# 云顶数字工作台 — 服务端/客户端拆分策略与商业化路径（v0.3）

> **定位：** 会思考、会干活、陪企业成长的智能伙伴
>
> **核心原则：**
> - **客户端统一且轻量**：只有一种客户端，功能完全相同
> - **模式差异由服务端决定**：本地（自托管）/ 云端 / 企业混合，纯服务端配置切换
> - **客户端自动适配能力**：通过 API 发现服务端 capabilities，动态展示可用功能
>
> **竞品对标：** 妙手 CatPaw（美团）、WorkBuddy（腾讯）、Kimi Work（月之暗面）、小浣熊 Raccoon Work（商汤）、OpenCode、DeepSeek Harness
>
> **日期：** 2026-10-21 · v0.3

---

## 一、核心洞察：客户端统一，服务端决定一切

### 1.1 设计哲学

```
之前的认知（v0.2）：
  胖客户端 = 一套代码, 瘦客户端 = 一套代码, 混合 = 一套代码 → 三套 UI 逻辑

现在的认知（v0.3）：
  ┌──────────────── 唯一客户端（统一安装包）────────────────┐
  │  一套代码 · 一样的功能 · 自动适配                       │
  │                                                         │
  │  第一次启动时：                                          │
  │    → 输入服务地址（或扫码）                              │
  │    → 调用 GET /api/v1/capabilities                     │
  │    → 服务端返回当前模式支持的能力列表                    │
  │    → 客户端据此决定显示哪些功能按钮                      │
  └─────────────────────────────────────────────────────────┘
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
  │ 本地服务端   │ │ 云端服务端   │ │ 企业混合服务端│
  │ mode: local │ │ mode: cloud │ │ mode: hybrid │
  │             │ │             │ │              │
  │ 自备 API Key│ │ 平台额度    │ │ 自备 + Bridge│
  │ 本地计费关   │ │ 计费开      │ │ 审计开       │
  │ 能力: A,B,C │ │ 能力: A,B,  │ │ 能力: A,B,C, │
  │             │ │   C,D,E     │ │   D,E,F,G    │
  └─────────────┘ └─────────────┘ └─────────────┘

  客户端不需要知道自己在哪种模式。
  服务端返回什么 capabilities，客户端就展示什么。
```

### 1.2 客户端职责（极简）

| 职责 | 说明 | 禁止 |
|------|------|------|
| UI 渲染 | Dashboard、对话、配置页面 | 不直接调用 infra/ 模块 |
| 网络请求 | 通过 SDK 调用 `/api/v1/*` | 不直连数据库 |
| 输入/输出 | 语音识别、系统通知、文件拖拽 | 不调度 Cron 任务 |
| 本地缓存 | Token、最近会话、UI 偏好 | 不存储业务数据 |
| 能力适配 | 根据 `/capabilities` 展示功能 | 不假设服务端模式 |

### 1.3 服务端职责（全部业务逻辑 + 能力声明）

| 职责 | 三种模式共享 | 仅 local | 仅 cloud | 仅 hybrid |
|------|:----------:|:--------:|:--------:|:---------:|
| Agent 运行时 | ✅ | | | |
| IM 通道引擎 | ✅ | | | |
| 定时任务 Cron | ✅ | | | |
| 知识库 RAG | ✅ | | | |
| 专家/技能市场 | ✅ | | | |
| 会话历史 | ✅ | | | |
| 模型调用（自备 Key） | | ✅ | | ✅ |
| 模型 Relay + 计费 | | | ✅ | |
| 云同步 Sync | | ✅（桥接） | ✅（原生） | ✅ |
| Bridge Agent | | | | ✅ |
| 审计日志 | | | | ✅ |
| 多租户隔离 | | | ✅ | |
| SSO / LDAP | | | | ✅ |

### 1.4 能力发现协议（Capabilities Negotiation）

客户端第一次连接服务端时，通过 HTTP 握手协商可用能力：

```
客户端请求：
  GET /api/v1/capabilities
  Authorization: Bearer <token>

服务端响应（模式一：本地）：
  {
    "mode": "local",
    "capabilities": {
      "agent": true,
      "chat": true,
      "cron": true,
      "channels": true,
      "knowledge_base": true,
      "marketplace": true,
      "model_relay": false,        // ← 本地模式无模型 Relay
      "billing": false,             // ← 本地模式无计费
      "sync": true,                 // ← 本地模式支持云同步（需绑定账号）
      "sync_native": false,         // ← 本地模式的同步依赖 Bridge
      "audit": false,
      "sso": false,
      "max_agents": null,           // ← 本地无限
      "max_team_members": null,
    }
  }

服务端响应（模式二：云端 cloud）：
  {
    "mode": "cloud",
    "capabilities": {
      "agent": true,
      "chat": true,
      "cron": true,
      "channels": true,
      "knowledge_base": true,
      "marketplace": true,
      "model_relay": true,          // ← 云端支持模型 Relay
      "billing": true,              // ← 云端有计费
      "sync": true,
      "sync_native": true,          // ← 云端原生同步
      "audit": false,
      "sso": false,
      "max_agents": 10,             // ← Pro 订阅限额
      "max_team_members": 10,
    }
  }

服务端响应（模式三：混合 hybrid）：
  {
    "mode": "hybrid",
    "capabilities": {
      "agent": true,
      "chat": true,
      "cron": true,
      "channels": true,
      "knowledge_base": true,
      "marketplace": true,
      "model_relay": false,         // ← 企业自备模型
      "billing": false,
      "sync": true,
      "sync_native": false,         // ← 混合模式同步走 Bridge
      "audit": true,                // ← 审计开启
      "sso": true,                  // ← SSO 集成
      "max_agents": null,
      "max_team_members": 50,       // ← 企业按 License 限额
    }
  }
```

客户端据此决定 UI 渲染：

```typescript
// dashboard/src/hooks/useServerCapabilities.ts
const caps = await fetchCapabilities(serverUrl);

// 计费相关 UI
showBillingSection = caps.capabilities.billing;
showModelRelaySelector = caps.capabilities.model_relay;

// 同步相关 UI
showCloudSyncButton = caps.capabilities.sync;
syncModeLabel = caps.capabilities.sync_native ? "云同步" : "桥接同步";

// 企业管理 UI
showAdminPanel = caps.capabilities.audit || caps.capabilities.sso;
showTeamManagement = caps.capabilities.max_team_members > 1;
```

---

## 二、统一客户端设计

### 2.1 三种形态，一套代码

```
┌─────────────────────────────── 统一客户端 ──────────────────────────────┐
│                                                                        │
│                    代码完全相同 · 功能完全一样                            │
│                    大小 ~80MB · 启动 < 3 秒                              │
│                                                                        │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │  Dashboard SPA（React）                                          │  │
│   │    ├─ 对话页 / Agent 管理 / Cron / Channels / KB / Marketplace   │  │
│   │    ├─ 统一 SDK 调用 `/api/v1/*`（ydsz-sdk-typescript）          │  │
│   │    └─ capabilities hook 动态渲染可用功能                         │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐             │
│   │ 桌面壳（Wails）│   │ Web PWA      │   │ Mobile App   │             │
│   │ + 托盘        │   │              │   │ + 语音输入   │             │
│   │ + 全局快捷键  │   │              │   │ + 通知推送   │             │
│   │ + 系统通知    │   │              │   │              │             │
│   └──────────────┘   └──────────────┘   └──────────────┘             │
│                                                                        │
│   启动 → 选择服务 → 连接 → 获取 capabilities → 渲染对应 UI             │
│   · localhost:8088 (本地)     · 自动发现 · 渲染 local 模式 UI          │
│   · cloud.ydsz.ai (云端)      · 自动发现 · 渲染 cloud 模式 UI          │
│   · 192.168.x.x:8088 (企业)   · 自动发现 · 渲染 hybrid 模式 UI        │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.2 首次启动流程（统一交互）

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   ① 启动客户端（桌面壳/浏览器/App）                           │
│              │                                               │
│              ▼                                               │
│   ② 服务发现 / 手动输入                                      │
│     ├─ 自动发现：mDNS 搜索本地 :8088（胖客户端场景）          │
│     ├─ 手动输入：http://192.168.x.x:8088（企业内网）          │
│     └─ 选择云端：https://api.ydsz.ai                        │
│              │                                               │
│              ▼                                               │
│   ③ 能力协商                                                 │
│     └─ GET /api/v1/capabilities → { mode, capabilities }    │
│              │                                               │
│              ▼                                               │
│   ④ UI 自适应                                                │
│     ├─ mode="local" → 隐藏计费/仪表盘，显示自备 Key 配置     │
│     ├─ mode="cloud" → 显示订阅状态、Token 余额、高级模型选择  │
│     └─ mode="hybrid" → 显示企业管理入口、审计日志           │
│              │                                               │
│              ▼                                               │
│   ⑤ 进入正常使用                                             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 2.3 模式切换（用户视角）

```
场景 1：极客小李在家使用胖客户端
  安装 ydsz-worker → 启动本地服务 → 桌面壳连接 localhost
  → 自动识别为 local 模式 → 功能 A/B/C 可用
  后来想要手机远程控制：
  → 设置中点击"绑定云端账号" → 同步能力开启
  → 服务端 sync 模块自动启用 → UI 显示同步状态
  （同一客户端，同一安装包，无需重装）

场景 2：员工小王在公司使用瘦客户端
  浏览器打开 cloud.ydsz.ai → 手机验证码登录
  → 自动为 cloud 模式 → 功能 A-G 可用（含计费和模型 Relay）
  同时在家中打开同一网址 →自动延续 sessions
  （完全无需安装，零配置）

场景 3：券商某券商在企业内网使用混合客户端
  管理员部署 ydsz-worker --mode hybrid
  → 员工桌面壳连接内网地址 → 自动识别为 hybrid 模式
  → 功能 A-G 全可用（含审计和 SSO）
  管理员通过云端管控面统一管理所有企业实例
```

---

## 三、服务端三种模式设计

### 3.1 模式一：本地（local）

**用户画像：** 开发极客 / 一人公司 / 隐私敏感企业 / 边缘无网环境

```bash
# 启动命令（用户执行）
ydsz-worker run --mode local --listen 127.0.0.1:8088

# 配置片段（config.json）
{
  "mode": "local",
  "auth": "local",           // 本地账号
  "model": {
    "provider": "manual",    // 用户自备 API Key
  },
  "cloud_sync": {
    "enabled": false,        // 默认关闭
    "bridge_endpoint": null, // 绑定云端后自动填充
  },
  "modules": {
    "billing": false,
    "model_relay": false,
    "audit": false,
    "bridge": false,
  }
}
```

**能力暴露：** `model_relay=false, billing=false, audit=false`

**商业模式：**
- 服务端本身完全免费开源
- 增值服务来自用户**可选**绑定的云同步账户（¥19/月 Bridge 同步）

### 3.2 模式二：云端（cloud）

**用户画像：** 普罗大众 / 轻度用户 / 跨设备协同 / 无 GPU 用户

```bash
# 启动命令（云平台运维执行，多租户部署）
ydsz-worker run --mode cloud --listen 0.0.0.0:8088 --tenant-id=<uuid>

# 配置片段
{
  "mode": "cloud",
  "auth": "cloud_jwt",       // 云端 JWT
  "model": {
    "provider": "relay",     // 平台统一调用（第三方 Token 服务商）
    "relay_endpoint": "https://relay.ydsz.ai",
  },
  "cloud_sync": {
    "enabled": true,
    "native": true,
  },
  "modules": {
    "billing": true,
    "model_relay": true,
    "audit": false,
    "bridge": false,
    "marketplace": true,
    "quota": true,
  }
}
```

**能力暴露：** `model_relay=true, billing=true, sync_native=true, audit=false`

**商业模式：** Free / Pro ¥49 / Pro+ ¥99 / Team ¥199（订阅 + token 加价 15-25%）

**与第三方 Token 服务商合作：**

```
用户 A 发起对话请求
  ↓
cloud.ydsz.ai API Gateway
  ↓ Auth 校验 + Quota 检查
  ↓
云顶 Model Relay Service
  ↓ 智能路由（按任务选最优模型 + 性价比优先）
  ├→ DeepSeek（代码任务，走年框折扣）
  ├→ Kimi（中文创作，走批量团购）
  └→ Qwen-VL（视觉任务，按需调用）
  ↓ Token 计量 → 计费系统 → 扣减用户余额
  ↓
返回结果给用户 A 的客户端
```

**合作商分层：**

| 层级 | 合作方式 | 毛利率 |
|------|---------|--------|
| L1 API 代采 | 服务商直供，平台加价 25-30% | 高，需垫资 |
| L2 OEM 接口 | 服务商白标接口，统一计费用 | 中，毛利 20-25% |
| L3 战略年框 | 年保量 + 阶梯折扣 | 低，但可谈判 |

### 3.3 模式三：混合（hybrid）

**用户画像：** 金融券商 / 政府私企 / 有等保要求的组织

```bash
# 启动命令（企业 IT 管理员执行）
ydsz-worker run --mode hybrid \
  --listen 0.0.0.0:8088 \
  --bridge-endpoint wss://bridge.ydsz.ai \
  --bridge-cert /etc/ydsz/bridge.pem \
  --license /etc/ydsz/license.lic

# 配置片段
{
  "mode": "hybrid",
  "auth": "sso_ldap",        // 对接企业 LDAP/SSO
  "model": {
    "provider": "manual",    // 企业自备 API Key（合规要求）
    "internal_model_url": "http://llm.internal.corp/v1"  // 可选：内部模型
  },
  "cloud_sync": {
    "enabled": true,         // 走 Bridge，不是原生同步
    "native": false,
    "bridge_endpoint": "wss://bridge.ydsz.ai"
  },
  "modules": {
    "billing": false,        // 企业不按量计费
    "model_relay": false,    // 企业自备
    "audit": true,           // 审计全量开启
    "bridge": true,          // Bridge Agent 连接云端
    "marketplace": true,     // 通过云端拉取已审核技能
  },
  "compliance": {
    "log_retention_days": 180,
    "audit_level": "full",
    "sso_provider": "ldap",
    "ip_whitelist": ["10.0.0.0/8"]
  }
}
```

**能力暴露：** `model_relay=false, billing=false, audit=true, sso=true, team_management=true`

**商业模式：** 私有化部署 + 云端管控面订阅（¥5-50 万/年 + Bridge ¥1 万/年）

### 3.4 三种模式的能力对比矩阵

| 能力 | local | cloud | hybrid |
|------|:-----:|:-----:|:------:|
| **基础能力** | | | |
| 单 Agent 对话 | ✅ | ✅ | ✅ |
| 多 Agent 协作（AgentTeams） | ✅ | ✅ | ✅ |
| 定时任务（Cron） | ✅ | ✅ | ✅ |
| IM 通道（飞书/钉钉/微信等） | ✅ | ✅ | ✅ |
| 知识库 RAG | ✅ | ✅ | ✅ |
| 专家/技能市场 | ✅ | ✅ | ✅ |
| 浏览器/终端沙箱 | ✅ | ✅ | ✅ |
| | | | |
| **模型相关** | | | |
| 用户自备 API Key | ✅ | ✅ | ✅ |
| 平台 Relay（免 Key） | | ✅ | |
| Token 余额/订阅显示 | | ✅ | |
| 跨模型智能路由 | | ✅ | |
| | | | |
| **同步相关** | | | |
| 配置同步（Bridge） | ✅（可选） | | ✅ |
| 会话历史同步（原生） | | ✅ | |
| 多设备在线 | | ✅ | |
| | | | |
| **企业管理** | | | |
| 团队管理 | | ✅ | ✅ |
| SSO / LDAP | | | ✅ |
| 审计日志 | | | ✅ |
| 策略下发 | | | ✅ |
| 多租户隔离 | | ✅ | |
| | | | |
| **限额** | | | |
| Agent 数量 | 无限 | 按套餐 | 按 License |
| 团队成员 | 无限 | 按套餐 | 按 License |
| 存储空间 | 本地磁盘 | 云端分配 | 本地磁盘 |

---

## 四、服务端技术实现

### 4.1 代码改动范围

**核心原则：infra/ 层几乎不动，三种模式复用同一套业务逻辑，差异仅在"启用哪些模块"。**

| 改动区域 | 改动量 | 说明 |
|---------|:------:|------|
| `api/v1/capabilities.py` | 🆕 新增 | 能力发现接口 |
| `api/v1/billing.py` | 🆕 新增 | 计费相关接口 |
| `api/v1/sync.py` | 🆕 新增 | 同步相关接口 |
| `api/v1/bridge.py` | 🆕 新增 | Bridge Agent 接口 |
| `api/v1/auth.py` | 🔧 重构 | 支持 local_jwt / cloud_jwt / ldap 三轨 |
| `launch.py` | 🔧 重构 | 新增 `--mode` 参数 |
| `server.py` | 🔧 小改 | 根据 mode 初始化对应模块 |
| `infra/` | ✅ 基本不动 | 三种模式共享 |
| `cloud/` | 🆕 新增模块 | 计费/同步/审计/Bridge |
| `dashboard/` | 🔧 重构 | 改为纯 UI 客户端，使用 SDK |

### 4.2 服务端模块加载逻辑

```python
# server.py

class YdszServer:
    def __init__(self, config: OctopConfig):
        # === 三种模式共享的核心模块 ===
        self.agent_manager = AgentManager(self)
        self.channel_engine = ChannelEngine(self)
        self.cron_engine = CronEngine(self)
        self.kb_manager = KnowledgeBaseManager(self)
        self.expert_registry = ExpertRegistry(self)
        self.marketplace = MarketplaceService(self)

        # === 按 mode 加载可选模块 ===
        if config.mode in ("local", "cloud", "hybrid"):
            # 模型提供器（三种模式都需要，但配置不同）
            if config.mode == "cloud":
                self.model_provider = ModelRelayProvider(config.model_relay)
            else:
                self.model_provider = ManualKeyProvider()  # 自备 Key

        if config.mode == "cloud":
            # 纯云端模块
            self.billing_service = BillingService(self)
            self.quota_manager = QuotaManager(self)
            self.sync_service = NativeSyncService(self)
            self.tenant_manager = TenantManager(self)

        if config.mode in ("local", "hybrid"):
            # 本地或混合：可选的云同步
            if config.cloud_sync.enabled:
                self.sync_service = BridgeSyncService(self)

        if config.mode == "hybrid":
            # 企业混合专属
            self.bridge_agent = BridgeAgent(self)
            self.audit_logger = AuditLogger(self)
            self.sso_provider = SSOProvider(config.sso)
            self.policy_engine = PolicyEngine(self)
```

### 4.3 统一 Dashboard 客户端

```typescript
// Dashboard 启动流程（伪代码）

async function bootstrap() {
  // 1. 获取服务地址
  const serverUrl = await discoverServer()    // mDNS / 用户输入 / 书签
  // 2. 能力协商
  const caps = await ydzsSdk.getCapabilities(serverUrl)
  // 3. 根据模式决定 UI
  configureRouter(caps.capabilities)          // 注册可用路由
  setupNavigation(caps.capabilities)          // 配置菜单
  initializeLayout(caps.mode)                 // 设置主题/branding
  // 4. 启动 React App
  createRoot(document.getElementById('root')).render(<App />)
}

// Capabilities-driven UI 示例
function SettingsPage() {
  const { caps } = useServerCapabilities()

  return (
    <SettingsLayout>
      <AccountSection />                        {/* 三种模式都显示 */}
      <ModelConfigSection />                    {/* 三种模式都显示 */}
      {caps.model_relay && <ModelRelaySection />}   {/* 仅 cloud */}
      {caps.billing && <BillingSection />}          {/* 仅 cloud */}
      {caps.sync && <SyncSection mode={caps.sync_native ? 'native' : 'bridge'} />}
      {caps.audit && <AuditSection />}              {/* 仅 hybrid */}
      {caps.sso && <SSOSection />}                  {/* 仅 hybrid */}
    </SettingsLayout>
  )
}
```

---

## 五、客户端实现

### 5.1 桌面客户端

```
从"嵌 Python 完整运行时"变为"纯 UI 壳 + 自动发现本地服务 + 可连云端"

改动重点：

封装前（胖客户端）：
  Go 壳 → 启动 Python 子进程 → Python 服务 Dashboard → 浏览器嵌入访问

封装后（统一轻壳）：
  Go 壳 → 启动器 UI（选择服务地址）→ Dashboard SPA 加载 → 连接 API
         │
         └─ 本地服务自动发现（mDNS 搜索 :8088）
         └─ 云端直连 api.ydsz.ai
         └─ 企业连接用户配置的地址
```

**关键决策：桌面壳不再启动 Python 进程。** Python 进程仅在用户主动安装 ydsz-worker 时启动，桌面壳只是 API 客户端。

### 5.2 Web PWA（最简入口）

```
用户无需安装任何软件：
  1. 浏览器打开 https://cloud.ydsz.ai
  2. SPA 加载（首次 < 1s，缓存后 < 200ms）
  3. 登录后直连云端 API
  4. 可选"安装为 PWA"添加到桌面/手机主屏

PWA 本身就是"统一客户端"的 Web 实现，代码与桌面壳共享 Dashboard SPA。
```

### 5.3 Mobile App（最精简）

```
移动端客户端职责进一步精简：
  · 只做语音输入 + 对话浏览 + 推送接收，极简 UI
  · 完整功能在"设置-连接到服务"中配置（同桌面壳）
  · 支持模式：方案 A. 纯云端（推荐大众用户）/ 方案 B. 连接本地/企业（高级用户）
  · 客户端体积 < 30MB（不含 Python，不含模型）
```

### 5.4 SDK 设计

```
ydsz-sdk（所有客户端共享）
  ├─ core/
  │   ├─ capabilities.ts      # 能力发现与缓存
  │   ├─ client.ts            # HTTP 客户端 + 自动重连
  │   ├─ ws.ts                # WebSocket + 事件订阅
  │   └─ auth.ts              # Token 管理 + 自动刷新
  │
  ├─ modules/
  │   ├─ agents.ts
  │   ├─ chat.ts
  │   ├─ cron.ts
  │   ├─ channels.ts
  │   ├─ knowledge.ts
  │   ├─ marketplace.ts
  │   ├─ sync.ts              # 同步模块
  │   ├─ billing.ts           # 计费模块
  │   └─ admin.ts             # 企业管理
  │
  └─ platforms/
      ├─ web/                  # Web 入口
      ├─ wails/                # Wails 绑定
      └─ rn/                   # React Native 绑定
```

---

## 六、商业化路径

### 6.1 一句话总结

> **客户端完全免费统一，商业模式 = 为服务端能力付费。**

### 6.2 收入模型

| 收入来源 | 模式 | 单价 | 规模化难度 |
|---------|------|------|----------|
| Bridge 云同步订阅 | local 用户可选 | ¥19/月 | 低 |
| Pro 订阅（含模型 Relay） | cloud 用户 | ¥49/月 | 中 |
| Pro+ 订阅（含高级模型） | cloud 用户 | ¥99/月 | 中 |
| Team  Seat | cloud 团队用户 | ¥199/月/人 | 中 |
| Token 加价（第三方算力） | cloud 按量 | +15-25% | 低（自动计费） |
| 企业私有化 Bridge 管控 | hybrid 企业 | ¥1 万/年 | 高 |
| 企业 License 部署 | hybrid 企业 | ¥5-50 万/年 | 高 |
| 技能平台佣金 | 全部模式 | 20% 抽佣 | 中 |

### 6.3 推荐商业化推进路线

```
Phase 0（M1-M3）：服务端 API 分离
  └─ 客户端/服务端解耦，ydsz-sdk 就绪
  └─ capabilities 接口上线
  └─ 不影响现有胖客户端用户

Phase 1（M3-M5）：模式二-Pro 订阅验证
  └─ 云端 ydsz-worker --mode cloud 单租户验证
  └─ 集成 1-2 家第三方 Token 服务商（DeepSeek 优先）
  └─ 计费系统 MVP + 支付接入
  └─ 统一客户端上线（Web PWA + 桌面壳）
  └─ 目标：100 付费 Pro 用户

Phase 2（M5-M8）：模式二-生态扩展
  └─ 桌面壳 + Mobile App 上架
  └─ 技能市场开放上架
  └─ 多模型接入（Kimi/Qwen/GLM）
  └─ 目标：1000 付费 Pro 用户 + 10 万 MAU

Phase 3（M8-M12）：模式三-企业混合
  └─ Bridge Agent + 企业管控面开发
  └─ 首个券商/政企 PoC
  └─ 合规认证（SOC2 / 等保）
  └─ 目标：3 家付费企业客户

Phase 4（M12+）：模式一-增值服务
  └─ Bridge 远程访问/同步作为增值产品
  └─ 个人极客变现（¥19-39/月）
```

---

## 七、关键风险与对策

| 风险 | 概率 | 影响 | 对策 |
|------|:----:|:----:|------|
| API 化大规模重构引入回归 bug | 高 | 高 | 现有 Coverage 保护 + 灰度 rollout + 功能开关 |
| 第三方 Token 服务商合作失败 | 中 | 高 | 同时多渠道谈判，不绑定单一供应商 |
| 统一客户端开发周期超出预期 | 中 | 中 | 分形态交付（先 Web PWA → 桌面壳 → Mobile） |
| 企业合规认证延迟 | 高 | 中 | M6 即启动申请，预留 6-12 个月 |
| 付费转化率不及预期 | 中 | 高 | 先邀请制验证 PMF，不急于获客投放 |
| 云端成本高（模型调用垫资） | 高 | 中 | 预充值模式 + 阶梯定价 + 限量邀请制 |

---

## 八、待确认事项

### 8.1 核心架构

- [ ] **A. 是否确定"客户端完全统一、模式由服务端决定"为核心设计原则？**
- [ ] **B. 桌面壳是否彻底去掉"嵌入 Python 运行时"？**（改造为纯 UI 壳）
- [ ] **C. Web PWA 是否为最优先交付的客户端形态？**（最大化零摩擦获客）
- [ ] **D. Mobile App 首版是否采用 React Native / Flutter？**

### 8.2 服务端模式

- [ ] **E. 服务端模式用 `--mode {local|cloud|hybrid}` 命名是否合适？**
- [ ] **F. 本地模式可选的云同步增值包是否在 v1.0 范围？**
- [ ] **G. 第三方 Token 服务商首选合作伙伴？**（DeepSeek / Kimi / Qwen / 其他）

### 8.3 商业化

- [ ] **H. 基础定价：Pro ¥49 / Pro+ ¥99 / Team ¥199 是否合理？**
- [ ] **I. Token 加价基准：+15-25% 是否可接受？（对比 OpenCode 加价基准）**

### 8.4 实施

- [ ] **J. Phase 0 目标服务接口就绪日期？**（建议 2027 Q1）
- [ ] **K. 是否需要在 Phase 0 之前先做现有 API 的全面审计？**
