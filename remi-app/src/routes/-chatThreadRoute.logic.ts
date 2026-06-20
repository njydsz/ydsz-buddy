/**
 * @file èŠå¤©çº¿ç¨‹è·¯ç”±é€»è¾‘è¾…åŠ©æ¨¡å—
 * @description æä¾›è·¯ç”±çº§åˆ«çš„èŠå¤©é¢æ¿çŠ¶æ€è½¬æ¢å’Œé™çº§å¤„ç†çš„ç¡®å®šæ€§é€»è¾‘
 * @layer è·¯ç”± UI é€»è¾‘è¾…åŠ©ï¿½? * @exports çº¿ç¨‹æ ‡é¢˜é™çº§ã€æ·±åº¦é“¾æŽ¥å¼•å¯¼é‡æ”¾å¤„ç†ã€é¢æ¿åˆ‡æ¢è¾…åŠ©å‡½ï¿½? */

import type { ThreadId, TurnId } from "~/contracts";

import type { ChatRightPanel, DiffRouteSearch } from "../diffRouteSearch";

/**
 * èŠå¤©é¢æ¿çŠ¶æ€å¿«ï¿½? * @description è¡¨ç¤ºå½“å‰èŠå¤©é¢æ¿çš„å®Œæ•´çŠ¶æ€ï¼ŒåŒ…æ‹¬é¢æ¿ç±»åž‹å’Œå·®å¼‚å¯¹æ¯”ä¿¡ï¿½? */
export interface ChatPanelStateSnapshot {
  /** å½“å‰æ¿€æ´»çš„é¢æ¿ç±»åž‹ï¼Œnull è¡¨ç¤ºæ— é¢æ¿æ‰“å¼€ */
  panel: ChatRightPanel | null;
  /** å·®å¼‚å¯¹æ¯”çš„è½®ï¿½?IDï¼Œç”¨äºŽå®šä½å…·ä½“çš„ä»£ç å˜æ›´ */
  diffTurnId: TurnId | null;
  /** å·®å¼‚å¯¹æ¯”çš„æ–‡ä»¶è·¯ï¿½?*/
  diffFilePath: string | null;
}

/**
 * èŠå¤©é¢æ¿çŠ¶æ€è¡¥ï¿½? * @description ç”¨äºŽéƒ¨åˆ†æ›´æ–°é¢æ¿çŠ¶æ€ï¼Œæ‰€æœ‰å­—æ®µéƒ½æ˜¯å¯é€‰çš„
 */
export interface ChatPanelStatePatch {
  /** é¢æ¿ç±»åž‹ */
  panel?: ChatRightPanel | null;
  /** å·®å¼‚å¯¹æ¯”çš„è½®ï¿½?ID */
  diffTurnId?: TurnId | null;
  /** å·®å¼‚å¯¹æ¯”çš„æ–‡ä»¶è·¯ï¿½?*/
  diffFilePath?: string | null;
}

/**
 * è·¯ç”±é¢æ¿å¼•å¯¼ç»“æžœ
 * @description è¡¨ç¤ºï¿½?URL æœç´¢å‚æ•°ä¸­è§£æžé¢æ¿çŠ¶æ€çš„å¼•å¯¼ç»“æžœ
 */
export interface RoutePanelBootstrapResult {
  /** ä¸‹ä¸€ä¸ªåº”ç”¨çš„æœç´¢é”®ï¼Œç”¨äºŽé¿å…é‡å¤åº”ç”¨ç›¸åŒçš„çŠ¶ï¿½?*/
  nextAppliedSearchKey: string | null;
  /** é¢æ¿çŠ¶æ€è¡¥ä¸ï¼Œnull è¡¨ç¤ºæ— éœ€æ›´æ–° */
  panelPatch: ChatPanelStatePatch | null;
}

/**
 * åˆ†å‰²é¢æ¿æœ€å¤§åŒ–å†³ç­–
 * @description å½“ç”¨æˆ·æœ€å¤§åŒ–æŸä¸ªåˆ†å‰²é¢æ¿æ—¶ï¼Œå†³å®šå¦‚ä½•å¤„ç†å…¶ä»–é¢æ¿
 */
