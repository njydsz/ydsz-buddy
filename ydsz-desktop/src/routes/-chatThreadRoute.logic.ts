/**
 * @file 对话线程路由逻辑模块
 * @description 定义对话线程路由相关的状态快照、补丁类型和决策函数，
 *   包括面板状态管理、分屏面板最大化/关闭决策、路由搜索参数解析等。
 * @layer 路由逻辑层
 * @depends ThreadId, TurnId, ChatRightPanel, DiffRouteSearch
 */

import type { ThreadId, TurnId } from "~/contracts";

import type { ChatRightPanel, DiffRouteSearch } from "../diffRouteSearch";

/**
 * 聊天面板状态快照
 * @description 描述某个作用域下的完整面板状态，包括面板类型、Diff 轮次 ID 和文件路径
 */
export interface ChatPanelStateSnapshot {
  /** 当前打开的面板类型（browser / diff / null） */
  panel: ChatRightPanel | null;
  /** 当前 Diff 面板关联的轮次 ID */
  diffTurnId: TurnId | null;
  /** 当前 Diff 面板关联的文件路径 */
  diffFilePath: string | null;
}

/**
 * 聊天面板状态补丁
 * @description 用于部分更新面板状态的补丁类型，允许只更新部分字段
 */
export interface ChatPanelStatePatch {
  /** 面板类型补丁 */
  panel?: ChatRightPanel | null;
  /** Diff 轮次 ID 补丁 */
  diffTurnId?: TurnId | null;
  /** Diff 文件路径补丁 */
  diffFilePath?: string | null;
}

/**
 * 路由面板引导结果
 * @description 解析 URL 搜索参数后返回的结果，包含下次应用的搜索键和面板状态补丁
 */
export interface RoutePanelBootstrapResult {
  /** 下次应该应用的搜索键，用于比较搜索参数是否变化 */
  nextAppliedSearchKey: string | null;
  /** 面板状态补丁，如果搜索参数无变化则为 null */
  panelPatch: ChatPanelStatePatch | null;
}

/**
 * 分屏面板最大化决策
 * @description 当用户展开分屏面板时的决策结果，包含要移除的分屏视图 ID 和目标线程信息
 */
export interface SplitPaneMaximizeDecision {
  /** 需要移除的分屏视图 ID */
  splitViewIdToRemove: string;
  /** 目标线程 ID */
  threadId: ThreadId;
  /** 目标面板状态 */
  panelState: ChatPanelStateSnapshot | null;
}

/**
 * 分屏面板关闭决策
 * @description 当用户关闭分屏面板时的决策结果，根据关闭场景不同分为三种情况：
 *   - single-thread: 退回到单个线程视图
 *   - split-thread: 退回到另一个分屏视图
 *   - new-chat: 创建新对话
 */
export type SplitPaneCloseDecision =
  | {
      /** 退回到单个线程视图 */
      kind: "single-thread";
      threadId: ThreadId;
      splitViewIdToRemove: string;
    }
  | {
      /** 切换到另一个分屏视图继续分屏操作 */
      kind: "split-thread";
      threadId: ThreadId;
      splitViewId: string;
    }
  | {
      /** 关闭所有面板，创建新的空白对话 */
      kind: "new-chat";
    };

/**
 * 解析线程选择器标题
 * @description 如果线程没有标题则返回默认的 "New chat" 文本
 * @param title - 线程标题，可能为 null
 * @returns 解析后的显示标题
 */
export function resolveThreadPickerTitle(title: string | null): string {
  return title || "New chat";
}

/**
 * 创建路由面板搜索键
 * @description 将作用域 ID 和搜索参数序列化，用于比较搜索参数是否发生变化
 * @param input.scopeId - 作用域 ID
 * @param input.search - 路由搜索参数
 * @returns 序列化的搜索键，如果所有搜索参数都未定义则返回 null
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
 * @description 比较当前搜索参数与上次应用的搜索键，判断是否需要更新面板状态
 * @param input.scopeId - 作用域 ID
 * @param input.search - 当前路由搜索参数
 * @param input.lastAppliedSearchKey - 上次应用的搜索键
 * @returns 包含下次搜索键和面板补丁的结果
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
 * 解析面板切换补丁
 * @description 切换面板时生成新的面板状态补丁，如果切换到已打开的同类面板则关闭
 * @param previousState - 之前的面板状态
 * @param panel - 要切换到的目标面板类型
 * @returns 新的面板状态补丁
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
 * 解析分屏面板最大化决策
 * @description 展开分屏面板时会退出分屏模式，选中的对话成为单独的视图
 * @param input.splitViewId - 当前分屏视图 ID
 * @param input.focusedThreadId - 当前聚焦的线程 ID
 * @param input.focusedPanelState - 当前聚焦面板的状态
 * @returns 最大化决策，包含要移除的分屏视图和目标线程信息
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
 * 解析分屏面板关闭决策
 * @description 关闭侧边聊天的行为是返回源线程的操作，普通面板关闭仍然可以正常回退
 * @param input.splitViewId - 当前分屏视图 ID
 * @param input.sourceThreadId - 源线程 ID（分屏视图的创建来源）
 * @param input.closingThreadId - 正在关闭的线程 ID
 * @param input.closingSidechatSourceThreadId - 正在关闭的侧边聊天的源线程 ID
 * @param input.nextFocusedThreadId - 下一个要聚焦的线程 ID
 * @param input.nextLeafCount - 下一个叶子节点数量
 * @returns 关闭决策，决定关闭后的行为
 */
export function resolveSplitPaneCloseDecision(input: {
  splitViewId: string;
  sourceThreadId: ThreadId;
  closingThreadId: ThreadId | null | undefined;
  closingSidechatSourceThreadId: ThreadId | null | undefined;
  nextFocusedThreadId: ThreadId | null | undefined;
  nextLeafCount: number;
}): SplitPaneCloseDecision {
  // 关闭侧边聊天的源线程时，返回到源线程
  if (input.closingSidechatSourceThreadId) {
    return {
      kind: "single-thread",
      threadId: input.closingSidechatSourceThreadId,
      splitViewIdToRemove: input.splitViewId,
    };
  }

  // 关闭非源线程时，也返回到源线程
  if (input.closingThreadId && input.closingThreadId !== input.sourceThreadId) {
    return {
      kind: "single-thread",
      threadId: input.sourceThreadId,
      splitViewIdToRemove: input.splitViewId,
    };
  }

  // 有下一个聚焦线程时
  if (input.nextFocusedThreadId) {
    // 如果剩余面板数量 <= 1，退回到单个线程视图
    if (input.nextLeafCount <= 1) {
      return {
        kind: "single-thread",
        threadId: input.nextFocusedThreadId,
        splitViewIdToRemove: input.splitViewId,
      };
    }
    // 否则切换到另一个分屏视图
    return {
      kind: "split-thread",
      threadId: input.nextFocusedThreadId,
      splitViewId: input.splitViewId,
    };
  }

  // 没有下一个线程时，创建新对话
  return { kind: "new-chat" };
}
