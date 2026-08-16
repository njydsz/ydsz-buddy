# 2. 环境变量 YDSZ_BOOTSTRAP_TOKEN E2E 测试

真桌面端到端测试套件，覆盖 Tauri 桌面应用全流程。

> 目录已合并到 `ydsz-desktop/e2e/`，跟 `ydsz-mobile/e2e/maestro/` 的内嵌布局保持一致。

## 工具栈

- **[Playwright](https://playwright.dev)** — 浏览器/桌面 E2E 编排
- **[Tauri Driver](https://github.com/tauri-apps/tauri/tree/dev/crates/tauri-driver)** — Tauri 桌面 WebDriver 协议
- **WebDriver 协议** — tauri://localhost 通过 4444 端口

## 目录

```
ydsz-desktop/e2e/
├── tests/
│   ├── fixtures/         # Playwright fixture（每 spec 独立 context）
│   ├── page-objects/     # 页面对象（业务语义化方法）
│   ├── helpers/          # axe-helper 等公共工具
│   └── specs/            # 测试用例（按场景分文件）
├── scripts/
│   └── start-tauri-driver.mjs
├── playwright.config.ts
└── README.md
```

## 用例清单（P0 / P1）

| ID | 场景 | 文件 | 标签 |
| --- | --- | --- | --- |
| E2E-001 | 启动 → 进入 ChatView → 看见空态 | `smoke.spec.ts` | @smoke @p0 |
| E2E-002 | 启动 → 点击 New Thread → 仍为空态 | `smoke.spec.ts` | @smoke @p0 |
| E2E-P1-001 | 浅色/深色/系统模式切换同步到 `<html>` | `theme-switching.spec.ts` | @p1 @theme |
| E2E-P1-002 | Cmd/Ctrl+K 打开命令面板 + 模糊搜索 + Esc 关闭 | `command-palette.spec.ts` | @p1 @command-palette |
| E2E-P1-003 | 侧边栏 toggle 折叠/展开 | `sidebar-toggle.spec.ts` | @p1 @sidebar |
| E2E-P1-004 | 在 composer 输入文本后看到 user message | `chat-composer.spec.ts` | @p1 @composer |
| E2E-P1-005 | 通过侧边栏命令卡跳转到 Skills 视图 | `skills-view.spec.ts` | @p1 @skills |
| E2E-P1-006 | 通过侧边栏命令卡跳转到 Wiki 视图 | `wiki-view.spec.ts` | @p1 @wiki |
| E2E-P1-007 | 离线事件触发顶栏网络状态徽章 | `network-status.spec.ts` | @p1 @network |

## 编写规范

### 元素定位
**必须**使用 `data-testid` 锚点，不要使用 CSS class。

```tsx
// ✅ 推荐
<button data-testid="composer-send-button">发送</button>

// ❌ 禁止
<button className="bg-blue-500 ...">发送</button>
```

### 测试用例命名
`<MODULE>-<NUMBER> <业务动作>`，例如：
- `E2E-001 启动 → 进入 ChatView → 看见空态`
- `E2E-002 启动 → 点击 New Thread → 仍为空态`
- `E2E-P1-001 浅色/深色/系统模式切换同步到 <html>`

### 标签
- `@smoke` — 冒烟用例（每次 release 前必跑）
- `@p0` / `@p1` / `@p2` — 优先级
- `@flaky` — 不稳定用例（自动 quarantine，不阻塞主线 PR）
- `@theme` / `@command-palette` / `@sidebar` / `@composer` / `@skills` / `@wiki` / `@network` — 模块标签

## 项目分片（Project Sharding）

`playwright.config.ts` 定义两个项目：

- **`stable`**（默认）— 承载所有稳定用例，CI 必跑。用 `grepInvert: /@flaky/` 排除 flaky 标签。
- **`flaky-quarantine`** — 承载 `@flaky` 用例，CI 默认不跑（`workflow_dispatch` / 定时任务触发）。失败 `continue-on-error: true`，不阻塞主线。

```bash
# 跑 stable（默认）
pnpm --filter @ydsz-buddy/desktop test:e2e

# 跑 flaky-quarantine
pnpm --filter @ydsz-buddy/desktop test:e2e:flaky

# 通过环境变量临时跑指定标签
PLAYWRIGHT_GREP=@flaky pnpm --filter @ydsz-buddy/desktop test:e2e
```

## 本地运行

```bash
# 1. 安装依赖
cd ydsz-desktop
pnpm install
pnpm test:e2e:install   # 安装 Playwright 浏览器（仅首次）

# 2. 安装 tauri-driver（首次）
cargo install tauri-driver --locked

# 3. 启动桌面构建（需先 build 一次）
cd ydsz-desktop
pnpm tauri build --debug

# 4. 跑 E2E
cd ydsz-desktop
pnpm test:e2e
```

## CI 集成

`.github/workflows/e2e.yml` 自动：
1. 在 ubuntu/windows/macos 上构建 Tauri 桌面
2. 启动 tauri-driver
3. 跑 `stable` project 的 Playwright 用例
4. 上传 trace/视频/junit 到 artifact
5. （nightly / 手动触发）跑 `flaky-quarantine` project

## 调试

```bash
# Headed 模式
pnpm --filter @ydsz-buddy/desktop test:e2e:headed

# 单个 spec 调试
pnpm --filter @ydsz-buddy/desktop test:e2e:debug -- tests/specs/smoke.spec.ts

# 打开上次 report
pnpm --filter @ydsz-buddy/desktop test:e2e:report
```

## 页面对象（Page Object）列表

| 类 | 文件 | 描述 |
| --- | --- | --- |
| `ChatViewPage` | `chat-view.page.ts` | 聊天主界面、composer、消息、命令面板 |
| `SidebarPage` | `sidebar.page.ts` | 侧边栏折叠/展开、导航命令 |
| `ThemePage` | `theme.page.ts` | 浅色/深色/系统主题切换 |
| `CommandPalettePage` | `command-palette.page.ts` | Cmd+K 命令面板操作 |
| `NetworkStatusPage` | `network-status.page.ts` | 网络状态指示器 |
| `RoutesPage` | `routes.page.ts` | 路由跳转（Skills / Wiki / Plugins / Automations） |
