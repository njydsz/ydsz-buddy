/**
 * @file openUsageReactQuery.ts
 * @description OpenUsage 服务�?React Query 查询配置，通过轮询本地 HTTP 端点获取
 * Provider 用量快照数据，供工具栏弹窗等组件消费�? */

import type { ProviderKind } from "~/contracts";
import { queryOptions } from "@tanstack/react-query";

import { openUsageProviderIdForProvider } from "./openUsageRateLimits";

/** OpenUsage 本地服务基础地址 */
const OPEN_USAGE_BASE_URL = "http://127.0.0.1:6736";
/** localStorage 中控�?OpenUsage 轮询开关的键名 */
const OPEN_USAGE_ENABLED_STORAGE_KEY = "remicode.openUsage.enabled";

/** 检�?OpenUsage 轮询是否已通过 localStorage 启用 */
function isOpenUsagePollingEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(OPEN_USAGE_ENABLED_STORAGE_KEY) === "true";
}

/** OpenUsage 查询键集合，用于 React Query 缓存管理 */
export const openUsageQueryKeys = {
  /** 全局查询键前缀 */
  all: ["openUsage"] as const,
  /**
   * �?Provider 生成查询�?   *
   * @param provider - Provider 类型
   */
  provider: (provider: ProviderKind | null | undefined) =>
    ["openUsage", "provider", provider ?? null] as const,
};

/**
 * 创建 OpenUsage Provider 快照查询配置
 *
 * @param provider - 需要查询的 Provider 类型
 * @returns React Query queryOptions 配置对象，包�?15 秒轮询间�? *
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