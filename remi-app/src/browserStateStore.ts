/**
 * @file 濞村繗顫嶉崳銊уЦ閹浇浜ら柌蹇曠处鐎? * @description 閹稿鍤庣粙瀣樊鎼达妇绱︾€涙ɑ绁荤憴鍫濇珤閸忓啯鏆熼幑顔衡偓? * 鐎圭偤妾惃鍕セ鐟欏牆娅掑〒鍙夌厠闂堛垹婀?Tauri 濡楀矂娼扮粩顖ょ礉Web 缁旑垯绮庢穱婵堟殌鐡掑啿顧勯惃鍕Ц閹? * 娴犮儲瑕嗛弻鎾寸垼缁涢箖銆?瀹搞儱鍙块弽蹇ョ礉楠炶泛婀痪璺ㄢ柤閸掑洦宕查弮鏈电箽閹镐礁褰叉０鍕ゴ閻ㄥ嫯顢戞稉鎭掆偓? */

import type { ThreadBrowserState, ThreadId } from "~/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** localStorage 閹镐椒绠欓崠?key */
const BROWSER_STATE_STORAGE_KEY = "remicode:browser-state:v1";
/** 濮ｅ繋閲滅痪璺ㄢ柤娣囨繄鏆€閻ㄥ嫭娓舵径褍宸婚崣鑼额唶瑜版洘娼弫?*/
const BROWSER_HISTORY_LIMIT = 12;
/** 缁屽搫宸婚崣鑼额唶瑜版洜娈戠敮鎼佸櫤瀵洜鏁ら敍宀勪缉閸忓秹鍣告径宥呭灡瀵よ櫣鈹栭弫鎵矋 */
const EMPTY_BROWSER_HISTORY: BrowserHistoryEntry[] = [];

/** 濞村繗顫嶉崳銊ュ坊閸欒尪顔囪ぐ鏇熸蒋閻?*/
export interface BrowserHistoryEntry {
  /** 妞ょ敻娼?URL */
  url: string;
  /** 妞ょ敻娼伴弽鍥暯 */
  title: string;
  /** 閺嶅洨顒锋い?ID */
  tabId: string;
}

/** 濞村繗顫嶉崳銊уЦ閹?store 閸愬懘鍎撮幒銉ュ經 */
interface BrowserStateStore {
  /** 閹稿鍤庣粙?ID 缁便垹绱╅惃鍕セ鐟欏牆娅掗悩鑸碘偓?*/
  threadStatesByThreadId: Record<string, ThreadBrowserState | undefined>;
  /** 閹稿鍤庣粙?ID 缁便垹绱╅惃鍕付鏉╂垶绁荤憴鍫濆坊閸?*/
  recentHistoryByThreadId: Record<string, BrowserHistoryEntry[] | undefined>;
  /** 閺囧瓨鏌婇幋鏍ㄥ絻閸忋儳鍤庣粙瀣セ鐟欏牆娅掗悩鑸碘偓?*/
  upsertThreadState: (state: ThreadBrowserState) => void;
  /** 缁夊娅庣痪璺ㄢ柤濞村繗顫嶉崳銊уЦ閹?*/
  removeThreadState: (threadId: ThreadId) => void;
}

/** 瑜版帊绔撮崠鏍у坊閸?URL閿涘苯鐨?about:blank 鐟欏棔璐熺粚?URL */
function normalizeHistoryUrl(url: string): string {
  const trimmed = url.trim();
  return trimmed === "about:blank" ? "" : trimmed;
}

/**
 * 閺囧瓨鏌婇幋鏍ㄥ絻閸忋儲娓舵潻鎴炵セ鐟欏牆宸婚崣鍙夋蒋閻? *
 * @description 鐏忓棙鏌婇弶锛勬窗閹绘帒鍙嗛崚妤勩€冩径鎾劥閿涘苯骞撻柌宥呮倱 URL 閻ㄥ嫭妫弶锛勬窗閿? * 楠炲爼妾洪崚璺哄灙鐞涖劑鏆辨惔锔跨瑝鐡掑懓绻?BROWSER_HISTORY_LIMIT閵? *
 * @param entries - 瀹稿弶婀侀惃鍕坊閸欏弶娼惄顔煎灙鐞? * @param nextEntry - 閺傛壆娈戦崢鍡楀蕉閺夛紕娲? * @returns 閺囧瓨鏌婇崥搴ｆ畱閸樺棗褰堕弶锛勬窗閸掓銆? */
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
 * 閸掋倖鏌囨稉銈勫敜閸樺棗褰剁拋鏉跨秿閺勵垰鎯侀惄绋挎倱
 *
 * @description 閻劋绨柆鍨帳閸︺劌宸婚崣鎻掑敶鐎硅婀崣妯绘娴溠呮晸閺傛壆娈戝鏇犳暏閿涘苯鍣虹亸鎴滅瑝韫囧懓顩﹂惃鍕櫢濞撳弶鐓嬮妴? *
 * @param previousEntries - 娑斿澧犻惃鍕坊閸欏弶娼惄? * @param nextEntries - 閺傛壆娈戦崢鍡楀蕉閺夛紕娲? * @returns 閺勵垰鎯佺€瑰苯鍙忛惄绋挎倱
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

/** 濞村繗顫嶉崳銊уЦ閹?Zustand store閿涘苯鐢?localStorage 閹镐椒绠欓崠?*/
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
 * 闁瀚ㄩ幐鍥х暰缁捐法鈻奸惃鍕セ鐟欏牆娅掗悩鑸碘偓? *
 * @param threadId - 缁捐法鈻?ID
 * @returns Zustand 闁瀚ㄩ崳顭掔礉鏉╂柨娲栫拠銉у殠缁嬪娈戝ù蹇氼潔閸ｃ劎濮搁幀? */
export function selectThreadBrowserState(
  threadId: ThreadId,
): (store: BrowserStateStore) => ThreadBrowserState | undefined {
  return (store) => store.threadStatesByThreadId[threadId];
}

/**
 * 闁瀚ㄩ幐鍥х暰缁捐法鈻奸惃鍕セ鐟欏牆娅掗崢鍡楀蕉鐠佹澘缍? *
 * @param threadId - 缁捐法鈻?ID
 * @returns Zustand 闁瀚ㄩ崳顭掔礉鏉╂柨娲栫拠銉у殠缁嬪娈戝ù蹇氼潔閸樺棗褰堕崚妤勩€? */
export function selectThreadBrowserHistory(
  threadId: ThreadId,
): (store: BrowserStateStore) => BrowserHistoryEntry[] {
  return (store) => store.recentHistoryByThreadId[threadId] ?? EMPTY_BROWSER_HISTORY;
}
