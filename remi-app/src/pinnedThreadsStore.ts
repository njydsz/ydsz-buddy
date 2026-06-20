/**
 * @file 缂冾噣銆婄痪璺ㄢ柤閻樿埖鈧胶顓搁悶? *
 * 缁狅紕鎮婃笟褑绔熼弽蹇庤厬閸忋劌鐪純顕€銆婇惃鍕喊婢垛晝鍤庣粙?ID 閸掓銆冮妴? * 娴ｈ法鏁?Zustand + persist 娑擃參妫挎禒璺虹殺閻樿埖鈧焦瀵旀稊鍛閸?localStorage閿? * 閺€顖涘瘮缂冾噣銆婇妴浣稿絿濞戝牏鐤嗘い韬测偓浣稿瀼閹广垻鐤嗘い鍓佸Ц閹礁鎷板〒鍛倞閺冪姵鏅ョ純顕€銆婄粵澶嬫惙娴ｆ嚎鈧? */

import { type ThreadId } from "~/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 缂冾噣銆婄痪璺ㄢ柤 Store 閻ㄥ嫮濮搁幀浣瑰复閸?*/
interface PinnedThreadsStoreState {
  /** 缂冾噣銆婇惃鍕殠缁?ID 閸掓銆?*/
  pinnedThreadIds: ThreadId[];
  /** 缂冾噣銆婇幐鍥х暰缁捐法鈻?*/
  pinThread: (threadId: ThreadId) => void;
  /** 閸欐牗绉风純顕€銆婇幐鍥х暰缁捐法鈻?*/
  unpinThread: (threadId: ThreadId) => void;
  /** 閸掑洦宕查幐鍥х暰缁捐法鈻奸惃鍕枂妞ゅ墎濮搁幀?*/
  togglePinnedThread: (threadId: ThreadId) => void;
  /** 濞撳懐鎮婃稉宥呮躬缁捐法鈻奸崚妤勩€冩稉顓犳畱閺冪姵鏅ョ純顕€銆婃い?*/
  prunePinnedThreads: (threadIds: readonly ThreadId[]) => void;
}

/** localStorage 娑擃厾娈戠€涙ê鍋嶉柨?*/
const PINNED_THREADS_STORAGE_KEY = "remicode:pinned-threads:v1";

/**
 * 閺嶅洤鍣崠鏍枂妞ゅ墎鍤庣粙?ID 閸掓銆冮敍灞藉箵闂勩倗鈹栫€涙顑佹稉鎻掓嫲闁插秴顦叉い骞库偓? *
 * @param threadIds - 閸樼喎顫愮痪璺ㄢ柤 ID 閸掓銆? * @returns 閸樺鍣搁崥搴ｆ畱閺堝鏅ョ痪璺ㄢ柤 ID 閺佹壆绮? */
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
 * 缂冾噣銆婄痪璺ㄢ柤 Zustand Store閵? * 閹镐椒绠欓崠鏍у煂 localStorage閿涘本鏁幐浣虹枂妞?閸欐牗绉风純顕€銆?閸掑洦宕?濞撳懐鎮婇幙宥勭稊閵? * 鎼村繐鍨崠鏍ㄦ閼奉亜濮╅弽鍥у櫙閸栨牕骞撻柌宥忕礉閸欏秴绨崚妤€瀵查弮璺烘値楠炶埖鐗庢灞烩偓? */
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
