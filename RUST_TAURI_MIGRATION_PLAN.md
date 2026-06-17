# Rust + Tauri + React 迁移完善计划（完全替换版）

> 本文档基于新约束制定：
> 1. Tauri 2 完全替代 Electron，**不保留 Electron 任何代码**。
> 2. Rust 后端完全替代 TypeScript 后端，**删除 `apps/server`**。
> 3. 前端 React 代码保持不变，**不再维护 web 端**，全部移动到 `apps/desktop/src` 下。
>
> 状态：待评审 / 版本：0.2.0 / 更新日期：2026-06-18

---

## 1. 目标与范围

### 1.1 总体目标

- **后端**：`crates/remi-server` 成为唯一后端，承载全部 HTTP / WebSocket JSON-RPC 业务。
- **桌面壳**：Tauri 2 成为唯一桌面运行时，负责窗口管理、系统对话框、浏览器面板、自动更新、通知、后端进程托管。
- **前端**：将 `apps/web/src` 下的 React 代码整体迁移到 `apps/desktop/src`，作为 Tauri 的前端入口；不再保留 web 独立入口。
- **构建与发布**：Tauri CLI 成为桌面端唯一的打包、签名、自动更新入口；`electron-builder` 与 `apps/server` 构建脚本全部移除。

### 1.2 不在本阶段范围

- 大模型协议本身的重构（保持现有 JSON-RPC / WebSocket 协议不变）。
- React 组件大规模重写（仅做目录迁移与运行时装适配）。
- 移动端支持（Tauri mobile 暂不启用）。

---

## 2. 当前真实状态

> 注意：根目录的 `RUST_MIGRATION_SUMMARY.md` 对完成度估计偏高。以下基于源码实际审计结果。

### 2.1 已具备的基础

| 模块 | 状态 | 说明 |
|------|------|------|
| Cargo Workspace | ✅ 已搭建 | 11 个 crate 结构清晰，依赖管理规范。 |
| 配置与日志 | ✅ 可用 | `remi-core` 提供 `ServerConfig`、`Error` 类型与 tracing 初始化。 |
| 数据库与迁移 | ✅ 可用 | `remi-persistence` 使用 SQLite + sqlx，具备 `ThreadRepository`、`ProjectRepository`。 |
| Tauri 壳骨架 | ✅ 已搭建 | `apps/desktop/src-tauri` 可编译运行，能启动后端子进程。 |
| 前端桥接层 | 🔄 部分 | `tauriBridge.ts`/`tauriSetup.ts` 已写出，但与 Rust commands 存在命名/功能不匹配。 |
| CI | 🔄 部分 | `.github/workflows/rust-ci.yml` 已存在，但缺少 Tauri 构建与集成测试。 |

### 2.2 关键缺口

#### A. Rust 后端业务实现不足

- **RPC 方法覆盖率极低**：`crates/remi-contracts/src/rpc.rs` 中定义了约 40 个方法，但 `crates/remi-rpc/src/handler.rs` 仅实现了 `thread.*`、`git.status`、`git.listBranches`、`git.init`、`filesystem.browse`，其余全部返回 `Method not implemented`。
- **Provider 适配器单一**：`remi-providers` 只有 `ClaudeAdapter`；缺少 Codex、Cursor、Gemini、Grok、OpenCode、Pi、Kilo 等适配器。
- **Git 操作残缺**：仅实现 `status`、`createBranch`、`listBranches`、`init`；缺少 `checkout`、`pull`、`stash`、`worktree`、`diff`、`PR 相关` 等。
- **Terminal 未接入 RPC**：`remi-pty` 能创建 PTY，但 `TerminalManager` 未注册到 RPC，也没有 WebSocket 输出推送。
- **Auth 未接入 RPC**：`remi-auth` 有 `bootstrap`/`create_pairing_credential`，但 `auth.*` RPC 未在 handler 中实现。
- **Orchestration 简陋**：只支持简单的 `CreateThread`/`SendMessage`/`DeleteThread`，无 provider 选择、工具调用、流式响应、plan 模式、附件处理。

#### B. Tauri 桌面壳大量桩代码

