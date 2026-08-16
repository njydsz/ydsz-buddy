/**
 * @file 临时线程状态管理模块
 * @description 管理临时线程 ID 的状态，用于标记尚未永久保存的临时会话。
 *              临时线程通常在创建后未立即交互或保存，需要在适当时候清理。
 */

import { type ThreadId } from "@ydsz-buddy/contracts";
import { create } from "zustand";

/** 临时线程存储状态接口 */
interface TemporaryThreadStoreState {
  /** 临时线程 ID 映射表 */
  temporaryThreadIds: Record<ThreadId, true | undefined>;
  /** 标记线程为临时的 */
  markTemporaryThread: (threadId: ThreadId) => void;
  /** 清除线程的临时标记 */
  clearTemporaryThread: (threadId: ThreadId) => void;
}

/** 临时线程状态管理 Store */
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
