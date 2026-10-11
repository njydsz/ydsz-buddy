# ydzs-web

云顶数字 Buddy Web 端 - 对标 ZCode `--web` 能力的轻量级 SPA。

## 快速开始

### 前置条件

确保已安装：
- Node.js >= 18
- pnpm >= 8
- 本地 ydzs-server 后端（默认端口 7777）

### 安装 & 启动

```bash
# 在项目根目录安装依赖
pnpm install

# 进入 Web 包目录
cd ydzz-web

# 启动开发服务器
pnpm dev
```

开发服务器运行在 `http://localhost:1440`。

### 构建

```bash
pnpm build
```

## 端口配置

| 服务 | 端口 | 说明 |
|------|------|------|
| Vite Dev Server | 1440 | Web SPA 开发服务器 |
| ydzs-server | 7777 | 后端 API + WebSocket |
| Vite Proxy /api | -> 7777 | HTTP 请求代理到后端 |
| Vite Proxy /ws | ws-> 7777 | WebSocket 代理到后端 |

### 自定义后端地址

如果后端不在默认地址，修改 `vite.config.ts` 中的 proxy target：

```ts
proxy: {
  "/api": {
    target: "http://your-server:port",
    changeOrigin: true,
  },
  "/ws": {
    target: "ws://your-server:port",
    ws: true,
    changeOrigin: true,
  },
}
```

## 与桌面端后端配合使用

Web 端通过 WebSocket JSON-RPC 与 `ydsz-server` 通信，协议与桌面端（ydsz-desktop）一致：

1. 先启动 `ydsz-server`（Rust 后端，见项目根目录）
2. 再启动 Web 端 `pnpm dev`
3. 浏览器访问 `http://localhost:1440`
4. Vite 代理会自动将 `/ws` 请求转发到后端

## 项目结构

```
ydsz-web/
├── index.html                 # Vite SPA 入口
├── package.json               # Web 专用依赖
├── vite.config.ts             # Vite 配置（含代理）
├── tsconfig.json              # TypeScript 严格模式配置
├── src/
│   ├── main.tsx               # React 启动入口
│   ├── App.tsx                # 应用外壳
│   ├── components/
│   │   ├── WebSidebar.tsx     # 简化版侧边栏
│   │   ├── WebChatView.tsx    # 简化的 Chat 视图
│   │   └── WebSettingsPanel.tsx # 简化版设置面板
│   ├── adapters/
│   │   ├── wsClient.ts        # WebSocket JSON-RPC 客户端
│   │   └── httpFallback.ts    # HTTP fallback 请求
│   ├── store/
│   │   └── appStore.ts        # Zustand 全局状态
│   ├── routes/
│   │   └── index.ts           # 路由配置（预留）
│   ├── lib/
│   │   └── utils.ts           # 工具函数
│   └── styles/
│       └── globals.css        # Tailwind 4 + 主题变量
└── README-web.md              # 本文件
```

## 当前范围

本次实现为基础骨架，包含：

- WebSocket JSON-RPC 客户端（自动重连、订阅模式）
- HTTP fallback（WebSocket 不可用时的降级方案）
- 响应式布局（桌面/移动端适配）
- 会话管理（简化版）
- 消息输入与渲染（简化版）
- 主题切换（浅色/深色）
- 设置面板（连接配置、主题）

## 后续计划

- 集成完整 TanStack Router 路由系统
- 接入 ydzs-desktop 的共享 contracts 类型
- 实现 WebSocket 实时消息流
- 文件拖拽上传支持
- Markdown 渲染（代码高亮、数学公式）
- Provider 模型选择器
- 多会话管理
