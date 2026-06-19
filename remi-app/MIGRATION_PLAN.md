# Remi Code 迁移完善计划 (M1 → M5)

> 目标：在 `d:\Code\remi\org\modules\remi-code\remi-app\` 下完成 Tauri+React
> 前端对 Peak Code (`D:\Code\github\PeakCode`) 全部能力的 Rust 重构与迁移。
>
> 当前阶段：**M0 — 项目骨架（本次完成）**
>
> 后续五个里程碑按"互联网大厂"标准逐项推进：先修基本体验，再补功能，
> 最后做平台化与发布。

---

## 0. 进度对照（Peak Code → Remi Code）

| 类别 | Peak Code（TS） | Remi Code（Rust） | 当前状态 |
|------|-----------------|-------------------|----------|
| 服务端入口 | `apps/server/src/main.ts` | `remi-server/src/main.rs` + `remi-app/src-tauri/src/server.rs` | ✅ 已嵌入 Tauri 进程 |
| WebSocket JSON-RPC | `apps/server/src/wsRpc.ts` + `@effect/rpc` | `remi-rpc` + `remi-app/src/lib/wsTransport.ts` | ✅ 协议对齐 |
| 鉴权 | `apps/server/src/auth/**` | `remi-auth` | ✅ 基础实现 |
| 持久化 | `apps/server/src/persistence/**` (SQLite) | `remi-persistence` | 🟡 需补 migrations |
| Provider 适配 | `apps/server/src/provider/**` | `remi-providers` | ✅ 8 个适配器已注册 |
| 协调（Orchestration） | `apps/server/src/orchestration/**` | `remi-orchestration` | 🟡 命令协议未对齐 |
| 工作区 | `apps/web/src/components/WorkspaceView.tsx` | 占位组件 | ⏳ M3 |
| 终端 | `apps/web/src/components/terminal/**` | `remi-pty` + 占位组件 | 🟡 渲染层未迁移 |
| Diff 面板 | `apps/web/src/components/DiffPanel.tsx` | 无 | ⏳ M3 |
| 设置/插件/自动化 | `apps/web/src/components/{Settings,Plugins,Automations}View.tsx` | 占位 | ⏳ M2 / M3 / M4 |
| Electron 桥 | `apps/desktop/src/preload.ts` | `remi-app/src-tauri/src/commands.rs` | ✅ 核心命令已实现 |
| 自动更新 | `apps/desktop/src/updateMachine.ts` | `tauri-plugin-updater` | ✅ 插件已挂载，配置待完善 |
| 通知/托盘 | `apps/desktop/src/mediaPermissions.ts` + 菜单 | `tauri-plugin-notification` + `tray-icon` | 🟡 托盘菜单待实现 |

---

## M1 — 基本体验与可用性（最先修，1 周）

**目标：跑得起来、对得上话、不崩溃。**

1. **运行时联通**
   - [ ] `tauri dev` 启动后 React UI 能正确显示侧边栏项目与线程列表
   - [ ] WS 自动重连（指数退避）
   - [ ] 关闭/重开 Tauri 窗口后会话恢复
2. **核心聊天闭环**
   - [ ] 选中项目 → 新建线程 → 发送消息 → 渲染流式回复
   - [ ] 中断/取消 turn（基于 `orchestration.dispatchCommand` 协议）
   - [ ] 错误兜底：WS 断开时显示 banner，可一键重连
3. **基本错误处理**
   - [ ] 路由错误组件（替换 Peak Code 的 `RootRouteErrorView`）
   - [ ] Provider 健康状态横幅（迁移 `ProviderHealthBanner`）
   - [ ] Toaster：把 `remi-core::Error` 序列化为人类可读文案
4. **i18n 引入**
   - [ ] 引入 `react-intl` 或保留自研 I18n（参考 `apps/web/src/i18n/`）
   - [ ] 完成中/英双语，繁简校验
5. **可观测性**
   - [ ] Rust 端 `tracing-subscriber` → `tauri-plugin-log` 转发到前端
   - [ ] 前端 `console.debug` 全部走 `tracing` 风格的命名空间

**验收**：开发同学能跑 `npm run tauri:dev`，完成"打开项目 → 提问 → 收到回复"全流程，且无未捕获异常。

---

## M2 — 设置、Provider、鉴权（2 周）

**目标：让用户能登录、配 keybinding、配主题。**

1. **Settings 全量迁移**
   - [ ] Providers（Claude / Codex / OpenCode / Cursor / Gemini / Grok / Pi / Kilo）
     迁移 `apps/web/src/components/ProviderUsagePanelContent.tsx` 等
   - [ ] Keybindings：迁移 `apps/web/src/lib/keybindings.ts` + 解析 +
     冲突检测；与 Rust 端的 `ServerConfig.keybindings` 同步
   - [ ] Theme packs：迁移 `ThemePackEditor.tsx`
   - [ ] Voice / Debug / Backup 三页占位升级
2. **Provider 适配收口**
   - [ ] 与 Peak Code 8 个 Provider 的 `provider.listCommands` /
     `provider.health` / 模型选择对齐
   - [ ] 速率限制（`RateLimitsPanel.tsx`）UI 还原
3. **鉴权升级**
   - [ ] 把 `remi-auth` 的 pairing 流程接到 React：
     `auth.bootstrap` → 输入 pairing code → 建立 `Bearer` 凭据
   - [ ] 客户端凭证本地缓存（Web Crypto `IndexedDB`）
4. **更新器**
   - [ ] 接 `tauri-plugin-updater` 实际拉取 `tauri.conf.json` 中的
     `updater.endpoints`，按 Peak Code 的"先 toast 再下载"流程
5. **通知**
   - [ ] 把 `apps/web/src/notifications/taskCompletion.tsx` 落到
     `tauri-plugin-notification`

**验收**：8 个 Provider 全部在 UI 可登录、配 keybinding 不报错、升级流程能端到端跑通。

---

## M3 — 工作区、Diff、终端、插件（3 周）

**目标：把"编辑器"这块全部还原。**

1. **Workspace 视图**
   - [ ] 迁移 `WorkspaceView.tsx` + 工作树 Worktree Handoff 对话框
   - [ ] 接入 `remi-workspace` 的 RPC（managed worktree）
2. **Diff 面板**
   - [ ] 把 `apps/web/src/components/DiffPanel.tsx` + `pierre/diffs`
     渲染层接上 `remi-git` 的 `git.readWorkingTreeDiff` /
     `git.summarizeDiff`
   - [ ] 渲染设置/语法高亮/可折叠按 Peak Code 行为还原
3. **终端**
   - [ ] 把 `apps/web/src/components/terminal/**` 改用
     `remi-pty`（`@xterm/xterm` 仍保留渲染器）
   - [ ] 多 pane 切分（`ThreadTerminalLayout`）
   - [ ] 拖入拖出、`terminal.subscribeOutput` 推流
4. **Browser 面板**
   - [ ] 把 `apps/desktop/src/browserManager.ts` 改为
     `tauri-plugin-shell` 启动外部进程 + `tauri-plugin-webview`
     内嵌 WebView
5. **插件系统**
   - [ ] 把 `apps/web/src/components/PluginsView.tsx` 迁过来
   - [ ] 接入 `apps/server/src/provider/acp/**` 的 ACP 协议实现
     （Rust 侧新增 `remi-acp` crate）

**验收**：能在 workspace 切分支、看 diff、跑 terminal 命令、装/卸一个本地插件。

---

## M4 — 协调、自动化、可观测性（2 周）

**目标：把"协同"和"自动化"做出来，对标 CodeX / ZCode / OpenCode。**

1. **协调命令协议对齐**
   - [ ] 把 `apps/server/src/orchestration/Schemas.ts` 的 command 列表
     全部映射到 `remi-contracts` 的 `RpcMethod`
   - [ ] 实现 `thread.user-input.respond`、`thread.approval.respond`、
     `thread.handoff` 等 20+ 命令
2. **事件流**
   - [ ] 完整实现 shell / thread / terminal 三类 push 事件
   - [ ] `apps/web/src/routes/__root.tsx` 的 `EventRouter` 全量复刻
3. **自动化**
   - [ ] 迁移 `AutomationsView.tsx`
   - [ ] Rust 端新增 `remi-scheduler`（cron + one-shot）
4. **可观测性**
   - [ ] `opentelemetry` + `tracing-opentelemetry` 接入
   - [ ] 增加 `apps/server/src/telemetry/AnalyticsService.ts` 的 Rust
     等价物
5. **错误分级 + 用户引导**
   - [ ] 迁移 Peak Code 的 `apps/web/src/components/ThreadErrorBanner.tsx`
     + 错误分类（`codexErrorClassification.ts`）
6. **性能/内存**
   - [ ] 大 diff 走 `DiffWorkerPoolProvider`
   - [ ] 长消息虚拟滚动（`@tanstack/react-virtual` 已就位）

**验收**：连续 8 小时跑多线程、跑 subagent、跑 git handoff，无内存泄漏、无主线程卡顿。

---

## M5 — 平台化与发布（2 周）

**目标：与竞品对标，输出可分发的桌面端。**

1. **打包**
   - [ ] macOS `.dmg`（公证）、Windows `.msi` / `.exe`（WiX）、Linux
     `.deb` / `.AppImage`
   - [ ] CI：`tauri build` 在 GitHub Actions 上跑
2. **签名 + 自动更新**
   - [ ] Apple notarization key 接入
   - [ ] Windows EV 证书接入
   - [ ] 自动更新 manifest 服务（基于 `tauri-plugin-updater`）
3. **托盘 + 菜单**
   - [ ] `tauri::tray` 实现 Peak Code 菜单栏命令（新建线程、设置、退出）
   - [ ] 关闭时隐藏到托盘（`prevent_close` 流程已写）
4. **遥测与隐私**
   - [ ] 默认关闭遥测；首次启动明示同意
5. **多语言 + 主题**
   - [ ] 至少 zh-CN / en-US / ja-JP
   - [ ] 主题包支持自定义 import/export
6. **文档**
   - [ ] 开发者文档（架构、调试、构建）
   - [ ] 用户手册（功能、键位、故障排查）

**验收**：在三个平台都跑 `tauri build` 成功出包，CI 走完；自动更新通道可用。

---

## 风险与备注

- **Effect 依赖**：Peak Code 的 Web 端重度使用 `effect` /
  `effect/unstable/rpc`。Remi Code 的前端刻意把 Effect 移除，改用
  自研轻量 WS + Zustand。如果后续需要 RPC 协议层可演进，可以再加
  `@effect/rpc` 但默认不再强制。
- **Capacitor/移动端**：暂不在路线图；若要做 PWA 走
  `tauri-plugin-shell` 的 WRY 移动入口（M5 后视情况立项）。
- **桌面 + 浏览器双跑**：当前架构支持在 Vite 直跑（无 Tauri）。
  鉴权/通知/文件对话框使用降级路径。该能力在 M1 后会演化为
  E2E 测试底座。
- **图标/资源**：Tauri `icons/` 是占位文本文件，必须在 M5 前替换为
  Peak Code 的 `apps/desktop/resources/icon.*` 真实资源。
