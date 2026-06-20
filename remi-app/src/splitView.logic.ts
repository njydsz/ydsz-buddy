/**
 * @file splitView.logic.ts
 * @description 鍒嗗睆瑙嗗浘闈㈡澘鏍戠殑绾嚱鏁拌緟鍔╂ā鍧椼€? * 鎻愪緵闈㈡澘鏌ユ壘銆佹浛鎹€€佸垹闄ゃ€佹繁搴﹁绠椼€佸垎鍓插彲琛屾€у垽鏂瓑鍔熻兘锛? * 浠ュ強鏃х増鍒嗗睆瑙嗗浘鐨勮縼绉绘敮鎸併€備笉渚濊禆 DOM 鎴?React銆? */

import type { ProjectId, ThreadId } from "~/contracts";
import type {
  LeafPane,
  Pane,
  PaneId,
  SplitDirection,
  SplitNode,
  SplitViewPanePanelState,
} from "./splitViewStore";

/**
 * 娓呴櫎闈㈡澘鐨勫彸渚ч潰鏉跨姸鎬侊紙鍏抽棴闈㈡澘銆佹竻闄ゅ樊寮備俊鎭級
 *
 * @param panelState - 褰撳墠闈㈡澘鐘舵€? * @returns 閲嶇疆鍚庣殑闈㈡澘鐘舵€? */
export function clearSplitViewPanePanelState(
  panelState: SplitViewPanePanelState,
): SplitViewPanePanelState {
  return {
    ...panelState,
    panel: null,
    diffTurnId: null,
    diffFilePath: null,
  };
}

// --- pane lookup ---

/**
 * 鍦ㄩ潰鏉挎爲涓寜 ID 鏌ユ壘闈㈡澘鑺傜偣
 *
 * @param root - 闈㈡澘鏍戞牴鑺傜偣
 * @param paneId - 鐩爣闈㈡澘 ID
 * @returns 鎵惧埌鐨勯潰鏉胯妭鐐癸紝鏈壘鍒版椂杩斿洖 null
 */
export function findPaneById(root: Pane, paneId: PaneId): Pane | null {
  if (root.id === paneId) {
    return root;
  }
  if (root.kind === "leaf") {
    return null;
  }
  return findPaneById(root.first, paneId) ?? findPaneById(root.second, paneId);
}

/**
 * 鍦ㄩ潰鏉挎爲涓寜 ID 鏌ユ壘鍙跺瓙闈㈡澘
 *
 * @param root - 闈㈡澘鏍戞牴鑺傜偣
 * @param paneId - 鐩爣闈㈡澘 ID
 * @returns 鎵惧埌鐨勫彾瀛愰潰鏉匡紝鏈壘鍒版垨闈炲彾瀛愯妭鐐规椂杩斿洖 null
 */
export function findLeafPaneById(root: Pane, paneId: PaneId): LeafPane | null {
  const found = findPaneById(root, paneId);
  return found?.kind === "leaf" ? found : null;
}

/**
 * 鍦ㄩ潰鏉挎爲涓寜 ID 鏌ユ壘鍒嗗壊鑺傜偣
 *
 * @param root - 闈㈡澘鏍戞牴鑺傜偣
 * @param paneId - 鐩爣闈㈡澘 ID
 * @returns 鎵惧埌鐨勫垎鍓茶妭鐐癸紝鏈壘鍒版垨闈炲垎鍓茶妭鐐规椂杩斿洖 null
 */
export function findSplitNodeById(root: Pane, paneId: PaneId): SplitNode | null {
  const found = findPaneById(root, paneId);
  return found?.kind === "split" ? found : null;
}

/**
 * 鏌ユ壘鐩存帴鍖呭惈鎸囧畾闈㈡澘鐨勭埗鍒嗗壊鑺傜偣銆? * 濡傛灉闈㈡澘 ID 鏄牴鑺傜偣锛岃繑鍥?null銆? *
 * @param root - 闈㈡澘鏍戞牴鑺傜偣
 * @param paneId - 鐩爣闈㈡澘 ID
 * @returns 鐖跺垎鍓茶妭鐐癸紝闈㈡澘涓烘牴鑺傜偣鏃惰繑鍥?null
 */
