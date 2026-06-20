/**
 * @file 涓存椂绾跨▼鐘舵€佺鐞? *
 * 绠＄悊涓存椂绾跨▼鐨勬爣璁扮姸鎬併€備复鏃剁嚎绋嬫槸鎸囦笉闇€瑕佹寔涔呭寲鍒颁晶杈规爮鐨勭嚎绋嬶紝
 * 渚嬪閫氳繃蹇嵎閿揩閫熷垱寤虹殑绾跨▼銆備娇鐢?Zustand 绾唴瀛?Store锛堜笉鎸佷箙鍖栵級锛? * 椤甸潰鍒锋柊鍚庝复鏃舵爣璁拌嚜鍔ㄦ竻闄ゃ€? */

import { type ThreadId } from "~/contracts";
import { create } from "zustand";

/** 涓存椂绾跨▼ Store 鐨勭姸鎬佹帴鍙?*/
interface TemporaryThreadStoreState {
  /** 涓存椂绾跨▼ ID 闆嗗悎锛屽€间负 true 琛ㄧず璇ョ嚎绋嬩负涓存椂绾跨▼ */
  temporaryThreadIds: Record<ThreadId, true | undefined>;
  /** 灏嗘寚瀹氱嚎绋嬫爣璁颁负涓存椂绾跨▼ */
  markTemporaryThread: (threadId: ThreadId) => void;
  /** 娓呴櫎鎸囧畾绾跨▼鐨勪复鏃舵爣璁?*/
  clearTemporaryThread: (threadId: ThreadId) => void;
}

/**
 * 涓存椂绾跨▼ Zustand Store銆? * 绾唴瀛樼姸鎬侊紝涓嶆寔涔呭寲鍒?localStorage銆? * 椤甸潰鍒锋柊鍚庢墍鏈変复鏃剁嚎绋嬫爣璁拌嚜鍔ㄦ竻闄ゃ€? */
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
