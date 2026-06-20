/**
 * @file èŠå¤©çºç¨‹è·¯ç”±é€»è¾‘è¾…åŠ©æ¨¡å—
 * @description æä¾›è·¯ç”±çº§åˆ«çš„èŠå¤©é¢æçŠ¶æ€è½¬æ¢å’Œé™çº§å¤„ç†çš„ç¡®å®šæ€§é€»è¾‘
 * @layer è·¯ç”± UI é€»è¾‘è¾…åŠ©ï½? * @exports çºç¨‹æ ‡é¢˜é™çº§ã€æ·±åº¦é“¾æŽ¥å¼•å¯¼é‡æ”¾å¤„ç†ã€é¢æåˆ‡æ¢è¾…åŠ©å‡½ï½? */

import type { ThreadId, TurnId } from "~/contracts";

import type { ChatRightPanel, DiffRouteSearch } from "../diffRouteSearch";

/**
 * èŠå¤©é¢æçŠ¶æ€å«ï½? * @description è¡¨ç¤ºå½“å‰èŠå¤©é¢æçš„å®Œæ•´çŠ¶æ€ï¼ŒåŒ…æ‹¬é¢æç±»åž‹å’Œå·®å¼‚å¯¹æ¯”ä¡ï½? */
export interface ChatPanelStateSnapshot {
  /** å½“å‰æ€æ´»çš„é¢æç±»åž‹ï¼Œnull è¡¨ç¤ºæ— é¢ææ‰“å¼€ */
  panel: ChatRightPanel | null;
  /** å·®å¼‚å¯¹æ¯”çš„è½®ï½?IDï¼Œç”¨äºŽå®šä½å…·ä½“çš„ä»£ç å˜æ›´ */
  diffTurnId: TurnId | null;
  /** å·®å¼‚å¯¹æ¯”çš„æ–‡ä»¶è·¯ï½?*/
  diffFilePath: string | null;
}

/**
 * èŠå¤©é¢æçŠ¶æ€è¡¥ï½? * @description ç”¨äºŽéƒ¨åˆ†æ›´æ–°é¢æçŠ¶æ€ï¼Œæ‰€æœ‰å­—æ®µéƒ½æ˜¯å¯é€‰çš„
 */
export interface ChatPanelStatePatch {
  /** é¢æç±»åž‹ */
  panel?: ChatRightPanel | null;
  /** å·®å¼‚å¯¹æ¯”çš„è½®ï½?ID */
  diffTurnId?: TurnId | null;
  /** å·®å¼‚å¯¹æ¯”çš„æ–‡ä»¶è·¯ï½?*/
  diffFilePath?: string | null;
}

/**
 * è·¯ç”±é¢æå¼•å¯¼ç»“æžœ
 * @description è¡¨ç¤ºï½?URL æœç´¢å‚æ•°ä¸­è§£æžé¢æçŠ¶æ€çš„å¼•å¯¼ç»“æžœ
 */
export interface RoutePanelBootstrapResult {
  /** ä¸‹ä¸€ä¸ªåº”ç”¨çš„æœç´¢é”®ï¼Œç”¨äºŽéå…é‡å¤åº”ç”¨ç›¸åŒçš„çŠ¶ï½?*/
  nextAppliedSearchKey: string | null;
  /** é¢æçŠ¶æ€è¡¥ä¸ï¼Œnull è¡¨ç¤ºæ— éœ€æ›´æ–° */
  panelPatch: ChatPanelStatePatch | null;
}

/**
 * åˆ†å‰²é¢ææœ€å¤§åŒ–å†³ç­–
 * @description å½“ç”¨æˆ·æœ€å¤§åŒ–æŸä¸ªåˆ†å‰²é¢ææ—¶ï¼Œå†³å®šå¦‚ä½•å¤„ç†å…¶ä»–é¢æ
 */
export interface SplitPaneMaximizeDecision {
  /** è¦ç§»é™¤çš„åˆ†å‰²è§†å›¾ ID */
  splitViewIdToRemove: string;
  /** äç•™çš„çºï½?ID */
  threadId: ThreadId;
  /** äç•™çš„é¢æçŠ¶ï½?*/
  panelState: ChatPanelStateSnapshot | null;
}

/**
 * åˆ†å‰²é¢æå…³é—­å†³ç­–
 * @description è”åˆç±»åž‹ï¼Œè¡¨ç¤ºå…³é—­åˆ†å‰²é¢ææ—¶çš„ä¸åŒå¤„ç†ç­–ï½? */
export type SplitPaneCloseDecision =
  | {
      /** å•çºç¨‹æ¨¡å¼ï¼šå…³é—­åˆ†å‰²è§†å›¾ï¼Œäç•™å•ä¸ªçºï½?*/
      kind: "single-thread";
      threadId: ThreadId;
      splitViewIdToRemove: string;
    }
  | {
      /** åˆ†å‰²çºç¨‹æ¨¡å¼ï¼šäç•™åˆ†å‰²è§†å›¾ï¼Œä½†åˆ‡æ¢åˆ°å¦ä¸€ä¸ªçºï½?*/
      kind: "split-thread";
      threadId: ThreadId;
      splitViewId: string;
    }
  | {
      /** æ–°èŠå¤©æ¨¡å¼ï¼šå…³é—­æ‰€æœ‰åˆ†å‰²ï¼Œåˆ›å»ºæ–°çš„èŠå¤© */
      kind: "new-chat";
    };

/**
 * è§£æžçºç¨‹é€‰æ‹©å™¨æ ‡é¢˜
 * @description å½“çºç¨‹æ ‡é¢˜ä¸ºç©ºæ—¶è”å›žé»˜è®¤æ ‡é¢˜ "New chat"ï¼Œå¦åˆ™è”å›žåŽŸå§‹æ ‡é¢˜
 * @param title - çºç¨‹æ ‡é¢˜ï¼Œå¯èƒ½ä¸º null
 * @returns æ˜¾ç¤ºç”¨çš„çºç¨‹æ ‡é¢˜
 */
export function resolveThreadPickerTitle(title: string | null): string {
  return title || "New chat";
}

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

// Expanding a split pane exits split mode entirely; the selected chat becomes the single surface.
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

// Closing a sidechat is a return-to-source action; generic pane closes can still fall back normally.
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