export function findParentSplitNode(root: Pane, paneId: PaneId): SplitNode | null {
  if (root.kind === "leaf") {
    return null;
  }
  if (root.first.id === paneId || root.second.id === paneId) {
    return root;
  }
  return findParentSplitNode(root.first, paneId) ?? findParentSplitNode(root.second, paneId);
}

/**
 * 璁＄畻闈㈡澘鍦ㄦ爲涓殑娣卞害锛堟牴鑺傜偣娣卞害涓?0锛? *
 * @param root - 闈㈡澘鏍戞牴鑺傜偣
 * @param paneId - 鐩爣闈㈡澘 ID
 * @returns 闈㈡澘娣卞害锛屾湭鎵惧埌鏃惰繑鍥?null
 */
export function findPaneDepth(root: Pane, paneId: PaneId): number | null {
  if (root.id === paneId) {
    return 0;
  }
  if (root.kind === "leaf") {
    return null;
  }
  const firstDepth = findPaneDepth(root.first, paneId);
  if (firstDepth !== null) {
    return firstDepth + 1;
  }
  const secondDepth = findPaneDepth(root.second, paneId);
  return secondDepth === null ? null : secondDepth + 1;
}

/**
 * 鏀堕泦闈㈡澘鏍戜腑鐨勬墍鏈夊彾瀛愰潰鏉? *
 * @param root - 闈㈡澘鏍戞牴鑺傜偣
 * @returns 鍙跺瓙闈㈡澘鏁扮粍
 */
export function collectLeaves(root: Pane): LeafPane[] {
  if (root.kind === "leaf") {
    return [root];
  }
  return [...collectLeaves(root.first), ...collectLeaves(root.second)];
}

// --- pane mutation (immutable) ---

/**
 * 鍦ㄩ潰鏉挎爲涓浛鎹㈡寚瀹氶潰鏉胯妭鐐癸紙涓嶅彲鍙樻搷浣滐級銆? * 濡傛灉娌℃湁瀹為檯鍙樻洿锛岃繑鍥炲師鏍戝紩鐢ㄤ互淇濇寔寮曠敤鐩哥瓑鎬с€? *
 * @param root - 闈㈡澘鏍戞牴鑺傜偣
 * @param paneId - 瑕佹浛鎹㈢殑闈㈡澘 ID
 * @param replacement - 鏇挎崲闈㈡澘
 * @returns 鏇挎崲鍚庣殑鏂伴潰鏉挎爲
 */
export function replacePaneInTree(root: Pane, paneId: PaneId, replacement: Pane): Pane {
  if (root.id === paneId) {
    return replacement;
  }
  if (root.kind === "leaf") {
    return root;
  }
  const first = replacePaneInTree(root.first, paneId, replacement);
  const second = replacePaneInTree(root.second, paneId, replacement);
  if (first === root.first && second === root.second) {
    return root;
  }
  return { ...root, first, second };
}

/**
 * 鍒犻櫎鍙跺瓙闈㈡澘鐨勭粨鏋滐紝鍖呭惈鏂版爲鏍瑰拰琚Щ闄ょ殑鍙跺瓙 ID 鍒楄〃
 */
export interface RemoveLeafResult {
  /** 鍒犻櫎鍚庣殑鏂版爲鏍癸紝鎵€鏈夊彾瀛愯绉婚櫎鏃朵负 null */
  nextRoot: Pane | null;
  /** 琚Щ闄ょ殑鍙跺瓙闈㈡澘 ID 鍒楄〃 */
  removedLeafIds: PaneId[];
}

