/**
 * @file openUsageReactQuery.ts
 * @description OpenUsage 鏈嶅姟鐨?React Query 鏌ヨ閰嶇疆锛岄€氳繃杞鏈湴 HTTP 绔偣鑾峰彇
 * Provider 鐢ㄩ噺蹇収鏁版嵁锛屼緵宸ュ叿鏍忓脊绐楃瓑缁勪欢娑堣垂銆? */

import type { ProviderKind } from "~/contracts";
import { queryOptions } from "@tanstack/react-query";

import { openUsageProviderIdForProvider } from "./openUsageRateLimits";

/** OpenUsage 鏈湴鏈嶅姟鍩虹鍦板潃 */
const OPEN_USAGE_BASE_URL = "http://127.0.0.1:6736";
/** localStorage 涓帶鍒?OpenUsage 杞寮€鍏崇殑閿悕 */
const OPEN_USAGE_ENABLED_STORAGE_KEY = "remicode.openUsage.enabled";

/** 妫€鏌?OpenUsage 杞鏄惁宸查€氳繃 localStorage 鍚敤 */
function isOpenUsagePollingEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(OPEN_USAGE_ENABLED_STORAGE_KEY) === "true";
}

/** OpenUsage 鏌ヨ閿泦鍚堬紝鐢ㄤ簬 React Query 缂撳瓨绠＄悊 */
export const openUsageQueryKeys = {
  /** 鍏ㄥ眬鏌ヨ閿墠缂€ */
  all: ["openUsage"] as const,
  /**
   * 鎸?Provider 鐢熸垚鏌ヨ閿?   *
   * @param provider - Provider 绫诲瀷
   */
  provider: (provider: ProviderKind | null | undefined) =>
    ["openUsage", "provider", provider ?? null] as const,
};

/**
 * 鍒涘缓 OpenUsage Provider 蹇収鏌ヨ閰嶇疆
 *
 * @param provider - 闇€瑕佹煡璇㈢殑 Provider 绫诲瀷
 * @returns React Query queryOptions 閰嶇疆瀵硅薄锛屽寘鍚?15 绉掕疆璇㈤棿闅? *
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