export interface SplitPaneMaximizeDecision {
  /** è¦ç§»é™¤çš„åˆ†å‰²è§†å›¾ ID */
  splitViewIdToRemove: string;
  /** ä¿ç•™çš„çº¿ï¿½?ID */
  threadId: ThreadId;
  /** ä¿ç•™çš„é¢æ¿çŠ¶ï¿½?*/
  panelState: ChatPanelStateSnapshot | null;
}

/**
 * åˆ†å‰²é¢æ¿å…³é—­å†³ç­–
 * @description è”åˆç±»åž‹ï¼Œè¡¨ç¤ºå…³é—­åˆ†å‰²é¢æ¿æ—¶çš„ä¸åŒå¤„ç†ç­–ï¿½? */
export type SplitPaneCloseDecision =
  | {
      /** å•çº¿ç¨‹æ¨¡å¼ï¼šå…³é—­åˆ†å‰²è§†å›¾ï¼Œä¿ç•™å•ä¸ªçº¿ï¿½?*/
      kind: "single-thread";
      threadId: ThreadId;
      splitViewIdToRemove: string;
    }
  | {
      /** åˆ†å‰²çº¿ç¨‹æ¨¡å¼ï¼šä¿ç•™åˆ†å‰²è§†å›¾ï¼Œä½†åˆ‡æ¢åˆ°å¦ä¸€ä¸ªçº¿ï¿½?*/
      kind: "split-thread";
      threadId: ThreadId;
      splitViewId: string;
    }
  | {
      /** æ–°èŠå¤©æ¨¡å¼ï¼šå…³é—­æ‰€æœ‰åˆ†å‰²ï¼Œåˆ›å»ºæ–°çš„èŠå¤© */
      kind: "new-chat";
    };

/**
 * è§£æžçº¿ç¨‹é€‰æ‹©å™¨æ ‡é¢˜
 * @description å½“çº¿ç¨‹æ ‡é¢˜ä¸ºç©ºæ—¶è¿”å›žé»˜è®¤æ ‡é¢˜ "New chat"ï¼Œå¦åˆ™è¿”å›žåŽŸå§‹æ ‡é¢˜
 * @param title - çº¿ç¨‹æ ‡é¢˜ï¼Œå¯èƒ½ä¸º null
 * @returns æ˜¾ç¤ºç”¨çš„çº¿ç¨‹æ ‡é¢˜
 */
export function resolveThreadPickerTitle(title: string | null): string {
  return title || "New chat";
}

/**
 * åˆ›å»ºè·¯ç”±é¢æ¿æœç´¢é”®
 * @description æ ¹æ® scopeId å’Œæœç´¢å‚æ•°ç”Ÿæˆå”¯ä¸€é”®ï¼Œç”¨äºŽåˆ¤æ–­é¢æ¿çŠ¶æ€æ˜¯å¦å·²åº”ç”¨è¿‡ã€‚
 * å½“æœç´¢å‚æ•°ä¸­æ— é¢æ¿ç›¸å…³ä¿¡æ¯æ—¶è¿”å›ž null
 * @param input.scopeId - ä½œç”¨åŸŸ ID
 * @param input.search - å·®å¼‚è·¯ç”±æœç´¢å‚æ•°
 * @returns åºåˆ—åŒ–çš„æœç´¢é”®ï¼Œæˆ– nullï¼ˆæ— é¢æ¿çŠ¶æ€æ—¶ï¼‰
 */
function createRoutePanelSearchKey(input: {
  scopeId: string;
  search: DiffRouteSearch;
}): string | null {
  const { scopeId, search } = input;
  if (
    search.panel === undefined &&
    search.diff === undefined &&
    search.diffTurnId === undefined &&
    search.diffFilePath === undefined
  ) {
    return null;
  }

  return JSON.stringify({
    scopeId,
    panel: search.panel ?? (search.diff ? "diff" : null),
    diffTurnId: search.diffTurnId ?? null,
    diffFilePath: search.diffFilePath ?? null,
  });
}

