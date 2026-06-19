/**
 * @file 可处置线程管理模块
 * @description 隔离临时线程的自动处置决策与路由生命周期效果。
 *              提供基于切换感知的可处置线程清理解析器。
 */

import type { ThreadId } from "@remi-code/contracts";
import type { DraftThreadState } from "../composerDraftStore";

/**
 * 解析需要处置的临时线程 ID
 * @param input - 输入参数
 * @param input.previousThreadId - 上一个线程 ID
 * @param input.nextThreadId - 下一个线程 ID
 * @param input.previousThreadWasTemporary - 上一个线程是否为临时线程
 * @param input.draftThreadsByThreadId - 按线程 ID 索引的草稿线程状态
 * @returns 需要处置的线程 ID，如果无需处置则返回 null
 */
export function resolveDisposableThreadIdToDispose(input: {
  previousThreadId: ThreadId | null;
  nextThreadId: ThreadId | null;
  previousThreadWasTemporary?: boolean;
  draftThreadsByThreadId: Record<string, DraftThreadState | undefined>;
}): ThreadId | null {
  const previousThreadId = input.previousThreadId;
  // 如果没有上一个线程或线程未改变，则无需处置
  if (!previousThreadId || previousThreadId === input.nextThreadId) {
    return null;
  }
  const previousDraftThread = input.draftThreadsByThreadId[previousThreadId];
  // 仅当上一个线程是临时线程时才返回处置
  if (input.previousThreadWasTemporary !== true && previousDraftThread?.isTemporary !== true) {
    return null;
  }
  return previousThreadId;
}
