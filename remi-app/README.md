# Remi App

Remi Code 的桌面端 = Tauri (Rust) 壳 + React 19 (Vite + TanStack Router) UI。

本目录是 Peak Code → Remi Code Rust 重构的"前端 + 桌面壳"入口，
所有 Rust 业务能力来自同级 `remi-*/` crate（在 `remi-app/src-tauri` 内
通过 workspace 路径直接依赖）。

## 结构

```
remi-app/
├── src/                    # React 前端
│   ├── routes/             # TanStack Router 路由
│   ├── components/         # UI 组件
│   ├── hooks/              # React hooks
│   ├── lib/                # WS / RPC / Native API 桥
│   ├── store/              # Zustand store
│   ├── main.tsx            # 入口
│   ├── router.tsx          # 路由配置
│   └── index.css           # 全局样式
├── src-tauri/              # Tauri Rust 壳
│   ├── src/
│   │   ├── lib.rs          # Tauri 启动入口
│   │   ├── main.rs         # 进程入口
│   │   ├── server.rs       # 嵌入的 remi-server 启动器
│   │   └── commands.rs     # IPC 命令（替换 Electron contextBridge）
│   ├── capabilities/       # 权限清单
│   ├── icons/              # 占位图标
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
├── vite.config.ts
├── tsconfig.json
└── MIGRATION_PLAN.md       # 下一步迁移计划（M1 → M5）
```

## 启动

```bash
# 1. 安装前端依赖
cd remi-app
npm install

# 2. 启动 Tauri 桌面应用（开发模式）
npm run tauri:dev

# 3. 打包
npm run tauri:build
```

第一次构建需要下载大量 Rust crate（Tauri 2.x + axum + tokio + …），
预留 10–20 分钟。

## 与 Peak Code 的关系

| 角色 | Peak Code | Remi App |
|------|-----------|----------|
| 桌面壳 | Electron（`apps/desktop`） | Tauri 2（`src-tauri`） |
| 主进程 | `apps/desktop/src/main.ts` | `src-tauri/src/lib.rs` |
| 后端服务 | `apps/server`（独立 Node 进程） | `remi-server` crate（**嵌入**到 Tauri 进程） |
| Preload/IPC 桥 | `apps/desktop/src/preload.ts` | `src-tauri/src/commands.rs` |
| 渲染层 | `apps/web/src/**` | `src/**` |
| WS 客户端 | Effect-based `wsTransport.ts` | 轻量 `wsTransport.ts`（自研） |

## 下一步

见 [MIGRATION_PLAN.md](./MIGRATION_PLAN.md)，按 M1 → M5 逐项推进。
