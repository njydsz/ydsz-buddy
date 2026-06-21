/**
 * @file 临时线程生命周期 Hook
 *
 * 本 Hook 管理临时线程（disposable thread）的自动清理生命周期：
 *
 * - **路由切换清理**：用户切换路由时清理未使用的临时线程
 * - **会话结束清理**：窗口关闭或会话结束时清理
 * - **draft 关联**：与 ComposerDraftStore 联动，清理孤立 draft
 *
 * ## 核心导出
 *
 * - `useDisposableThreadLifecycle`：注册临时线程清理 effect
 * - `useDisposableThreadGuard`：在路由级别添加清理守卫
 *
 * ## 使用场景
 *
 * - 路由切换时清理未发送的临时线程
 * - 应用退出前清理
 * - 用户主动放弃会话时清理
 *
 * ## 注意事项
 *
 * - 仅清理已发送第一条消息的临时线程
 * - 草稿线程由 ComposerDraftStore 单独管理
 * - 清理操作幂等，可重复调用
 */

import type { ThreadId } from "@remi-claw/contracts";
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

export function useDisposableThreadLifecycle(activeThreadId: ThreadId | null): void {
  const syncServerShellSnapshot = useStore((store) => store.syncServerShellSnapshot);
  const clearDraftThread = useComposerDraftStore((store) => store.clearDraftThread);
  const clearTerminalState = useTerminalStateStore((store) => store.clearTerminalState);
  const removeThreadFromSplitViews = useSplitViewStore((store) => store.removeThreadFromSplitViews);
  const temporaryThreadIds = useTemporaryThreadStore((store) => store.temporaryThreadIds);
  const clearTemporaryThread = useTemporaryThreadStore((store) => store.clearTemporaryThread);
  const initialDraftThread =
    activeThreadId !== null
      ? useComposerDraftStore.getState().draftThreadsByThreadId[activeThreadId]
      : undefined;
  const previousThreadStateRef = useRef<{
    threadId: ThreadId | null;
    wasTemporary: boolean;
  }>({
    threadId: activeThreadId,
    wasTemporary:
      (activeThreadId ? temporaryThreadIds[activeThreadId] === true : false) ||
      initialDraftThread?.isTemporary === true,
  });
  const disposingThreadIdsRef = useRef<Set<ThreadId>>(new Set());

  useEffect(() => {
    const previousThreadState = previousThreadStateRef.current;
    const draftThreadsByThreadId = useComposerDraftStore.getState().draftThreadsByThreadId;
    previousThreadStateRef.current = {
      threadId: activeThreadId,
      wasTemporary: activeThreadId
        ? temporaryThreadIds[activeThreadId] === true ||
          draftThreadsByThreadId[activeThreadId]?.isTemporary === true
        : false,
    };

    const disposableThreadId = resolveDisposableThreadIdToDispose({
      previousThreadId: previousThreadState.threadId,
      nextThreadId: activeThreadId,
      previousThreadWasTemporary: previousThreadState.wasTemporary,
      draftThreadsByThreadId,
    });
    if (!disposableThreadId || disposingThreadIdsRef.current.has(disposableThreadId)) {
      return;
    }

    disposingThreadIdsRef.current.add(disposableThreadId);
    void (async () => {
      try {
        const api = readNativeApi();
        const storeState = useStore.getState();
        const serverThread = getThreadFromState(storeState, disposableThreadId) ?? null;

        if (api) {
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

          await api.terminal
            .close({ threadId: disposableThreadId, deleteHistory: true })
            .catch(() => undefined);

          if (serverThread) {
            await api.orchestration
              .dispatchCommand({
                type: "thread.delete",
                commandId: newCommandId(),
                threadId: disposableThreadId,
              })
              .catch(() => undefined);
            const snapshot = await api.orchestration.getShellSnapshot().catch(() => null);
            if (snapshot) {
              syncServerShellSnapshot(snapshot);
            }
          }
        }

        clearDraftThread(disposableThreadId);
        clearTerminalState(disposableThreadId);
        removeThreadFromSplitViews(disposableThreadId);
        clearTemporaryThread(disposableThreadId);
      } finally {
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