/**
 * 浠庨潰鏉挎爲涓Щ闄ゆ墍鏈夊尮閰嶆寚瀹氱嚎绋?ID 鐨勫彾瀛愰潰鏉裤€? * 澶卞幓鎵€鏈夊彾瀛愮殑瀛愭爲浼氭姌鍙犱负 null锛屼粎鍓╀竴渚у瓙鏍戠殑鍒嗗壊鑺傜偣浼氭姌鍙犱负璇ュ瓙鏍戙€? *
 * @param root - 闈㈡澘鏍戞牴鑺傜偣
 * @param threadId - 瑕佺Щ闄ょ殑绾跨▼ ID
 * @returns 鍒犻櫎缁撴灉
 */
export function removeLeafByThreadId(root: Pane, threadId: ThreadId): RemoveLeafResult {
  if (root.kind === "leaf") {
    if (root.threadId === threadId) {
      return { nextRoot: null, removedLeafIds: [root.id] };
    }
    return { nextRoot: root, removedLeafIds: [] };
  }

  const firstResult = removeLeafByThreadId(root.first, threadId);
  const secondResult = removeLeafByThreadId(root.second, threadId);
  const removedLeafIds = [...firstResult.removedLeafIds, ...secondResult.removedLeafIds];

  if (removedLeafIds.length === 0) {
    return { nextRoot: root, removedLeafIds };
  }

  if (firstResult.nextRoot && secondResult.nextRoot) {
    return {
      nextRoot: { ...root, first: firstResult.nextRoot, second: secondResult.nextRoot },
      removedLeafIds,
    };
  }
  if (firstResult.nextRoot) {
    return { nextRoot: firstResult.nextRoot, removedLeafIds };
  }
  if (secondResult.nextRoot) {
    return { nextRoot: secondResult.nextRoot, removedLeafIds };
  }
  return { nextRoot: null, removedLeafIds };
}

/**
 * 浠庨潰鏉挎爲涓Щ闄ゆ寚瀹氶潰鏉?ID 鐨勫彾瀛愰潰鏉裤€? * 澶卞幓鎵€鏈夊彾瀛愮殑瀛愭爲浼氭姌鍙犱负 null锛屼粎鍓╀竴渚у瓙鏍戠殑鍒嗗壊鑺傜偣浼氭姌鍙犱负璇ュ瓙鏍戯紝
 * 浣垮墿浣欓潰鏉胯嚜鍔ㄨ皟鏁村ぇ灏忋€? *
 * @param root - 闈㈡澘鏍戞牴鑺傜偣
 * @param paneId - 瑕佺Щ闄ょ殑鍙跺瓙闈㈡澘 ID
 * @returns 鍒犻櫎缁撴灉
 */
export function removeLeafByPaneId(root: Pane, paneId: PaneId): RemoveLeafResult {
  if (root.kind === "leaf") {
    if (root.id === paneId) {
      return { nextRoot: null, removedLeafIds: [root.id] };
    }
    return { nextRoot: root, removedLeafIds: [] };
  }

  const firstResult = removeLeafByPaneId(root.first, paneId);
  const secondResult = removeLeafByPaneId(root.second, paneId);
  const removedLeafIds = [...firstResult.removedLeafIds, ...secondResult.removedLeafIds];

  if (removedLeafIds.length === 0) {
    return { nextRoot: root, removedLeafIds };
  }

  if (firstResult.nextRoot && secondResult.nextRoot) {
    return {
      nextRoot: { ...root, first: firstResult.nextRoot, second: secondResult.nextRoot },
      removedLeafIds,
    };
  }
  if (firstResult.nextRoot) {
    return { nextRoot: firstResult.nextRoot, removedLeafIds };
  }
  if (secondResult.nextRoot) {
    return { nextRoot: secondResult.nextRoot, removedLeafIds };
  }
  return { nextRoot: null, removedLeafIds };
}

// --- structural rules ---

