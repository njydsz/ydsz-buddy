/**
 * @file NativeApi 入口模块
 * @description 提供获取原生 API 实例的统一入口。
 *              按优先级依次尝试：window.nativeApi（桌面端注入）→ Tauri 桥接 → WebSocket 实现。
 *              确保在不同运行环境下都能获取到合适的 NativeApi 实例。
 */

import type { NativeApi } from "@remi-code/contracts";

import { createWsNativeApi } from "./wsNativeApi";
import { tauriBridge } from "./lib/tauri-bridge";

/** 缓存的桌面端 NativeApi 实例 */
let cachedDesktopApi: NativeApi | undefined;

/**
 * 读取 NativeApi 实例，按优先级依次尝试：
 * 1. SSR 环境返回 undefined
 * 2. window.nativeApi（桌面端注入的实例）
 * 3. Tauri 环境下的 tauriBridge
 * 4. 基于 WebSocket 的实现
 * @returns NativeApi 实例，SSR 环境下返回 undefined
 */
export function readNativeApi(): NativeApi | undefined {
  if (typeof window === "undefined") return undefined;
  if (cachedDesktopApi && window.nativeApi === cachedDesktopApi) return cachedDesktopApi;

  if (window.nativeApi) {
    cachedDesktopApi = window.nativeApi;
    return cachedDesktopApi;
  }

  // In Tauri environment, use tauriBridge
  if ("__TAURI__" in window) {
    cachedDesktopApi = tauriBridge as unknown as NativeApi;
    return cachedDesktopApi;
  }

  return createWsNativeApi();
}

/**
 * 确保 NativeApi 实例可用，不可用时抛出错误
 * @returns NativeApi 实例
 * @throws 当无法获取 NativeApi 实例时抛出错误
 */
export function ensureNativeApi(): NativeApi {
  const api = readNativeApi();
  if (!api) {
    throw new Error("Native API not found");
  }
  return api;
}
