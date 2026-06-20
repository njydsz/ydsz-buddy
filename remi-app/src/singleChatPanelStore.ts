/**
 * @file 单聊面板状态管理
 *
 * 管理单线程聊天界面右侧面板的状态持久化。
 * 每个线程独立维护面板类型（浏览器/Diff）、Diff 轮次 ID、Diff 文件路径等状态，
 * 使用 Zustand + persist 中间件持久化到 localStorage。
 */

import type { ThreadId, TurnId } from "@remi-code/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ChatRightPanel } from "./diffRouteSearch";

/**
 * 单聊面板的状态，记录每个线程的右侧面板配置。
 */
export interface SingleChatPanelState {
  /** 当前打开的面板类型，null 表示面板关闭 */
  panel: ChatRightPanel | null;
  /** 当前查看的 Diff 轮次 ID */
  diffTurnId: TurnId | null;
  /** 当前查看的 Diff 文件路径 */
  diffFilePath: string | null;
  /** 用户是否曾经打开过面板（用于首次打开提示） */
  hasOpenedPanel: boolean;
  /** 上次打开的面板类型（用于面板切换时恢复） */
  lastOpenPanel: ChatRightPanel;
}

/** 单聊面板 Store 的状态接口 */
interface SingleChatPanelStore {
  /** 按线程 ID 索引的面板状态映射 */
  panelStateByThreadId: Record<string, SingleChatPanelState | undefined>;
  /** 更新指定线程的面板状态（部分更新） */
  setThreadPanelState: (threadId: ThreadId, patch: Partial<SingleChatPanelState>) => void;
  /** 清除指定线程的面板状态 */
  clearThreadPanelState: (threadId: ThreadId) => void;
}

/** localStorage 中的存储键 */
const SINGLE_CHAT_PANEL_STORAGE_KEY = "remicode:single-chat-panel-state:v1";

/**
 * 创建默认的单聊面板状态。
 *
 * @returns 默认面板状态对象
 */
export function createDefaultSingleChatPanelState(): SingleChatPanelState {
  return {
    panel: null,
    diffTurnId: null,
    diffFilePath: null,
    hasOpenedPanel: false,
    lastOpenPanel: "browser",
  };
}

/** 默认面板状态的单例缓存 */
const DEFAULT_SINGLE_CHAT_PANEL_STATE = createDefaultSingleChatPanelState();

/** 获取默认面板状态的引用（保持引用稳定以避免不必要的重渲染） */
function getDefaultSingleChatPanelState(): SingleChatPanelState {
  return DEFAULT_SINGLE_CHAT_PANEL_STATE;
}

/**
 * 单聊面板 Zustand Store。
 * 持久化到 localStorage，按线程 ID 独立管理面板状态。
 * 状态未变化时跳过更新以避免不必要的重渲染。
 */
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
 * 创建选择器函数，获取指定线程的面板状态。
 * 未持久化状态的线程返回默认状态的稳定引用，避免 React 检测到幻影变更。
 *
 * @param threadId - 线程 ID
 * @returns Zustand 选择器函数
 */
export function selectSingleChatPanelState(threadId: ThreadId) {
  return (store: SingleChatPanelStore) =>
    // Keep the fallback snapshot stable so React does not observe a phantom store change
    // while mounting a thread that has no persisted panel state yet.
    store.panelStateByThreadId[threadId] ?? getDefaultSingleChatPanelState();
}