- **浏览器面板未真正落地**：`browser.rs` 只维护内存状态，没有实际创建 Tauri webview 窗口；截图、CDP、剪贴板复制均为空实现。
- **自动更新不完整**：`updater.rs` 只做 GitHub Release 查询，没有调用 `tauri-plugin-updater` 的真实下载/安装/重启逻辑。
- **上下文菜单未实现**：`commands::show_context_menu` 直接返回 `None`。
- **主题设置未实现**：`commands::set_theme` 仅打印日志。
- **语音转写命令缺失**：`tauriBridge.ts` 调用 `server_transcribe_voice`，但 `commands.rs` 未注册该命令。
- **菜单事件未打通**：`tauriBridge.ts` 监听 `menu-action` 事件，但 Rust 端没有发送该事件。
- **更新状态事件未打通**：`tauriBridge.ts` 监听 `update-state` 事件，但 Rust 端没有发送该事件。

#### C. 前端桥接与命令不匹配

| `tauriBridge.ts` 调用 | Rust `commands.rs` 实际注册 | 状态 |
|-----------------------|----------------------------|------|
| `confirm_dialog`      | `confirm`                  | ❌ 不匹配 |
| `server_transcribe_voice` | 未注册                 | ❌ 缺失 |
| `browser_attach_webview`  | 未注册                 | ❌ 缺失 |
| `browser_open_devtools`   | `browser_open_dev_tools`（下划线） | ⚠️ 命名不一致 |
| `menu-action` 事件    | 未发送                     | ❌ 缺失 |
| `update-state` 事件   | 未发送                     | ❌ 缺失 |
| `browser-state` 事件  | 未发送                     | ❌ 缺失 |

#### D. 目录与构建流程未切换

- `apps/web` 仍是独立应用，拥有独立的 `index.html`、`vite.config`、`package.json`。
- `apps/desktop/src` 下仍残留大量 Electron 主进程代码（`main.ts`、`preload.ts`、`browserManager.ts`、`updateMachine.ts` 等），待清理。
- `scripts/dev-runner.ts` 仍引用 `apps/server/dist/index.mjs`。
- `tauri.conf.json` 的 `shell` 插件 scope 仍指向 Node 后端。
- Tauri 的 `beforeDevCommand`/`beforeBuildCommand` 没有自动编译 `remi-server`。
- 没有为 Tauri 打包配置 `remi-server` binary 的 sidecar / resources 拷贝。
- 自动更新公钥与 endpoint 仍是占位符（`REPLACE_WITH_ACTUAL_PUBKEY`、nicegui URL）。

---

## 3. 目录结构调整

迁移完成后的目标结构：

```
apps/
  desktop/
    src/                    # 原 apps/web/src 的 React 代码整体移入
      components/           # React 组件（保持原结构）
      hooks/                # React hooks
      lib/                  # 业务工具函数
      i18n/                 # 国际化
      index.css             # 全局样式
      main.tsx / index.tsx  # React 应用入口（从 apps/web 移入并适配）
      App.tsx               # 根组件
      desktopBridge.ts      # 仅保留 Tauri 桥接（替代原 tauriBridge.ts）
      desktopSetup.ts       # Tauri 初始化（替代原 tauriSetup.ts）
    src-tauri/              # Rust Tauri 后端
      src/
        lib.rs              # Tauri Builder、插件、命令注册
        main.rs             # 二进制入口
        commands.rs         # Tauri IPC 命令
        server.rs           # remi-server 子进程托管
        state.rs            # 应用状态
        browser.rs          # 浏览器面板管理
        updater.rs          # 自动更新
      Cargo.toml
      tauri.conf.json
      build.rs
      icons/
    package.json            # 合并原 apps/web 与 apps/desktop 依赖
    tsconfig.json
    index.html              # Vite 入口 HTML（从 apps/web 移入）
    vite.config.ts          # Vite 配置（从 apps/web 移入并适配）
    public/                 # 静态资源（从 apps/web/public 移入）
    resources/              # Tauri 打包资源
  marketing/                # 官网保持独立

crates/                     # Rust 后端 crates（11 个）
  remi-core/
  remi-contracts/
  remi-persistence/
  remi-rpc/
  remi-workspace/
  remi-git/
  remi-pty/
  remi-auth/
  remi-providers/
  remi-orchestration/
  remi-server/

scripts/                    # 清理后仅保留 Tauri/Rust 相关脚本
```

