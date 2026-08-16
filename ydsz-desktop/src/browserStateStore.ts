/**
 * @file 浏览器状态缓存模块
 * @description 轻量级的浏览器元数据缓存，按线程 ID 索引。
 *              活跃的浏览器界面保留在 Electron 中；Web 应用只保存足够的
 *              状态用于渲染标签栏/工具栏并在线程切换时能够可预测地恢复。
 */

import type { ThreadBrowserState, ThreadId } from "@ydsz-buddy/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const BROWSER_STATE_STORAGE_KEY = "ydsz-buddy:browser-state:v1";
const BROWSER_HISTORY_LIMIT = 12;
const EMPTY_BROWSER_HISTORY: BrowserHistoryEntry[] = [];

export interface BrowserHistoryEntry {
  url: string;
  title: string;
  tabId: string;
}

interface BrowserStateStore {
  threadStatesByThreadId: Record<string, ThreadBrowserState | undefined>;
  recentHistoryByThreadId: Record<string, BrowserHistoryEntry[] | undefined>;
  upsertThreadState: (state: ThreadBrowserState) => void;
  removeThreadState: (threadId: ThreadId) => void;
}

function normalizeHistoryUrl(url: string): string {
  const trimmed = url.trim();
  return trimmed === "about:blank" ? "" : trimmed;
}

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

export function selectThreadBrowserState(
  threadId: ThreadId,
): (store: BrowserStateStore) => ThreadBrowserState | undefined {
  return (store) => store.threadStatesByThreadId[threadId];
}

export function selectThreadBrowserHistory(
  threadId: ThreadId,
): (store: BrowserStateStore) => BrowserHistoryEntry[] {
  return (store) => store.recentHistoryByThreadId[threadId] ?? EMPTY_BROWSER_HISTORY;
}
