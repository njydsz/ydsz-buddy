/**
 * @file NativeApi 閸忋儱褰涘Ο鈥虫健
 * @description 閹绘劒绶甸懢宄板絿閸樼喓鏁?API 鐎圭偘绶ラ惃鍕埠娑撯偓閸忋儱褰涢妴? *              閹稿绱崗鍫㈤獓娓氭繃顐肩亸婵婄槸閿涙indow.nativeApi閿涘牊顢戦棃銏㈩伂濞夈劌鍙嗛敍澶嗗晪 Tauri 濡椼儲甯?閳?WebSocket 鐎圭偟骞囬妴? *              绾喕绻氶崷銊ょ瑝閸氬矁绻嶇悰宀€骞嗘晶鍐х瑓闁€熷厴閼惧嘲褰囬崚鏉挎値闁倻娈?NativeApi 鐎圭偘绶ラ妴? */

import type { NativeApi } from "~/contracts";

import { createWsNativeApi } from "./wsNativeApi";
import { tauriBridge } from "./lib/tauri-bridge";

/** 缂傛挸鐡ㄩ惃鍕攽闂堛垻顏?NativeApi 鐎圭偘绶?*/
let cachedDesktopApi: NativeApi | undefined;

/**
 * 鐠囪褰?NativeApi 鐎圭偘绶ラ敍灞惧瘻娴兼ê鍘涚痪褌绶峰▎鈥崇毦鐠囨洩绱? * 1. SSR 閻滎垰顣ㄦ潻鏂挎礀 undefined
 * 2. window.nativeApi閿涘牊顢戦棃銏㈩伂濞夈劌鍙嗛惃鍕杽娓氬绱? * 3. Tauri 閻滎垰顣ㄦ稉瀣畱 tauriBridge
 * 4. 閸╄桨绨?WebSocket 閻ㄥ嫬鐤勯悳? * @returns NativeApi 鐎圭偘绶ラ敍瀛睸R 閻滎垰顣ㄦ稉瀣箲閸?undefined
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
 * 绾喕绻?NativeApi 鐎圭偘绶ラ崣顖滄暏閿涘奔绗夐崣顖滄暏閺冭埖濮忛崙娲晩鐠? * @returns NativeApi 鐎圭偘绶? * @throws 瑜版挻妫ゅ▔鏇″箯閸?NativeApi 鐎圭偘绶ラ弮鑸靛閸戞椽鏁婄拠? */
export function ensureNativeApi(): NativeApi {
  const api = readNativeApi();
  if (!api) {
    throw new Error("Native API not found");
  }
  return api;
}
