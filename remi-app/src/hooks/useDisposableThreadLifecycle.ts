/**
 * @file useDisposableThreadLifecycle.ts
 * @description 涓€娆℃€х嚎绋嬬敓鍛藉懆鏈熺鐞?Hook - 澶勭悊涓存椂绾跨▼鐨勬竻鐞嗗拰閿€姣? * @module hooks/useDisposableThreadLifecycle
 */

import type { ThreadId } from "~/contracts";
import { useEffect, useRef } from "react";
import { useComposerDraftStore } from "../composerDraftStore";
import { resolveDisposableThreadIdToDispose } from "../lib/disposableThread";
import { newCommandId } from "../lib/utils";
import { readNativeApi } from "../nativeApi";
import { useSplitViewStore } from "../splitViewStore";
import { useStore } from "../store";
import { useTemporaryThreadStore } from "../temporaryThreadStore";
import { useTerminalStateStore } from "../terminalStateStore";
import { getThreadFromState } from "../threadDerivation";

/**
 * 涓€娆℃€х嚎绋嬬敓鍛藉懆鏈熺鐞?Hook
 *
 * @description
 * 鐩戞帶娲诲姩绾跨▼鐨勫彉鍖栵紝褰撴娴嬪埌涓存椂绾跨▼闇€瑕佽閿€姣佹椂锛屾墽琛屽畬鏁寸殑娓呯悊娴佺▼锛? * 1. 鍋滄绾跨▼浼氳瘽锛堝鏋滄鍦ㄨ繍琛岋級
 * 2. 鍏抽棴缁堢骞跺垹闄ゅ巻鍙茶褰? * 3. 浠庢湇鍔″櫒鍒犻櫎绾跨▼
 * 4. 娓呯悊鎵€鏈夌浉鍏崇殑鏈湴鐘舵€侊紙鑽夌ǹ銆佺粓绔姸鎬併€佸垎灞忚鍥俱€佷复鏃舵爣璁帮級
 *
 * @param activeThreadId - 褰撳墠娲诲姩鐨勭嚎绋?ID锛屼负 null 琛ㄧず鏃犳椿鍔ㄧ嚎绋? *
 * @example
 * ```tsx
 * function App() {
 *   useDisposableThreadLifecycle(currentThreadId);
 *   return <div>...</div>;
 * }
 * ```
 *
 * @remarks
 * - 浠呭湪娲诲姩绾跨▼鍙樺寲鏃惰Е鍙戞鏌? * - 浣跨敤 ref 闃叉閲嶅閿€姣佸悓涓€涓嚎绋? * - 鎵€鏈夋竻鐞嗘搷浣滈兘鏄紓姝ョ殑锛屽け璐ユ椂闈欓粯澶勭悊
 */
export function useDisposableThreadLifecycle(activeThreadId: ThreadId | null): void {
  const syncServerShellSnapshot = useStore((store) => store.syncServerShellSnapshot);
  const clearDraftThread = useComposerDraftStore((store) => store.clearDraftThread);
  const clearTerminalState = useTerminalStateStore((store) => store.clearTerminalState);
  const removeThreadFromSplitViews = useSplitViewStore((store) => store.removeThreadFromSplitViews);
  const temporaryThreadIds = useTemporaryThreadStore((store) => store.temporaryThreadIds);
  const clearTemporaryThread = useTemporaryThreadStore((store) => store.clearTemporaryThread);
  
  // 获取初始草稿线程状态（仅用于初始化 ref）
  const initialDraftThread =
    activeThreadId !== null
      ? useComposerDraftStore.getState().draftThreadsByThreadId[activeThreadId]
      : undefined;
  
  // 跟踪上一个线程的状态，用于检测线程切换
  const previousThreadStateRef = useRef<{
    threadId: ThreadId | null;
    wasTemporary: boolean;
  }>({
    threadId: activeThreadId,
    wasTemporary:
      (activeThreadId ? temporaryThreadIds[activeThreadId] === true : false) ||
      initialDraftThread?.isTemporary === true,
  });
  
  // 正在销毁中的线程 ID 集合，防止重复销毁
  const disposingThreadIdsRef = useRef<Set<ThreadId>>(new Set());

  useEffect(() => {
    const previousThreadState = previousThreadStateRef.current;
    const draftThreadsByThreadId = useComposerDraftStore.getState().draftThreadsByThreadId;
    
    // 鏇存柊涓婁竴涓嚎绋嬬姸鎬佷负褰撳墠绾跨▼
    previousThreadStateRef.current = {
      threadId: activeThreadId,
      wasTemporary: activeThreadId
        ? temporaryThreadIds[activeThreadId] === true ||
          draftThreadsByThreadId[activeThreadId]?.isTemporary === true
        : false,
    };

    // 判断是否需要销毁上一个线程
    const disposableThreadId = resolveDisposableThreadIdToDispose({
      previousThreadId: previousThreadState.threadId,
      nextThreadId: activeThreadId,
      previousThreadWasTemporary: previousThreadState.wasTemporary,
      draftThreadsByThreadId,
    });
    
    // 无需销毁或正在销毁中，直接返回
    if (!disposableThreadId || disposingThreadIdsRef.current.has(disposableThreadId)) {
      return;
    }

    // 标记为正在销毁
    disposingThreadIdsRef.current.add(disposableThreadId);
    
    // 鎵ц寮傛娓呯悊娴佺▼
    void (async () => {
      try {
        const api = readNativeApi();
        const storeState = useStore.getState();
        const serverThread = getThreadFromState(storeState, disposableThreadId) ?? null;

        if (api) {
          // 1. 鍋滄绾跨▼浼氳瘽锛堝鏋滄鍦ㄨ繍琛岋級
          if (serverThread?.session && serverThread.session.status !== "closed") {
            await api.orchestration
              .dispatchCommand({
                type: "thread.session.stop",
                commandId: newCommandId(),
                threadId: disposableThreadId,
                createdAt: new Date().toISOString(),
              })
              .catch(() => undefined);
          }

          // 2. 关闭终端并删除历史记录
          await api.terminal
            .close({ threadId: disposableThreadId, deleteHistory: true })
            .catch(() => undefined);

          // 3. 浠庢湇鍔″櫒鍒犻櫎绾跨▼
          if (serverThread) {
            await api.orchestration
              .dispatchCommand({
                type: "thread.delete",
                commandId: newCommandId(),
                threadId: disposableThreadId,
              })
              .catch(() => undefined);
            
            // 鍚屾鏈€鏂扮殑 Shell 蹇収
            const snapshot = await api.orchestration.getShellSnapshot().catch(() => null);
            if (snapshot) {
              syncServerShellSnapshot(snapshot);
            }
          }
        }

        // 4. 清理所有相关的本地状态（草稿、终端状态、分屏视图、临时标记）
        clearDraftThread(disposableThreadId);
        clearTerminalState(disposableThreadId);
        removeThreadFromSplitViews(disposableThreadId);
        clearTemporaryThread(disposableThreadId);
      } finally {
        // 浠庢鍦ㄩ攢姣侀泦鍚堜腑绉婚櫎
        disposingThreadIdsRef.current.delete(disposableThreadId);
      }
    })();
  }, [
    activeThreadId,
    clearDraftThread,
    clearTerminalState,
    clearTemporaryThread,
    removeThreadFromSplitViews,
    syncServerShellSnapshot,
    temporaryThreadIds,
  ]);
}
