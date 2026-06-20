/**
 * @file 缃《绾跨▼鐘舵€佺鐞? *
 * 绠＄悊渚ц竟鏍忎腑鍏ㄥ眬缃《鐨勮亰澶╃嚎绋?ID 鍒楄〃銆? * 浣跨敤 Zustand + persist 涓棿浠跺皢鐘舵€佹寔涔呭寲鍒?localStorage锛? * 鏀寔缃《銆佸彇娑堢疆椤躲€佸垏鎹㈢疆椤剁姸鎬佸拰娓呯悊鏃犳晥缃《绛夋搷浣溿€? */

import { type ThreadId } from "~/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 缃《绾跨▼ Store 鐨勭姸鎬佹帴鍙?*/
interface PinnedThreadsStoreState {
  /** 缃《鐨勭嚎绋?ID 鍒楄〃 */
  pinnedThreadIds: ThreadId[];
  /** 缃《鎸囧畾绾跨▼ */
  pinThread: (threadId: ThreadId) => void;
  /** 鍙栨秷缃《鎸囧畾绾跨▼ */
  unpinThread: (threadId: ThreadId) => void;
  /** 鍒囨崲鎸囧畾绾跨▼鐨勭疆椤剁姸鎬?*/
  togglePinnedThread: (threadId: ThreadId) => void;
  /** 娓呯悊涓嶅湪绾跨▼鍒楄〃涓殑鏃犳晥缃《椤?*/
  prunePinnedThreads: (threadIds: readonly ThreadId[]) => void;
}

/** localStorage 涓殑瀛樺偍閿?*/
const PINNED_THREADS_STORAGE_KEY = "remicode:pinned-threads:v1";

/**
 * 鏍囧噯鍖栫疆椤剁嚎绋?ID 鍒楄〃锛屽幓闄ょ┖瀛楃涓插拰閲嶅椤广€? *
 * @param threadIds - 鍘熷绾跨▼ ID 鍒楄〃
 * @returns 鍘婚噸鍚庣殑鏈夋晥绾跨▼ ID 鏁扮粍
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
 * 缃《绾跨▼ Zustand Store銆? * 鎸佷箙鍖栧埌 localStorage锛屾敮鎸佺疆椤?鍙栨秷缃《/鍒囨崲/娓呯悊鎿嶄綔銆? * 搴忓垪鍖栨椂鑷姩鏍囧噯鍖栧幓閲嶏紝鍙嶅簭鍒楀寲鏃跺悎骞舵牎楠屻€? */
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
