import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
      "@": path.resolve(__dirname, "./src"),
      "@ydsz-buddy/contracts": path.resolve(__dirname, "./src/contracts/index.ts"),
      "@njydsz/shared": path.resolve(__dirname, "./src/shared"),
    },
  },
  // 强制把 worker 输出格式改为 ES，避免 @pierre/diffs 的 worker.js (iife)
  // 在 code-splitting 构建下报 "Invalid value iife for option output.format"。
  // Vite 5+ 把 worker 配置放在顶层 worker.*，而不是 build.worker.*。
  worker: {
    format: "es",
  },
  clearScreen: false,
  // 预打包重型依赖，避免 dev 模式下 Vite 按需编译导致 Effect RPC 握手
  // 超过 10s 内置 Ping 超时，WebSocket 连接被客户端主动关闭、前端卡死。
  optimizeDeps: {
    include: [
      "effect",
      "effect/Schema",
      "effect/Context",
      "effect/Layer",
      "effect/Scope",
      "effect/Stream",
      "effect/ManagedRuntime",
      "@effect/rpc",
      "@effect/platform",
      "@effect/platform/Socket",
      "@effect/platform/HttpServer",
      "@tanstack/react-query",
      "@tanstack/react-router",
      "@tanstack/react-pacer",
      "react",
      "react-dom",
      "zustand",
      "react-markdown",
      "rehype-katex",
      "remark-gfm",
      "remark-math",
      "react-icons/pi",
      "react-icons/ri",
      "react-icons/si",
      "react-icons/vsc",
      "lucide-react",
    ],
  },
  server: {
    port: 1430,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
    // 禁用 Vite HMR WebSocket 客户端:WebView2 渲染进程在 dev 模式下
    // 处理 HMR 推送时主线程持续抢占,导致整个 UI 卡死且进程 Not Responding。
    // 桌面端用 Ctrl+R 手动刷新即可,跳过 HMR 提升稳定性。
    hmr: false,
    // 预热关键模块：Vite 在 dev server 启动时就预编译这些文件，
    // 避免首次请求时按需编译导致 Effect RPC 握手超时。
    warmup: {
      clientFiles: [
        "/src/main.tsx",
        "/src/contracts/index.ts",
        "/src/wsTransport.ts",
        "/src/wsNativeApi.ts",
        "/src/nativeApi.ts",
        "/src/lib/tauri-bridge.ts",
        "/src/routes/__root.tsx",
        "/src/store.ts",
        "/src/env.ts",
      ],
    },
  },
});