### 3.1 待删除的目录与文件

- `apps/web/` 整个目录（功能合并到 `apps/desktop/src`）。
- `apps/desktop/src/main.ts`（Electron 主进程）。
- `apps/desktop/src/preload.ts`（Electron preload）。
- `apps/desktop/src/browserManager.ts`、`browserIpc.ts`、`browserUsePipeServer.ts` 等 Electron 浏览器相关文件。
- `apps/desktop/src/updateMachine.ts`、`updateState.ts`、`githubUpdateFeed.ts` 等 Electron 更新相关文件。
- `apps/desktop/src/confirmDialog.ts`、`desktopUserDataProfile.ts`、`initialBackendWindowOpen.ts`、`mediaPermissions.ts`、`menuShortcuts.ts`、`rotatingFileSink.test.ts`、`runtimeArch.ts`、`serverListeningDetector.ts`、`syncShellEnvironment.ts`、`voiceTranscription.ts` 等 Electron 专属文件。
- `apps/desktop/src/backendReadiness.ts`、`backendStartupReadiness.ts`、`desktopWsBridge.ts` 等 Electron 后端就绪检测文件（Tauri 直接托管后端，无需这些）。
- `apps/desktop/scripts/dev-electron.mjs`、`electron-builder-after-pack.cjs`、`electron-launcher.mjs`、`start-electron.mjs`、`smoke-test.mjs`（如无法复用）。
- `apps/server/` 整个目录（功能由 Rust crates 替代）。
- 根 `package.json` 中的 Electron 相关脚本与依赖。

---

## 4. 分阶段迁移计划

### 阶段一：Rust 后端能力补齐（Backend Parity）

**目标**：让 `remi-server` 在功能上完全替代 `apps/server`，随后删除 `apps/server`。

**预计周期**：4–6 周

#### 4.1 RPC Handler 补全

- **任务 1.1**：在 `crates/remi-rpc/src/handler.rs` 中实现所有 `RpcMethod` 分支。
  - 优先级 P0：`auth.bootstrap`、`auth.createPairingCredential`、`auth.revokePairingLink`、`auth.revokeClientSession`
  - 优先级 P0：`thread.sendMessage`、`thread.cancel`、`thread.pin`、`thread.setTitle`
  - 优先级 P0：`terminal.create`、`terminal.write`、`terminal.resize`、`terminal.close`、`terminal.subscribeOutput`
  - 优先级 P1：剩余 `git.*` 方法
  - 优先级 P1：`editor.open`
- **任务 1.2**：统一 RPC 错误码与原 `apps/server` 保持一致，确保前端错误处理不中断。
- **任务 1.3**：为每个 handler 增加单元测试与集成测试。

#### 4.2 Provider 适配器补齐

- **任务 1.4**：在 `crates/remi-providers/src/` 新增：
  - `codex.rs`：基于 stdio JSON-RPC 的 Codex/Cursor/OpenCode 适配器。
  - `gemini.rs`：Google Gemini HTTP API 适配器。
  - `grok.rs`：xAI Grok HTTP API 适配器。
  - `pi.rs`：Pi 适配器（如适用 stdio）。
- **任务 1.5**：在 `remi-server/src/main.rs` 注册所有可用适配器，并支持通过环境变量/配置文件启用。
- **任务 1.6**：实现 provider 健康检查的真实探测逻辑（而非仅检查 API key）。

#### 4.3 Git / Workspace / Terminal / Auth 补齐

- **任务 1.7**：`remi-git`：实现 `checkout`、`pull`、`stashInfo`、`stashDrop`、`stashAndCheckout`、`createWorktree`、`removeWorktree`、`readWorkingTreeDiff`、`summarizeDiff`、`preparePullRequestThread`。
- **任务 1.8**：`remi-workspace`：在 `browse` 之外增加文件监听（可选）与忽略规则对齐（`.gitignore`）。
- **任务 1.9**：`remi-pty`：
  - 修复当前只持有 writer/reader 但不启动读取任务的问题。
  - 将终端输出通过 `broadcast` channel 推送到 WebSocket。
  - 在 RPC handler 中接入 `TerminalManager`。
