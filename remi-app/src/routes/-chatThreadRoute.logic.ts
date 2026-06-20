/**
 * @file 聊天线程路由逻辑辅助模块
 * @description 提供路由级别的聊天面板状态转换和降级处理的确定性逻辑
 * @layer 路由 UI 逻辑辅助�? * @exports 线程标题降级、深度链接引导重放处理、面板切换辅助函�? */

import type { ThreadId, TurnId } from "~/contracts";

import type { ChatRightPanel, DiffRouteSearch } from "../diffRouteSearch";

/**
 * 聊天面板状态快�? * @description 表示当前聊天面板的完整状态，包括面板类型和差异对比信�? */
export interface ChatPanelStateSnapshot {
  /** 当前激活的面板类型，null 表示无面板打开 */
  panel: ChatRightPanel | null;
  /** 差异对比的轮�?ID，用于定位具体的代码变更 */
  diffTurnId: TurnId | null;
  /** 差异对比的文件路�?*/
  diffFilePath: string | null;
}

/**
 * 聊天面板状态补�? * @description 用于部分更新面板状态，所有字段都是可选的
 */
export interface ChatPanelStatePatch {
  /** 面板类型 */
  panel?: ChatRightPanel | null;
  /** 差异对比的轮�?ID */
  diffTurnId?: TurnId | null;
  /** 差异对比的文件路�?*/
  diffFilePath?: string | null;
}

/**
 * 路由面板引导结果
 * @description 表示�?URL 搜索参数中解析面板状态的引导结果
 */
export interface RoutePanelBootstrapResult {
  /** 下一个应用的搜索键，用于避免重复应用相同的状�?*/
  nextAppliedSearchKey: string | null;
  /** 面板状态补丁，null 表示无需更新 */
  panelPatch: ChatPanelStatePatch | null;
}

/**
 * 分割面板最大化决策
 * @description 当用户最大化某个分割面板时，决定如何处理其他面板
 */
export interface SplitPaneMaximizeDecision {
  /** 要移除的分割视图 ID */
  splitViewIdToRemove: string;
  /** 保留的线�?ID */
  threadId: ThreadId;
  /** 保留的面板状�?*/
  panelState: ChatPanelStateSnapshot | null;
}

/**
 * 分割面板关闭决策
 * @description 联合类型，表示关闭分割面板时的不同处理策�? */
export type SplitPaneCloseDecision =
  | {
      /** 单线程模式：关闭分割视图，保留单个线�?*/
      kind: "single-thread";
      threadId: ThreadId;
      splitViewIdToRemove: string;
    }
  | {
      /** 分割线程模式：保留分割视图，但切换到另一个线�?*/
      kind: "split-thread";
      threadId: ThreadId;
      splitViewId: string;
    }
  | {
      /** 新聊天模式：关闭所有分割，创建新的聊天 */
      kind: "new-chat";
    };

/**
 * 解析线程选择器标题
 * @description 当线程标题为空时返回默认标题 "New chat"，否则返回原始标题
 * @param title - 线程标题，可能为 null
 * @returns 显示用的线程标题
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
