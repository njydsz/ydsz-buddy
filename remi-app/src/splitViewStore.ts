/**
 * @file splitViewStore.ts
 * @description 閸掑棗鐫嗙憴鍡楁禈閻?Zustand 閹镐椒绠欓崠鏍Ц閹礁鐡ㄩ崒銊ｂ偓? * 娴犮儵鈧帒缍婇棃銏℃緲閺嶆埊绱欏ǎ鍗炲娑撳﹪妾?2閿涘本娓舵径?2鑴? 缂冩垶鐗搁敍澶岊吀閻炲棗鍨庣仦蹇氫喊婢垛晝鏅棃顫礉
 * 閹绘劒绶甸棃銏℃緲/閸掑棗澹婄猾璇茬€烽妴浣圭埐閹扮喓鐓￠柅澶嬪閸ｃ劌鎷伴崺杞扮艾 ID 閻ㄥ嫬褰夐弴瀛樻惙娴ｆ嚎鈧? */

import { type ProjectId, type ThreadId, type TurnId } from "~/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { type ChatRightPanel } from "./diffRouteSearch";
import { randomUUID } from "./lib/utils";
import {
  canSubdividePane,
  collectLeaves,
  findLeafPaneById,
  findSplitNodeById,
  isLegacySplitViewLike,
  removeLeafByPaneId,
  removeLeafByThreadId as removeLeafByThreadIdInTree,
  replacePaneInTree,
  resolveDefaultFocusLeafId,
  type LegacySplitViewLike,
} from "./splitView.logic";

/** 閸掑棗鐫嗙憴鍡楁禈閸烆垯绔撮弽鍥槕 */
export type SplitViewId = string;
/** 闂堛垺婢橀崬顖欑閺嶅洩鐦?*/
export type PaneId = string;
/** 閸掑棗澹婇弬鐟版倻閿涙瓪"horizontal"` 濮樻潙閽╅崚鍡楀閿涘牆涔忛崣绛圭礆閿涘畭"vertical"` 閸ㄥ倻娲块崚鍡楀閿涘牅绗傛稉瀣剁礆 */
export type SplitDirection = "horizontal" | "vertical";
/**
 * 閸掑棗澹婇弨鍓х枂娓氀嶇窗`"first"` 鐎电懓绨查崚鍡楀閻ㄥ嫪绗?瀹革缚鏅堕敍瀹?second"` 鐎电懓绨叉稉?閸欏厖鏅? */
export type SplitDropSide = "first" | "second";

/** 闂堛垺婢橀崣鍏呮櫠闂堛垺婢橀悩鑸碘偓渚婄礄濞村繗顫嶉崳?瀹割喖绱撶憴鍡楁禈缁涘绱?*/
export interface SplitViewPanePanelState {
  /** 瑜版挸澧犻幍鎾崇磻閻ㄥ嫰娼伴弶璺ㄨ閸?*/
  panel: ChatRightPanel | null;
  /** 瀹割喖绱撶憴鍡楁禈閻ㄥ嫯鐤嗗▎?ID */
  diffTurnId: TurnId | null;
  /** 瀹割喖绱撶憴鍡楁禈閻ㄥ嫭鏋冩禒鎯扮熅瀵?*/
  diffFilePath: string | null;
  /** 閺勵垰鎯侀弴鐐ⅵ瀵偓鏉╁洭娼伴弶?*/
  hasOpenedPanel: boolean;
  /** 閺堚偓鏉╂垶澧﹀鈧惃鍕桨閺夎法琚崹?*/
  lastOpenPanel: ChatRightPanel;
}

/** 閸欒泛鐡欓棃銏℃緲閿涘奔鍞悰銊ょ娑擃亞鍤庣粙瀣畱閺勫墽銇氶崠鍝勭厵 */
export interface LeafPane {
  kind: "leaf";
  /** 闂堛垺婢橀崬顖欑 ID */
  id: PaneId;
  /** 閸忓疇浠堥惃鍕殠缁?ID閿涘奔璐?null 閺冩儼銆冪粈铏光敄闂堛垺婢?*/
  threadId: ThreadId | null;
  /** 闂堛垺婢橀崣鍏呮櫠闂堛垺婢橀悩鑸碘偓?*/
  panel: SplitViewPanePanelState;
}

/** 閸掑棗澹婇懞鍌滃仯閿涘奔鍞悰銊ょ娑擃亝鎸夐獮铏灗閸ㄥ倻娲块惃鍕瀻閸?*/
export interface SplitNode {
  kind: "split";
  /** 閼哄倻鍋ｉ崬顖欑 ID */
  id: PaneId;
  /** 閸掑棗澹婇弬鐟版倻 */
  direction: SplitDirection;
  /** first = 瀹革讣绱欏鏉戦挬閿? 娑撳绱欓崹鍌滄纯閿涘绱眘econd = 閸?/ 娑?*/
  first: Pane;
  second: Pane;
  /** 閸掑棗澹婂В鏂剧伐閿?.25 ~ 0.75閿?*/
  ratio: number;
}

/** 闂堛垺婢橀懞鍌滃仯閼辨柨鎮庣猾璇茬€烽敍鍫濆骄鐎涙劖鍨ㄩ崚鍡楀閿?*/
export type Pane = LeafPane | SplitNode;