- **任务 1.10**：`remi-auth`：
  - 在 `remi-server/src/main.rs` 初始化 `AuthService` 并传入 RPC state。
  - 实现 WebSocket 连接的 token 校验中间件。
  - 实现 `revokePairingLink` / `revokeClientSession`。

#### 4.4 Orchestration 增强

- **任务 1.11**：支持 provider/model 选择（从项目设置或消息元数据读取）。
- **任务 1.12**：实现流式响应（SSE）通过 WebSocket 推送给前端。
- **任务 1.13**：支持工具调用/函数调用协议（与原 `apps/server/src/orchestration` 对齐）。
- **任务 1.14**：支持附件路径解析与图片上传。
- **任务 1.15**：支持 plan 模式与 diff 应用。

**阶段一验收标准**：

- `cargo test --workspace` 全部通过。
- 启动 `remi-server` 后，前端可完成登录、创建 thread、发送消息、接收回复、浏览文件、查看 git 状态。
- `apps/server` 可以从工作区中移除且不影响桌面应用运行。

---

### 阶段二：前端目录迁移与 Tauri 桥接对齐

**目标**：将 React 前端并入 `apps/desktop/src`，让 Tauri 桌面壳与前端直接对接，不再区分 web/desktop 两套入口。

**预计周期**：2–3 周

#### 4.5 目录迁移

- **任务 2.1**：将 `apps/web/src` 整体复制到 `apps/desktop/src/ui`（或 `apps/desktop/src/app`，团队确定后统一）。
- **任务 2.2**：将 `apps/web/index.html`、`apps/web/public`、`apps/web/vite.config.ts` 移到 `apps/desktop/` 根目录。
- **任务 2.3**：合并 `apps/web/package.json` 与 `apps/desktop/package.json`：
  - 保留 `@tauri-apps/*` 依赖。
  - 移除 Electron 相关依赖。
  - 移除 web 端独立运行脚本（如 `dev:web`、`start:marketing` 保留，`dev:web` 删除）。
- **任务 2.4**：删除 `apps/web` 目录。

#### 4.6 桥接简化

- **任务 2.5**：由于不再保留 Electron，`desktopBridge.ts` 只保留 Tauri 实现，删除 Electron 兼容逻辑。
- **任务 2.6**：修复 `desktopBridge.ts` 与 `commands.rs` 的命名/功能不匹配：
  - `confirm_dialog` → `confirm`
  - `server_transcribe_voice`：补注册对应命令或从桥接删除
  - `browser_attach_webview`：补注册对应命令或从桥接删除
  - `browser_open_devtools` 与 `browser_open_dev_tools` 统一命名
- **任务 2.7**：实现 `menu-action`、`update-state`、`browser-state` 事件的 Rust 端触发。
- **任务 2.8**：在 `desktopSetup.ts` 中初始化桥接并挂载到 `window.desktopBridge`。

#### 4.7 前端入口适配

- **任务 2.9**：调整 React 入口文件，使其在 Tauri 环境下先调用 `desktopSetup.ts` 再渲染。
- **任务 2.10**：检查并移除前端代码中对 `process.env.VITE_DEV_SERVER_URL` 等 web 专属环境变量的依赖，改用 Tauri 提供的能力。
- **任务 2.11**：确认 `index.html` 中的脚本入口、静态资源路径正确。

**阶段二验收标准**：

- `bun run dev:desktop` 能启动 Vite 并渲染原 `apps/web` 的 React 界面。
- 前端可通过 `window.desktopBridge` 调用 Tauri 命令。
- `apps/web` 目录已删除，不再出现在 monorepo 工作区。

---

### 阶段三：Tauri 桌面壳能力落地

**目标**：让 Tauri 桌面壳达到与原 Electron 主进程同等可用性。

**预计周期**：3–4 周

#### 4.8 系统命令补齐

