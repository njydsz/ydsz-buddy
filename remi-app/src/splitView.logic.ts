/**
 * @file splitView.logic.ts
 * @description 閸掑棗鐫嗙憴鍡楁禈闂堛垺婢橀弽鎴犳畱缁绢垰鍤遍弫鎷岀窡閸斺晜膩閸фぜ鈧? * 閹绘劒绶甸棃銏℃緲閺屻儲澹橀妴浣规禌閹光偓鈧礁鍨归梽銈冣偓浣圭箒鎼达箒顓哥粻妞尖偓浣稿瀻閸撴彃褰茬悰灞锯偓褍鍨介弬顓犵搼閸旂喕鍏橀敍? * 娴犮儱寮烽弮褏澧楅崚鍡楃潌鐟欏棗娴橀惃鍕讣缁夌粯鏁幐浣碘偓鍌欑瑝娓氭繆绂?DOM 閹?React閵? */

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
 * 濞撳懘娅庨棃銏℃緲閻ㄥ嫬褰告笟褔娼伴弶璺ㄥЦ閹緤绱欓崗鎶芥４闂堛垺婢橀妴浣圭闂勩倕妯婂鍌欎繆閹垽绱? *
 * @param panelState - 瑜版挸澧犻棃銏℃緲閻樿埖鈧? * @returns 闁插秶鐤嗛崥搴ｆ畱闂堛垺婢橀悩鑸碘偓? */
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
 * 閸︺劑娼伴弶鎸庣埐娑擃厽瀵?ID 閺屻儲澹橀棃銏℃緲閼哄倻鍋? *
 * @param root - 闂堛垺婢橀弽鎴炵壌閼哄倻鍋? * @param paneId - 閻╊喗鐖ｉ棃銏℃緲 ID
 * @returns 閹垫儳鍩岄惃鍕桨閺夎儻濡悙鐧哥礉閺堫亝澹橀崚鐗堟鏉╂柨娲?null
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
 * 閸︺劑娼伴弶鎸庣埐娑擃厽瀵?ID 閺屻儲澹橀崣璺虹摍闂堛垺婢? *
 * @param root - 闂堛垺婢橀弽鎴炵壌閼哄倻鍋? * @param paneId - 閻╊喗鐖ｉ棃銏℃緲 ID
 * @returns 閹垫儳鍩岄惃鍕骄鐎涙劙娼伴弶鍖＄礉閺堫亝澹橀崚鐗堝灗闂堢偛褰剧€涙劘濡悙瑙勬鏉╂柨娲?null
 */
export function findLeafPaneById(root: Pane, paneId: PaneId): LeafPane | null {
  const found = findPaneById(root, paneId);
  return found?.kind === "leaf" ? found : null;
}

/**
 * 閸︺劑娼伴弶鎸庣埐娑擃厽瀵?ID 閺屻儲澹橀崚鍡楀閼哄倻鍋? *
 * @param root - 闂堛垺婢橀弽鎴炵壌閼哄倻鍋? * @param paneId - 閻╊喗鐖ｉ棃銏℃緲 ID
 * @returns 閹垫儳鍩岄惃鍕瀻閸撹尪濡悙鐧哥礉閺堫亝澹橀崚鐗堝灗闂堢偛鍨庨崜鑼跺Ν閻愯妞傛潻鏂挎礀 null
 */
export function findSplitNodeById(root: Pane, paneId: PaneId): SplitNode | null {
  const found = findPaneById(root, paneId);
  return found?.kind === "split" ? found : null;
}

