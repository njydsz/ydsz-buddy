/**
 * @file 应用状态管理
 * @description 使用 Zustand 管理 Web 应用的全局状态（会话、连接状态、主题）
 */

import { create } from "zustand";

/** 聊天消息 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

/** 会话摘要 */
export interface SessionSummary {
  id: string;
  title: string;
  lastMessage?: string;
  updatedAt: number;
}

/** 连接状态 */
export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

/** 应用状态 */
interface AppState {
  // 连接状态
  connectionStatus: ConnectionStatus;
  setConnectionStatus: (status: ConnectionStatus) => void;

  // 会话列表
  sessions: SessionSummary[];
  activeSessionId: string | null;
  setSessions: (sessions: SessionSummary[]) => void;
  setActiveSession: (id: string | null) => void;
  addSession: (session: SessionSummary) => void;

  // 当前会话消息
  messages: ChatMessage[];
  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  clearMessages: () => void;

  // 主题
  isDark: boolean;
  toggleTheme: () => void;

  // 侧边栏折叠（移动端）
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // 连接状态
  connectionStatus: "connecting",
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  // 会话列表
  sessions: [],
  activeSessionId: null,
  setSessions: (sessions) => set({ sessions }),
  setActiveSession: (id) => set({ activeSessionId: id }),
  addSession: (session) =>
    set((state) => ({
      sessions: [session, ...state.sessions],
      activeSessionId: session.id,
    })),

  // 当前会话消息
  messages: [],
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  setMessages: (messages) => set({ messages }),
  clearMessages: () => set({ messages: [] }),

  // 主题
  isDark: window.matchMedia("(prefers-color-scheme: dark)").matches,
  toggleTheme: () =>
    set((state) => {
      const newIsDark = !state.isDark;
      // 同步更新 DOM 上的 dark 类
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", newIsDark);
      }
      return { isDark: newIsDark };
    }),

  // 侧边栏
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
