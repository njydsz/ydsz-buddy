/**
 * @file 运行环境检测模块
 * @description 检测当前应用运行环境（Tauri 桌面端 / 浏览器），
 *              提供全局环境标识常量供其他模块判断运行平台。
 */

/**
 * 是否运行在 Tauri 桌面端环境中
 * Tauri 在 WebView 中注入 `window.__TAURI__` 对象
 */
export const isTauri =
  typeof window !== "undefined" && "__TAURI__" in window;

/**
 * 是否为桌面环境，等同于 isTauri
 */
export const isDesktop = isTauri;

/**
 * 是否为 Electron 环境（向后兼容标识）
 * 项目已从 Electron 迁移到 Tauri，此常量始终为 false
 */
export const isElectron = false;