/**
 * 閺屻儲澹橀惄瀛樺复閸栧懎鎯堥幐鍥х暰闂堛垺婢橀惃鍕煑閸掑棗澹婇懞鍌滃仯閵? * 婵″倹鐏夐棃銏℃緲 ID 閺勵垱鐗撮懞鍌滃仯閿涘矁绻戦崶?null閵? *
 * @param root - 闂堛垺婢橀弽鎴炵壌閼哄倻鍋? * @param paneId - 閻╊喗鐖ｉ棃銏℃緲 ID
 * @returns 閻栬泛鍨庨崜鑼跺Ν閻愮櫢绱濋棃銏℃緲娑撶儤鐗撮懞鍌滃仯閺冩儼绻戦崶?null
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
 * 鐠侊紕鐣婚棃銏℃緲閸︺劍鐖叉稉顓犳畱濞ｅ崬瀹抽敍鍫熺壌閼哄倻鍋ｅǎ鍗炲娑?0閿? *
 * @param root - 闂堛垺婢橀弽鎴炵壌閼哄倻鍋? * @param paneId - 閻╊喗鐖ｉ棃銏℃緲 ID
 * @returns 闂堛垺婢樺ǎ鍗炲閿涘本婀幍鎯у煂閺冩儼绻戦崶?null
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
 * 閺€鍫曟肠闂堛垺婢橀弽鎴滆厬閻ㄥ嫭澧嶉張澶婂骄鐎涙劙娼伴弶? *
 * @param root - 闂堛垺婢橀弽鎴炵壌閼哄倻鍋? * @returns 閸欒泛鐡欓棃銏℃緲閺佹壆绮? */
export function collectLeaves(root: Pane): LeafPane[] {
  if (root.kind === "leaf") {
    return [root];
  }
  return [...collectLeaves(root.first), ...collectLeaves(root.second)];
}

// --- pane mutation (immutable) ---

/**
 * 閸︺劑娼伴弶鎸庣埐娑擃厽娴涢幑銏″瘹鐎规岸娼伴弶鑳Ν閻愮櫢绱欐稉宥呭讲閸欐ɑ鎼锋担婊愮礆閵? * 婵″倹鐏夊▽鈩冩箒鐎圭偤妾崣妯绘纯閿涘矁绻戦崶鐐插斧閺嶆垵绱╅悽銊や簰娣囨繃瀵斿鏇犳暏閻╁摜鐡戦幀褋鈧? *
 * @param root - 闂堛垺婢橀弽鎴炵壌閼哄倻鍋? * @param paneId - 鐟曚焦娴涢幑銏㈡畱闂堛垺婢?ID
 * @param replacement - 閺囨寧宕查棃銏℃緲
 * @returns 閺囨寧宕查崥搴ｆ畱閺備即娼伴弶鎸庣埐
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
 * 閸掔娀娅庨崣璺虹摍闂堛垺婢橀惃鍕波閺嬫粣绱濋崠鍛儓閺傜増鐖查弽鐟版嫲鐞氼偆些闂勩倗娈戦崣璺虹摍 ID 閸掓銆? */
export interface RemoveLeafResult {
  /** 閸掔娀娅庨崥搴ｆ畱閺傜増鐖查弽鐧哥礉閹碘偓閺堝褰剧€涙劘顫︾粔濠氭珟閺冩湹璐?null */
  nextRoot: Pane | null;
  /** 鐞氼偆些闂勩倗娈戦崣璺虹摍闂堛垺婢?ID 閸掓銆?*/
  removedLeafIds: PaneId[];
}