/**
 * 鍒ゆ柇鍙跺瓙闈㈡澘鏄惁鍙互鍦ㄦ寚瀹氭柟鍚戜笂鍒嗗壊锛屼笉瓒呰繃娣卞害涓婇檺 2銆? * 褰撶埗鑺傜偣鏂瑰悜涓?null锛堟牴绾у彾瀛愶級鏃讹紝浠讳綍鏂瑰悜閮藉厑璁搞€? * 娣卞害涓婇檺纭繚鏈€澶氬舰鎴?2脳2 鐨勭綉鏍煎竷灞€銆? *
 * @param parentDirection - 鐖跺垎鍓茶妭鐐圭殑鏂瑰悜锛屾牴绾т负 null
 * @param requestedDirection - 璇锋眰鐨勫垎鍓叉柟鍚? * @returns 鏄惁鍙互鍒嗗壊
 */
export function canSubdivide(
  parentDirection: SplitDirection | null,
  requestedDirection: SplitDirection,
): boolean {
  if (parentDirection === null) {
    return true;
  }
  return parentDirection !== requestedDirection;
}

/**
 * 鍒ゆ柇闈㈡澘鏍戜腑鎸囧畾鍙跺瓙闈㈡澘鏄惁鍙互鍦ㄦ寚瀹氭柟鍚戜笂鍒嗗壊銆? * 缁煎悎妫€鏌ラ潰鏉垮瓨鍦ㄦ€с€佹繁搴﹂檺鍒跺拰鏂瑰悜闄愬埗銆? *
 * @param root - 闈㈡澘鏍戞牴鑺傜偣
 * @param targetPaneId - 鐩爣鍙跺瓙闈㈡澘 ID
 * @param requestedDirection - 璇锋眰鐨勫垎鍓叉柟鍚? * @returns 鏄惁鍙互鍒嗗壊
 */
export function canSubdividePane(
  root: Pane,
  targetPaneId: PaneId,
  requestedDirection: SplitDirection,
): boolean {
  if (!findLeafPaneById(root, targetPaneId)) {
    return false;
  }
  const targetDepth = findPaneDepth(root, targetPaneId);
  if (targetDepth === null || targetDepth >= 2) {
    return false;
  }
  const parent = findParentSplitNode(root, targetPaneId);
  return canSubdivide(parent?.direction ?? null, requestedDirection);
}

/**
 * 瑙ｆ瀽榛樿鑱氱劍鐨勫彾瀛愰潰鏉?ID锛圖FS 搴忓垪涓殑绗竴涓彾瀛愶級銆? * 濡傛灉娌℃湁鍙跺瓙锛屽洖閫€鍒版牴鑺傜偣 ID銆? *
 * @param root - 闈㈡澘鏍戞牴鑺傜偣
 * @returns 榛樿鑱氱劍鐨勫彾瀛愰潰鏉?ID
 */
export function resolveDefaultFocusLeafId(root: Pane): PaneId {
  const leaves = collectLeaves(root);
  return leaves[0]?.id ?? root.id;
}

// --- legacy split-view migration ---

/**
 * 鏃х増鍒嗗睆瑙嗗浘缁撴瀯锛堝乏鍙充袱闈㈡澘鐨勬墎骞崇粨鏋勶級锛岀敤浜庤縼绉诲埌鏂扮殑鏍戝舰缁撴瀯
 */
export interface LegacySplitViewLike {
  id: string;
  sourceThreadId: ThreadId;
  ownerProjectId: ProjectId;
  leftThreadId: ThreadId | null;
  rightThreadId: ThreadId | null;
  focusedPane: "left" | "right";
  ratio: number;
  leftPanel: SplitViewPanePanelState;
  rightPanel: SplitViewPanePanelState;
  createdAt: string;
  updatedAt: string;
}

/**
 * 鍒ゆ柇缁欏畾鍊兼槸鍚︿负鏃х増鍒嗗睆瑙嗗浘缁撴瀯
 *
 * @param value - 寰呭垽鏂殑鍊? * @returns 鏄惁涓烘棫鐗堝垎灞忚鍥剧粨鏋勶紙绫诲瀷瀹堝崼锛? */
export function isLegacySplitViewLike(value: unknown): value is LegacySplitViewLike {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.sourceThreadId === "string" &&
    "leftThreadId" in candidate &&
    "rightThreadId" in candidate &&
    typeof candidate.focusedPane === "string"
  );
}
