/**
 * @file 临时线程状态管理
 *
 * 管理临时线程的标记状态。临时线程是指不需要持久化到侧边栏的线程，
 * 例如通过快捷键快速创建的线程。使用 Zustand 纯内存 Store（不持久化），
 * 页面刷新后临时标记自动清除。
 */

import { type ThreadId } from "@remi-code/contracts";
import { create } from "zustand";

/** 临时线程 Store 的状态接口 */
interface TemporaryThreadStoreState {
  /** 临时线程 ID 集合，值为 true 表示该线程为临时线程 */
  temporaryThreadIds: Record<ThreadId, true | undefined>;
  /** 将指定线程标记为临时线程 */
  markTemporaryThread: (threadId: ThreadId) => void;
  /** 清除指定线程的临时标记 */
  clearTemporaryThread: (threadId: ThreadId) => void;
}

/**
 * 临时线程 Zustand Store。
 * 纯内存状态，不持久化到 localStorage。
 * 页面刷新后所有临时线程标记自动清除。
 */
export const useTemporaryThreadStore = create<TemporaryThreadStoreState>((set) => ({
  temporaryThreadIds: {},
  markTemporaryThread: (threadId) => {
    if (threadId.length === 0) return;
    set((state) => {
      if (state.temporaryThreadIds[threadId]) {
        return state;
      }
      return {
        temporaryThreadIds: {
          ...state.temporaryThreadIds,
          [threadId]: true,
        },
      };
    });
  },
  clearTemporaryThread: (threadId) => {
    if (threadId.length === 0) return;
    set((state) => {
      if (!state.temporaryThreadIds[threadId]) {
        return state;
      }
      const nextTemporaryThreadIds = { ...state.temporaryThreadIds };
      delete nextTemporaryThreadIds[threadId];
      return { temporaryThreadIds: nextTemporaryThreadIds };
    });
  },
}));