- **任务 3.1**：实现 `show_context_menu`（使用 Tauri 的 `Menu::new().popup()`）。
- **任务 3.2**：实现 `set_theme`（调用 Tauri 窗口主题 API 或注入 CSS）。
- **任务 3.3**：实现 `show_in_folder` 跨平台一致性（已部分实现，补充 Linux 回退）。
- **任务 3.4**：实现语音转写命令（调用后端 HTTP API 或本地 Whisper）。
- **任务 3.5**：实现原生应用菜单（`tauri::menu`），并发送 `menu-action` 事件。

#### 4.9 浏览器面板真实化

- **任务 3.6**：使用 Tauri 2 的 `WebviewWindow` 创建真正的浏览器窗口/面板。
- **任务 3.7**：实现 `browser_hide`、`set_panel_bounds` 对 webview 窗口的位置/显隐控制。
- **任务 3.8**：实现 `capture_screenshot`（使用 webview 截图或 CDP）。
- **任务 3.9**：实现 `execute_cdp`（通过 Tauri 的 `WebviewWindow::eval` 或 Webview2 DevTools Protocol）。
- **任务 3.10**：实现 `copy_screenshot_to_clipboard`（借助 `tauri-plugin-clipboard-manager`）。

#### 4.10 自动更新

- **任务 3.11**：替换 `updater.rs` 为 `tauri-plugin-updater` 的标准用法。
- **任务 3.12**：生成并配置真实的 updater 公钥与 endpoint。
- **任务 3.13**：在发布流程中生成 `latest.json`。

**阶段三验收标准**：

- `tauri dev` 启动的桌面应用在窗口、菜单、对话框、浏览器面板、更新检查上与原 Electron 版本对齐。
- 所有 `desktopBridge.ts` 中的 API 调用都能正确返回或收到事件。

---

### 阶段四：Electron / apps/server 清理与构建流程切换

**目标**：彻底删除旧运行时相关代码与脚本，将 Tauri 与 Rust 后端接入完整开发/发布流程。

**预计周期**：2–3 周

#### 4.11 删除 Electron 遗留

- **任务 4.1**：删除 `apps/desktop/src` 中所有 Electron 主进程/preload/IPC 文件（详见 3.1 列表）。
- **任务 4.2**：删除 `apps/desktop/scripts` 中的 Electron 脚本。
- **任务 4.3**：从根 `package.json` 移除 `electron`、`electron-builder`、`electron-updater` 等依赖及对应脚本。
- **任务 4.4**：删除 `.github/workflows` 中与 Electron 构建相关的工作流（如有）。

#### 4.12 删除 TypeScript 后端

- **任务 4.5**：删除 `apps/server` 整个目录。
- **任务 4.6**：从根 `package.json` workspaces 中移除 `apps/server` 相关条目。
- **任务 4.7**：删除 `scripts/dev-runner.ts` 中对 `apps/server/dist/index.mjs` 的所有引用。

#### 4.13 开发脚本改造

- **任务 4.8**：改造 `scripts/dev-runner.ts` 的 `dev:desktop`：
  - 先 `cargo build -p remi-server`（watch 模式可选）。
  - 启动 Vite dev server（使用合并后的 `apps/desktop/vite.config.ts`）。
  - 启动 `tauri dev`。
- **任务 4.9**：新增/更新 `dev:rust` 命令用于只调试 Rust 后端。

#### 4.14 构建与打包

- **任务 4.10**：修改 `tauri.conf.json`：
  - 移除 `shell` 插件中指向 Node 后端的 scope。
  - 配置 `bundle > externalBin` 或 resources，将 `remi-server` 二进制文件打包进安装包。
  - 替换 updater 占位符。
- **任务 4.11**：修改 `apps/desktop/package.json` 的 `build` 脚本，在 `tauri build` 之前执行 `cargo build --release -p remi-server`。
- **任务 4.12**：更新 `scripts/build-desktop-artifact.ts` 以调用 Tauri CLI。
- **任务 4.13**：配置签名：
  - Windows：证书指纹。
  - macOS：签名身份、公证（notary）。
  - Linux：AppImage / deb 签名（可选）。

**阶段四验收标准**：

- `apps/desktop/src` 中不存在任何 Electron 文件。
- `apps/server` 与 `apps/web` 目录已删除。
- `bun run dev:desktop` 一键启动 Rust 后端 + Vite + Tauri。
- `bun run build:desktop` 生成带 `remi-server` sidecar 的 Tauri 安装包。

