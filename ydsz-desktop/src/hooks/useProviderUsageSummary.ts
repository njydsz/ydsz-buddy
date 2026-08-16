/**
 * @file useProviderUsageSummary.ts
 * @description Provider 使用摘要 Hook - 合并来自线程活动、服务器端本地归档和 Provider 特定快照的使用信号
 * @module hooks/useProviderUsageSummary
 */

import type { OrchestrationThread, ProviderKind } from "@ydsz-buddy/contracts";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import {
  normalizeOpenUsageSnapshot,
  normalizeOpenUsageUsageLines,
} from "~/lib/openUsageRateLimits";
import { openUsageProviderSnapshotQueryOptions } from "~/lib/openUsageReactQuery";
import {
  normalizeServerProviderUsageLines,
  normalizeServerProviderUsageRateLimit,
} from "~/lib/providerUsageSnapshot";
import {
  deriveProviderUsageLearnMoreHref,
  deriveRateLimitLearnMoreHref,
  deriveAccountRateLimits,
  mergeProviderRateLimits,
  type ProviderRateLimit,
} from "~/lib/rateLimits";
import { serverProviderUsageSnapshotQueryOptions } from "~/lib/serverReactQuery";

/**
 * Provider 使用摘要 Hook 输入参数
 */
export type UseProviderUsageSummaryInput = {
  /** Provider 类型 */
  provider: ProviderKind | null | undefined;
  /** 线程列表（只读） */
  threads: ReadonlyArray<Pick<OrchestrationThread, "activities">>;
  /** Codex 主目录路径 */
  codexHomePath?: string | null;
};

/**
 * Provider 使用摘要 Hook
 *
 * @description
 * 合并来自以下来源的使用信号，生成适合 UI 显示的使用摘要：
 * - 线程活动中的使用信号
 * - 服务器端的本地归档
 * - Provider 特定的快照
 *
 * 数据包括速率限制和使用量信息。
 *
 * @param input - 输入参数
 * @param input.provider - Provider 类型
 * @param input.threads - 线程列表
 * @param input.codexHomePath - Codex 主目录路径
 *
 * @returns 使用摘要对象
 * @returns.isLoading - 是否正在加载
 * @returns.learnMoreHref - 了解更多链接
 * @returns.rateLimits - 速率限制列表
 * @returns.usageLines - 使用量信息列表
 */
export function useProviderUsageSummary(input: UseProviderUsageSummaryInput) {
  const providerUsageSnapshotQuery = useQuery(
    serverProviderUsageSnapshotQueryOptions({
      provider: input.provider,
      homePath: input.provider === "codex" ? input.codexHomePath || null : null,
    }),
  );
  const openUsageSnapshotQuery = useQuery(openUsageProviderSnapshotQueryOptions(input.provider));

  // 合并速率限制
  const rateLimits = useMemo<ReadonlyArray<ProviderRateLimit>>(() => {
    // 从线程活动中推导速率限制
    const derivedRateLimits = deriveAccountRateLimits(input.threads).filter((rateLimit) =>
      input.provider ? rateLimit.provider === input.provider : true,
    );
    // 规范化服务器端的速率限制
    const serverUsageRateLimit = normalizeServerProviderUsageRateLimit(
      providerUsageSnapshotQuery.data,
    );
    // 规范化开放使用的快照
    const openUsageSnapshot = normalizeOpenUsageSnapshot(
      openUsageSnapshotQuery.data,
      input.provider,
    );
    // 合并所有速率限制
    return mergeProviderRateLimits(
      derivedRateLimits,
      mergeProviderRateLimits(
        serverUsageRateLimit ? [serverUsageRateLimit] : [],
        openUsageSnapshot ? [openUsageSnapshot] : [],
      ),
    );
  }, [input.provider, input.threads, openUsageSnapshotQuery.data, providerUsageSnapshotQuery.data]);

  // 获取使用量信息
  const usageLines = useMemo(() => {
    // 优先使用服务器端的使用量信息
    const serverUsageLines = normalizeServerProviderUsageLines(providerUsageSnapshotQuery.data);
    if (serverUsageLines.length > 0) {
      return serverUsageLines;
    }
    // 降级到开放使用的信息
    return normalizeOpenUsageUsageLines(openUsageSnapshotQuery.data);
  }, [openUsageSnapshotQuery.data, providerUsageSnapshotQuery.data]);

  // 派生了解更多链接
  const learnMoreHref = useMemo(
    () =>
      deriveRateLimitLearnMoreHref(rateLimits) ?? deriveProviderUsageLearnMoreHref(input.provider),
    [input.provider, rateLimits],
  );

  // 计算加载状态
  const isLoading =
    input.provider !== null &&
    input.provider !== undefined &&
    providerUsageSnapshotQuery.isPending &&
    rateLimits.length === 0 &&
    usageLines.length === 0;

  return {
    /** 是否正在加载数据 */
    isLoading,
    /** 了解更多页面的链接 */
    learnMoreHref,
    /** 合并后的速率限制列表 */
    rateLimits,
    /** 使用量信息列表 */
    usageLines,
  } as const;
}
