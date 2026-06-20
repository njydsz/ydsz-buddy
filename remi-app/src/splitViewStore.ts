/**
 * @file splitViewStore.ts
 * @description 鍒嗗睆瑙嗗浘鐨?Zustand 鎸佷箙鍖栫姸鎬佸瓨鍌ㄣ€? * 浠ラ€掑綊闈㈡澘鏍戯紙娣卞害涓婇檺 2锛屾渶澶?2脳2 缃戞牸锛夌鐞嗗垎灞忚亰澶╃晫闈紝
 * 鎻愪緵闈㈡澘/鍒嗗壊绫诲瀷銆佹爲鎰熺煡閫夋嫨鍣ㄥ拰鍩轰簬 ID 鐨勫彉鏇存搷浣溿€? */

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

/** 鍒嗗睆瑙嗗浘鍞竴鏍囪瘑 */
export type SplitViewId = string;
/** 闈㈡澘鍞竴鏍囪瘑 */
export type PaneId = string;
/** 鍒嗗壊鏂瑰悜锛歚"horizontal"` 姘村钩鍒嗗壊锛堝乏鍙筹級锛宍"vertical"` 鍨傜洿鍒嗗壊锛堜笂涓嬶級 */
export type SplitDirection = "horizontal" | "vertical";
/**
 * 鍒嗗壊鏀剧疆渚э細`"first"` 瀵瑰簲鍒嗗壊鐨勪笂/宸︿晶锛宍"second"` 瀵瑰簲涓?鍙充晶
 */
export type SplitDropSide = "first" | "second";

/** 闈㈡澘鍙充晶闈㈡澘鐘舵€侊紙娴忚鍣?宸紓瑙嗗浘绛夛級 */
export interface SplitViewPanePanelState {
  /** 褰撳墠鎵撳紑鐨勯潰鏉跨被鍨?*/
  panel: ChatRightPanel | null;
  /** 宸紓瑙嗗浘鐨勮疆娆?ID */
  diffTurnId: TurnId | null;
  /** 宸紓瑙嗗浘鐨勬枃浠惰矾寰?*/
  diffFilePath: string | null;
  /** 鏄惁鏇炬墦寮€杩囬潰鏉?*/
  hasOpenedPanel: boolean;
  /** 鏈€杩戞墦寮€鐨勯潰鏉跨被鍨?*/
  lastOpenPanel: ChatRightPanel;
}

/** 鍙跺瓙闈㈡澘锛屼唬琛ㄤ竴涓嚎绋嬬殑鏄剧ず鍖哄煙 */
export interface LeafPane {
  kind: "leaf";
  /** 闈㈡澘鍞竴 ID */
  id: PaneId;
  /** 鍏宠仈鐨勭嚎绋?ID锛屼负 null 鏃惰〃绀虹┖闈㈡澘 */
  threadId: ThreadId | null;
  /** 闈㈡澘鍙充晶闈㈡澘鐘舵€?*/
  panel: SplitViewPanePanelState;
}

/** 鍒嗗壊鑺傜偣锛屼唬琛ㄤ竴涓按骞虫垨鍨傜洿鐨勫垎鍓?*/
export interface SplitNode {
  kind: "split";
  /** 鑺傜偣鍞竴 ID */
  id: PaneId;
  /** 鍒嗗壊鏂瑰悜 */
  direction: SplitDirection;
  /** first = 宸︼紙姘村钩锛? 涓婏紙鍨傜洿锛夛紱second = 鍙?/ 涓?*/
  first: Pane;
  second: Pane;
  /** 鍒嗗壊姣斾緥锛?.25 ~ 0.75锛?*/
  ratio: number;
}

/** 闈㈡澘鑺傜偣鑱斿悎绫诲瀷锛堝彾瀛愭垨鍒嗗壊锛?*/
export type Pane = LeafPane | SplitNode;

