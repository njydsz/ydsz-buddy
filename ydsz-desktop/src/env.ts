/**
 * @file 运行环境检测模块
 * @description 检测当前应用运行环境（Tauri 桌面端 / 浏览器），
 *              提供全局环境标识常量供其他模块判断运行平台。
 */

/**
 * 是否运行在 Tauri 桌面端环境中
 *
 * Tauri 2.x 在 WebView 中默认注入 `window.__TAURI_INTERNALS__`。
 * 只有在 `app.withGlobalTauri = true` 时才会额外注入 `window.__TAURI__`，
 * 因此检测桌面环境必须同时检查两者，否则 dev 模式下会误判为浏览器，
 * 进而把 Vite dev server 地址当成后端 WebSocket 地址引发连接风暴。
 */
export const isTauri =
  typeof window !== "undefined" &&
  ("__TAURI__" in window || "__TAURI_INTERNALS__" in window);

/**
 * 是否为桌面环境，等同于 {@link isTauri}。
 * 旧称 `isElectron` 在 0.3.0 已下线，新代码请使用 `isTauri`。
 */
export const isDesktop = isTauri;

/**
 * @deprecated 项目已从 Electron 迁移到 Tauri，此常量始终为 false。
 * 仅用于尚未迁移的旧引用，新代码请使用 {@link isTauri}。
 *
 * @example
 * ```ts
 * // 旧代码（请勿新增）：
 * if (isElectron) { ... }
 *
 * // 新代码：
 * if (isTauri) { ... }
 * ```
 */
export const isElectron = false;

/**
 * Desktop dev minimal hooks - skip useFrameRateMonitor in Tauri dev mode to prevent WebView2 freeze
 */
export const isDesktopDevMinimalHooks =
  typeof window !== "undefined" &&
  (new URLSearchParams(window.location.search).get("__ydszMin") === "1" ||
    (import.meta.env.DEV &&
      isTauri &&
      (window as unknown as { __ydszMinForce?: boolean }).__ydszMinForce !== false));
