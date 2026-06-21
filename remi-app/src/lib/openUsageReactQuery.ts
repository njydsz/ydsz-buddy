/**
 * @file OpenUsage React Query 模块
 *
 * 本模块为 OpenUsage 的本地 HTTP 代理提供 React Query 封装，
 * 用于获取各 Provider 的速率限制、用量统计、健康状态等快照数据。
 *
 * ## 核心导出
 *
 * - `useOpenUsageProviderStatus`：获取 Provider 健康状态
 * - `useOpenUsageRateLimits`：获取速率限制快照
 * - `useOpenUsageUsageSnapshot`：获取用量快照
 * - `useOpenUsageAllProviders`：获取所有 Provider 状态
 *
 * ## 使用场景
 *
 * - RateLimitBanner 自动刷新
 * - ProviderAvailability 检查
 * - ProviderUsagePanelContent 数据源
 *
 * ## 注意事项
 *
 * - 默认每 30 秒自动刷新
 * - Provider 不可用时会返回降级数据
 * - HTTP 错误会通过 React Query 的 `error` 字段暴露
 */

import type { ProviderKind } from "~/contracts";
import { queryOptions } from "@tanstack/react-query";

import { openUsageProviderIdForProvider } from "./openUsageRateLimits";

/** OpenUsage 閺堫剙婀撮張宥呭閸╄櫣顢呴崷鏉挎絻 */
const OPEN_USAGE_BASE_URL = "http://127.0.0.1:6736";
/** localStorage 娑擃厽甯堕崚?OpenUsage 鏉烆喛顕楀鈧崗宕囨畱闁款喖�?*/
const OPEN_USAGE_ENABLED_STORAGE_KEY = "remi-claw.openUsage.enabled";

/** 濡偓閺?OpenUsage 鏉烆喛顕楅弰顖氭儊瀹告煡鈧俺�?localStorage 閸氼垳鏁?*/
function isOpenUsagePollingEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(OPEN_USAGE_ENABLED_STORAGE_KEY) === "true";
}

/** OpenUsage 閺屻儴顕楅柨顕€娉﹂崥鍫礉閻劋绨?React Query 缂傛挸鐡ㄧ粻锛勬�?*/
export const openUsageQueryKeys = {
  /** 閸忋劌鐪弻銉嚄闁款喖澧犵紓鈧?*/
  all: ["openUsage"] as const,
  /**
   * �?Provider 閻㈢喐鍨氶弻銉嚄闁?   *
   * @param provider - Provider 缁鐎?   */
  provider: (provider: ProviderKind | null | undefined) =>
    ["openUsage", "provider", provider ?? null] as const,
};

/**
 * 閸掓稑缂?OpenUsage Provider 韫囶偆鍙庨弻銉嚄闁板秶�? *
 * @param provider - 闂団偓鐟曚焦鐓＄拠銏㈡畱 Provider 缁鐎? * @returns React Query queryOptions 闁板秶鐤嗙€电钖勯敍灞藉瘶�?15 缁夋帟鐤嗙拠銏ゆ？闂? *
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