/** 鍒嗗睆瑙嗗浘锛屽寘鍚潰鏉挎爲鍜岃仛鐒︾姸鎬?*/
export interface SplitView {
  /** 鍒嗗睆瑙嗗浘鍞竴 ID */
  id: SplitViewId;
  /** 婧愮嚎绋?ID */
  sourceThreadId: ThreadId;
  /** 鎵€灞為」鐩?ID */
  ownerProjectId: ProjectId;
  /** 闈㈡澘鏍戞牴鑺傜偣 */
  root: Pane;
  /** 褰撳墠鑱氱劍鐨勯潰鏉?ID */
  focusedPaneId: PaneId;
  /** 鍒涘缓鏃堕棿 */
  createdAt: string;
  /** 鏇存柊鏃堕棿 */
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
 * 瑙ｆ瀽鍒嗗睆瑙嗗浘涓仛鐒︾殑绾跨▼ ID銆? * 浼樺厛杩斿洖鑱氱劍闈㈡澘鐨勭嚎绋?ID锛岃嫢鑱氱劍闈㈡澘涓虹┖鍒欏洖閫€鍒扮涓€涓潪绌哄彾瀛愰潰鏉裤€? *
 * @param splitView - 鍒嗗睆瑙嗗浘
 * @returns 鑱氱劍鐨勭嚎绋?ID锛屾墍鏈夐潰鏉夸负绌烘椂杩斿洖 null
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
 * 涓ユ牸鑾峰彇鑱氱劍闈㈡澘鐨勭嚎绋?ID锛堟棤鍥為€€锛夛紝鐢ㄤ簬璺敱浜ゆ帴
 *
 * @param splitView - 鍒嗗睆瑙嗗浘
 * @returns 鑱氱劍闈㈡澘鐨勭嚎绋?ID
 */
export function resolveSplitViewFocusedPaneThreadId(splitView: SplitView): ThreadId | null {
  return findLeafPaneById(splitView.root, splitView.focusedPaneId)?.threadId ?? null;
}

/**
 * 鑾峰彇鎸囧畾闈㈡澘 ID 鍏宠仈鐨勭嚎绋?ID
 *
 * @param splitView - 鍒嗗睆瑙嗗浘
 * @param paneId - 闈㈡澘 ID
 * @returns 绾跨▼ ID
 */
export function resolveSplitViewPaneThreadId(
  splitView: SplitView,
  paneId: PaneId,
): ThreadId | null {
  return findLeafPaneById(splitView.root, paneId)?.threadId ?? null;
}

/**
 * 鑾峰彇鍒嗗睆瑙嗗浘涓墍鏈夐潪绌虹殑绾跨▼ ID锛堝幓閲嶏級
 *
 * @param splitView - 鍒嗗睆瑙嗗浘
 * @returns 绾跨▼ ID 鏁扮粍
 */
export function resolveSplitViewThreadIds(splitView: SplitView): ThreadId[] {
  const ids = collectLeaves(splitView.root)
    .map((leaf) => leaf.threadId)
    .filter((threadId): threadId is ThreadId => threadId !== null);
  return [...new Set(ids)];
}

/**
 * 鏍规嵁绾跨▼ ID 鏌ユ壘瀵瑰簲鐨勯潰鏉?ID
 *
 * @param splitView - 鍒嗗睆瑙嗗浘
 * @param threadId - 绾跨▼ ID
 * @returns 闈㈡澘 ID锛屾湭鎵惧埌鏃惰繑鍥?null
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
 * 鏀堕泦鍒嗗睆瑙嗗浘涓墍鏈夊彾瀛愰潰鏉裤€? *
 * 閬嶅巻鍒嗗睆瑙嗗浘鐨勬牴鑺傜偣锛岄€掑綊鏀堕泦鎵€鏈夊彾瀛愰潰鏉匡紙LeafPane锛夈€? *
 * @param splitView - 瑕佹敹闆嗗彾瀛愰潰鏉跨殑鍒嗗睆瑙嗗浘
 * @returns 鍙跺瓙闈㈡澘鏁扮粍锛屾寜鏍戦亶鍘嗛『搴忔帓鍒? */
export function resolveSplitViewLeaves(splitView: SplitView): LeafPane[] {
  return collectLeaves(splitView.root);
}

/**
 * 鍒涘缓涓€涓?Zustand 閫夋嫨鍣紝鏍规嵁鍒嗗睆瑙嗗浘 ID 閫夊彇瀵瑰簲鐨勫垎灞忚鍥俱€? *
 * @param splitViewId - 瑕侀€夊彇鐨勫垎灞忚鍥?ID锛屼负 null 鏃惰繑鍥?null
 * @returns Zustand 閫夋嫨鍣ㄥ嚱鏁帮紝鎺ユ敹 store 杩斿洖瀵瑰簲鐨?SplitView 鎴?null
 */
export function selectSplitView(splitViewId: SplitViewId | null) {
  return (store: SplitViewStore) =>
    splitViewId ? (store.splitViewsById[splitViewId] ?? null) : null;
}

/**
 * 鍒涘缓涓€涓?Zustand 閫夋嫨鍣紝鏍规嵁婧愮嚎绋?ID 鏌ユ壘鍏舵墍灞炵殑鍒嗗睆瑙嗗浘 ID銆? *
 * 閫氳繃 splitViewIdBySourceThreadId 鏄犲皠琛ㄦ煡鎵炬簮绾跨▼瀵瑰簲鐨勫垎灞忚鍥俱€? *
 * @param threadId - 婧愮嚎绋?ID锛屼负 null 鏃惰繑鍥?null
 * @returns Zustand 閫夋嫨鍣ㄥ嚱鏁帮紝鎺ユ敹 store 杩斿洖瀵瑰簲鐨?SplitViewId 鎴?null
 */
export function selectSplitViewIdForSourceThread(threadId: ThreadId | null) {
  return (store: SplitViewStore) =>
    threadId ? (store.splitViewIdBySourceThreadId[threadId] ?? null) : null;
}

/**
 * 纭畾鎬ф垚鍛樻煡鎵撅細浠呭綋绾跨▼鏈夊敮涓€鏄庣‘鐨勫垎灞忚鍥惧綊灞烇紝鎴栦綔涓烘煇涓垎灞忕殑婧愮嚎绋嬫椂鎵嶆仮澶嶃€? * 妯＄硦鐨勯潪婧愮嚎绋嬫垚鍛樺叧绯诲洖閫€鍒板崟鑱婃ā寮忥紝鑰岄潪鎸夋渶杩戜娇鐢ㄧ寽娴嬨€? *
 * 鏌ユ壘绾跨▼棣栭€夊綊灞炵殑鍒嗗睆瑙嗗浘 ID銆備紭鍏堜娇鐢ㄦ簮绾跨▼鏄犲皠琛ㄦ煡鎵撅紱
 * 鑻ョ嚎绋嬪悓鏃跺嚭鐜板湪澶氫釜鍒嗗睆瑙嗗浘涓笖涓嶆槸浠讳綍鍒嗗睆鐨勬簮绾跨▼锛屽垯浠呭綋鍞竴鍖归厤鏃惰繑鍥炪€? *
 * @param input - 鏌ユ壘鍙傛暟
 * @param input.splitViewsById - 鎵€鏈夊垎灞忚鍥剧殑鏄犲皠琛? * @param input.splitViewIdBySourceThreadId - 婧愮嚎绋嬪埌鍒嗗睆瑙嗗浘 ID 鐨勬槧灏勮〃
 * @param input.threadId - 瑕佹煡鎵惧綊灞炵殑绾跨▼ ID锛屼负 null 鏃惰繑鍥?null
 * @returns 绾跨▼棣栭€夊綊灞炵殑鍒嗗睆瑙嗗浘 ID锛屾棤娉曠‘瀹氭椂杩斿洖 null
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
 * 鍒嗗睆瑙嗗浘 Zustand 鐘舵€佺鐞?store銆? *
 * 浣跨敤 persist 涓棿浠跺皢鍒嗗睆瑙嗗浘鏁版嵁鎸佷箙鍖栧埌 localStorage锛? * 鏀寔浠庢棫鐗堟墎骞冲乏鍙抽潰鏉跨粨鏋勮縼绉诲埌鏍戝舰缁撴瀯銆? *
 * 涓昏鍔熻兘锛? * - createFromThread锛氫粠婧愮嚎绋嬪垱寤哄垎灞忚鍥? * - createFromDrop锛氫粠鎷栨斁鎿嶄綔鍒涘缓鍒嗗睆瑙嗗浘
 * - removeSplitView锛氬垹闄ゅ垎灞忚鍥? * - replacePaneThread锛氭浛鎹㈤潰鏉夸腑鐨勭嚎绋? * - dropThreadOnPane锛氬皢绾跨▼鎷栨斁鍒伴潰鏉夸笂浠ュ垱寤哄垎灞? * - removePaneFromSplitView锛氫粠鍒嗗睆瑙嗗浘涓Щ闄ら潰鏉? * - setFocusedPane锛氳缃仛鐒﹂潰鏉? * - setRatioForNode锛氳缃垎灞忚妭鐐圭殑鍒嗗壊姣斾緥
 * - setPanePanelState锛氳缃潰鏉跨殑 UI 鐘舵€侊紙濡?diff 瑙嗗浘銆侀潰鏉垮睍寮€绛夛級
 * - removeThreadFromSplitViews锛氫粠鎵€鏈夊垎灞忚鍥句腑绉婚櫎鎸囧畾绾跨▼
 */
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
      // v2 涔嬪墠鐨勫瓨鍌ㄤ娇鐢ㄦ墎骞崇殑宸﹀彸闈㈡澘缁撴瀯銆傛澶勫皢鎸佷箙鍖栫姸鎬佽縼绉诲埌鏍戝舰缁撴瀯锛?      // 濡傛灉杩佺Щ鏃犳硶鎭㈠浠讳綍鏈夋晥鏁版嵁锛屽垯闈欓粯涓㈠純鑰岄潪宕╂簝銆?      migrate: (persistedState, version) => {
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
