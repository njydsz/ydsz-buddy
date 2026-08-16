/**
 * @file useFailoverDraftGuard
 * @description 联动 Provider 故障转移与 Composer 离线草稿存储
 *
 * 监听 `useAutoProviderFailover` 的 history 变化。当发生 Provider 切换时，
 * 自动把当前 Composer 内容写入离线草稿，避免在切换 Provider / 重试过程中
 * 丢失用户已输入的文字。
 *
 * ## 核心导出
 *
 * - `useFailoverDraftGuard`：Hook（必须在 AutoProviderFailoverProvider 内使用）
 *
 * ## 使用场景
 *
 * - 顶层挂载 `AutoProviderFailoverProvider` 后，调用本 Hook
 * - 传入 `getCurrentPrompt` 回调（避免 Hook 重渲染时拿到陈旧值）
 * - 内部监听 history 长度变化，自动 `flushDraft` 一次当前内容
 */

import { useEffect, useRef } from "react";
import { useAutoProviderFailover } from "./useAutoProviderFailover";
import { useNetworkStatus } from "./useNetworkStatus";
import { useComposerOfflineDrafts } from "./useComposerOfflineDrafts";
import type { ThreadId } from "~/contracts";

export interface UseFailoverDraftGuardParams {
  /** 当前线程 id；为 null 时不生效 */
  threadId: ThreadId | null;
  /**
   * 返回当前 Composer 中用户已输入的文本。
   * 使用回调形式以避免 Hook 重渲染时拿到陈旧值。
   */
  getCurrentPrompt: () => string;
  /**
   * 可选：是否启用。
   * 默认 true（联动启用）。
   */
  enabled?: boolean;
}

export interface UseFailoverDraftGuardResult {
  /** 当前已保存草稿数量（用于 UI 展示） */
  draftCount: number;
  /** 网络是否处于降级 / 离线状态 */
  isDegraded: boolean;
}

/**
 * 联动故障转移与离线草稿的 Hook。
 *
 * - 监听 `useAutoProviderFailover().history` 长度变化
 * - 当新增 FailoverEvent 时，调用 `flushDraft` 写入离线草稿
 * - 同步报告当前降级状态与草稿数量
 *
 * ## 调用时机
 *
 * 必须在 `AutoProviderFailoverProvider` 子树内调用；通常与 `useComposerOfflineDrafts`
 * 一起在 ChatView 顶层使用。
 */
export function useFailoverDraftGuard(
  params: UseFailoverDraftGuardParams,
): UseFailoverDraftGuardResult {
  const { threadId, getCurrentPrompt, enabled = true } = params;
  const { history } = useAutoProviderFailover();
  const { isOffline, markDegraded } = useNetworkStatus();
  const { flushDraft, drafts } = useComposerOfflineDrafts(threadId);
  const lastSeenHistoryLengthRef = useRef(history.length);
  const initializedRef = useRef(false);

  // 初始化 lastSeenHistoryLengthRef 到首次 history 长度
  useEffect(() => {
    if (!initializedRef.current) {
      lastSeenHistoryLengthRef.current = history.length;
      initializedRef.current = true;
    }
  }, [history.length]);

  // 监听 history 变化：新增事件时保存草稿
  useEffect(() => {
    if (!enabled || !threadId) return;
    if (history.length <= lastSeenHistoryLengthRef.current) {
      return;
    }
    lastSeenHistoryLengthRef.current = history.length;
    const prompt = getCurrentPrompt();
    if (!prompt || !prompt.trim()) return;
    // 标记网络为降级状态，让 UI 显示恢复提示
    if (!isOffline) {
      markDegraded();
    }
    // 立即写入草稿（不走防抖）
    flushDraft(prompt);
  }, [enabled, threadId, history.length, getCurrentPrompt, isOffline, markDegraded, flushDraft]);

  return {
    draftCount: drafts.length,
    isDegraded: isOffline,
  };
}