---

### 阶段五：测试、性能、发布

**目标**：达到生产发布质量标准。

**预计周期**：2–3 周

#### 4.15 测试体系

- **任务 5.1**：为 Rust 后端补充集成测试：启动 `remi-server`，通过 WebSocket 调用完整对话流程。
- **任务 5.2**：为 Tauri 命令补充单元测试（使用 `tauri::test` 工具）。
- **任务 5.3**：迁移/重写 `scripts/smoke-test.mjs` 为 Tauri 版本。
- **任务 5.4**：为 `desktopBridge.ts` 增加 mock 测试。

#### 4.16 性能与可观测性

- **任务 5.5**：对比原 Electron + TS 后端与 Tauri + Rust 后端的启动时间、内存、CPU。
- **任务 5.6**：引入 `tracing-opentelemetry` 或 Sentry Rust SDK，收集后端错误与性能指标。
- **任务 5.7**：优化 SQLite WAL、连接池、provider 流式响应延迟。

#### 4.17 发布

- **任务 5.8**：更新 GitHub Actions：
  - 新增 Tauri build workflow（Windows / macOS / Linux）。
  - 新增 `remi-server` release build 与 artifact 上传。
- **任务 5.9**：制定发布策略与回滚方案（基于 GitHub Release 与 Tauri updater）。
- **任务 5.10**：编写用户迁移 FAQ（数据目录、快捷键、签名授权差异）。

**阶段五验收标准**：

- CI 中 Tauri 与 Rust 测试全部通过。
- 性能指标不低于 RUST_MIGRATION_SUMMARY.md 中宣称的 10x 提升目标，或相比原 Electron 版本无明显倒退。
- 完成一次内测/公开发布，无 P0 故障。

---

## 5. 关键文件映射

| 能力 | 旧实现（待删除） | 新实现（Tauri/Rust） | 备注 |
|------|------------------|---------------------|------|
| 主进程入口 | `apps/desktop/src/main.ts` | `apps/desktop/src-tauri/src/lib.rs` | 已建，需补能力 |
| 前端代码 | `apps/web/src/*` | `apps/desktop/src/*` | 整体迁移 |
| Vite 入口 | `apps/web/index.html` | `apps/desktop/index.html` | 随前端迁移 |
| 预加载桥接 | `apps/desktop/src/preload.ts` | `apps/desktop/src/desktopBridge.ts` | 仅 Tauri |
| 桥接初始化 | — | `apps/desktop/src/desktopSetup.ts` | 新增或替换原 `tauriSetup.ts` |
| 后端进程托管 | `main.ts` 中 `startBackend` | `apps/desktop/src-tauri/src/server.rs` | Rust 后端唯一 |
| WebSocket RPC | `apps/server/src/wsRpc.ts` | `crates/remi-rpc/src/server.rs` + `handler.rs` | handler 待补全 |
| 业务编排 | `apps/server/src/orchestration/` | `crates/remi-orchestration/src/lib.rs` | 仅基础 thread |
| Provider 适配 | `apps/server/src/provider/` | `crates/remi-providers/src/lib.rs` | 仅 Claude |
| Git | `apps/server/src/git/` | `crates/remi-git/src/lib.rs` | 仅部分方法 |
| Terminal | `apps/server/src/terminal/` | `crates/remi-pty/src/lib.rs` | 未接入 RPC |
| Auth | `apps/server/src/auth/` | `crates/remi-auth/src/lib.rs` | 未接入 RPC |
| 浏览器面板 | `apps/desktop/src/browserManager.ts` | `apps/desktop/src-tauri/src/browser.rs` | 仅为状态桩 |
| 自动更新 | `apps/desktop/src/updateMachine.ts` + electron-updater | `apps/desktop/src-tauri/src/updater.rs` + plugin-updater | 未真正下载/安装 |
| 构建脚本 | `scripts/build-desktop-artifact.ts`（electron-builder） | 同上，调用 `tauri build` | 待改造 |
| 开发脚本 | `scripts/dev-runner.ts` | 同上，编译 Rust 后端 + Tauri | 待改造 |

---

