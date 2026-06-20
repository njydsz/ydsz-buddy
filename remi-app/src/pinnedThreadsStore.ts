/**
 * @file 置顶线程状态管�? *
 * 管理侧边栏中全局置顶的聊天线�?ID 列表�? * 使用 Zustand + persist 中间件将状态持久化�?localStorage�? * 支持置顶、取消置顶、切换置顶状态和清理无效置顶等操作�? */

import { type ThreadId } from "~/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 置顶线程 Store 的状态接�?*/
interface PinnedThreadsStoreState {
  /** 置顶的线�?ID 列表 */
  pinnedThreadIds: ThreadId[];
  /** 置顶指定线程 */
  pinThread: (threadId: ThreadId) => void;
  /** 取消置顶指定线程 */
  unpinThread: (threadId: ThreadId) => void;
  /** 切换指定线程的置顶状�?*/
  togglePinnedThread: (threadId: ThreadId) => void;
  /** 清理不在线程列表中的无效置顶�?*/
  prunePinnedThreads: (threadIds: readonly ThreadId[]) => void;
}

/** localStorage 中的存储�?*/
const PINNED_THREADS_STORAGE_KEY = "remicode:pinned-threads:v1";

/**
 * 标准化置顶线�?ID 列表，去除空字符串和重复项�? *
 * @param threadIds - 原始线程 ID 列表
 * @returns 去重后的有效线程 ID 数组
 */
function normalizePinnedThreadIds(threadIds: readonly ThreadId[]): ThreadId[] {
  const seen = new Set<ThreadId>();
  const normalized: ThreadId[] = [];

  for (const threadId of threadIds) {
    if (threadId.length === 0 || seen.has(threadId)) {
      continue;
    }
    seen.add(threadId);
    normalized.push(threadId);
  }

  return normalized;
}

/**
 * 置顶线程 Zustand Store�? * 持久化到 localStorage，支持置�?取消置顶/切换/清理操作�? * 序列化时自动标准化去重，反序列化时合并校验�? */
export const usePinnedThreadsStore = create<PinnedThreadsStoreState>()(
  persist(
    (set) => ({
      pinnedThreadIds: [],
      pinThread: (threadId) => {
        if (threadId.length === 0) return;
        set((state) => {
          if (state.pinnedThreadIds.includes(threadId)) {
            return state;
          }
          return {
            pinnedThreadIds: [threadId, ...state.pinnedThreadIds],
          };
        });
      },
      unpinThread: (threadId) => {
        if (threadId.length === 0) return;
        set((state) => {
          if (!state.pinnedThreadIds.includes(threadId)) {
            return state;
          }
          return {
            pinnedThreadIds: state.pinnedThreadIds.filter((candidate) => candidate !== threadId),
          };
        });
      },
      togglePinnedThread: (threadId) => {
        if (threadId.length === 0) return;
        set((state) => {
          if (state.pinnedThreadIds.includes(threadId)) {
            return {
              pinnedThreadIds: state.pinnedThreadIds.filter((candidate) => candidate !== threadId),
            };
          }
          return {
            pinnedThreadIds: [threadId, ...state.pinnedThreadIds],
          };
        });
      },
      prunePinnedThreads: (threadIds) => {
        const allowedThreadIds = new Set(threadIds);
        set((state) => {
          const nextPinnedThreadIds = state.pinnedThreadIds.filter((threadId) =>
            allowedThreadIds.has(threadId),
          );
          return nextPinnedThreadIds.length === state.pinnedThreadIds.length
            ? state
            : { pinnedThreadIds: nextPinnedThreadIds };
        });
      },
    }),
    {
      name: PINNED_THREADS_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        pinnedThreadIds: normalizePinnedThreadIds(state.pinnedThreadIds),
      }),
      merge: (persistedState, currentState) => {
        const candidate =
          (persistedState as Partial<Pick<PinnedThreadsStoreState, "pinnedThreadIds">> | undefined)
            ?.pinnedThreadIds ?? [];
        return {
          ...currentState,
          pinnedThreadIds: normalizePinnedThreadIds(candidate),
        };
      },
    },
  ),
);
