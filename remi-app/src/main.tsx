/**
 * @file 应用入口文件
 * @description 初始化 React 应用根节点，挂载路由器并提供全局样式导入。
 * 按顺序加载字体（JetBrains Mono）、KaTeX 数学公式样式、xterm 终端样式、
 * 全局 CSS、存储键迁移脚本，最终渲染 RouterProvider。
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import "@fontsource-variable/jetbrains-mono";
import "katex/dist/katex.min.css";
import "@xterm/xterm/css/xterm.css";
import "./index.css";
import "./storageKeyMigration";

import { appHistory } from "./appNavigation";
import { getRouter } from "./router";
import { APP_DISPLAY_NAME } from "./branding";
import { tauriBridge } from "./lib/tauri-bridge";
import { isTauri } from "./env";

/**
 * 在挂载 React 之前预热嵌入式 WebSocket 服务器 URL。
 *
 * `WsTransport` / `wsHttpUrl` 等同步消费方依赖 `cachedServerWsUrl`。
 * 通过顶层 await 让 tauriBridge.getWsUrl() 在第一次渲染前完成，
 * 避免 fallback 到 `window.location` 引发 SocketOpenError。
 */
try {
  await tauriBridge.getWsUrl();
} catch {
  // 预热失败时 WsTransport 会回退到环境变量或 window.location。
}

/**
 * 为无边框窗口的自定义标题栏初始化拖拽和双击最大化行为。
 *
 * Tauri 的 `data-tauri-drag-region` / `-webkit-app-region: drag` 无法区分单击拖拽
 * 与双击最大化，因此通过 JS 手动实现：
 * - 单击（mousedown，detail === 1）开始拖拽窗口
 * - 双击（dblclick）切换最大化 / 还原
 *
 * 可交互元素（button、input 等）以及 h2 标题（双击重命名）会被排除。
 */
async function initCustomTitlebar() {
  if (!isTauri || typeof document === "undefined") {
    return;
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const appWindow = getCurrentWindow();

  const isExcludedInDragRegion = (
    target: HTMLElement,
    dragRegion: Element,
  ): boolean => {
    let el: HTMLElement | null = target;
    while (el && el !== dragRegion) {
      // 可交互元素和显式标记为 no-drag 的区域保持原生行为
      if (
        el.matches(
          'button, input, textarea, select, a, [data-tauri-drag-region="no-drag"], [data-no-drag]',
        ) ||
        (el.style as CSSStyleDeclaration & { webkitAppRegion?: string }).webkitAppRegion === "no-drag"
      ) {
        return true;
      }
      // h2 标题双击用于重命名，不触发窗口最大化
      if (el.tagName === "H2") {
        return true;
      }
      el = el.parentElement;
    }
    return false;
  };

  document.addEventListener("mousedown", (event) => {
    if (event.button !== 0) {
      return;
    }
    const target = event.target as HTMLElement;
    const dragRegion = target.closest(".drag-region");
    if (!dragRegion || isExcludedInDragRegion(target, dragRegion)) {
      return;
    }
    // 双击的第二次 mousedown 不再触发拖拽，避免与双击最大化冲突
    if (event.detail > 1) {
      return;
    }

    event.preventDefault();
    void appWindow.startDragging();
  });

  document.addEventListener("dblclick", (event) => {
    const target = event.target as HTMLElement;
    const dragRegion = target.closest(".drag-region");
    if (!dragRegion || isExcludedInDragRegion(target, dragRegion)) {
      return;
    }

    event.preventDefault();
    void appWindow.toggleMaximize();
  });
}

void initCustomTitlebar();

/** 应用路由器实例，集成 React Query 和 Zustand Store Provider */
const router = getRouter(appHistory);

/** 设置浏览器标签页标题为应用展示名称 */
document.title = APP_DISPLAY_NAME;

/** 将 React 应用挂载到 HTML 根节点 */
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