/** 閸掑棗鐫嗙憴鍡楁禈閿涘苯瀵橀崥顐︽桨閺夋寧鐖查崪宀冧粵閻掞妇濮搁幀?*/
export interface SplitView {
  /** 閸掑棗鐫嗙憴鍡楁禈閸烆垯绔?ID */
  id: SplitViewId;
  /** 濠ф劗鍤庣粙?ID */
  sourceThreadId: ThreadId;
  /** 閹碘偓鐏炵偤銆嶉惄?ID */
  ownerProjectId: ProjectId;
  /** 闂堛垺婢橀弽鎴炵壌閼哄倻鍋?*/
  root: Pane;
  /** 瑜版挸澧犻懕姘卞妽閻ㄥ嫰娼伴弶?ID */
  focusedPaneId: PaneId;
  /** 閸掓稑缂撻弮鍫曟？ */
  createdAt: string;
  /** 閺囧瓨鏌婇弮鍫曟？ */
  updatedAt: string;
}

interface CreateFromThreadInput {
  sourceThreadId: ThreadId;
  ownerProjectId: ProjectId;
}

interface CreateFromDropInput {
  sourceThreadId: ThreadId;
  ownerProjectId: ProjectId;
  droppedThreadId: ThreadId;
  direction: SplitDirection;
  side: SplitDropSide;
}

interface DropThreadOnPaneInput {
  splitViewId: SplitViewId;
  targetPaneId: PaneId;
  direction: SplitDirection;
  side: SplitDropSide;
  threadId: ThreadId;
}

interface RemovePaneFromSplitViewInput {
  splitViewId: SplitViewId;
  paneId: PaneId;
}

interface SplitViewStore {
  hasHydrated: boolean;
  splitViewsById: Record<SplitViewId, SplitView | undefined>;
  splitViewIdBySourceThreadId: Record<string, SplitViewId | undefined>;
  createFromThread: (input: CreateFromThreadInput) => SplitViewId;
  createFromDrop: (input: CreateFromDropInput) => SplitViewId;
  removeSplitView: (splitViewId: SplitViewId) => void;
  replacePaneThread: (splitViewId: SplitViewId, paneId: PaneId, threadId: ThreadId | null) => void;
  dropThreadOnPane: (input: DropThreadOnPaneInput) => boolean;
  removePaneFromSplitView: (input: RemovePaneFromSplitViewInput) => boolean;
  setFocusedPane: (splitViewId: SplitViewId, paneId: PaneId) => void;
  setRatioForNode: (splitViewId: SplitViewId, splitNodeId: PaneId, ratio: number) => void;
  setPanePanelState: (
    splitViewId: SplitViewId,
    paneId: PaneId,
    patch: Partial<SplitViewPanePanelState>,
  ) => void;
  removeThreadFromSplitViews: (threadId: ThreadId) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
}

// Keep the v1 suffix stable while using the RemiCode namespace.
const SPLIT_VIEW_STORAGE_KEY = "remicode:split-view-state:v1";
const SPLIT_VIEW_STORAGE_VERSION = 2;
const DEFAULT_RATIO = 0.5;
const MIN_RATIO = 0.25;
const MAX_RATIO = 0.75;

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_RATIO;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, value));
}

function createDefaultPanePanelState(): SplitViewPanePanelState {
  return {
    panel: null,
    diffTurnId: null,
    diffFilePath: null,
    hasOpenedPanel: false,
    lastOpenPanel: "browser",
  };
}

function createLeafPane(threadId: ThreadId | null): LeafPane {
  return {
    kind: "leaf",
    id: randomUUID(),
    threadId,
    panel: createDefaultPanePanelState(),
  };
}

function createSplitNode(input: {
  direction: SplitDirection;
  first: Pane;
  second: Pane;
  ratio?: number;
}): SplitNode {
  return {
    kind: "split",
    id: randomUUID(),
    direction: input.direction,
    first: input.first,
    second: input.second,
    ratio: clampRatio(input.ratio ?? DEFAULT_RATIO),
  };
}

function buildSplitViewFromThread(input: CreateFromThreadInput): SplitView {
  const now = new Date().toISOString();
  const sourceLeaf = createLeafPane(input.sourceThreadId);
  const emptyLeaf = createLeafPane(null);
  const root = createSplitNode({
    direction: "horizontal",
    first: sourceLeaf,
    second: emptyLeaf,
  });
  return {
    id: randomUUID(),
    sourceThreadId: input.sourceThreadId,
    ownerProjectId: input.ownerProjectId,
    root,
    focusedPaneId: emptyLeaf.id,
    createdAt: now,
    updatedAt: now,
  };
}