/**
 * 娴犲酣娼伴弶鎸庣埐娑擃厾些闂勩倖澧嶉張澶婂爱闁板秵瀵氱€规氨鍤庣粙?ID 閻ㄥ嫬褰剧€涙劙娼伴弶瑁も偓? * 婢跺崬骞撻幍鈧張澶婂骄鐎涙劗娈戠€涙劖鐖叉导姘閸欑姳璐?null閿涘奔绮庨崜鈺€绔存笟褍鐡欓弽鎴犳畱閸掑棗澹婇懞鍌滃仯娴兼碍濮岄崣鐘辫礋鐠囥儱鐡欓弽鎴欌偓? *
 * @param root - 闂堛垺婢橀弽鎴炵壌閼哄倻鍋? * @param threadId - 鐟曚胶些闂勩倗娈戠痪璺ㄢ柤 ID
 * @returns 閸掔娀娅庣紒鎾寸亯
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
 * 娴犲酣娼伴弶鎸庣埐娑擃厾些闂勩倖瀵氱€规岸娼伴弶?ID 閻ㄥ嫬褰剧€涙劙娼伴弶瑁も偓? * 婢跺崬骞撻幍鈧張澶婂骄鐎涙劗娈戠€涙劖鐖叉导姘閸欑姳璐?null閿涘奔绮庨崜鈺€绔存笟褍鐡欓弽鎴犳畱閸掑棗澹婇懞鍌滃仯娴兼碍濮岄崣鐘辫礋鐠囥儱鐡欓弽鎴礉
 * 娴ｅ灝澧挎担娆撴桨閺夎儻鍤滈崝銊ㄧ殶閺佹潙銇囩亸蹇嬧偓? *
 * @param root - 闂堛垺婢橀弽鎴炵壌閼哄倻鍋? * @param paneId - 鐟曚胶些闂勩倗娈戦崣璺虹摍闂堛垺婢?ID
 * @returns 閸掔娀娅庣紒鎾寸亯
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
 * 閸掋倖鏌囬崣璺虹摍闂堛垺婢橀弰顖氭儊閸欘垯浜掗崷銊﹀瘹鐎规碍鏌熼崥鎴滅瑐閸掑棗澹婇敍灞肩瑝鐡掑懓绻冨ǎ鍗炲娑撳﹪妾?2閵? * 瑜版挾鍩楅懞鍌滃仯閺傜懓鎮滄稉?null閿涘牊鐗寸痪褍褰剧€涙劧绱氶弮璁圭礉娴犺缍嶉弬鐟版倻闁棄鍘戠拋鎼炩偓? * 濞ｅ崬瀹虫稉濠囨绾喕绻氶張鈧径姘埌閹?2鑴? 閻ㄥ嫮缍夐弽鐓庣鐏炩偓閵? *
 * @param parentDirection - 閻栬泛鍨庨崜鑼跺Ν閻愬湱娈戦弬鐟版倻閿涘本鐗寸痪褌璐?null
 * @param requestedDirection - 鐠囬攱鐪伴惃鍕瀻閸撳弶鏌熼崥? * @returns 閺勵垰鎯侀崣顖欎簰閸掑棗澹? */
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
 * 閸掋倖鏌囬棃銏℃緲閺嶆垳鑵戦幐鍥х暰閸欒泛鐡欓棃銏℃緲閺勵垰鎯侀崣顖欎簰閸︺劍瀵氱€规碍鏌熼崥鎴滅瑐閸掑棗澹婇妴? * 缂佺厧鎮庡Λ鈧弻銉╂桨閺夊灝鐡ㄩ崷銊︹偓褋鈧焦绻佹惔锕傛閸掕泛鎷伴弬鐟版倻闂勬劕鍩楅妴? *
 * @param root - 闂堛垺婢橀弽鎴炵壌閼哄倻鍋? * @param targetPaneId - 閻╊喗鐖ｉ崣璺虹摍闂堛垺婢?ID
 * @param requestedDirection - 鐠囬攱鐪伴惃鍕瀻閸撳弶鏌熼崥? * @returns 閺勵垰鎯侀崣顖欎簰閸掑棗澹? */
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
 * 鐟欙絾鐎芥妯款吇閼辨氨鍔嶉惃鍕骄鐎涙劙娼伴弶?ID閿涘湒FS 鎼村繐鍨稉顓犳畱缁楊兛绔存稉顏勫骄鐎涙劧绱氶妴? * 婵″倹鐏夊▽鈩冩箒閸欒泛鐡欓敍灞芥礀闁偓閸掔増鐗撮懞鍌滃仯 ID閵? *
 * @param root - 闂堛垺婢橀弽鎴炵壌閼哄倻鍋? * @returns 姒涙顓婚懕姘卞妽閻ㄥ嫬褰剧€涙劙娼伴弶?ID
 */
export function resolveDefaultFocusLeafId(root: Pane): PaneId {
  const leaves = collectLeaves(root);
  return leaves[0]?.id ?? root.id;
}

// --- legacy split-view migration ---

/**
 * 閺冄呭閸掑棗鐫嗙憴鍡楁禈缂佹挻鐎敍鍫濅箯閸欏厖琚遍棃銏℃緲閻ㄥ嫭澧庨獮宕囩波閺嬪嫸绱氶敍宀€鏁ゆ禍搴ょ讣缁夎鍩岄弬鎵畱閺嶆垵鑸扮紒鎾寸€? */
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
 * 閸掋倖鏌囩紒娆忕暰閸婂吋妲搁崥锔胯礋閺冄呭閸掑棗鐫嗙憴鍡楁禈缂佹挻鐎? *
 * @param value - 瀵板懎鍨介弬顓犳畱閸? * @returns 閺勵垰鎯佹稉鐑樻＋閻楀牆鍨庣仦蹇氼潒閸ュ墽绮ㄩ弸鍕剁礄缁鐎风€瑰牆宕奸敍? */
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
