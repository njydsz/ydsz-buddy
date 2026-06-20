/**
 * @file useDisposableThreadLifecycle.ts
 * @description ä¸€æ¬¡æ€§çº¿ç¨‹ç”Ÿå‘½å‘¨æœŸç®¡ç† Hook - å¤„ç†ä¸´æ—¶çº¿ç¨‹çš„æ¸…ç†å’Œé”€æ¯ * @module hooks/useDisposableThreadLifecycle
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
 * ä¸€æ¬¡æ€§çº¿ç¨‹ç”Ÿå‘½å‘¨æœŸç®¡ç† Hook
 *
 * @description
 * ç›‘æŽ§æ´»åŠ¨çº¿ç¨‹çš„å˜åŒ–ï¼Œå½“æ£€æµ‹åˆ°ä¸´æ—¶çº¿ç¨‹éœ€è¦è¢«é”€æ¯æ—¶ï¼Œæ‰§è¡Œå®Œæ•´çš„æ¸…ç†æµç¨‹ã€‚
 * 1. åœæ­¢çº¿ç¨‹ä¼šè¯ï¼ˆå¦‚æžœæ­£åœ¨è¿è¡Œï¼‰
 * 2. å…³é—­ç»ˆç«¯å¹¶åˆ é™¤åŽ†å²è®°å½• * 3. ä»ŽæœåŠ¡å™¨åˆ é™¤çº¿ç¨‹
 * 4. æ¸…ç†æ‰€æœ‰ç›¸å…³çš„æœ¬åœ°çŠ¶æ€ï¼ˆè‰ç¨¿ã€ç»ˆç«¯çŠ¶æ€ã€åˆ†å±è§†å›¾ã€ä¸´æ—¶æ ‡è®°ï¼‰
 *
 * @param activeThreadId - å½“å‰æ´»åŠ¨çš„çº¿ç¨‹ IDï¼Œä¸º null è¡¨ç¤ºæ— æ´»åŠ¨çº¿ç¨‹ *
 * @example
 * ```tsx
 * function App() {
 *   useDisposableThreadLifecycle(currentThreadId);
 *   return <div>...</div>;
 * }
 * ```
 *
 * @remarks
 * - ä»…åœ¨æ´»åŠ¨çº¿ç¨‹å˜åŒ–æ—¶è§¦å‘æ£€æŸ¥
 * - ä½¿ç”¨ ref é˜²æ­¢é‡å¤é”€æ¯åŒä¸€ä¸ªçº¿ç¨‹ * - æ‰€æœ‰æ¸…ç†æ“ä½œéƒ½æ˜¯å¼‚æ­¥çš„ï¼Œå¤±è´¥æ—¶é™é»˜å¤„ç†
 */
export function useDisposableThreadLifecycle(activeThreadId: ThreadId | null): void {
  const syncServerShellSnapshot = useStore((store) => store.syncServerShellSnapshot);
  const clearDraftThread = useComposerDraftStore((store) => store.clearDraftThread);
  const clearTerminalState = useTerminalStateStore((store) => store.clearTerminalState);
  const removeThreadFromSplitViews = useSplitViewStore((store) => store.removeThreadFromSplitViews);
  const temporaryThreadIds = useTemporaryThreadStore((store) => store.temporaryThreadIds);
  const clearTemporaryThread = useTemporaryThreadStore((store) => store.clearTemporaryThread);
  
  // èŽ·å–åˆå§‹è‰ç¨¿çº¿ç¨‹çŠ¶æ€ï¼ˆä»…ç”¨äºŽåˆå§‹åŒ– refï¼‰
  const initialDraftThread
    activeThreadId !== null
      ? useComposerDraftStore.getState().draftThreadsByThreadId[activeThreadId]
      : undefined;
  
  // è·Ÿè¸ªä¸Šä¸€ä¸ªçº¿ç¨‹çš„çŠ¶æ€ï¼Œç”¨äºŽæ£€æµ‹çº¿ç¨‹åˆ‡æ¢
  const previousThreadStateRef
    threadId: ThreadId | null;
    wasTemporary: boolean;
  }>({
    threadId: activeThreadId,
    wasTemporary:
      (activeThreadId ? temporaryThreadIds[activeThreadId] === true : false) ||
      initialDraftThread?.isTemporary === true,
  });
  
  // æ­£åœ¨é”€æ¯ä¸­çš„çº¿ç¨‹ ID é›†åˆï¼Œé˜²æ­¢é‡å¤é”€æ¯
  const disposingThreadIdsRef

  useEffect(() => {
    const previousThreadState = previousThreadStateRef.current;
    const draftThreadsByThreadId = useComposerDraftStore.getState().draftThreadsByThreadId;
    
    // æ›´æ–°ä¸Šä¸€ä¸ªçº¿ç¨‹çŠ¶æ€ä¸ºå½“å‰çº¿ç¨‹
    previousThreadStateRef.current = {
      threadId: activeThreadId,
      wasTemporary: activeThreadId
        ? temporaryThreadIds[activeThreadId] === true ||
          draftThreadsByThreadId[activeThreadId]?.isTemporary === true
        : false,
    };

    // åˆ¤æ–­æ˜¯å¦éœ€è¦é”€æ¯ä¸Šä¸€ä¸ªçº¿ç¨‹
    const disposableThreadId
      previousThreadId: previousThreadState.threadId,
      nextThreadId: activeThreadId,
      previousThreadWasTemporary: previousThreadState.wasTemporary,
      draftThreadsByThreadId,
    });
    
    // æ— éœ€é”€æ¯æˆ–æ­£åœ¨é”€æ¯ä¸­ï¼Œç›´æŽ¥è¿”å›ž
    if (!disposableThreadId
      return;
    }

    // æ ‡è®°ä¸ºæ­£åœ¨é”€ï¿½?    disposingThreadIdsRef.current.add(disposableThreadId);
    
    // æ‰§è¡Œå¼‚æ­¥æ¸…ç†æµç¨‹
    void (async () => {
      try {
        const api = readNativeApi();
        const storeState = useStore.getState();
        const serverThread = getThreadFromState(storeState, disposableThreadId) ?? null;

        if (api) {
          // 1. åœæ­¢çº¿ç¨‹ä¼šè¯ï¼ˆå¦‚æžœæ­£åœ¨è¿è¡Œï¼‰
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

          // 2. å…³é—­ç»ˆç«¯å¹¶åˆ é™¤åŽ†å²è®°å½•          await api.terminal
            .close({ threadId: disposableThreadId, deleteHistory: true })
            .catch(() => undefined);

          // 3. ä»ŽæœåŠ¡å™¨åˆ é™¤çº¿ç¨‹
          if (serverThread) {
            await api.orchestration
              .dispatchCommand({
                type: "thread.delete",
                commandId: newCommandId(),
                threadId: disposableThreadId,
              })
              .catch(() => undefined);
            
            // åŒæ­¥æœ€æ–°çš„ Shell å¿«ç…§
            const snapshot = await api.orchestration.getShellSnapshot().catch(() => null);
            if (snapshot) {
              syncServerShellSnapshot(snapshot);
            }
          }
        }

        // 4. æ¸…ç†æ‰€æœ‰æœ¬åœ°çŠ¶ï¿½?        clearDraftThread(disposableThreadId);
        clearTerminalState(disposableThreadId);
        removeThreadFromSplitViews(disposableThreadId);
        clearTemporaryThread(disposableThreadId);
      } finally {
        // ä»Žæ­£åœ¨é”€æ¯é›†åˆä¸­ç§»é™¤
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
