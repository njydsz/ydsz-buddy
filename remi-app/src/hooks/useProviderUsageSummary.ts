/**
 * @file useProviderUsageSummary.ts
 * @description 閹绘劒绶甸崯鍡曞▏閻劑鍣洪幗妯款洣 Hook - 閸氬牆鑻熸径姘嚋閺夈儲绨惃鍕▏閻劑鍣烘穱鈥冲娇娑撹櫣绮烘稉鈧惃?UI 閹芥顩? * @module hooks/useProviderUsageSummary
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
 * 閹绘劒绶甸崯鍡曞▏閻劑鍣洪幗妯款洣 Hook
 * 
 * @description
 * 娴犲骸顦挎稉顏呮降濠ф劕鎮庨獮鏈靛▏閻劑鍣烘穱鈥冲娇閿涘瞼鏁撻幋鎰埠娑撯偓閻?UI 閸欏銈介幗妯款洣閿? * 1. 缁捐法鈻煎ú璇插З閿涘牅绮犵痪璺ㄢ柤閸掓銆冩稉顓熷腹鐎电》绱? * 2. 閺堝秴濮熼崳銊ь伂閺堫剙婀磋ぐ鎺撱€傞敍鍫熷絹娓氭稑鏅㈡担璺ㄦ暏闁插繐鎻╅悡褝绱? * 3. 瀵偓閺€鍙ュ▏閻劑鍣鸿箛顐ゅ弾閿涘牆顩?OpenAI 缁涘绱? * 
 * 閸氬牆鑻熼崥搴ｆ畱閺佺増宓侀崠鍛閿? * - 闁喓宸奸梽鎰煑娣団剝浼呴敍鍧產teLimits閿? * - 娴ｈ法鏁ら柌蹇旀缂佸棴绱檜sageLines閿? * - 鐎涳缚绡勯弴鏉戭樋闁剧偓甯撮敍鍧檈arnMoreHref閿? * - 閸旂姾娴囬悩鑸碘偓渚婄礄isLoading閿? * 
 * @param input - 鏉堟挸鍙嗛崣鍌涙殶鐎电钖? * @param input.provider - 閹绘劒绶甸崯鍡欒閸ㄥ绱檔ull 閹?undefined 鐞涖劎銇氭稉宥嗙叀鐠囶澁绱? * @param input.threads - 缁捐法鈻奸崚妤勩€冮敍鍫㈡暏娴滃孩甯圭€佃壈澶勯幋椋庨獓閸掝偆娈戦柅鐔哄芳闂勬劕鍩楅敍? * @param input.codexHomePath - Codex 娑撹崵娲拌ぐ鏇＄熅瀵板嫸绱欐禒?codex 閹绘劒绶甸崯鍡涙付鐟曚緤绱? * 
 * @returns 娴ｈ法鏁ら柌蹇旀喅鐟曚礁顕挒? * 
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
 *     {learnMoreHref && <a href={learnMoreHref}>娴滃棜袙閺囨潙顦?/a>}
 *   </UsagePanel>
 * );
 * ```
 */