## 6. 风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| Rust Provider 适配器开发周期长 | 阻塞阶段一验收 | 优先实现 HTTP 类 Provider（Gemini/Grok/Claude）；stdio 类（Codex/Cursor）复用已有 `StdioJsonRpcClient`。 |
| Tauri 浏览器面板/截图/CDP 能力受限 | 阶段三验收风险 | 调研 Tauri 2 `WebviewWindow` 截图与 `Webview2` DevTools Protocol；必要时在 Windows 使用原生 webview2-com，macOS 使用 WKWebView 私有 API。 |
| `apps/web` 与 `apps/desktop/src` 代码合并冲突 | 阶段二风险 | 将 React 代码放在 `apps/desktop/src/ui` 或 `apps/desktop/src/app` 子目录，避免与原 desktop 文件冲突；逐步删除旧文件。 |
| 自动更新签名/公证流程变更 | 发布风险 | 提前申请各平台证书；在 CI 中使用 Tauri 官方 action `tauri-apps/tauri-action`。 |
| 数据目录迁移 | 用户数据风险 | Tauri 使用 `dirs` crate 定位数据目录；提供从原 Electron `~/.remi-code/userdata` 的迁移脚本。 |
| Windows ConPTY / PTY 兼容性 | 终端风险 | 优先使用 `portable-pty`；在 Windows 上充分测试 PowerShell/cmd/WSL 启动。 |
| 性能未达预期 | 项目目标风险 | 在阶段五设置基准测试；若未达标，定位瓶颈（SQLite、序列化、WebSocket）后再优化。 |
| 删除 `apps/server` 后功能遗漏 | 回归风险 | 建立 RPC 方法清单，对照原 `apps/server/src` 逐项验收；保留可运行的旧分支作为参考。 |

---

## 7. 建议的近期迭代顺序（未来 2 周）

以下是可以立即开始的、风险最低且收益最高的任务：

1. **对齐 Tauri 命令与前端桥接**：修复 `confirm_dialog`/`confirm`、`browser_open_devtools` 等命名不一致；补注册缺失命令或从桥接中删除。
2. **实现 `thread.sendMessage` RPC**：让 `remi-server` 能从前端接收消息并调用 Claude 适配器返回回复，打通最小端到端路径。
3. **启动前端目录迁移**：将 `apps/web/src` 复制到 `apps/desktop/src/ui`，移动 `index.html`/`vite.config.ts`/`public`，验证 Vite 能在 desktop 下启动。
4. **清理 Electron 入口**：删除 `apps/desktop/src/main.ts`、`preload.ts` 及明显 Electron 专属文件，避免与 React 入口冲突。
5. **改造 `dev:desktop` 脚本**：默认编译并启动 Rust 后端，移除对 `apps/server/dist/index.mjs` 的依赖。

---

## 8. 验收标准汇总

| 阶段 | 必须完成 |
|------|----------|
| 阶段一 | `cargo test --workspace` 通过；`remi-server` 可独立运行并替代 `apps/server` 完成核心对话。 |
| 阶段二 | `apps/web` 已删除，React 代码在 `apps/desktop/src` 下运行；Tauri 桥接与命令对齐。 |
| 阶段三 | `tauri dev` 启动的桌面应用在窗口/菜单/对话框/浏览器/更新上与原 Electron 对齐。 |
| 阶段四 | `apps/server` 已删除；`apps/desktop/src` 无 Electron 文件；一键 Tauri 开发与打包。 |
| 阶段五 | CI 全绿、性能达标、完成发布。 |

---

## 9. 附录：参考命令

```bash
# 构建并测试 Rust 后端
cargo build --release -p remi-server
cargo test --workspace

# 启动 Rust 后端（桌面模式）
REMI_CODE_MODE=desktop REMI_CODE_NO_BROWSER=1 cargo run -p remi-server

# 启动 Tauri 开发（阶段二、四完成后）
bun run dev:desktop

# 构建 Tauri 桌面安装包（阶段四完成后）
bun run build:desktop
```

---

*本文档基于“完全替换 Electron 与 TypeScript 后端、前端并入 desktop”的约束重写。建议在团队评审后拆分为 GitHub Issues / 项目看板任务，并指定负责人与截止日期。*
