/**
 * @file openUsageReactQuery.ts
 * @description OpenUsage 閺堝秴濮熼惃?React Query 閺屻儴顕楅柊宥囩枂閿涘矂鈧俺绻冩潪顔款嚄閺堫剙婀?HTTP 缁旑垳鍋ｉ懢宄板絿
 * Provider 閻劑鍣鸿箛顐ゅ弾閺佺増宓侀敍灞肩返瀹搞儱鍙块弽蹇撹剨缁愭鐡戠紒鍕濞戝牐鍨傞妴? */

import type { ProviderKind } from "~/contracts";
import { queryOptions } from "@tanstack/react-query";

import { openUsageProviderIdForProvider } from "./openUsageRateLimits";

/** OpenUsage 閺堫剙婀撮張宥呭閸╄櫣顢呴崷鏉挎絻 */
const OPEN_USAGE_BASE_URL = "http://127.0.0.1:6736";
/** localStorage 娑擃厽甯堕崚?OpenUsage 鏉烆喛顕楀鈧崗宕囨畱闁款喖鎮?*/
const OPEN_USAGE_ENABLED_STORAGE_KEY = "remicode.openUsage.enabled";

/** 濡偓閺?OpenUsage 鏉烆喛顕楅弰顖氭儊瀹告煡鈧俺绻?localStorage 閸氼垳鏁?*/
function isOpenUsagePollingEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(OPEN_USAGE_ENABLED_STORAGE_KEY) === "true";
}

/** OpenUsage 閺屻儴顕楅柨顕€娉﹂崥鍫礉閻劋绨?React Query 缂傛挸鐡ㄧ粻锛勬倞 */
export const openUsageQueryKeys = {
  /** 閸忋劌鐪弻銉嚄闁款喖澧犵紓鈧?*/
  all: ["openUsage"] as const,
  /**
   * 閹?Provider 閻㈢喐鍨氶弻銉嚄闁?   *
   * @param provider - Provider 缁鐎?   */
  provider: (provider: ProviderKind | null | undefined) =>
    ["openUsage", "provider", provider ?? null] as const,
};

/**
 * 閸掓稑缂?OpenUsage Provider 韫囶偆鍙庨弻銉嚄闁板秶鐤? *
 * @param provider - 闂団偓鐟曚焦鐓＄拠銏㈡畱 Provider 缁鐎? * @returns React Query queryOptions 闁板秶鐤嗙€电钖勯敍灞藉瘶閸?15 缁夋帟鐤嗙拠銏ゆ？闂? *
 * @example
 * ```ts
 * const options = openUsageProviderSnapshotQueryOptions("claudeAgent");
 * useQuery(options);
 * ```
 */
export function openUsageProviderSnapshotQueryOptions(provider: ProviderKind | null | undefined) {
  const providerId = openUsageProviderIdForProvider(provider);
  const openUsageEnabled = isOpenUsagePollingEnabled();

  return queryOptions({
    queryKey: openUsageQueryKeys.provider(provider),
    enabled: openUsageEnabled && providerId !== null,
    staleTime: 15_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async (): Promise<unknown | null> => {
      if (!providerId) return null;

      try {
        const response = await fetch(`${OPEN_USAGE_BASE_URL}/v1/usage/${providerId}`);
        if (response.status === 204 || response.status === 404) {
          return null;
        }
        if (!response.ok) {
          return null;
        }
        return await response.json();
      } catch {
        return null;
      }
    },
  });
}