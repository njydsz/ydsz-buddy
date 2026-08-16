/**
 * @file 临时线程判断 Hook
 *
 * 本 Hook 用于判断当前线程是否为临时线程（disposable thread），
 * 临时线程会在特定条件下被自动清理。
 *
 * ## 核心导出
 *
 * - `useIsDisposableThread`：返回 boolean 表示当前线程是否临时
 * - `useIsDisposableThreadById`：传入 threadId 判定
 *
 * ## 使用场景
 *
 * - 顶栏"删除"按钮的可见性
 * - 路由切换时的清理判断
 * - 关闭确认对话框的提示
 *
 * ## 注意事项
 *
 * - 临时线程的判断基于 `temporaryThreadStore`
 * - 已发送第一条消息后，临时线程晋升为永久线程
 * - 该 Hook 不会修改任何状态
 */

import { type ThreadId } from "@ydsz-buddy/contracts";
import { useEffect, useRef } from "react";
import { useComposerDraftStore } from "../composerDraftStore";
import { useTemporaryThreadStore } from "../temporaryThreadStore";

export function useIsDisposableThread(threadId: ThreadId | null | undefined): boolean {
  const hasTemporaryThreadMarker = useTemporaryThreadStore((store) =>
    threadId ? store.temporaryThreadIds[threadId] === true : false,
  );
  const hasTemporaryDraftMetadata = useComposerDraftStore((store) =>
    threadId ? store.draftThreadsByThreadId[threadId]?.isTemporary === true : false,
  );
  const seenDisposableThreadIdsRef = useRef<Set<ThreadId>>(new Set());

  useEffect(() => {
    if (!threadId) {
      return;
    }
    // Latch positives to avoid transient UI flicker during draft/server promotion.
    if (hasTemporaryThreadMarker || hasTemporaryDraftMetadata) {
      seenDisposableThreadIdsRef.current.add(threadId);
    }
  }, [threadId, hasTemporaryDraftMetadata, hasTemporaryThreadMarker]);

  if (!threadId) {
    return false;
  }
  return (
    hasTemporaryThreadMarker ||
    hasTemporaryDraftMetadata ||
    seenDisposableThreadIdsRef.current.has(threadId)
  );
}
