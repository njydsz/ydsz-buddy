/**
 * @file useProviderUsageSummary.ts
 * @description 鎻愪緵鍟嗕娇鐢ㄩ噺鎽樿 Hook - 鍚堝苟澶氫釜鏉ユ簮鐨勪娇鐢ㄩ噺淇″彿涓虹粺涓€鐨?UI 鎽樿
 * @module hooks/useProviderUsageSummary
 */

import type { OrchestrationThread, ProviderKind } from "~/contracts";
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
 * 鎻愪緵鍟嗕娇鐢ㄩ噺鎽樿 Hook
 * 
 * @description
 * 浠庡涓潵婧愬悎骞朵娇鐢ㄩ噺淇″彿锛岀敓鎴愮粺涓€鐨?UI 鍙嬪ソ鎽樿锛? * 1. 绾跨▼娲诲姩锛堜粠绾跨▼鍒楄〃涓帹瀵硷級
 * 2. 鏈嶅姟鍣ㄧ鏈湴褰掓。锛堟彁渚涘晢浣跨敤閲忓揩鐓э級
 * 3. 寮€鏀句娇鐢ㄩ噺蹇収锛堝 OpenAI 绛夛級
 * 
 * 鍚堝苟鍚庣殑鏁版嵁鍖呮嫭锛? * - 閫熺巼闄愬埗淇℃伅锛坮ateLimits锛? * - 浣跨敤閲忔槑缁嗭紙usageLines锛? * - 瀛︿範鏇村閾炬帴锛坙earnMoreHref锛? * - 鍔犺浇鐘舵€侊紙isLoading锛? * 
 * @param input - 杈撳叆鍙傛暟瀵硅薄
 * @param input.provider - 鎻愪緵鍟嗙被鍨嬶紙null 鎴?undefined 琛ㄧず涓嶆煡璇級
 * @param input.threads - 绾跨▼鍒楄〃锛堢敤浜庢帹瀵艰处鎴风骇鍒殑閫熺巼闄愬埗锛? * @param input.codexHomePath - Codex 涓荤洰褰曡矾寰勶紙浠?codex 鎻愪緵鍟嗛渶瑕侊級
 * 
 * @returns 浣跨敤閲忔憳瑕佸璞? * 
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
 *     {learnMoreHref && <a href={learnMoreHref}>浜嗚В鏇村</a>}
 *   </UsagePanel>
 * );
 * ```
 */
export function useProviderUsageSummary(input: {
  provider: ProviderKind | null | undefined;
  threads: ReadonlyArray<Pick<OrchestrationThread, "activities">>;
  codexHomePath?: string | null;
}) {
  // 鏌ヨ鏈嶅姟鍣ㄧ鐨勬彁渚涘晢浣跨敤閲忓揩鐓?  const providerUsageSnapshotQuery = useQuery(
    serverProviderUsageSnapshotQueryOptions({
      provider: input.provider,
      homePath: input.provider === "codex" ? input.codexHomePath || null : null,
    }),
  );
  
  // 鏌ヨ寮€鏀句娇鐢ㄩ噺蹇収
  const openUsageSnapshotQuery = useQuery(openUsageProviderSnapshotQueryOptions(input.provider));

  /**
   * 鍚堝苟鎵€鏈夋潵婧愮殑閫熺巼闄愬埗
   * 
   * @description
   * 鍚堝苟浼樺厛绾э細
   * 1. 浠庣嚎绋嬫椿鍔ㄦ帹瀵肩殑璐︽埛绾у埆闄愬埗
   * 2. 鏈嶅姟鍣ㄧ浣跨敤閲忓揩鐓х殑闄愬埗
   * 3. 寮€鏀句娇鐢ㄩ噺蹇収鐨勯檺鍒?   */
  const rateLimits = useMemo<ReadonlyArray<ProviderRateLimit>>(() => {
    // 浠庣嚎绋嬫椿鍔ㄦ帹瀵肩殑闄愬埗锛堣繃婊ゅ綋鍓嶆彁渚涘晢锛?    const derivedRateLimits = deriveAccountRateLimits(input.threads).filter((rateLimit) =>
      input.provider ? rateLimit.provider === input.provider : true,
    );
    
    // 鏈嶅姟鍣ㄧ浣跨敤閲忓揩鐓х殑闄愬埗
    const serverUsageRateLimit = normalizeServerProviderUsageRateLimit(
      providerUsageSnapshotQuery.data,
    );
    
    // 寮€鏀句娇鐢ㄩ噺蹇収鐨勯檺鍒?    const openUsageSnapshot = normalizeOpenUsageSnapshot(
      openUsageSnapshotQuery.data,
      input.provider,
    );
    
    // 鍚堝苟鎵€鏈夐檺鍒?    return mergeProviderRateLimits(
      derivedRateLimits,
      mergeProviderRateLimits(
        serverUsageRateLimit ? [serverUsageRateLimit] : [],
        openUsageSnapshot ? [openUsageSnapshot] : [],
      ),
    );
  }, [input.provider, input.threads, openUsageSnapshotQuery.data, providerUsageSnapshotQuery.data]);

  /**
   * 浣跨敤閲忔槑缁嗚
   * 
   * @description
   * 浼樺厛浣跨敤鏈嶅姟鍣ㄧ鏁版嵁锛屽鏋滄病鏈夊垯浣跨敤寮€鏀句娇鐢ㄩ噺鏁版嵁
   */
  const usageLines = useMemo(() => {
    const serverUsageLines = normalizeServerProviderUsageLines(providerUsageSnapshotQuery.data);
    if (serverUsageLines.length > 0) {
      return serverUsageLines;
    }
    return normalizeOpenUsageUsageLines(openUsageSnapshotQuery.data);
  }, [openUsageSnapshotQuery.data, providerUsageSnapshotQuery.data]);

  /**
   * 瀛︿範鏇村閾炬帴
   * 
   * @description
   * 浼樺厛浠庨€熺巼闄愬埗涓帹瀵硷紝鍚﹀垯浣跨敤鎻愪緵鍟嗛粯璁ら摼鎺?   */
  const learnMoreHref = useMemo(
    () =>
      deriveRateLimitLearnMoreHref(rateLimits) ?? deriveProviderUsageLearnMoreHref(input.provider),
    [input.provider, rateLimits],
  );

  /**
   * 鍔犺浇鐘舵€?   * 
   * @description
   * 褰撴彁渚涘晢宸叉寚瀹氥€佹煡璇㈡鍦ㄨ繘琛屼腑銆佷笖娌℃湁浠讳綍鏁版嵁鏃讹紝璁や负姝ｅ湪鍔犺浇
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