export function useProviderUsageSummary(input: {
  provider: ProviderKind | null | undefined;
  threads: ReadonlyArray<Pick<OrchestrationThread, "activities">>;
  codexHomePath?: string | null;
}) {
  // 閺屻儴顕楅張宥呭閸ｃ劎顏惃鍕絹娓氭稑鏅㈡担璺ㄦ暏闁插繐鎻╅悡?  const providerUsageSnapshotQuery = useQuery(
    serverProviderUsageSnapshotQueryOptions({
      provider: input.provider,
      homePath: input.provider === "codex" ? input.codexHomePath || null : null,
    }),
  );
  
  // 閺屻儴顕楀鈧弨鍙ュ▏閻劑鍣鸿箛顐ゅ弾
  const openUsageSnapshotQuery = useQuery(openUsageProviderSnapshotQueryOptions(input.provider));

  /**
   * 閸氬牆鑻熼幍鈧張澶嬫降濠ф劗娈戦柅鐔哄芳闂勬劕鍩?   * 
   * @description
   * 閸氬牆鑻熸导妯哄帥缁狙嶇窗
   * 1. 娴犲海鍤庣粙瀣た閸斻劍甯圭€佃偐娈戠拹锔藉煕缁狙冨焼闂勬劕鍩?   * 2. 閺堝秴濮熼崳銊ь伂娴ｈ法鏁ら柌蹇撴彥閻撗呮畱闂勬劕鍩?   * 3. 瀵偓閺€鍙ュ▏閻劑鍣鸿箛顐ゅ弾閻ㄥ嫰妾洪崚?   */
  const rateLimits = useMemo<ReadonlyArray<ProviderRateLimit>>(() => {
    // 娴犲海鍤庣粙瀣た閸斻劍甯圭€佃偐娈戦梽鎰煑閿涘牐绻冨銈呯秼閸撳秵褰佹笟娑樻櫌閿?    const derivedRateLimits = deriveAccountRateLimits(input.threads).filter((rateLimit) =>
      input.provider ? rateLimit.provider === input.provider : true,
    );
    
    // 閺堝秴濮熼崳銊ь伂娴ｈ法鏁ら柌蹇撴彥閻撗呮畱闂勬劕鍩?    const serverUsageRateLimit = normalizeServerProviderUsageRateLimit(
      providerUsageSnapshotQuery.data,
    );
    
    // 瀵偓閺€鍙ュ▏閻劑鍣鸿箛顐ゅ弾閻ㄥ嫰妾洪崚?    const openUsageSnapshot = normalizeOpenUsageSnapshot(
      openUsageSnapshotQuery.data,
      input.provider,
    );
    
    // 閸氬牆鑻熼幍鈧張澶愭閸?    return mergeProviderRateLimits(
      derivedRateLimits,
      mergeProviderRateLimits(
        serverUsageRateLimit ? [serverUsageRateLimit] : [],
        openUsageSnapshot ? [openUsageSnapshot] : [],
      ),
    );
  }, [input.provider, input.threads, openUsageSnapshotQuery.data, providerUsageSnapshotQuery.data]);

  /**
   * 娴ｈ法鏁ら柌蹇旀缂佸棜顢?   * 
   * @description
   * 娴兼ê鍘涙担璺ㄦ暏閺堝秴濮熼崳銊ь伂閺佺増宓侀敍灞筋洤閺嬫粍鐥呴張澶婂灟娴ｈ法鏁ゅ鈧弨鍙ュ▏閻劑鍣洪弫鐗堝祦
   */
  const usageLines = useMemo(() => {
    const serverUsageLines = normalizeServerProviderUsageLines(providerUsageSnapshotQuery.data);
    if (serverUsageLines.length > 0) {
      return serverUsageLines;
    }
    return normalizeOpenUsageUsageLines(openUsageSnapshotQuery.data);
  }, [openUsageSnapshotQuery.data, providerUsageSnapshotQuery.data]);

  /**
   * 鐎涳缚绡勯弴鏉戭樋闁剧偓甯?   * 
   * @description
   * 娴兼ê鍘涙禒搴ㄢ偓鐔哄芳闂勬劕鍩楁稉顓熷腹鐎电》绱濋崥锕€鍨担璺ㄦ暏閹绘劒绶甸崯鍡涚帛鐠併倝鎽奸幒?   */
  const learnMoreHref = useMemo(
    () =>
      deriveRateLimitLearnMoreHref(rateLimits) ?? deriveProviderUsageLearnMoreHref(input.provider),
    [input.provider, rateLimits],
  );

  /**
   * 閸旂姾娴囬悩鑸碘偓?   * 
   * @description
   * 瑜版挻褰佹笟娑樻櫌瀹稿弶瀵氱€规哎鈧焦鐓＄拠銏☆劀閸︺劏绻樼悰灞艰厬閵嗕椒绗栧▽鈩冩箒娴犺缍嶉弫鐗堝祦閺冭绱濈拋銈勮礋濮濓絽婀崝鐘烘祰
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
