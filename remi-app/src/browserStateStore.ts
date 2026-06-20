/**
 * @file 浏览器状态轻量缓�? * @description 按线程维度缓存浏览器元数据�? * 实际的浏览器渲染面在 Tauri 桌面端，Web 端仅保留足够的状�? * 以渲染标签页/工具栏，并在线程切换时保持可预测的行为�? */

import type { ThreadBrowserState, ThreadId } from "~/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** localStorage 持久�?key */
const BROWSER_STATE_STORAGE_KEY = "remicode:browser-state:v1";
/** 每个线程保留的最大历史记录条�?*/
const BROWSER_HISTORY_LIMIT = 12;
/** 空历史记录的常量引用，避免重复创建空数组 */
const EMPTY_BROWSER_HISTORY: BrowserHistoryEntry[] = [];

/** 浏览器历史记录条�?*/
export interface BrowserHistoryEntry {
  /** 页面 URL */
  url: string;
  /** 页面标题 */
  title: string;
  /** 标签�?ID */
  tabId: string;
}

/** 浏览器状�?store 内部接口 */
interface BrowserStateStore {
  /** 按线�?ID 索引的浏览器状�?*/
  threadStatesByThreadId: Record<string, ThreadBrowserState | undefined>;
  /** 按线�?ID 索引的最近浏览历�?*/
  recentHistoryByThreadId: Record<string, BrowserHistoryEntry[] | undefined>;
  /** 更新或插入线程浏览器状�?*/
  upsertThreadState: (state: ThreadBrowserState) => void;
  /** 移除线程浏览器状�?*/
  removeThreadState: (threadId: ThreadId) => void;
}

/** 归一化历�?URL，将 about:blank 视为�?URL */
function normalizeHistoryUrl(url: string): string {
  const trimmed = url.trim();
  return trimmed === "about:blank" ? "" : trimmed;
}

/**
 * 更新或插入最近浏览历史条�? *
 * @description 将新条目插入列表头部，去重同 URL 的旧条目�? * 并限制列表长度不超过 BROWSER_HISTORY_LIMIT�? *
 * @param entries - 已有的历史条目列�? * @param nextEntry - 新的历史条目
 * @returns 更新后的历史条目列表
 */
function upsertRecentHistoryEntry(
  entries: BrowserHistoryEntry[] | undefined,
  nextEntry: BrowserHistoryEntry,
): BrowserHistoryEntry[] {
  const normalizedUrl = normalizeHistoryUrl(nextEntry.url);
  if (normalizedUrl.length === 0) {
    return entries ?? [];
  }

  const nextEntries = (entries ?? []).filter(
    (entry) => normalizeHistoryUrl(entry.url) !== normalizedUrl,
  );
  nextEntries.unshift({
    ...nextEntry,
    url: normalizedUrl,
  });
  return nextEntries.slice(0, BROWSER_HISTORY_LIMIT);
}

/**
 * 判断两份历史记录是否相同
 *
 * @description 用于避免在历史内容未变时产生新的引用，减少不必要的重渲染�? *
 * @param previousEntries - 之前的历史条�? * @param nextEntries - 新的历史条目
 * @returns 是否完全相同
 */
function sameBrowserHistoryEntries(
  previousEntries: BrowserHistoryEntry[] | undefined,
  nextEntries: BrowserHistoryEntry[],
): boolean {
  if (previousEntries === nextEntries) {
    return true;
  }

  if (previousEntries == null || previousEntries.length !== nextEntries.length) {
    return false;
  }

  return previousEntries.every((entry, index) => {
    const nextEntry = nextEntries[index];
    if (!nextEntry) {
      return false;
    }
    return (
      entry.url === nextEntry.url &&
      entry.title === nextEntry.title &&
      entry.tabId === nextEntry.tabId
    );
  });
}

/** 浏览器状�?Zustand store，带 localStorage 持久�?*/
export const useBrowserStateStore = create<BrowserStateStore>()(
  persist(
    (set) => ({
      threadStatesByThreadId: {},
      recentHistoryByThreadId: {},
      upsertThreadState: (state) =>
        set((current) => {
          const previousState = current.threadStatesByThreadId[state.threadId];
          if (previousState?.version === state.version) {
            return current;
          }
          const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId) ?? null;
          const orderedTabs = activeTab
            ? [activeTab, ...state.tabs.filter((tab) => tab.id !== activeTab.id)]
            : state.tabs;
          const previousHistory =
            current.recentHistoryByThreadId[state.threadId] ?? EMPTY_BROWSER_HISTORY;
          const nextHistory = orderedTabs.reduce(
            (entries, tab) =>
              upsertRecentHistoryEntry(entries, {
                url: tab.lastCommittedUrl ?? tab.url,
                title: tab.title,
                tabId: tab.id,
              }),
            previousHistory,
          );
          const historyChanged = !sameBrowserHistoryEntries(previousHistory, nextHistory);

          return {
            threadStatesByThreadId: {
              ...current.threadStatesByThreadId,
              [state.threadId]: state,
            },
            recentHistoryByThreadId: historyChanged
              ? {
                  ...current.recentHistoryByThreadId,
                  [state.threadId]: nextHistory,
                }
              : current.recentHistoryByThreadId,
          };
        }),
      removeThreadState: (threadId) =>
        set((current) => {
          if (!Object.hasOwn(current.threadStatesByThreadId, threadId)) {
            return current;
          }
          const nextThreadStatesByThreadId = {
            ...current.threadStatesByThreadId,
          };
          const nextRecentHistoryByThreadId = {
            ...current.recentHistoryByThreadId,
          };
          delete nextThreadStatesByThreadId[threadId];
          delete nextRecentHistoryByThreadId[threadId];
          return {
            threadStatesByThreadId: nextThreadStatesByThreadId,
            recentHistoryByThreadId: nextRecentHistoryByThreadId,
          };
        }),
    }),
    {
      name: BROWSER_STATE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        recentHistoryByThreadId: state.recentHistoryByThreadId,
      }),
    },
  ),
);

/**
 * 选择指定线程的浏览器状�? *
 * @param threadId - 线程 ID
 * @returns Zustand 选择器，返回该线程的浏览器状�? */
export function selectThreadBrowserState(
  threadId: ThreadId,
): (store: BrowserStateStore) => ThreadBrowserState | undefined {
  return (store) => store.threadStatesByThreadId[threadId];
}

/**
 * 选择指定线程的浏览器历史记录
 *
 * @param threadId - 线程 ID
 * @returns Zustand 选择器，返回该线程的浏览历史列表
 */
export function selectThreadBrowserHistory(
  threadId: ThreadId,
): (store: BrowserStateStore) => BrowserHistoryEntry[] {
  return (store) => store.recentHistoryByThreadId[threadId] ?? EMPTY_BROWSER_HISTORY;
}
