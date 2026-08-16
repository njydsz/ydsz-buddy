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
import { isDesktop, isTauri } from "./env";
import { AppErrorBoundary } from "./app/ErrorBoundary";
import { applyThemeTransitionToDom } from "./shared/appearanceStore";
import { monitor } from "./lib/monitor";
import { initOsKeychainBackend } from "./lib/credentialVault";

// #region debug-point warmup-timing
//
// 调试开关:默认关闭。仅当 URL 携带 `?__ydszDbg=1` 时启用真实 fetch 上报,
// 避免正常启动时每次 RootRouteView 渲染都触发 fetch("http://127.0.0.1:7777/event")
// 形成 fetch 风暴,叠加 useFrameRateMonitor 每秒重渲染导致主线程被持续占用,
// 最终触发 Windows "未响应" 卡死。
//
// 历史背景:此前 _dbg 默认启用,而 debug server (端口 7777) 通常未启动,
// fetch 会快速失败但仍占用主线程调度;__root.tsx 中 `_dbg?.()` 在
// RootRouteView / EventRouter 每次渲染都被调用,useFrameRateMonitor 的
// 每秒 setFrameRate 把渲染频率拉到 1Hz,主线程持续被占据。
const _debugUrl = "http://127.0.0.1:7777/event";
const _debugSession = "desktop-freeze-v3";
const _debugEnabled =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("__ydszDbg") === "1";
function _dbg(msg: string, data?: Record<string, unknown>, hypothesisId?: string) {
  if (!_debugEnabled) return;
  try {
    void fetch(_debugUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        sessionId: _debugSession,
        runId: "post-singleton-fix",
        hypothesisId: hypothesisId ?? "H1-H5",
        location: "main.tsx",
        msg: `[DEBUG] ${msg}`,
        data: data ?? {},
        ts: Date.now(),
      }),
    }).catch(() => {});
  } catch {
    // ignore
  }
}
// 仅在调试启用时挂载 window.__ydszDbg。__root.tsx 的 `_dbg?.()` 调用
// 在未挂载时直接跳过,避免每秒重渲染时反复进入 noop 函数调用的开销。
if (typeof window !== "undefined" && _debugEnabled) {
  (window as unknown as { __ydszDbg?: typeof _dbg }).__ydszDbg = _dbg;
}
// #endregion

/**
 * E2E 测试钩子(仅在 URL 携带 `?__ydszE2EMonitorTest=1` 时激活)
 *
 * 大厂基线:E2E 端到端验证 monitor SDK 是否被 ErrorBoundary / 应用代码
 * 正确调用,而不是单元测试里 mock 一下。生产环境永远走 noop console stub,
 * 此 hook 不会影响正常用户。
 *
 * 暴露 `window.__ydszE2EMonitor`:
 *  - `captureError(payload)`     → 直接调用 monitor.captureError
 *  - `captureMessage(msg, ctx)`  → 直接调用 monitor.captureMessage
 *  - `triggerErrorBoundary()`    → 抛出一个会被 AppErrorBoundary 捕获的错误
 *  - `calls`                     → 由 init 脚本注入的 console hook 填充
 */
function installE2EMonitorHooksIfRequested() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (params.get("__ydszE2EMonitorTest") !== "1") return;

  const api = {
    captureError: (payload: Parameters<typeof monitor.captureError>[0]) => {
      monitor.captureError(payload);
    },
    captureMessage: (msg: string, ctx?: Record<string, unknown>) => {
      monitor.captureMessage(msg, ctx as never);
    },
    /**
     * 触发一次"应用代码自身抛错"场景:使用 queueMicrotask 抛出未捕获错误,
     * React 18 的 error reporting pipeline 会把它转交给 AppErrorBoundary,
     * 从而走通 monitor.captureError 的真实链路。
     */
    triggerErrorBoundary: () => {
      queueMicrotask(() => {
        throw new Error("__ydszE2EMonitorTest: simulated render error");
      });
    },
  };
  (window as unknown as { __ydszE2EMonitor: typeof api }).__ydszE2EMonitor = api;
}

installE2EMonitorHooksIfRequested();

_dbg("top-level-start");

/**
 * 在挂载 React 之前启用主题切换动画，避免首屏主题应用时不带过渡。
 * 首次 setup 阶段由 useTheme 的 `no-transitions` 机制压制，避免闪烁。
 */
applyThemeTransitionToDom(true);
_dbg("theme-applied");

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

/** 设置浏览器标签页标题为应用展示名称 */
document.title = APP_DISPLAY_NAME;

/**
 * 先挂载 React，再异步预热 WebSocket 服务器 URL。
 *
 * 关键修复：之前先 await getWsUrl() 再挂载 React，如果 Tauri invoke 失败
 * 需要等待 10 秒超时，主线程被阻塞 10 秒，Windows 标记窗口"未响应"。
 *
 * 现在先挂载 React 让 UI 立即渲染，warmup 放到后台异步执行。
 * WsTransport 构造时会通过 tauriBridge.getCachedWsUrl() 读取缓存，
 * 如果缓存未设置则 fallback 到环境变量或当前页面地址。
 * 后续通过 readNativeApi() 的重试机制自动恢复连接。
 */
(() => {
  // Vite HMR / StrictMode 可能导致模块重估；保证整个生命周期只初始化一次。
  if (typeof window !== "undefined" && (window as unknown as { __ydszMainInitDone?: boolean }).__ydszMainInitDone) {
    _dbg("main-init-skipped-already-done");
    return;
  }
  if (typeof window !== "undefined") {
    (window as unknown as { __ydszMainInitDone?: boolean }).__ydszMainInitDone = true;
  }

  /** 应用路由器实例，集成 React Query 和 Zustand Store Provider */
  const router = getRouter(appHistory);

  /** 将 React 应用挂载到 HTML 根节点 — 立即执行，不等待 warmup */
  _dbg("react-mount");
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <AppErrorBoundary>
        <RouterProvider router={router} />
      </AppErrorBoundary>
    </React.StrictMode>,
  );
  _dbg("react-mount-complete");

  // 异步预热 WebSocket 服务器 URL（不阻塞 UI 渲染）
  _dbg("warmup-start", { isTauri, isDesktop });
  void (async () => {
    try {
      // 添加 5 秒超时，避免 invoke 无限 pending
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("getWsUrl timeout")), 5000);
      });

      await Promise.race([
        tauriBridge.getWsUrl(),
        timeoutPromise,
      ]);
      _dbg("warmup-ok", { cachedWsUrl: tauriBridge.getCachedWsUrl() });
    } catch (error) {
      // 预热失败不影响应用启动，后续会通过 readNativeApi() 重试
      _dbg("warmup-failed", { error: error instanceof Error ? error.message : String(error) });
    }
  })();

  // P0-2: 异步初始化 OS Keychain 后端（预加载凭证到内存缓存，不阻塞 UI）
  if (isTauri) {
    void initOsKeychainBackend().catch(() => {
      // OS Keyring 不可用时静默降级到 session/local-obfuscated 模式
    });
  }
})();
