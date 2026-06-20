/**
 * @file useDisposableThreadLifecycle.ts
 * @description 一次性线程生命周期管理 Hook - 处理临时线程的清理和销毁 * @module hooks/useDisposableThreadLifecycle
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
 * 一次性线程生命周期管理 Hook
 *
 * @description
 * 监控活动线程的变化，当检测到临时线程需要被销毁时，执行完整的清理流程。
 * 1. 停止线程会话（如果正在运行）
 * 2. 关闭终端并删除历史记录 * 3. 从服务器删除线程
 * 4. 清理所有相关的本地状态（草稿、终端状态、分屏视图、临时标记）
 *
 * @param activeThreadId - 当前活动的线程 ID，为 null 表示无活动线程 *
 * @example
 * ```tsx
 * function App() {
 *   useDisposableThreadLifecycle(currentThreadId);
 *   return <div>...</div>;
 * }
 * ```
 *
 * @remarks
 * - 仅在活动线程变化时触发检查
 * - 使用 ref 防止重复销毁同一个线程 * - 所有清理操作都是异步的，失败时静默处理
 */
export function useDisposableThreadLifecycle(activeThreadId: ThreadId | null): void {
  const syncServerShellSnapshot = useStore((store) => store.syncServerShellSnapshot);
  const clearDraftThread = useComposerDraftStore((store) => store.clearDraftThread);
  const clearTerminalState = useTerminalStateStore((store) => store.clearTerminalState);
  const removeThreadFromSplitViews = useSplitViewStore((store) => store.removeThreadFromSplitViews);
  const temporaryThreadIds = useTemporaryThreadStore((store) => store.temporaryThreadIds);
  const clearTemporaryThread = useTemporaryThreadStore((store) => store.clearTemporaryThread);
  
  // 获取初始草稿线程状态（仅用于初始化 ref�?  const initialDraftThread =
    activeThreadId !== null
      ? useComposerDraftStore.getState().draftThreadsByThreadId[activeThreadId]
      : undefined;
  
  // 跟踪上一个线程的状态，用于检测线程切�?  const previousThreadStateRef = useRef<{
    threadId: ThreadId | null;
    wasTemporary: boolean;
  }>({
    threadId: activeThreadId,
    wasTemporary:
      (activeThreadId ? temporaryThreadIds[activeThreadId] === true : false) ||
      initialDraftThread?.isTemporary === true,
  });
  
  // 正在销毁中的线�?ID 集合，防止重复销�?  const disposingThreadIdsRef = useRef<Set<ThreadId>>(new Set());

  useEffect(() => {
    const previousThreadState = previousThreadStateRef.current;
    const draftThreadsByThreadId = useComposerDraftStore.getState().draftThreadsByThreadId;
    
    // 更新上一个线程状态为当前线程
    previousThreadStateRef.current = {
      threadId: activeThreadId,
      wasTemporary: activeThreadId
        ? temporaryThreadIds[activeThreadId] === true ||
          draftThreadsByThreadId[activeThreadId]?.isTemporary === true
        : false,
    };

    // 判断是否需要销毁上一个线程    const disposableThreadId = resolveDisposableThreadIdToDispose({
      previousThreadId: previousThreadState.threadId,
      nextThreadId: activeThreadId,
      previousThreadWasTemporary: previousThreadState.wasTemporary,
      draftThreadsByThreadId,
    });
    
    // 无需销毁或正在销毁中，直接返�?    if (!disposableThreadId || disposingThreadIdsRef.current.has(disposableThreadId)) {
      return;
    }

    // 标记为正在销�?    disposingThreadIdsRef.current.add(disposableThreadId);
    
    // 执行异步清理流程
    void (async () => {
      try {
        const api = readNativeApi();
        const storeState = useStore.getState();
        const serverThread = getThreadFromState(storeState, disposableThreadId) ?? null;

        if (api) {
          // 1. 停止线程会话（如果正在运行）
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

          // 2. 关闭终端并删除历史记录          await api.terminal
            .close({ threadId: disposableThreadId, deleteHistory: true })
            .catch(() => undefined);

          // 3. 从服务器删除线程
          if (serverThread) {
            await api.orchestration
              .dispatchCommand({
                type: "thread.delete",
                commandId: newCommandId(),
                threadId: disposableThreadId,
              })
              .catch(() => undefined);
            
            // 同步最新的 Shell 快照
            const snapshot = await api.orchestration.getShellSnapshot().catch(() => null);
            if (snapshot) {
              syncServerShellSnapshot(snapshot);
            }
          }
        }

        // 4. 清理所有本地状�?        clearDraftThread(disposableThreadId);
        clearTerminalState(disposableThreadId);
        removeThreadFromSplitViews(disposableThreadId);
        clearTemporaryThread(disposableThreadId);
      } finally {
        // 从正在销毁集合中移除
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
