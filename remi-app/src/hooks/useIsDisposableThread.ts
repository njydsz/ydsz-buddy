/**
 * @file useIsDisposableThread.ts
 * @description 娑撯偓濞嗏剝鈧呭殠缁嬪顥呭ù?Hook - 閸掋倖鏌囩痪璺ㄢ柤閺勵垰鎯佹惔鏃囶嚉鐞氼偊鏀㈠В? * @module hooks/useIsDisposableThread
 */

import { type ThreadId } from "~/contracts";
import { useEffect, useRef } from "react";
import { useComposerDraftStore } from "../composerDraftStore";
import { useTemporaryThreadStore } from "../temporaryThreadStore";

/**
 * 娑撯偓濞嗏剝鈧呭殠缁嬪顥呭ù?Hook
 *
 * @description
 * 閸掋倖鏌囬幐鍥х暰缁捐法鈻奸弰顖氭儊娑撹桨绔村▎鈩冣偓褏鍤庣粙瀣剁礄娑撳瓨妞傜痪璺ㄢ柤閿涘鈧? * 娑撯偓濞嗏剝鈧呭殠缁嬪婀悽銊﹀煕缁傝绱戦弮璺虹安鐠囥儴顫﹂懛顏勫З闁库偓濮ｄ降鈧? *
 * 鐠?Hook 娴ｈ法鏁?闁夸礁鐡?閺堝搫鍩楅敍姘閺冿附顥呭ù瀣煂缁捐法鈻奸弰顖欏閺冨墎娈戦敍灞藉祮娴ｅ灝鎮楃紒顓犲Ц閹礁褰夐崠鏍电礉
 * 娑旂喍绱版穱婵囧瘮鏉╂柨娲?true閿涘矂浼╅崗?UI 閸︺劏宕忕粙?閺堝秴濮熼崳銊﹀絹閸楀洩绻冪粙瀣╄厬闂傤亞鍎婇妴? *
 * @param threadId - 鐟曚焦顥呴弻銉ф畱缁捐法鈻?ID閿涘苯褰叉禒銉よ礋 null 閹?undefined
 *
 * @returns 閺勵垰鎯佹稉杞扮濞嗏剝鈧呭殠缁? *
 * @example
 * ```tsx
 * const isDisposable = useIsDisposableThread(currentThreadId);
 *
 * if (isDisposable) {
 *   console.log('鏉╂瑦妲告稉鈧稉顏冨閺冨墎鍤庣粙瀣剁礉缁傝绱戦弮鏈电窗鐞氼偊鏀㈠В?);
 * }
 * ```
 *
 * @remarks
 * - 濡偓閺屻儰琚辨稉顏呮降濠ф劧绱版稉瀛樻缁捐法鈻肩€涙ê鍋嶉崪宀冨磸缁嬭法鍤庣粙瀣帗閺佺増宓? * - 娴ｈ法鏁?ref 鐠佹澘缍嶅鑼额潌鏉╁洨娈戞稉瀛樻缁捐法鈻奸敍宀勬Щ濮濄垻濮搁幀浣虹仜閸欐ê顕遍懛?UI 闂傤亞鍎? */
export function useIsDisposableThread(threadId: ThreadId | null | undefined): boolean {
  // 娴犲簼澶嶉弮鍓佸殠缁嬪鐡ㄩ崒銊よ厬濡偓閺屻儲鐖ｇ拋?  const hasTemporaryThreadMarker = useTemporaryThreadStore((store) =>
    threadId ? store.temporaryThreadIds[threadId] === true : false,
  );
  
  // 娴犲氦宕忕粙璺ㄥ殠缁嬪鍘撻弫鐗堝祦娑擃厽顥呴弻銉ゅ閺冭埖鐖ｇ拋?  const hasTemporaryDraftMetadata = useComposerDraftStore((store) =>
    threadId ? store.draftThreadsByThreadId[threadId]?.isTemporary === true : false,
  );
  
  // 鐠佹澘缍嶅鑼额潌鏉╁洨娈戞稉瀛樻缁捐法鈻?ID閿涘瞼鏁ゆ禍搴ㄦ敚鐎涙ɑ婧€閸?  const seenDisposableThreadIdsRef = useRef<Set<ThreadId>>(new Set());

  useEffect(() => {
    if (!threadId) {
      return;
    }
    // 闁夸礁鐡ㄩ張鍝勫煑閿涙矮绔撮弮锔界垼鐠侀璐熸稉瀛樻閿涘苯姘ㄥ闀愮畽鐠佹澘缍嶉敍宀勪缉閸?UI 闂傤亞鍎?    if (hasTemporaryThreadMarker || hasTemporaryDraftMetadata) {
      seenDisposableThreadIdsRef.current.add(threadId);
    }
  }, [threadId, hasTemporaryDraftMetadata, hasTemporaryThreadMarker]);

  if (!threadId) {
    return false;
  }
  
  // 鏉╂柨娲?true 閻ㄥ嫭娼禒璁圭窗瑜版挸澧犻張澶夊閺冭埖鐖ｇ拋甯礉閹存牞鈧懏娴樼紒蹇氼潶閺嶅洩顔囨稉杞板閺?  return (
    hasTemporaryThreadMarker ||
    hasTemporaryDraftMetadata ||
    seenDisposableThreadIdsRef.current.has(threadId)
  );
}
