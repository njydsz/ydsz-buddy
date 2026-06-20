/**
 * @file 鍗曡亰闈㈡澘鐘舵€佺鐞? *
 * 绠＄悊鍗曠嚎绋嬭亰澶╃晫闈㈠彸渚ч潰鏉跨殑鐘舵€佹寔涔呭寲銆? * 姣忎釜绾跨▼鐙珛缁存姢闈㈡澘绫诲瀷锛堟祻瑙堝櫒/Diff锛夈€丏iff 杞 ID銆丏iff 鏂囦欢璺緞绛夌姸鎬侊紝
 * 浣跨敤 Zustand + persist 涓棿浠舵寔涔呭寲鍒?localStorage銆? */

import type { ThreadId, TurnId } from "~/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ChatRightPanel } from "./diffRouteSearch";

/**
 * 鍗曡亰闈㈡澘鐨勭姸鎬侊紝璁板綍姣忎釜绾跨▼鐨勫彸渚ч潰鏉块厤缃€? */
export interface SingleChatPanelState {
  /** 褰撳墠鎵撳紑鐨勯潰鏉跨被鍨嬶紝null 琛ㄧず闈㈡澘鍏抽棴 */
  panel: ChatRightPanel | null;
  /** 褰撳墠鏌ョ湅鐨?Diff 杞 ID */
  diffTurnId: TurnId | null;
  /** 褰撳墠鏌ョ湅鐨?Diff 鏂囦欢璺緞 */
  diffFilePath: string | null;
  /** 鐢ㄦ埛鏄惁鏇剧粡鎵撳紑杩囬潰鏉匡紙鐢ㄤ簬棣栨鎵撳紑鎻愮ず锛?*/
  hasOpenedPanel: boolean;
  /** 涓婃鎵撳紑鐨勯潰鏉跨被鍨嬶紙鐢ㄤ簬闈㈡澘鍒囨崲鏃舵仮澶嶏級 */
  lastOpenPanel: ChatRightPanel;
}

/** 鍗曡亰闈㈡澘 Store 鐨勭姸鎬佹帴鍙?*/
interface SingleChatPanelStore {
  /** 鎸夌嚎绋?ID 绱㈠紩鐨勯潰鏉跨姸鎬佹槧灏?*/
  panelStateByThreadId: Record<string, SingleChatPanelState | undefined>;
  /** 鏇存柊鎸囧畾绾跨▼鐨勯潰鏉跨姸鎬侊紙閮ㄥ垎鏇存柊锛?*/
  setThreadPanelState: (threadId: ThreadId, patch: Partial<SingleChatPanelState>) => void;
  /** 娓呴櫎鎸囧畾绾跨▼鐨勯潰鏉跨姸鎬?*/
  clearThreadPanelState: (threadId: ThreadId) => void;
}

/** localStorage 涓殑瀛樺偍閿?*/
const SINGLE_CHAT_PANEL_STORAGE_KEY = "remicode:single-chat-panel-state:v1";

/**
 * 鍒涘缓榛樿鐨勫崟鑱婇潰鏉跨姸鎬併€? *
 * @returns 榛樿闈㈡澘鐘舵€佸璞? */
export function createDefaultSingleChatPanelState(): SingleChatPanelState {
  return {
    panel: null,
    diffTurnId: null,
    diffFilePath: null,
    hasOpenedPanel: false,
    lastOpenPanel: "browser",
  };
}

/** 榛樿闈㈡澘鐘舵€佺殑鍗曚緥缂撳瓨 */
const DEFAULT_SINGLE_CHAT_PANEL_STATE = createDefaultSingleChatPanelState();

/** 鑾峰彇榛樿闈㈡澘鐘舵€佺殑寮曠敤锛堜繚鎸佸紩鐢ㄧǔ瀹氫互閬垮厤涓嶅繀瑕佺殑閲嶆覆鏌擄級 */
function getDefaultSingleChatPanelState(): SingleChatPanelState {
  return DEFAULT_SINGLE_CHAT_PANEL_STATE;
}

/**
 * 鍗曡亰闈㈡澘 Zustand Store銆? * 鎸佷箙鍖栧埌 localStorage锛屾寜绾跨▼ ID 鐙珛绠＄悊闈㈡澘鐘舵€併€? * 鐘舵€佹湭鍙樺寲鏃惰烦杩囨洿鏂颁互閬垮厤涓嶅繀瑕佺殑閲嶆覆鏌撱€? */
export const useSingleChatPanelStore = create<SingleChatPanelStore>()(
  persist(
    (set) => ({
      panelStateByThreadId: {},
      setThreadPanelState: (threadId, patch) =>
        set((state) => {
          const previous = state.panelStateByThreadId[threadId] ?? getDefaultSingleChatPanelState();
          const next = {
            ...previous,
            ...patch,
          };
          if (
            previous.panel === next.panel &&
            previous.diffTurnId === next.diffTurnId &&
            previous.diffFilePath === next.diffFilePath &&
            previous.hasOpenedPanel === next.hasOpenedPanel &&
            previous.lastOpenPanel === next.lastOpenPanel
          ) {
            return state;
          }
          return {
            panelStateByThreadId: {
              ...state.panelStateByThreadId,
              [threadId]: next,
            },
          };
        }),
      clearThreadPanelState: (threadId) =>
        set((state) => {
          if (!Object.hasOwn(state.panelStateByThreadId, threadId)) {
            return state;
          }
          const nextPanelStateByThreadId = { ...state.panelStateByThreadId };
          delete nextPanelStateByThreadId[threadId];
          return {
            panelStateByThreadId: nextPanelStateByThreadId,
          };
        }),
    }),
    {
      name: SINGLE_CHAT_PANEL_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/**
 * 鍒涘缓閫夋嫨鍣ㄥ嚱鏁帮紝鑾峰彇鎸囧畾绾跨▼鐨勯潰鏉跨姸鎬併€? * 鏈寔涔呭寲鐘舵€佺殑绾跨▼杩斿洖榛樿鐘舵€佺殑绋冲畾寮曠敤锛岄伩鍏?React 妫€娴嬪埌骞诲奖鍙樻洿銆? *
 * @param threadId - 绾跨▼ ID
 * @returns Zustand 閫夋嫨鍣ㄥ嚱鏁? */
export function selectSingleChatPanelState(threadId: ThreadId) {
  return (store: SingleChatPanelStore) =>
    // Keep the fallback snapshot stable so React does not observe a phantom store change
    // while mounting a thread that has no persisted panel state yet.
    store.panelStateByThreadId[threadId] ?? getDefaultSingleChatPanelState();
}