/**
 * è§£æžè·¯ç”±é¢æ¿å¼•å¯¼çŠ¶æ€
 * @description æ ¹æ® URL æœç´¢å‚æ•°è§£æžé¢æ¿çŠ¶æ€ï¼Œç”Ÿæˆé¢æ¿è¡¥ä¸ã€‚
 * é€šè¿‡æœç´¢é”®åŽ»é‡ï¼Œé¿å…é‡å¤åº”ç”¨ç›¸åŒçš„é¢æ¿çŠ¶æ€
 * @param input.scopeId - ä½œç”¨åŸŸ ID
 * @param input.search - å·®å¼‚è·¯ç”±æœç´¢å‚æ•°
 * @param input.lastAppliedSearchKey - ä¸Šæ¬¡å·²åº”ç”¨çš„æœç´¢é”®
 * @returns å¼•å¯¼ç»“æžœï¼ŒåŒ…å«ä¸‹ä¸€ä¸ªæœç´¢é”®å’Œé¢æ¿è¡¥ä¸
 */
export function resolveRoutePanelBootstrap(input: {
  scopeId: string;
  search: DiffRouteSearch;
  lastAppliedSearchKey: string | null;
}): RoutePanelBootstrapResult {
  const nextAppliedSearchKey = createRoutePanelSearchKey({
    scopeId: input.scopeId,
    search: input.search,
  });

  if (nextAppliedSearchKey === null) {
    return {
      nextAppliedSearchKey: null,
      panelPatch: null,
    };
  }

  if (input.lastAppliedSearchKey === nextAppliedSearchKey) {
    return {
      nextAppliedSearchKey,
      panelPatch: null,
    };
  }

  return {
    nextAppliedSearchKey,
    panelPatch: {
      panel: input.search.panel ?? (input.search.diff ? "diff" : null),
      diffTurnId: input.search.diffTurnId ?? null,
      diffFilePath: input.search.diffFilePath ?? null,
    },
  };
}

/**
 * è§£æžåˆ‡æ¢èŠå¤©é¢æ¿çš„è¡¥ä¸
 * @description åˆ‡æ¢æŒ‡å®šé¢æ¿çš„å¼€å…³çŠ¶æ€ï¼šå¦‚æžœå½“å‰é¢æ¿å·²ç»æ˜¯ç›®æ ‡é¢æ¿åˆ™å…³é—­ï¼Œå¦åˆ™æ‰“å¼€ç›®æ ‡é¢æ¿ã€‚
 * å·®å¼‚å¯¹æ¯”çš„è½®æ¬¡ ID å’Œæ–‡ä»¶è·¯å¾„ä¿æŒä¸å˜
 * @param previousState - ä¹‹å‰çš„é¢æ¿çŠ¶æ€å¿«ç…§
 * @param panel - è¦åˆ‡æ¢çš„é¢æ¿ç±»åž‹
 * @returns é¢æ¿çŠ¶æ€è¡¥ä¸
 */
export function resolveToggledChatPanelPatch(
  previousState: ChatPanelStateSnapshot,
  panel: ChatRightPanel,
): ChatPanelStatePatch {
  return {
    panel: previousState.panel === panel ? null : panel,
    diffTurnId: previousState.diffTurnId,
    diffFilePath: previousState.diffFilePath,
  };
}

/**
 * è§£æžåˆ†å‰²é¢æ¿æœ€å¤§åŒ–å†³ç­–
 * @description å±•å¼€åˆ†å‰²é¢æ¿æ—¶é€€å‡ºåˆ†å‰²æ¨¡å¼ï¼Œé€‰ä¸­çš„èŠå¤©æˆä¸ºå”¯ä¸€çš„æ˜¾ç¤ºç•Œé¢ã€‚
 * å¦‚æžœæ²¡æœ‰èšç„¦çš„çº¿ç¨‹ ID åˆ™è¿”å›ž null
 * @param input.splitViewId - åˆ†å‰²è§†å›¾ ID
 * @param input.focusedThreadId - å½“å‰èšç„¦çš„çº¿ç¨‹ ID
 * @param input.focusedPanelState - å½“å‰èšç„¦çš„é¢æ¿çŠ¶æ€
 * @returns æœ€å¤§åŒ–å†³ç­–ï¼Œæˆ– nullï¼ˆæ— èšç„¦çº¿ç¨‹æ—¶ï¼‰
 */
