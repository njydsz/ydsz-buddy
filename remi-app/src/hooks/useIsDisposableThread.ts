/**
 * @file useIsDisposableThread.ts
 * @description 涓€娆℃€х嚎绋嬫娴?Hook - 鍒ゆ柇绾跨▼鏄惁搴旇琚攢姣? * @module hooks/useIsDisposableThread
 */

import { type ThreadId } from "~/contracts";
import { useEffect, useRef } from "react";
import { useComposerDraftStore } from "../composerDraftStore";
import { useTemporaryThreadStore } from "../temporaryThreadStore";

/**
 * 涓€娆℃€х嚎绋嬫娴?Hook
 *
 * @description
 * 鍒ゆ柇鎸囧畾绾跨▼鏄惁涓轰竴娆℃€х嚎绋嬶紙涓存椂绾跨▼锛夈€? * 涓€娆℃€х嚎绋嬪湪鐢ㄦ埛绂诲紑鏃跺簲璇ヨ鑷姩閿€姣併€? *
 * 璇?Hook 浣跨敤"閿佸瓨"鏈哄埗锛氫竴鏃︽娴嬪埌绾跨▼鏄复鏃剁殑锛屽嵆浣垮悗缁姸鎬佸彉鍖栵紝
 * 涔熶細淇濇寔杩斿洖 true锛岄伩鍏?UI 鍦ㄨ崏绋?鏈嶅姟鍣ㄦ彁鍗囪繃绋嬩腑闂儊銆? *
 * @param threadId - 瑕佹鏌ョ殑绾跨▼ ID锛屽彲浠ヤ负 null 鎴?undefined
 *
 * @returns 鏄惁涓轰竴娆℃€х嚎绋? *
 * @example
 * ```tsx
 * const isDisposable = useIsDisposableThread(currentThreadId);
 *
 * if (isDisposable) {
 *   console.log('杩欐槸涓€涓复鏃剁嚎绋嬶紝绂诲紑鏃朵細琚攢姣?);
 * }
 * ```
 *
 * @remarks
 * - 妫€鏌ヤ袱涓潵婧愶細涓存椂绾跨▼瀛樺偍鍜岃崏绋跨嚎绋嬪厓鏁版嵁
 * - 浣跨敤 ref 璁板綍宸茶杩囩殑涓存椂绾跨▼锛岄槻姝㈢姸鎬佺灛鍙樺鑷?UI 闂儊
 */
export function useIsDisposableThread(threadId: ThreadId | null | undefined): boolean {
  // 浠庝复鏃剁嚎绋嬪瓨鍌ㄤ腑妫€鏌ユ爣璁?  const hasTemporaryThreadMarker = useTemporaryThreadStore((store) =>
    threadId ? store.temporaryThreadIds[threadId] === true : false,
  );
  
  // 浠庤崏绋跨嚎绋嬪厓鏁版嵁涓鏌ヤ复鏃舵爣璁?  const hasTemporaryDraftMetadata = useComposerDraftStore((store) =>
    threadId ? store.draftThreadsByThreadId[threadId]?.isTemporary === true : false,
  );
  
  // 璁板綍宸茶杩囩殑涓存椂绾跨▼ ID锛岀敤浜庨攣瀛樻満鍒?  const seenDisposableThreadIdsRef = useRef<Set<ThreadId>>(new Set());

  useEffect(() => {
    if (!threadId) {
      return;
    }
    // 閿佸瓨鏈哄埗锛氫竴鏃︽爣璁颁负涓存椂锛屽氨姘镐箙璁板綍锛岄伩鍏?UI 闂儊
    if (hasTemporaryThreadMarker || hasTemporaryDraftMetadata) {
      seenDisposableThreadIdsRef.current.add(threadId);
    }
  }, [threadId, hasTemporaryDraftMetadata, hasTemporaryThreadMarker]);

  if (!threadId) {
    return false;
  }
  
  // 杩斿洖 true 鐨勬潯浠讹細褰撳墠鏈変复鏃舵爣璁帮紝鎴栬€呮浘缁忚鏍囪涓轰复鏃?  return (
    hasTemporaryThreadMarker ||
    hasTemporaryDraftMetadata ||
    seenDisposableThreadIdsRef.current.has(threadId)
  );
}
