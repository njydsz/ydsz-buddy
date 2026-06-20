/**
 * @file 娴忚鍣ㄧ姸鎬佽交閲忕紦瀛? * @description 鎸夌嚎绋嬬淮搴︾紦瀛樻祻瑙堝櫒鍏冩暟鎹€? * 瀹為檯鐨勬祻瑙堝櫒娓叉煋闈㈠湪 Tauri 妗岄潰绔紝Web 绔粎淇濈暀瓒冲鐨勭姸鎬? * 浠ユ覆鏌撴爣绛鹃〉/宸ュ叿鏍忥紝骞跺湪绾跨▼鍒囨崲鏃朵繚鎸佸彲棰勬祴鐨勮涓恒€? */

import type { ThreadBrowserState, ThreadId } from "~/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** localStorage 鎸佷箙鍖?key */
const BROWSER_STATE_STORAGE_KEY = "remicode:browser-state:v1";
/** 姣忎釜绾跨▼淇濈暀鐨勬渶澶у巻鍙茶褰曟潯鏁?*/
const BROWSER_HISTORY_LIMIT = 12;
/** 绌哄巻鍙茶褰曠殑甯搁噺寮曠敤锛岄伩鍏嶉噸澶嶅垱寤虹┖鏁扮粍 */
const EMPTY_BROWSER_HISTORY: BrowserHistoryEntry[] = [];

/** 娴忚鍣ㄥ巻鍙茶褰曟潯鐩?*/
export interface BrowserHistoryEntry {
  /** 椤甸潰 URL */
  url: string;
  /** 椤甸潰鏍囬 */
  title: string;
  /** 鏍囩椤?ID */
  tabId: string;
}

/** 娴忚鍣ㄧ姸鎬?store 鍐呴儴鎺ュ彛 */
interface BrowserStateStore {
  /** 鎸夌嚎绋?ID 绱㈠紩鐨勬祻瑙堝櫒鐘舵€?*/
  threadStatesByThreadId: Record<string, ThreadBrowserState | undefined>;
  /** 鎸夌嚎绋?ID 绱㈠紩鐨勬渶杩戞祻瑙堝巻鍙?*/
  recentHistoryByThreadId: Record<string, BrowserHistoryEntry[] | undefined>;
  /** 鏇存柊鎴栨彃鍏ョ嚎绋嬫祻瑙堝櫒鐘舵€?*/
  upsertThreadState: (state: ThreadBrowserState) => void;
  /** 绉婚櫎绾跨▼娴忚鍣ㄧ姸鎬?*/
  removeThreadState: (threadId: ThreadId) => void;
}

/** 褰掍竴鍖栧巻鍙?URL锛屽皢 about:blank 瑙嗕负绌?URL */
function normalizeHistoryUrl(url: string): string {
  const trimmed = url.trim();
  return trimmed === "about:blank" ? "" : trimmed;
}

/**
 * 鏇存柊鎴栨彃鍏ユ渶杩戞祻瑙堝巻鍙叉潯鐩? *
 * @description 灏嗘柊鏉＄洰鎻掑叆鍒楄〃澶撮儴锛屽幓閲嶅悓 URL 鐨勬棫鏉＄洰锛? * 骞堕檺鍒跺垪琛ㄩ暱搴︿笉瓒呰繃 BROWSER_HISTORY_LIMIT銆? *
 * @param entries - 宸叉湁鐨勫巻鍙叉潯鐩垪琛? * @param nextEntry - 鏂扮殑鍘嗗彶鏉＄洰
 * @returns 鏇存柊鍚庣殑鍘嗗彶鏉＄洰鍒楄〃
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
 * 鍒ゆ柇涓や唤鍘嗗彶璁板綍鏄惁鐩稿悓
 *
 * @description 鐢ㄤ簬閬垮厤鍦ㄥ巻鍙插唴瀹规湭鍙樻椂浜х敓鏂扮殑寮曠敤锛屽噺灏戜笉蹇呰鐨勯噸娓叉煋銆? *
 * @param previousEntries - 涔嬪墠鐨勫巻鍙叉潯鐩? * @param nextEntries - 鏂扮殑鍘嗗彶鏉＄洰
 * @returns 鏄惁瀹屽叏鐩稿悓
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

/** 娴忚鍣ㄧ姸鎬?Zustand store锛屽甫 localStorage 鎸佷箙鍖?*/
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
 * 閫夋嫨鎸囧畾绾跨▼鐨勬祻瑙堝櫒鐘舵€? *
 * @param threadId - 绾跨▼ ID
 * @returns Zustand 閫夋嫨鍣紝杩斿洖璇ョ嚎绋嬬殑娴忚鍣ㄧ姸鎬? */
export function selectThreadBrowserState(
  threadId: ThreadId,
): (store: BrowserStateStore) => ThreadBrowserState | undefined {
  return (store) => store.threadStatesByThreadId[threadId];
}

/**
 * 閫夋嫨鎸囧畾绾跨▼鐨勬祻瑙堝櫒鍘嗗彶璁板綍
 *
 * @param threadId - 绾跨▼ ID
 * @returns Zustand 閫夋嫨鍣紝杩斿洖璇ョ嚎绋嬬殑娴忚鍘嗗彶鍒楄〃
 */
export function selectThreadBrowserHistory(
  threadId: ThreadId,
): (store: BrowserStateStore) => BrowserHistoryEntry[] {
  return (store) => store.recentHistoryByThreadId[threadId] ?? EMPTY_BROWSER_HISTORY;
}
