/**
 * @file 鑱氱劍鑱婂ぉ涓婁笅鏂囨ā鍧? * @description 瑙ｆ瀽褰撳墠鑱氱劍鐨勮亰澶╀笂涓嬫枃锛屾敮鎸佸崟瑙嗗浘鍜屽垎灞忚鍥俱€? *              涓哄揩鎹烽敭銆佸彂鐜板姛鑳姐€佺嚎绋嬪垱寤虹瓑娴佺▼鎻愪緵褰撳墠娲昏穬绾跨▼鍜岄」鐩俊鎭€? */

import { ThreadId, type ThreadId as ThreadIdType } from "~/contracts";
import { useParams, useSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import { type DraftThreadState, useComposerDraftStore } from "./composerDraftStore";
import { parseDiffRouteSearch } from "./diffRouteSearch";
import {
  resolveSplitViewFocusedPaneThreadId,
  selectSplitView,
  type SplitView,
  useSplitViewStore,
} from "./splitViewStore";
import { useStore } from "./store";
import { createProjectSelector, createThreadSelector } from "./storeSelectors";
import type { Project, Thread } from "./types";

/**
 * 鑱氱劍鑱婂ぉ涓婁笅鏂囷紝鍖呭惈褰撳墠娲昏穬鐨勭嚎绋嬨€佽崏绋垮拰椤圭洰淇℃伅
 * @property routeThreadId - 璺敱鍙傛暟涓殑绾跨▼ ID
 * @property splitView - 褰撳墠鍒嗗睆瑙嗗浘鐘舵€侊紝鏃犲垎灞忔椂涓?null
 * @property focusedThreadId - 瀹為檯鑱氱劍鐨勭嚎绋?ID锛堣€冭檻鍒嗗睆鍚庣殑缁撴灉锛? * @property activeThread - 鑱氱劍绾跨▼鐨勫畬鏁存暟鎹? * @property activeDraftThread - 鑱氱劍绾跨▼鐨勮崏绋跨姸鎬? * @property activeProject - 娲昏穬椤圭洰鏁版嵁
 * @property activeProjectId - 娲昏穬椤圭洰 ID
 */
export interface FocusedChatContext {
  routeThreadId: ThreadIdType | null;
  splitView: SplitView | null;
  focusedThreadId: ThreadIdType | null;
  activeThread: Thread | null;
  activeDraftThread: DraftThreadState | null;
  activeProject: Project | null;
  activeProjectId: Project["id"] | null;
}

/**
 * 绾嚱鏁帮細瑙ｆ瀽鑱氱劍鐨勮亰澶╀笂涓嬫枃
 * 鍒嗗睆瑙嗗浘鏃跺彇鍒嗗睆鑱氱劍闈㈡澘鐨勭嚎绋?ID锛屽惁鍒欎娇鐢ㄨ矾鐢变腑鐨勭嚎绋?ID
 * @param input - 鍖呭惈璺敱绾跨▼ ID銆佸垎灞忚鍥俱€佺嚎绋嬪垪琛ㄣ€侀」鐩垪琛ㄥ拰鑽夌ǹ鐨勮緭鍏ュ璞? * @returns 鑱氱劍鑱婂ぉ涓婁笅鏂? */
export function resolveFocusedChatContext(input: {
  routeThreadId: ThreadIdType | null;
  splitView: SplitView | null;
  threads: readonly Thread[];
  projects: readonly Project[];
  draftThreadsByThreadId: Record<string, DraftThreadState | undefined>;
}): FocusedChatContext {
  const focusedThreadId = input.splitView
    ? resolveSplitViewFocusedPaneThreadId(input.splitView)
    : input.routeThreadId;
  const activeThread =
    focusedThreadId !== null
      ? (input.threads.find((thread) => thread.id === focusedThreadId) ?? null)
      : null;
  const activeDraftThread =
    focusedThreadId !== null ? (input.draftThreadsByThreadId[focusedThreadId] ?? null) : null;
  const activeProjectId =
    activeDraftThread?.projectId ??
    activeThread?.projectId ??
    input.splitView?.ownerProjectId ??
    null;
  const activeProject =
    activeProjectId !== null
      ? (input.projects.find((project) => project.id === activeProjectId) ?? null)
      : null;

  return {
    routeThreadId: input.routeThreadId,
    splitView: input.splitView,
    focusedThreadId,
    activeThread,
    activeDraftThread,
    activeProject,
    activeProjectId,
  };
}

/**
 * React Hook锛氳幏鍙栧綋鍓嶈仛鐒︾殑鑱婂ぉ涓婁笅鏂? * 鑷姩浠庤矾鐢卞弬鏁般€佸垎灞忚鍥剧姸鎬併€佸叏灞€ store 涓彁鍙栧苟璁＄畻鑱氱劍淇℃伅
 * @returns 鑱氱劍鑱婂ぉ涓婁笅鏂? */
export function useFocusedChatContext(): FocusedChatContext {
  const draftThreadsByThreadId = useComposerDraftStore((store) => store.draftThreadsByThreadId);
  const routeThreadId = useParams({
    strict: false,
    select: (params) => (params.threadId ? ThreadId.makeUnsafe(params.threadId) : null),
  });
  const routeSearch = useSearch({
    strict: false,
    select: (search) => parseDiffRouteSearch(search),
  });
  const activeSplitView = useSplitViewStore(selectSplitView(routeSearch.splitViewId ?? null));
  const focusedThreadId = useMemo(
    () => (activeSplitView ? resolveSplitViewFocusedPaneThreadId(activeSplitView) : routeThreadId),
    [activeSplitView, routeThreadId],
  );
  const activeThread = useStore(
    useMemo(() => createThreadSelector(focusedThreadId), [focusedThreadId]),
  );
  const activeDraftThread =
    focusedThreadId !== null ? (draftThreadsByThreadId[focusedThreadId] ?? null) : null;
  const activeProjectId =
    activeDraftThread?.projectId ??
    activeThread?.projectId ??
    activeSplitView?.ownerProjectId ??
    null;
  const activeProject = useStore(
    useMemo(() => createProjectSelector(activeProjectId), [activeProjectId]),
  );

  return useMemo(
    () => ({
      routeThreadId,
      splitView: activeSplitView,
      focusedThreadId,
      activeThread: activeThread ?? null,
      activeDraftThread,
      activeProject: activeProject ?? null,
      activeProjectId,
    }),
    [
      activeDraftThread,
      activeProject,
      activeProjectId,
      activeSplitView,
      activeThread,
      focusedThreadId,
      routeThreadId,
    ],
  );
}
