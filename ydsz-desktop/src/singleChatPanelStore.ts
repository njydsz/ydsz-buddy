/**
 * @file 单聊天面板状态管理模块
 * @description 管理单线程聊天界面的右侧面板状态，包括 diff 面板、文件浏览器等。
 *              面板状态通过 threadId 隔离存储，支持持久化。
 */

import type { ThreadId, TurnId } from "@ydsz-buddy/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ChatRightPanel } from "./diffRouteSearch";

export interface SingleChatPanelState {
  panel: ChatRightPanel | null;
  diffTurnId: TurnId | null;
  diffFilePath: string | null;
  hasOpenedPanel: boolean;
  lastOpenPanel: ChatRightPanel;
}

interface SingleChatPanelStore {
  panelStateByThreadId: Record<string, SingleChatPanelState | undefined>;
  setThreadPanelState: (threadId: ThreadId, patch: Partial<SingleChatPanelState>) => void;
  clearThreadPanelState: (threadId: ThreadId) => void;
}

const SINGLE_CHAT_PANEL_STORAGE_KEY = "ydsz-buddy:single-chat-panel-state:v1";

export function createDefaultSingleChatPanelState(): SingleChatPanelState {
  return {
    panel: null,
    diffTurnId: null,
    diffFilePath: null,
    hasOpenedPanel: false,
    lastOpenPanel: "browser",
  };
}

const DEFAULT_SINGLE_CHAT_PANEL_STATE = createDefaultSingleChatPanelState();

function getDefaultSingleChatPanelState(): SingleChatPanelState {
  return DEFAULT_SINGLE_CHAT_PANEL_STATE;
}

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

export function selectSingleChatPanelState(threadId: ThreadId) {
  return (store: SingleChatPanelStore) =>
    // Keep the fallback snapshot stable so React does not observe a phantom store change
    // while mounting a thread that has no persisted panel state yet.
    store.panelStateByThreadId[threadId] ?? getDefaultSingleChatPanelState();
}