function buildSplitViewFromDrop(
  input: CreateFromDropInput,
  existing?: Pick<SplitView, "id" | "createdAt"> | null,
): SplitView {
  const now = new Date().toISOString();
  const sourceLeaf = createLeafPane(input.sourceThreadId);
  const droppedLeaf = createLeafPane(input.droppedThreadId);
  const root = createSplitNode(
    input.side === "first"
      ? { direction: input.direction, first: droppedLeaf, second: sourceLeaf }
      : { direction: input.direction, first: sourceLeaf, second: droppedLeaf },
  );
  return {
    id: existing?.id ?? randomUUID(),
    sourceThreadId: input.sourceThreadId,
    ownerProjectId: input.ownerProjectId,
    root,
    focusedPaneId: droppedLeaf.id,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

function migrateLegacySplitView(legacy: LegacySplitViewLike): SplitView | null {
  const now = new Date().toISOString();
  const leftLeaf: LeafPane = {
    kind: "leaf",
    id: randomUUID(),
    threadId: legacy.leftThreadId ?? null,
    panel: { ...legacy.leftPanel },
  };
  const rightLeaf: LeafPane = {
    kind: "leaf",
    id: randomUUID(),
    threadId: legacy.rightThreadId ?? null,
    panel: { ...legacy.rightPanel },
  };

  if (!leftLeaf.threadId && !rightLeaf.threadId) {
    return null;
  }

  const root = createSplitNode({
    direction: "horizontal",
    first: leftLeaf,
    second: rightLeaf,
    ratio: legacy.ratio,
  });
  return {
    id: legacy.id,
    sourceThreadId: legacy.sourceThreadId,
    ownerProjectId: legacy.ownerProjectId,
    root,
    focusedPaneId: legacy.focusedPane === "right" ? rightLeaf.id : leftLeaf.id,
    createdAt: legacy.createdAt ?? now,
    updatedAt: legacy.updatedAt ?? now,
  };
}

function migrateLegacyPersistedState(state: unknown): SplitViewStoreState | null {
  if (!state || typeof state !== "object") {
    return null;
  }
  const legacyMap = (state as { splitViewsById?: Record<string, unknown> }).splitViewsById;
  if (!legacyMap || typeof legacyMap !== "object") {
    return null;
  }
  const splitViewsById: Record<SplitViewId, SplitView | undefined> = {};
  const splitViewIdBySourceThreadId: Record<string, SplitViewId | undefined> = {};

  for (const [splitViewId, value] of Object.entries(legacyMap)) {
    if (!isLegacySplitViewLike(value)) {
      continue;
    }
    const migrated = migrateLegacySplitView(value);
    if (!migrated) {
      continue;
    }
    splitViewsById[splitViewId] = migrated;
    splitViewIdBySourceThreadId[migrated.sourceThreadId] = splitViewId;
  }

  return {
    splitViewsById,
    splitViewIdBySourceThreadId,
  };
}

function resolveUpdatedAt(): string {
  return new Date().toISOString();
}

type SplitViewStoreState = Pick<SplitViewStore, "splitViewsById" | "splitViewIdBySourceThreadId">;

function updateSplitView(
  state: SplitViewStoreState,
  splitViewId: SplitViewId,
  updater: (splitView: SplitView) => SplitView,
): SplitViewStoreState {
  const existing = state.splitViewsById[splitViewId];
  if (!existing) return state;
  const updated = updater(existing);
  if (updated === existing) return state;
  return {
    ...state,
    splitViewsById: {
      ...state.splitViewsById,
      [splitViewId]: updated,
    },
  };
}

// Re-anchor only to threads that are not already the source of another split view.
function resolveNextSourceThreadId(input: {
  root: Pane;
  splitViewId: SplitViewId;
  splitViewIdBySourceThreadId: Record<string, SplitViewId | undefined>;
}): ThreadId | null {
  for (const leaf of collectLeaves(input.root)) {
    if (!leaf.threadId) continue;
    const existingSourceSplitId = input.splitViewIdBySourceThreadId[leaf.threadId];
    if (!existingSourceSplitId || existingSourceSplitId === input.splitViewId) {
      return leaf.threadId;
    }
  }
  return null;
}

// --- selectors ---

/**
 * 鐟欙絾鐎介崚鍡楃潌鐟欏棗娴樻稉顓′粵閻掞妇娈戠痪璺ㄢ柤 ID閵? * 娴兼ê鍘涙潻鏂挎礀閼辨氨鍔嶉棃銏℃緲閻ㄥ嫮鍤庣粙?ID閿涘矁瀚㈤懕姘卞妽闂堛垺婢樻稉铏光敄閸掓瑥娲栭柅鈧崚鎵儑娑撯偓娑擃亪娼粚鍝勫骄鐎涙劙娼伴弶瑁も偓? *
 * @param splitView - 閸掑棗鐫嗙憴鍡楁禈
 * @returns 閼辨氨鍔嶉惃鍕殠缁?ID閿涘本澧嶉張澶愭桨閺夊じ璐熺粚鐑樻鏉╂柨娲?null
 */
export function resolveSplitViewFocusedThreadId(splitView: SplitView): ThreadId | null {
  const focused = findLeafPaneById(splitView.root, splitView.focusedPaneId);
  if (focused?.threadId) {
    return focused.threadId;
  }
  for (const leaf of collectLeaves(splitView.root)) {
    if (leaf.threadId) return leaf.threadId;
  }
  return null;
}

/**
 * 娑撱儲鐗搁懢宄板絿閼辨氨鍔嶉棃銏℃緲閻ㄥ嫮鍤庣粙?ID閿涘牊妫ら崶鐐衡偓鈧敍澶涚礉閻劋绨捄顖滄暠娴溿倖甯? *
 * @param splitView - 閸掑棗鐫嗙憴鍡楁禈
 * @returns 閼辨氨鍔嶉棃銏℃緲閻ㄥ嫮鍤庣粙?ID
 */
export function resolveSplitViewFocusedPaneThreadId(splitView: SplitView): ThreadId | null {
  return findLeafPaneById(splitView.root, splitView.focusedPaneId)?.threadId ?? null;
}

/**
 * 閼惧嘲褰囬幐鍥х暰闂堛垺婢?ID 閸忓疇浠堥惃鍕殠缁?ID
 *
 * @param splitView - 閸掑棗鐫嗙憴鍡楁禈
 * @param paneId - 闂堛垺婢?ID
 * @returns 缁捐法鈻?ID
 */
export function resolveSplitViewPaneThreadId(
  splitView: SplitView,
  paneId: PaneId,
): ThreadId | null {
  return findLeafPaneById(splitView.root, paneId)?.threadId ?? null;
}

/**
 * 閼惧嘲褰囬崚鍡楃潌鐟欏棗娴樻稉顓熷閺堝娼粚铏规畱缁捐法鈻?ID閿涘牆骞撻柌宥忕礆
 *
 * @param splitView - 閸掑棗鐫嗙憴鍡楁禈
 * @returns 缁捐法鈻?ID 閺佹壆绮? */
export function resolveSplitViewThreadIds(splitView: SplitView): ThreadId[] {
  const ids = collectLeaves(splitView.root)
    .map((leaf) => leaf.threadId)
    .filter((threadId): threadId is ThreadId => threadId !== null);
  return [...new Set(ids)];
}

/**
 * 閺嶈宓佺痪璺ㄢ柤 ID 閺屻儲澹樼€电懓绨查惃鍕桨閺?ID
 *
 * @param splitView - 閸掑棗鐫嗙憴鍡楁禈
 * @param threadId - 缁捐法鈻?ID
 * @returns 闂堛垺婢?ID閿涘本婀幍鎯у煂閺冩儼绻戦崶?null
 */
export function resolveSplitViewPaneIdForThread(
  splitView: SplitView,
  threadId: ThreadId | null,
): PaneId | null {
  if (!threadId) return null;
  for (const leaf of collectLeaves(splitView.root)) {
    if (leaf.threadId === threadId) return leaf.id;
  }
  return null;
}

/**
 * 閺€鍫曟肠閸掑棗鐫嗙憴鍡楁禈娑擃厽澧嶉張澶婂骄鐎涙劙娼伴弶瑁も偓? *
 * 闁秴宸婚崚鍡楃潌鐟欏棗娴橀惃鍕壌閼哄倻鍋ｉ敍宀勨偓鎺戠秺閺€鍫曟肠閹碘偓閺堝褰剧€涙劙娼伴弶鍖＄礄LeafPane閿涘鈧? *
 * @param splitView - 鐟曚焦鏁归梿鍡楀骄鐎涙劙娼伴弶璺ㄦ畱閸掑棗鐫嗙憴鍡楁禈
 * @returns 閸欒泛鐡欓棃銏℃緲閺佹壆绮嶉敍灞惧瘻閺嶆垿浜堕崢鍡涖€庢惔蹇斿笓閸? */
export function resolveSplitViewLeaves(splitView: SplitView): LeafPane[] {
  return collectLeaves(splitView.root);
}

/**
 * 閸掓稑缂撴稉鈧稉?Zustand 闁瀚ㄩ崳顭掔礉閺嶈宓侀崚鍡楃潌鐟欏棗娴?ID 闁褰囩€电懓绨查惃鍕瀻鐏炲繗顫嬮崶淇扁偓? *
 * @param splitViewId - 鐟曚線鈧褰囬惃鍕瀻鐏炲繗顫嬮崶?ID閿涘奔璐?null 閺冩儼绻戦崶?null
 * @returns Zustand 闁瀚ㄩ崳銊ュ毐閺佸府绱濋幒銉︽暪 store 鏉╂柨娲栫€电懓绨查惃?SplitView 閹?null
 */
export function selectSplitView(splitViewId: SplitViewId | null) {
  return (store: SplitViewStore) =>
    splitViewId ? (store.splitViewsById[splitViewId] ?? null) : null;
}

/**
 * 閸掓稑缂撴稉鈧稉?Zustand 闁瀚ㄩ崳顭掔礉閺嶈宓佸┃鎰殠缁?ID 閺屻儲澹橀崗鑸靛鐏炵偟娈戦崚鍡楃潌鐟欏棗娴?ID閵? *
 * 闁俺绻?splitViewIdBySourceThreadId 閺勭姴鐨犵悰銊︾叀閹电偓绨痪璺ㄢ柤鐎电懓绨查惃鍕瀻鐏炲繗顫嬮崶淇扁偓? *
 * @param threadId - 濠ф劗鍤庣粙?ID閿涘奔璐?null 閺冩儼绻戦崶?null
 * @returns Zustand 闁瀚ㄩ崳銊ュ毐閺佸府绱濋幒銉︽暪 store 鏉╂柨娲栫€电懓绨查惃?SplitViewId 閹?null
 */
export function selectSplitViewIdForSourceThread(threadId: ThreadId | null) {
  return (store: SplitViewStore) =>
    threadId ? (store.splitViewIdBySourceThreadId[threadId] ?? null) : null;
}

/**
 * 绾喖鐣鹃幀褎鍨氶崨妯荤叀閹垫拝绱版禒鍛秼缁捐法鈻奸張澶婃暜娑撯偓閺勫海鈥橀惃鍕瀻鐏炲繗顫嬮崶鎯х秺鐏炵儑绱濋幋鏍︾稊娑撶儤鐓囨稉顏勫瀻鐏炲繒娈戝┃鎰殠缁嬪妞傞幍宥嗕划婢跺秲鈧? * 濡紕纭﹂惃鍕姜濠ф劗鍤庣粙瀣灇閸涙ê鍙х化璇叉礀闁偓閸掓澘宕熼懕濠兡佸蹇ョ礉閼板矂娼幐澶嬫付鏉╂垳濞囬悽銊у濞村鈧? *
 * 閺屻儲澹樼痪璺ㄢ柤妫ｆ牠鈧缍婄仦鐐垫畱閸掑棗鐫嗙憴鍡楁禈 ID閵嗗倷绱崗鍫滃▏閻劍绨痪璺ㄢ柤閺勭姴鐨犵悰銊︾叀閹垫拝绱? * 閼汇儳鍤庣粙瀣倱閺冭泛鍤悳鏉挎躬婢舵矮閲滈崚鍡楃潌鐟欏棗娴樻稉顓濈瑬娑撳秵妲告禒璁崇秿閸掑棗鐫嗛惃鍕爱缁捐法鈻奸敍灞藉灟娴犲懎缍嬮崬顖欑閸栧綊鍘ら弮鎯扮箲閸ョ偑鈧? *
 * @param input - 閺屻儲澹橀崣鍌涙殶
 * @param input.splitViewsById - 閹碘偓閺堝鍨庣仦蹇氼潒閸ュ墽娈戦弰鐘茬殸鐞? * @param input.splitViewIdBySourceThreadId - 濠ф劗鍤庣粙瀣煂閸掑棗鐫嗙憴鍡楁禈 ID 閻ㄥ嫭妲х亸鍕€? * @param input.threadId - 鐟曚焦鐓￠幍鎯х秺鐏炵偟娈戠痪璺ㄢ柤 ID閿涘奔璐?null 閺冩儼绻戦崶?null
 * @returns 缁捐法鈻兼＃鏍偓澶婄秺鐏炵偟娈戦崚鍡楃潌鐟欏棗娴?ID閿涘本妫ゅ▔鏇犫€樼€规碍妞傛潻鏂挎礀 null
 */
export function resolvePreferredSplitViewIdForThread(input: {
  splitViewsById: Record<SplitViewId, SplitView | undefined>;
  splitViewIdBySourceThreadId: Record<string, SplitViewId | undefined>;
  threadId: ThreadId | null;
}): SplitViewId | null {
  if (!input.threadId) {
    return null;
  }

  const matchingSplitViews = Object.values(input.splitViewsById)
    .filter((splitView): splitView is SplitView => splitView !== undefined)
    .filter((splitView) =>
      collectLeaves(splitView.root).some((leaf) => leaf.threadId === input.threadId),
    );

  const sourceSplitViewId = input.splitViewIdBySourceThreadId[input.threadId] ?? null;
  if (
    sourceSplitViewId &&
    matchingSplitViews.some((splitView) => splitView.id === sourceSplitViewId)
  ) {
    return sourceSplitViewId;
  }

  const onlyMatchingSplitView = matchingSplitViews.length === 1 ? matchingSplitViews[0] : null;
  return onlyMatchingSplitView?.id ?? null;
}

// --- store ---

/**
 * 閸掑棗鐫嗙憴鍡楁禈 Zustand 閻樿埖鈧胶顓搁悶?store閵? *
 * 娴ｈ法鏁?persist 娑擃參妫挎禒璺虹殺閸掑棗鐫嗙憴鍡楁禈閺佺増宓侀幐浣风畽閸栨牕鍩?localStorage閿? * 閺€顖涘瘮娴犲孩妫悧鍫熷楠炲啿涔忛崣鎶芥桨閺夎法绮ㄩ弸鍕讣缁夎鍩岄弽鎴濊埌缂佹挻鐎妴? *
 * 娑撴槒顩﹂崝鐔诲厴閿? * - createFromThread閿涙矮绮犲┃鎰殠缁嬪鍨卞鍝勫瀻鐏炲繗顫嬮崶? * - createFromDrop閿涙矮绮犻幏鏍ㄦ杹閹垮秳缍旈崚娑樼紦閸掑棗鐫嗙憴鍡楁禈
 * - removeSplitView閿涙艾鍨归梽銈呭瀻鐏炲繗顫嬮崶? * - replacePaneThread閿涙碍娴涢幑銏ゆ桨閺夊じ鑵戦惃鍕殠缁? * - dropThreadOnPane閿涙艾鐨㈢痪璺ㄢ柤閹锋牗鏂侀崚浼存桨閺夊じ绗傛禒銉ュ灡瀵ゅ搫鍨庣仦? * - removePaneFromSplitView閿涙矮绮犻崚鍡楃潌鐟欏棗娴樻稉顓犘╅梽銈夋桨閺? * - setFocusedPane閿涙俺顔曠純顔夸粵閻掞箓娼伴弶? * - setRatioForNode閿涙俺顔曠純顔煎瀻鐏炲繗濡悙鍦畱閸掑棗澹婂В鏂剧伐
 * - setPanePanelState閿涙俺顔曠純顕€娼伴弶璺ㄦ畱 UI 閻樿埖鈧緤绱欐俊?diff 鐟欏棗娴橀妴渚€娼伴弶鍨潔瀵偓缁涘绱? * - removeThreadFromSplitViews閿涙矮绮犻幍鈧張澶婂瀻鐏炲繗顫嬮崶鍙ヨ厬缁夊娅庨幐鍥х暰缁捐法鈻? */
export const useSplitViewStore = create<SplitViewStore>()(
  persist(
    (set, get) => ({
      hasHydrated: false,
      splitViewsById: {},
      splitViewIdBySourceThreadId: {},
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      createFromThread: (input) => {
        const existingId = get().splitViewIdBySourceThreadId[input.sourceThreadId] ?? null;
        if (existingId) {
          return existingId;
        }

        const splitView = buildSplitViewFromThread(input);
        set((state) => ({
          splitViewsById: {
            ...state.splitViewsById,
            [splitView.id]: splitView,
          },
          splitViewIdBySourceThreadId: {
            ...state.splitViewIdBySourceThreadId,
            [input.sourceThreadId]: splitView.id,
          },
        }));
        return splitView.id;
      },
      createFromDrop: (input) => {
        const existingId = get().splitViewIdBySourceThreadId[input.sourceThreadId] ?? null;
        const existing = existingId ? (get().splitViewsById[existingId] ?? null) : null;
        const splitView = buildSplitViewFromDrop(input, existing);
        set((state) => ({
          splitViewsById: {
            ...state.splitViewsById,
            [splitView.id]: splitView,
          },
          splitViewIdBySourceThreadId: {
            ...state.splitViewIdBySourceThreadId,
            [input.sourceThreadId]: splitView.id,
          },
        }));
        return splitView.id;
      },
      removeSplitView: (splitViewId) =>
        set((state) => {
          const existing = state.splitViewsById[splitViewId];
          if (!existing) return state;
          const nextSplitViewsById = { ...state.splitViewsById };
          const nextSplitViewIdBySourceThreadId = { ...state.splitViewIdBySourceThreadId };
          delete nextSplitViewsById[splitViewId];
          delete nextSplitViewIdBySourceThreadId[existing.sourceThreadId];
          return {
            splitViewsById: nextSplitViewsById,
            splitViewIdBySourceThreadId: nextSplitViewIdBySourceThreadId,
          };
        }),
      replacePaneThread: (splitViewId, paneId, threadId) =>
        set((state) => {
          const existing = state.splitViewsById[splitViewId];
          if (!existing) return state;
          let nextSourceThreadId: ThreadId | null = existing.sourceThreadId;
          let shouldRemoveSplitView = false;
          const nextState = updateSplitView(state, splitViewId, (splitView) => {
            const leaf = findLeafPaneById(splitView.root, paneId);
            if (!leaf) return splitView;
            if (leaf.threadId === threadId) return splitView;
            const nextLeaf: LeafPane = { ...leaf, threadId };
            const nextRoot = replacePaneInTree(splitView.root, paneId, nextLeaf);
            const hasAnyThread = collectLeaves(nextRoot).some(
              (nextLeaf) => nextLeaf.threadId !== null,
            );
            if (!hasAnyThread) {
              shouldRemoveSplitView = true;
            }
            if (leaf.threadId === splitView.sourceThreadId) {
              nextSourceThreadId = resolveNextSourceThreadId({
                root: nextRoot,
                splitViewId,
                splitViewIdBySourceThreadId: state.splitViewIdBySourceThreadId,
              });
              if (nextSourceThreadId === null) {
                shouldRemoveSplitView = true;
              }
            }
            return {
              ...splitView,
              sourceThreadId: nextSourceThreadId ?? splitView.sourceThreadId,
              root: nextRoot,
              updatedAt: resolveUpdatedAt(),
            };
          });
          if (nextState === state) return state;

          if (shouldRemoveSplitView) {
            const nextSplitViewsById = { ...nextState.splitViewsById };
            const nextSplitViewIdBySourceThreadId = { ...nextState.splitViewIdBySourceThreadId };
            delete nextSplitViewsById[splitViewId];
            if (nextSplitViewIdBySourceThreadId[existing.sourceThreadId] === splitViewId) {
              delete nextSplitViewIdBySourceThreadId[existing.sourceThreadId];
            }
            return {
              splitViewsById: nextSplitViewsById,
              splitViewIdBySourceThreadId: nextSplitViewIdBySourceThreadId,
            };
          }

          const updated = nextState.splitViewsById[splitViewId];
          if (
            !updated ||
            nextSourceThreadId === null ||
            nextSourceThreadId === existing.sourceThreadId
          ) {
            return nextState;
          }

          const nextSplitViewIdBySourceThreadId = { ...nextState.splitViewIdBySourceThreadId };
          if (nextSplitViewIdBySourceThreadId[existing.sourceThreadId] === splitViewId) {
            delete nextSplitViewIdBySourceThreadId[existing.sourceThreadId];
          }
          nextSplitViewIdBySourceThreadId[nextSourceThreadId] = splitViewId;
          return {
            ...nextState,
            splitViewIdBySourceThreadId: nextSplitViewIdBySourceThreadId,
          };
        }),
      dropThreadOnPane: ({ splitViewId, targetPaneId, direction, side, threadId }) => {
        const stateBefore = get();
        const splitView = stateBefore.splitViewsById[splitViewId];
        if (!splitView) return false;
        const targetLeaf = findLeafPaneById(splitView.root, targetPaneId);
        if (!targetLeaf) return false;
        if (collectLeaves(splitView.root).some((leaf) => leaf.threadId === threadId)) {
          return false;
        }
        if (!canSubdividePane(splitView.root, targetPaneId, direction)) {
          return false;
        }

        const newLeaf = createLeafPane(threadId);
        const newSplit = createSplitNode(
          side === "first"
            ? { direction, first: newLeaf, second: targetLeaf }
            : { direction, first: targetLeaf, second: newLeaf },
        );

        set((state) =>
          updateSplitView(state, splitViewId, (current) => ({
            ...current,
            root: replacePaneInTree(current.root, targetPaneId, newSplit),
            focusedPaneId: newLeaf.id,
            updatedAt: resolveUpdatedAt(),
          })),
        );
        return true;
      },
      removePaneFromSplitView: ({ splitViewId, paneId }) => {
        const stateBefore = get();
        const splitView = stateBefore.splitViewsById[splitViewId];
        if (!splitView) return false;
        const targetLeaf = findLeafPaneById(splitView.root, paneId);
        if (!targetLeaf) return false;

        set((state) => {
          const current = state.splitViewsById[splitViewId];
          if (!current) return state;
          const currentTargetLeaf = findLeafPaneById(current.root, paneId);
          if (!currentTargetLeaf) return state;

          const result = removeLeafByPaneId(current.root, paneId);
          if (result.removedLeafIds.length === 0) return state;
          const nextSplitViewsById = { ...state.splitViewsById };
          const nextSplitViewIdBySourceThreadId = { ...state.splitViewIdBySourceThreadId };

          if (current.sourceThreadId === currentTargetLeaf.threadId) {
            delete nextSplitViewIdBySourceThreadId[current.sourceThreadId];
          }

          if (!result.nextRoot) {
            delete nextSplitViewsById[splitViewId];
            delete nextSplitViewIdBySourceThreadId[current.sourceThreadId];
            return {
              splitViewsById: nextSplitViewsById,
              splitViewIdBySourceThreadId: nextSplitViewIdBySourceThreadId,
            };
          }

          const hasAnyThread = collectLeaves(result.nextRoot).some(
            (leaf) => leaf.threadId !== null,
          );
          if (!hasAnyThread) {
            delete nextSplitViewsById[splitViewId];
            delete nextSplitViewIdBySourceThreadId[current.sourceThreadId];
            return {
              splitViewsById: nextSplitViewsById,
              splitViewIdBySourceThreadId: nextSplitViewIdBySourceThreadId,
            };
          }

          const nextSourceThreadId =
            current.sourceThreadId === currentTargetLeaf.threadId
              ? resolveNextSourceThreadId({
                  root: result.nextRoot,
                  splitViewId,
                  splitViewIdBySourceThreadId: nextSplitViewIdBySourceThreadId,
                })
              : current.sourceThreadId;
          if (!nextSourceThreadId) {
            delete nextSplitViewsById[splitViewId];
            return {
              splitViewsById: nextSplitViewsById,
              splitViewIdBySourceThreadId: nextSplitViewIdBySourceThreadId,
            };
          }
          if (nextSourceThreadId !== current.sourceThreadId) {
            nextSplitViewIdBySourceThreadId[nextSourceThreadId] = splitViewId;
          }

          const focusedStillPresent = !result.removedLeafIds.includes(current.focusedPaneId);
          nextSplitViewsById[splitViewId] = {
            ...current,
            sourceThreadId: nextSourceThreadId,
            root: result.nextRoot,
            focusedPaneId: focusedStillPresent
              ? current.focusedPaneId
              : resolveDefaultFocusLeafId(result.nextRoot),
            updatedAt: resolveUpdatedAt(),
          };
          return {
            splitViewsById: nextSplitViewsById,
            splitViewIdBySourceThreadId: nextSplitViewIdBySourceThreadId,
          };
        });
        return true;
      },
      setFocusedPane: (splitViewId, paneId) =>
        set((state) =>
          updateSplitView(state, splitViewId, (splitView) => {
            if (splitView.focusedPaneId === paneId) return splitView;
            if (!findLeafPaneById(splitView.root, paneId)) return splitView;
            return {
              ...splitView,
              focusedPaneId: paneId,
              updatedAt: resolveUpdatedAt(),
            };
          }),
        ),
      setRatioForNode: (splitViewId, splitNodeId, ratio) =>
        set((state) =>
          updateSplitView(state, splitViewId, (splitView) => {
            const node = findSplitNodeById(splitView.root, splitNodeId);
            if (!node) return splitView;
            const nextRatio = clampRatio(ratio);
            if (node.ratio === nextRatio) return splitView;
            const nextNode: SplitNode = { ...node, ratio: nextRatio };
            return {
              ...splitView,
              root: replacePaneInTree(splitView.root, splitNodeId, nextNode),
              updatedAt: resolveUpdatedAt(),
            };
          }),
        ),
      setPanePanelState: (splitViewId, paneId, patch) =>
        set((state) =>
          updateSplitView(state, splitViewId, (splitView) => {
            const leaf = findLeafPaneById(splitView.root, paneId);
            if (!leaf) return splitView;
            const nextPanel: SplitViewPanePanelState = { ...leaf.panel, ...patch };
            if (
              leaf.panel.panel === nextPanel.panel &&
              leaf.panel.diffTurnId === nextPanel.diffTurnId &&
              leaf.panel.diffFilePath === nextPanel.diffFilePath &&
              leaf.panel.hasOpenedPanel === nextPanel.hasOpenedPanel &&
              leaf.panel.lastOpenPanel === nextPanel.lastOpenPanel
            ) {
              return splitView;
            }
            const nextLeaf: LeafPane = { ...leaf, panel: nextPanel };
            return {
              ...splitView,
              root: replacePaneInTree(splitView.root, paneId, nextLeaf),
              updatedAt: resolveUpdatedAt(),
            };
          }),
        ),
      removeThreadFromSplitViews: (threadId) =>
        set((state) => {
          let didChange = false;
          const nextSplitViewsById = { ...state.splitViewsById };
          const nextSplitViewIdBySourceThreadId = { ...state.splitViewIdBySourceThreadId };

          for (const [splitViewId, splitView] of Object.entries(state.splitViewsById)) {
            if (!splitView) {
              continue;
            }
            const result = removeLeafByThreadIdInTree(splitView.root, threadId);
            if (result.removedLeafIds.length === 0) {
              continue;
            }

            didChange = true;
            if (result.nextRoot === null) {
              delete nextSplitViewsById[splitViewId];
              delete nextSplitViewIdBySourceThreadId[splitView.sourceThreadId];
              continue;
            }
            if (!collectLeaves(result.nextRoot).some((leaf) => leaf.threadId !== null)) {
              delete nextSplitViewsById[splitViewId];
              delete nextSplitViewIdBySourceThreadId[splitView.sourceThreadId];
              continue;
            }

            const focusedStillPresent = !result.removedLeafIds.includes(splitView.focusedPaneId);
            const nextFocusedPaneId = focusedStillPresent
              ? splitView.focusedPaneId
              : resolveDefaultFocusLeafId(result.nextRoot);
            const nextSourceThreadId =
              splitView.sourceThreadId === threadId
                ? resolveNextSourceThreadId({
                    root: result.nextRoot,
                    splitViewId,
                    splitViewIdBySourceThreadId: nextSplitViewIdBySourceThreadId,
                  })
                : splitView.sourceThreadId;

            if (splitView.sourceThreadId === threadId) {
              delete nextSplitViewIdBySourceThreadId[splitView.sourceThreadId];
            }
            if (!nextSourceThreadId) {
              delete nextSplitViewsById[splitViewId];
              continue;
            }
            if (nextSourceThreadId !== splitView.sourceThreadId) {
              nextSplitViewIdBySourceThreadId[nextSourceThreadId] = splitViewId;
            }

            nextSplitViewsById[splitViewId] = {
              ...splitView,
              sourceThreadId: nextSourceThreadId,
              root: result.nextRoot,
              focusedPaneId: nextFocusedPaneId,
              updatedAt: resolveUpdatedAt(),
            };
          }

          if (!didChange) {
            return state;
          }

          return {
            splitViewsById: nextSplitViewsById,
            splitViewIdBySourceThreadId: nextSplitViewIdBySourceThreadId,
          };
        }),
    }),
    {
      name: SPLIT_VIEW_STORAGE_KEY,
      version: SPLIT_VIEW_STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        splitViewsById: state.splitViewsById,
        splitViewIdBySourceThreadId: state.splitViewIdBySourceThreadId,
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState as Partial<SplitViewStoreState>),
        hasHydrated: currentState.hasHydrated,
      }),
      onRehydrateStorage: () => {
        return (state) => {
          state?.setHasHydrated(true);
        };
      },
      // v2 娑斿澧犻惃鍕摠閸屻劋濞囬悽銊﹀楠炲磭娈戝锕€褰搁棃銏℃緲缂佹挻鐎妴鍌涱劃婢跺嫬鐨㈤幐浣风畽閸栨牜濮搁幀浣界讣缁夎鍩岄弽鎴濊埌缂佹挻鐎敍?      // 婵″倹鐏夋潻浣盒╅弮鐘崇《閹垹顦叉禒璁崇秿閺堝鏅ラ弫鐗堝祦閿涘苯鍨棃娆撶帛娑撱垹绱旈懓宀勬姜瀹曗晜绨濋妴?      migrate: (persistedState, version) => {
        if (version >= SPLIT_VIEW_STORAGE_VERSION) {
          return persistedState as SplitViewStoreState;
        }
        return (
          migrateLegacyPersistedState(persistedState) ?? {
            splitViewsById: {},
            splitViewIdBySourceThreadId: {},
          }
        );
      },
    },
  ),
);
