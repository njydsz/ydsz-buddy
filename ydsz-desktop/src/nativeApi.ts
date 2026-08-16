/**
 * @file 原生 API 读取模块
 * @description 提供原生 API 的读取和确保机制。优先使用 Tauri 原生桥接的 nativeApi，
 *              若不可用则回退到 WebSocket 实现的 NativeApi。
 */

import type { NativeApi } from "@ydsz-buddy/contracts";

import { createWsNativeApi } from "./wsNativeApi";
import { tauriBridge } from "./lib/tauri-bridge";
import { isTauri } from "./env";

/** 缓存的 NativeApi 实例 */
let cachedDesktopApi: NativeApi | undefined;

/**
 * 读取原生 API 实例
 * @returns NativeApi 实例，若在非浏览器环境或 Tauri 下 WS URL 尚未就绪返回 undefined
 */
export function readNativeApi(): NativeApi | undefined {
  if (typeof window === "undefined") return undefined;

  // 优先使用 Tauri 注入的原生桥接；若其发生变化则同步更新缓存
  if (window.nativeApi) {
    cachedDesktopApi = window.nativeApi;
    return cachedDesktopApi;
  }

  // Tauri 桌面端必须等待 tauriBridge.getWsUrl() 缓存正确的嵌入式服务器地址；
  // 否则 WsTransport 会 fallback 到 window.location（Vite dev 的 localhost:1420），
  // 导致 WebSocket 连接错误、stream 不断重启，进而触发渲染风暴和窗口卡死。
  if (isTauri && !tauriBridge.getCachedWsUrl()) {
    return undefined;
  }

  // 桌面端未注入 nativeApi 时回退到 WebSocket NativeApi；必须缓存单例，
  // 否则每次 render 都会新建 WsTransport，导致连接风暴和页面卡死。
  if (!cachedDesktopApi) {
    cachedDesktopApi = createWsNativeApi();
  }
  return cachedDesktopApi;
}

/**
 * 确保原生 API 可用，若不可用则抛出错误
 * @returns NativeApi 实例
 * @throws 当 API 不可用时抛出错误
 */
export function ensureNativeApi(): NativeApi {
  const api = readNativeApi();
  if (!api) {
    throw new Error("Native API not found");
  }
  return api;
}
