/**
 * @file NativeApi 鍏ュ彛妯″潡
 * @description 鎻愪緵鑾峰彇鍘熺敓 API 瀹炰緥鐨勭粺涓€鍏ュ彛銆? *              鎸変紭鍏堢骇渚濇灏濊瘯锛歸indow.nativeApi锛堟闈㈢娉ㄥ叆锛夆啋 Tauri 妗ユ帴 鈫?WebSocket 瀹炵幇銆? *              纭繚鍦ㄤ笉鍚岃繍琛岀幆澧冧笅閮借兘鑾峰彇鍒板悎閫傜殑 NativeApi 瀹炰緥銆? */

import type { NativeApi } from "~/contracts";

import { createWsNativeApi } from "./wsNativeApi";
import { tauriBridge } from "./lib/tauri-bridge";

/** 缂撳瓨鐨勬闈㈢ NativeApi 瀹炰緥 */
let cachedDesktopApi: NativeApi | undefined;

/**
 * 璇诲彇 NativeApi 瀹炰緥锛屾寜浼樺厛绾т緷娆″皾璇曪細
 * 1. SSR 鐜杩斿洖 undefined
 * 2. window.nativeApi锛堟闈㈢娉ㄥ叆鐨勫疄渚嬶級
 * 3. Tauri 鐜涓嬬殑 tauriBridge
 * 4. 鍩轰簬 WebSocket 鐨勫疄鐜? * @returns NativeApi 瀹炰緥锛孲SR 鐜涓嬭繑鍥?undefined
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
 * 纭繚 NativeApi 瀹炰緥鍙敤锛屼笉鍙敤鏃舵姏鍑洪敊璇? * @returns NativeApi 瀹炰緥
 * @throws 褰撴棤娉曡幏鍙?NativeApi 瀹炰緥鏃舵姏鍑洪敊璇? */
export function ensureNativeApi(): NativeApi {
  const api = readNativeApi();
  if (!api) {
    throw new Error("Native API not found");
  }
  return api;
}
