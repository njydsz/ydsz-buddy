/**
 * @file 应用状态管理
 * @description 使用 Zustand 管理 Web 应用的全局状态（会话、连接状态、主题、消息）
 */

import { create } from "zustand";

// ── 类型定义 ──────────────────────────────────────────────────────────

/** 聊天消息状态 */
export type MessageStatus = "pending" | "sending" | "streaming" | "sent" | "error";

/** 聊天消息 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  /** 消息状态 */
  status: MessageStatus;
  /** 错误信息（status 为 error 时） */
  error?: string;
  /** 是否可重试 */
  retryable?: boolean;
  /** 会话关联的 threadId */
  threadId?: string;
  /** 后端 messageId（用于流式更新匹配） */
  remoteMessageId?: string;
}

/** 会话摘要 */
export interface SessionSummary {
  id: string;
  title: string;
  lastMessage?: string;
  updatedAt: number;
  /** 后端 threadId */
  threadId?: string;
  /** 后端 projectId */
  projectId?: string;
}

/** 连接状态 */
export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

/** 应用状态 */
interface AppState {
  // ── 连接状态 ──────────────────────────────────────────────────────
  connectionStatus: ConnectionStatus;
  setConnectionStatus: (status: ConnectionStatus) => void;
  reconnectAttempts: number;
  setReconnectAttempts: (count: number) => void;

  // ── 会话列表 ──────────────────────────────────────────────────────
  sessions: SessionSummary[];
  activeSessionId: string | null;
  setSessions: (sessions: SessionSummary[]) => void;
  setActiveSession: (id: string | null) => void;
  addSession: (session: SessionSummary) => void;
  removeSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;

  // ── 当前会话消息 ──────────────────────────────────────────────────
  messages: ChatMessage[];
  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  clearMessages: () => void;
  /**
   * 更新消息内容（流式响应场景）
   * @param id 消息 ID
   * @param content 新内容
   * @param status 新状态
   */
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  /**
   * 设置消息状态为 error
   */
  setMessageError: (id: string, error: string, retryable?: boolean) => void;
  /**
   * 移除指定消息
   */
  removeMessage: (id: string) => void;

  // ── 主题 ──────────────────────────────────────────────────────────
  isDark: boolean;
  toggleTheme: () => void;
  setDark: (dark: boolean) => void;

  // ── 侧边栏折叠（移动端） ──────────────────────────────────────────
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

// ── Store 创建 ────────────────────────────────────────────────────────

export const useAppStore = create<AppState>((set, get) => ({
  // ── 连接状态 ──────────────────────────────────────────────────────
  connectionStatus: "connecting",
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  reconnectAttempts: 0,
  setReconnectAttempts: (count) => set({ reconnectAttempts: count }),

  // ── 会话列表 ──────────────────────────────────────────────────────
  sessions: [],
  activeSessionId: null,
  setSessions: (sessions) => set({ sessions }),

  setActiveSession: (id) => {
    // 切换会话时清空消息
    const prevId = get().activeSessionId;
    if (prevId !== id) {
      set({ activeSessionId: id, messages: [] });
    } else {
      set({ activeSessionId: id });
    }
  },

  addSession: (session) =>
    set((state) => ({
      sessions: [session, ...state.sessions],
      activeSessionId: session.id,
      messages: [],
    })),

  removeSession: (id) =>
    set((state) => {
      const newSessions = state.sessions.filter((s) => s.id !== id);
      const newActiveId =
        state.activeSessionId === id
          ? (newSessions[0]?.id ?? null)
          : state.activeSessionId;
      return {
        sessions: newSessions,
        activeSessionId: newActiveId,
        messages: state.activeSessionId === id ? [] : state.messages,
      };
    }),

  renameSession: (id, title) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, title } : s,
      ),
    })),

  // ── 当前会话消息 ──────────────────────────────────────────────────
  messages: [],
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  setMessages: (messages) => set({ messages }),

  clearMessages: () => set({ messages: [] }),

  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, ...updates } : msg,
      ),
    })),

  setMessageError: (id, error, retryable = true) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id
          ? { ...msg, status: "error" as const, error, retryable }
          : msg,
      ),
    })),

  removeMessage: (id) =>
    set((state) => ({
      messages: state.messages.filter((msg) => msg.id !== id),
    })),

  // ── 主题 ──────────────────────────────────────────────────────────
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

  setDark: (dark) =>
    set(() => {
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", dark);
      }
      return { isDark: dark };
    }),

  // ── 侧边栏 ────────────────────────────────────────────────────────
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
