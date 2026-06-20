/**
 * @file 閸楁洝浜伴棃銏℃緲閻樿埖鈧胶顓搁悶? *
 * 缁狅紕鎮婇崡鏇犲殠缁嬪浜版径鈺冩櫕闂堛垹褰告笟褔娼伴弶璺ㄦ畱閻樿埖鈧焦瀵旀稊鍛閵? * 濮ｅ繋閲滅痪璺ㄢ柤閻欘剛鐝涚紒瀛樺Б闂堛垺婢樼猾璇茬€烽敍鍫熺セ鐟欏牆娅?Diff閿涘鈧笍iff 鏉烆喗顐?ID閵嗕笍iff 閺傚洣娆㈢捄顖氱窞缁涘濮搁幀渚婄礉
 * 娴ｈ法鏁?Zustand + persist 娑擃參妫挎禒鑸靛瘮娑斿懎瀵查崚?localStorage閵? */

import type { ThreadId, TurnId } from "~/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ChatRightPanel } from "./diffRouteSearch";

/**
 * 閸楁洝浜伴棃銏℃緲閻ㄥ嫮濮搁幀渚婄礉鐠佹澘缍嶅В蹇庨嚋缁捐法鈻奸惃鍕礁娓氀囨桨閺夊潡鍘ょ純顔衡偓? */
export interface SingleChatPanelState {
  /** 瑜版挸澧犻幍鎾崇磻閻ㄥ嫰娼伴弶璺ㄨ閸ㄥ绱漬ull 鐞涖劎銇氶棃銏℃緲閸忔娊妫?*/
  panel: ChatRightPanel | null;
  /** 瑜版挸澧犻弻銉ф箙閻?Diff 鏉烆喗顐?ID */
  diffTurnId: TurnId | null;
  /** 瑜版挸澧犻弻銉ф箙閻?Diff 閺傚洣娆㈢捄顖氱窞 */
  diffFilePath: string | null;
  /** 閻劍鍩涢弰顖氭儊閺囧墽绮￠幍鎾崇磻鏉╁洭娼伴弶鍖＄礄閻劋绨＃鏍偧閹垫挸绱戦幓鎰仛閿?*/
  hasOpenedPanel: boolean;
  /** 娑撳﹥顐奸幍鎾崇磻閻ㄥ嫰娼伴弶璺ㄨ閸ㄥ绱欓悽銊ょ艾闂堛垺婢橀崚鍥ㄥ床閺冭埖浠径宥忕礆 */
  lastOpenPanel: ChatRightPanel;
}

/** 閸楁洝浜伴棃銏℃緲 Store 閻ㄥ嫮濮搁幀浣瑰复閸?*/
interface SingleChatPanelStore {
  /** 閹稿鍤庣粙?ID 缁便垹绱╅惃鍕桨閺夎法濮搁幀浣规Ё鐏?*/
  panelStateByThreadId: Record<string, SingleChatPanelState | undefined>;
  /** 閺囧瓨鏌婇幐鍥х暰缁捐法鈻奸惃鍕桨閺夎法濮搁幀渚婄礄闁劌鍨庨弴瀛樻煀閿?*/
  setThreadPanelState: (threadId: ThreadId, patch: Partial<SingleChatPanelState>) => void;
  /** 濞撳懘娅庨幐鍥х暰缁捐法鈻奸惃鍕桨閺夎法濮搁幀?*/
  clearThreadPanelState: (threadId: ThreadId) => void;
}

/** localStorage 娑擃厾娈戠€涙ê鍋嶉柨?*/
const SINGLE_CHAT_PANEL_STORAGE_KEY = "remicode:single-chat-panel-state:v1";

/**
 * 閸掓稑缂撴妯款吇閻ㄥ嫬宕熼懕濠囨桨閺夎法濮搁幀浣碘偓? *
 * @returns 姒涙顓婚棃銏℃緲閻樿埖鈧礁顕挒? */
export function createDefaultSingleChatPanelState(): SingleChatPanelState {
  return {
    panel: null,
    diffTurnId: null,
    diffFilePath: null,
    hasOpenedPanel: false,
    lastOpenPanel: "browser",
  };
}

/** 姒涙顓婚棃銏℃緲閻樿埖鈧胶娈戦崡鏇氱伐缂傛挸鐡?*/
const DEFAULT_SINGLE_CHAT_PANEL_STATE = createDefaultSingleChatPanelState();

/** 閼惧嘲褰囨妯款吇闂堛垺婢橀悩鑸碘偓浣烘畱瀵洜鏁ら敍鍫滅箽閹镐礁绱╅悽銊旂€规矮浜掗柆鍨帳娑撳秴绻€鐟曚胶娈戦柌宥嗚閺屾搫绱?*/
function getDefaultSingleChatPanelState(): SingleChatPanelState {
  return DEFAULT_SINGLE_CHAT_PANEL_STATE;
}

/**
 * 閸楁洝浜伴棃銏℃緲 Zustand Store閵? * 閹镐椒绠欓崠鏍у煂 localStorage閿涘本瀵滅痪璺ㄢ柤 ID 閻欘剛鐝涚粻锛勬倞闂堛垺婢橀悩鑸碘偓浣碘偓? * 閻樿埖鈧焦婀崣妯哄閺冩儼鐑︽潻鍥ㄦ纯閺傞浜掗柆鍨帳娑撳秴绻€鐟曚胶娈戦柌宥嗚閺屾挶鈧? */
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
 * 閸掓稑缂撻柅澶嬪閸ｃ劌鍤遍弫甯礉閼惧嘲褰囬幐鍥х暰缁捐法鈻奸惃鍕桨閺夎法濮搁幀浣碘偓? * 閺堫亝瀵旀稊鍛閻樿埖鈧胶娈戠痪璺ㄢ柤鏉╂柨娲栨妯款吇閻樿埖鈧胶娈戠粙鍐茬暰瀵洜鏁ら敍宀勪缉閸?React 濡偓濞村鍩岄獮璇插閸欐ɑ娲块妴? *
 * @param threadId - 缁捐法鈻?ID
 * @returns Zustand 闁瀚ㄩ崳銊ュ毐閺? */
export function selectSingleChatPanelState(threadId: ThreadId) {
  return (store: SingleChatPanelStore) =>
    // Keep the fallback snapshot stable so React does not observe a phantom store change
    // while mounting a thread that has no persisted panel state yet.
    store.panelStateByThreadId[threadId] ?? getDefaultSingleChatPanelState();
}