export function resolveSplitPaneMaximizeDecision(input: {
  splitViewId: string;
  focusedThreadId: ThreadId | null | undefined;
  focusedPanelState: ChatPanelStateSnapshot | null | undefined;
}): SplitPaneMaximizeDecision | null {
  if (!input.focusedThreadId) {
    return null;
  }

  return {
    splitViewIdToRemove: input.splitViewId,
    threadId: input.focusedThreadId,
    panelState: input.focusedPanelState ?? null,
  };
}

/**
 * è§£æžåˆ†å‰²é¢æ¿å…³é—­å†³ç­–
 * @description å…³é—­ä¾§è¾¹èŠå¤©æ˜¯è¿”å›žæºçº¿ç¨‹çš„æ“ä½œã€‚æ ¹æ®å…³é—­çš„çº¿ç¨‹å’Œå‰©ä½™é¢æ¿æ•°é‡ï¼Œ
 * å†³å®šæ˜¯å›žåˆ°å•çº¿ç¨‹æ¨¡å¼ã€ä¿ç•™åˆ†å‰²è§†å›¾åˆ‡æ¢åˆ°å¦ä¸€çº¿ç¨‹ï¼Œè¿˜æ˜¯åˆ›å»ºæ–°èŠå¤©
 * @param input.splitViewId - åˆ†å‰²è§†å›¾ ID
 * @param input.sourceThreadId - æºçº¿ç¨‹ ID
 * @param input.closingThreadId - æ­£åœ¨å…³é—­çš„çº¿ç¨‹ ID
 * @param input.closingSidechatSourceThreadId - æ­£åœ¨å…³é—­çš„ä¾§è¾¹èŠå¤©çš„æºçº¿ç¨‹ ID
 * @param input.nextFocusedThreadId - ä¸‹ä¸€ä¸ªèšç„¦çš„çº¿ç¨‹ ID
 * @param input.nextLeafCount - å…³é—­åŽå‰©ä½™çš„å¶å­èŠ‚ç‚¹æ•°é‡
 * @returns å…³é—­å†³ç­–ï¼ŒåŒ…å«å•çº¿ç¨‹ã€åˆ†å‰²çº¿ç¨‹æˆ–æ–°èŠå¤©ä¸‰ç§ç­–ç•¥
 */
export function resolveSplitPaneCloseDecision(input: {
  splitViewId: string;
  sourceThreadId: ThreadId;
  closingThreadId: ThreadId | null | undefined;
  closingSidechatSourceThreadId: ThreadId | null | undefined;
  nextFocusedThreadId: ThreadId | null | undefined;
  nextLeafCount: number;
}): SplitPaneCloseDecision {
  if (input.closingSidechatSourceThreadId) {
    return {
      kind: "single-thread",
      threadId: input.closingSidechatSourceThreadId,
      splitViewIdToRemove: input.splitViewId,
    };
  }

  if (input.closingThreadId && input.closingThreadId !== input.sourceThreadId) {
    return {
      kind: "single-thread",
      threadId: input.sourceThreadId,
      splitViewIdToRemove: input.splitViewId,
    };
  }

  if (input.nextFocusedThreadId) {
    if (input.nextLeafCount <= 1) {
      return {
        kind: "single-thread",
        threadId: input.nextFocusedThreadId,
        splitViewIdToRemove: input.splitViewId,
      };
    }
    return {
      kind: "split-thread",
      threadId: input.nextFocusedThreadId,
      splitViewId: input.splitViewId,
    };
  }

  return { kind: "new-chat" };
}
