/**
 * @file 閼辨氨鍔嶉懕濠傘亯娑撳﹣绗呴弬鍥侀崸? * @description 鐟欙絾鐎借ぐ鎾冲閼辨氨鍔嶉惃鍕喊婢垛晙绗傛稉瀣瀮閿涘本鏁幐浣稿礋鐟欏棗娴橀崪灞藉瀻鐏炲繗顫嬮崶淇扁偓? *              娑撳搫鎻╅幑鐑芥暛閵嗕礁褰傞悳鏉垮閼冲鈧胶鍤庣粙瀣灡瀵よ櫣鐡戝ù浣衡柤閹绘劒绶佃ぐ鎾冲濞叉槒绌痪璺ㄢ柤閸滃矂銆嶉惄顔讳繆閹垬鈧? */

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
 * 閼辨氨鍔嶉懕濠傘亯娑撳﹣绗呴弬鍥风礉閸栧懎鎯堣ぐ鎾冲濞叉槒绌惃鍕殠缁嬪鈧浇宕忕粙鍨嫲妞ゅ湱娲版穱鈩冧紖
 * @property routeThreadId - 鐠侯垳鏁遍崣鍌涙殶娑擃厾娈戠痪璺ㄢ柤 ID
 * @property splitView - 瑜版挸澧犻崚鍡楃潌鐟欏棗娴橀悩鑸碘偓渚婄礉閺冪姴鍨庣仦蹇旀娑?null
 * @property focusedThreadId - 鐎圭偤妾懕姘卞妽閻ㄥ嫮鍤庣粙?ID閿涘牐鈧啳妾婚崚鍡楃潌閸氬海娈戠紒鎾寸亯閿? * @property activeThread - 閼辨氨鍔嶇痪璺ㄢ柤閻ㄥ嫬鐣弫瀛樻殶閹? * @property activeDraftThread - 閼辨氨鍔嶇痪璺ㄢ柤閻ㄥ嫯宕忕粙璺ㄥЦ閹? * @property activeProject - 濞叉槒绌い鍦窗閺佺増宓? * @property activeProjectId - 濞叉槒绌い鍦窗 ID
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
 * 缁绢垰鍤遍弫甯窗鐟欙絾鐎介懕姘卞妽閻ㄥ嫯浜版径鈺€绗傛稉瀣瀮
 * 閸掑棗鐫嗙憴鍡楁禈閺冭泛褰囬崚鍡楃潌閼辨氨鍔嶉棃銏℃緲閻ㄥ嫮鍤庣粙?ID閿涘苯鎯侀崚娆庡▏閻劏鐭鹃悽鍙樿厬閻ㄥ嫮鍤庣粙?ID
 * @param input - 閸栧懎鎯堢捄顖滄暠缁捐法鈻?ID閵嗕礁鍨庣仦蹇氼潒閸ヤ勘鈧胶鍤庣粙瀣灙鐞涖劊鈧線銆嶉惄顔煎灙鐞涖劌鎷伴懡澶屒归惃鍕翻閸忋儱顕挒? * @returns 閼辨氨鍔嶉懕濠傘亯娑撳﹣绗呴弬? */
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
 * React Hook閿涙俺骞忛崣鏍х秼閸撳秷浠涢悞锔炬畱閼卞﹤銇夋稉濠佺瑓閺? * 閼奉亜濮╂禒搴ょ熅閻㈠崬寮弫鑸偓浣稿瀻鐏炲繗顫嬮崶鍓уЦ閹降鈧礁鍙忕仦鈧?store 娑擃厽褰侀崣鏍ц嫙鐠侊紕鐣婚懕姘卞妽娣団剝浼? * @returns 閼辨氨鍔嶉懕濠傘亯娑撳﹣绗呴弬? */
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
