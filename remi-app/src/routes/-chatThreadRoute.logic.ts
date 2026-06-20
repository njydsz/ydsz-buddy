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

/**
 * 创建路由面板搜索键
 * @description 根据 scopeId 和搜索参数生成唯一键，用于判断面板状态是否已应用过。
 * 当搜索参数中无面板相关信息时返回 null
 * @param input.scopeId - 作用域 ID
 * @param input.search - 差异路由搜索参数
 * @returns 序列化的搜索键，或 null（无面板状态时）
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
 * 解析路由面板引导状态
 * @description 根据 URL 搜索参数解析面板状态，生成面板补丁。
 * 通过搜索键去重，避免重复应用相同的面板状态
 * @param input.scopeId - 作用域 ID
 * @param input.search - 差异路由搜索参数
 * @param input.lastAppliedSearchKey - 上次已应用的搜索键
 * @returns 引导结果，包含下一个搜索键和面板补丁
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
 * 解析切换聊天面板的补丁
 * @description 切换指定面板的开关状态：如果当前面板已经是目标面板则关闭，否则打开目标面板。
 * 差异对比的轮次 ID 和文件路径保持不变
 * @param previousState - 之前的面板状态快照
 * @param panel - 要切换的面板类型
 * @returns 面板状态补丁
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
 * 解析分割面板最大化决策
 * @description 展开分割面板时退出分割模式，选中的聊天成为唯一的显示界面。
 * 如果没有聚焦的线程 ID 则返回 null
 * @param input.splitViewId - 分割视图 ID
 * @param input.focusedThreadId - 当前聚焦的线程 ID
 * @param input.focusedPanelState - 当前聚焦的面板状态
 * @returns 最大化决策，或 null（无聚焦线程时）
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
 * 解析分割面板关闭决策
 * @description 关闭侧边聊天是返回源线程的操作。根据关闭的线程和剩余面板数量，
 * 决定是回到单线程模式、保留分割视图切换到另一线程，还是创建新聊天
 * @param input.splitViewId - 分割视图 ID
 * @param input.sourceThreadId - 源线程 ID
 * @param input.closingThreadId - 正在关闭的线程 ID
 * @param input.closingSidechatSourceThreadId - 正在关闭的侧边聊天的源线程 ID
 * @param input.nextFocusedThreadId - 下一个聚焦的线程 ID
 * @param input.nextLeafCount - 关闭后剩余的叶子节点数量
 * @returns 关闭决策，包含单线程、分割线程或新聊天三种策略
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
