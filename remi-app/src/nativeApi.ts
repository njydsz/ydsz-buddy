import type { NativeApi } from "@remi-code/contracts";

import { createWsNativeApi } from "./wsNativeApi";
import { tauriBridge } from "./lib/tauri-bridge";

let cachedDesktopApi: NativeApi | undefined;

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

export function ensureNativeApi(): NativeApi {
  const api = readNativeApi();
  if (!api) {
    throw new Error("Native API not found");
  }
  return api;
}
