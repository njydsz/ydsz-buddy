/**
 * @file useProviderUsageSummary.ts
 * @description 提供商使用量摘要 Hook - 合并多个来源的使用量信号为统一的 UI 摘要
 * @module hooks/useProviderUsageSummary
 */

import type { OrchestrationThread, ProviderKind } from "@remi-code/contracts";
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
 * 提供商使用量摘要 Hook
 * 
 * @description
 * 从多个来源合并使用量信号，生成统一的 UI 友好摘要：
 * 1. 线程活动（从线程列表中推导）
 * 2. 服务器端本地归档（提供商使用量快照）
 * 3. 开放使用量快照（如 OpenAI 等）
 * 
 * 合并后的数据包括：
 * - 速率限制信息（rateLimits）
 * - 使用量明细（usageLines）
 * - 学习更多链接（learnMoreHref）
 * - 加载状态（isLoading）
 * 
 * @param input - 输入参数对象
 * @param input.provider - 提供商类型（null 或 undefined 表示不查询）
 * @param input.threads - 线程列表（用于推导账户级别的速率限制）
 * @param input.codexHomePath - Codex 主目录路径（仅 codex 提供商需要）
 * 
 * @returns 使用量摘要对象
 * 
 * @example
 * ```tsx
 * const { rateLimits, usageLines, learnMoreHref, isLoading } = useProviderUsageSummary({
 *   provider: "openai",
 *   threads: threadList,
 * });
 * 
 * if (isLoading) {
 *   return <LoadingSpinner />;
 * }
 * 
 * return (
 *   <UsagePanel>
 *     {rateLimits.map(limit => <RateLimitCard key={limit.id} limit={limit} />)}
 *     {usageLines.map(line => <UsageLineItem key={line.id} line={line} />)}
 *     {learnMoreHref && <a href={learnMoreHref}>了解更多</a>}
 *   </UsagePanel>
 * );
 * ```
 */
export function useProviderUsageSummary(input: {
  provider: ProviderKind | null | undefined;
  threads: ReadonlyArray<Pick<OrchestrationThread, "activities">>;
  codexHomePath?: string | null;
}) {
  // 查询服务器端的提供商使用量快照
  const providerUsageSnapshotQuery = useQuery(
    serverProviderUsageSnapshotQueryOptions({
      provider: input.provider,
      homePath: input.provider === "codex" ? input.codexHomePath || null : null,
    }),
  );
  
  // 查询开放使用量快照
  const openUsageSnapshotQuery = useQuery(openUsageProviderSnapshotQueryOptions(input.provider));

  /**
   * 合并所有来源的速率限制
   * 
   * @description
   * 合并优先级：
   * 1. 从线程活动推导的账户级别限制
   * 2. 服务器端使用量快照的限制
   * 3. 开放使用量快照的限制
   */
  const rateLimits = useMemo<ReadonlyArray<ProviderRateLimit>>(() => {
    // 从线程活动推导的限制（过滤当前提供商）
    const derivedRateLimits = deriveAccountRateLimits(input.threads).filter((rateLimit) =>
      input.provider ? rateLimit.provider === input.provider : true,
    );
    
    // 服务器端使用量快照的限制
    const serverUsageRateLimit = normalizeServerProviderUsageRateLimit(
      providerUsageSnapshotQuery.data,
    );
    
    // 开放使用量快照的限制
    const openUsageSnapshot = normalizeOpenUsageSnapshot(
      openUsageSnapshotQuery.data,
      input.provider,
    );
    
    // 合并所有限制
    return mergeProviderRateLimits(
      derivedRateLimits,
      mergeProviderRateLimits(
        serverUsageRateLimit ? [serverUsageRateLimit] : [],
        openUsageSnapshot ? [openUsageSnapshot] : [],
      ),
    );
  }, [input.provider, input.threads, openUsageSnapshotQuery.data, providerUsageSnapshotQuery.data]);

  /**
   * 使用量明细行
   * 
   * @description
   * 优先使用服务器端数据，如果没有则使用开放使用量数据
   */
  const usageLines = useMemo(() => {
    const serverUsageLines = normalizeServerProviderUsageLines(providerUsageSnapshotQuery.data);
    if (serverUsageLines.length > 0) {
      return serverUsageLines;
    }
    return normalizeOpenUsageUsageLines(openUsageSnapshotQuery.data);
  }, [openUsageSnapshotQuery.data, providerUsageSnapshotQuery.data]);

  /**
   * 学习更多链接
   * 
   * @description
   * 优先从速率限制中推导，否则使用提供商默认链接
   */
  const learnMoreHref = useMemo(
    () =>
      deriveRateLimitLearnMoreHref(rateLimits) ?? deriveProviderUsageLearnMoreHref(input.provider),
    [input.provider, rateLimits],
  );

  /**
   * 加载状态
   * 
   * @description
   * 当提供商已指定、查询正在进行中、且没有任何数据时，认为正在加载
   */
  const isLoading =
    input.provider !== null &&
    input.provider !== undefined &&
    providerUsageSnapshotQuery.isPending &&
    rateLimits.length === 0 &&
    usageLines.length === 0;

  return {
    isLoading,
    learnMoreHref,
    rateLimits,
    usageLines,
  } as const;
}
