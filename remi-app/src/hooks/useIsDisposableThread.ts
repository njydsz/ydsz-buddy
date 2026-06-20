/**
 * @file useIsDisposableThread.ts
 * @description 一次性线程检�?Hook - 判断线程是否应该被销�? * @module hooks/useIsDisposableThread
 */

import { type ThreadId } from "~/contracts";
import { useEffect, useRef } from "react";
import { useComposerDraftStore } from "../composerDraftStore";
import { useTemporaryThreadStore } from "../temporaryThreadStore";

/**
 * 一次性线程检�?Hook
 *
 * @description
 * 判断指定线程是否为一次性线程（临时线程）�? * 一次性线程在用户离开时应该被自动销毁�? *
 * �?Hook 使用"锁存"机制：一旦检测到线程是临时的，即使后续状态变化，
 * 也会保持返回 true，避�?UI 在草�?服务器提升过程中闪烁�? *
 * @param threadId - 要检查的线程 ID，可以为 null �?undefined
 *
 * @returns 是否为一次性线�? *
 * @example
 * ```tsx
 * const isDisposable = useIsDisposableThread(currentThreadId);
 *
 * if (isDisposable) {
 *   console.log('这是一个临时线程，离开时会被销�?);
 * }
 * ```
 *
 * @remarks
 * - 检查两个来源：临时线程存储和草稿线程元数据
 * - 使用 ref 记录已见过的临时线程，防止状态瞬变导�?UI 闪烁
 */
export function useIsDisposableThread(threadId: ThreadId | null | undefined): boolean {
  // 从临时线程存储中检查标�?  const hasTemporaryThreadMarker = useTemporaryThreadStore((store) =>
    threadId ? store.temporaryThreadIds[threadId] === true : false,
  );
  
  // 从草稿线程元数据中检查临时标�?  const hasTemporaryDraftMetadata = useComposerDraftStore((store) =>
    threadId ? store.draftThreadsByThreadId[threadId]?.isTemporary === true : false,
  );
  
  // 记录已见过的临时线程 ID，用于锁存机�?  const seenDisposableThreadIdsRef = useRef<Set<ThreadId>>(new Set());

  useEffect(() => {
    if (!threadId) {
      return;
    }
    // 锁存机制：一旦标记为临时，就永久记录，避�?UI 闪烁
    if (hasTemporaryThreadMarker || hasTemporaryDraftMetadata) {
      seenDisposableThreadIdsRef.current.add(threadId);
    }
  }, [threadId, hasTemporaryDraftMetadata, hasTemporaryThreadMarker]);

  if (!threadId) {
    return false;
  }
  
  // 返回 true 的条件：当前有临时标记，或者曾经被标记为临�?  return (
    hasTemporaryThreadMarker ||
    hasTemporaryDraftMetadata ||
    seenDisposableThreadIdsRef.current.has(threadId)
  );
}
