/**
 * @file useThreadActivationController.ts
 * @description 线程激活控制器 Hook - 集中处理侧边栏线程激活的副作用逻辑
 * @module hooks/useThreadActivationController
 */

import { useCallback } from "react";
import type { useNavigate } from "@tanstack/react-router";
import type { ProjectId, ThreadId } from "@ydsz-buddy/contracts";
import type { LastThreadRoute } from "../chatRouteRestore";
import { type PaneId, type SplitView, type SplitViewId } from "../splitViewStore";
import { selectThreadTerminalState } from "../terminalStateStore";
import type { SidebarThreadSummary } from "../types";
import {
  resolvePreferredSplitForCommand,
  resolveThreadCommandActivation,
} from "../threadActivation.logic";

/** 导航函数类型 */
type Navigate = ReturnType<typeof useNavigate>;
/** 线程终端状态类型 */
type ThreadTerminalStateById = Parameters<typeof selectThreadTerminalState>[0];
/** 侧边栏线程激活摘要类型 */
type SidebarThreadActivationSummary = Pick<
  SidebarThreadSummary,
  "id" | "projectId" | "sidechatSourceThreadId"
>;

/**
 * 线程激活控制器输入参数类型
 */
export type ThreadActivationControllerInput = {
  /** 当前活动的分屏视图 */
  activeSplitView: SplitView | null;
  /** 清除选择状态的回调 */
  clearSelection: () => void;
  /** 导航函数 */
  navigate: Navigate;
  /** 打开聊天线程页面的回调 */
  openChatThreadPage: (threadId: ThreadId) => void;
  /** 打开侧聊分屏的回调 */
  openSidechatSplit: (input: {
    sidechatThreadId: ThreadId;
    sourceThreadId: ThreadId;
    ownerProjectId: ProjectId;
  }) => SplitViewId;
  /** 打开终端线程页面的回调 */
  openTerminalThreadPage: (threadId: ThreadId) => void;
  /** 预热线程详情的回调 */
  prewarmThreadDetailForIntent: (threadId: ThreadId) => void;
  /** 立即记录最后线程路由的回调 */
  rememberLastThreadRouteNow: (nextLastThreadRoute: LastThreadRoute) => void;
  /** 路由中的分屏视图 ID */
  routeSplitViewId: string | null | undefined;
  /** 路由中的线程 ID */
  routeThreadId: ThreadId | null | undefined;
  /** 已选中的线程数量 */
  selectedThreadCount: number;
  /** 设置乐观激活线程 ID 的回调 */
  setOptimisticActiveThreadId: (threadId: ThreadId) => void;
  /** 设置选择锚点的回调 */
  setSelectionAnchor: (threadId: ThreadId) => void;
  /** 设置分屏聚焦面板的回调 */
  setSplitFocusedPane: (splitViewId: SplitViewId, paneId: PaneId) => void;
  /** 侧边栏线程摘要映射 */
  sidebarThreadSummaryById: Readonly<Partial<Record<ThreadId, SidebarThreadActivationSummary>>>;
  /** 分屏视图映射 */
  splitViewsById: Record<SplitViewId, SplitView | undefined>;
  /** 线程终端状态映射 */
  terminalStateByThreadId: ThreadTerminalStateById;
};

/**
 * 从侧边栏意图激活线程
 *
 * @description
 * 执行完整的侧边栏激活副作用链，处理单个线程的激活意图。
 * 根据当前状态解析最佳的分屏位置，然后执行相应的激活操作。
 *
 * @param input - 线程激活控制器输入参数
 * @param threadId - 要激活的线程 ID
 */
export function activateThreadFromSidebarIntent(
  input: ThreadActivationControllerInput,
  threadId: ThreadId,
): void {
  const {
    activeSplitView,
    clearSelection,
    navigate,
    openChatThreadPage: _openChatThreadPage,
    openTerminalThreadPage: _openTerminalThreadPage,
    prewarmThreadDetailForIntent,
    rememberLastThreadRouteNow,
    routeSplitViewId,
    routeThreadId,
    selectedThreadCount,
    setOptimisticActiveThreadId,
    setSelectionAnchor,
    setSplitFocusedPane,
    sidebarThreadSummaryById,
    splitViewsById,
    terminalStateByThreadId: _terminalStateByThreadId,
  } = input;

  // 活动分屏优先；否则每个持久化的分屏都可以确定性地恢复
  const preferredSplit = resolvePreferredSplitForCommand({
    activeSplitView,
    splitViewsById,
    threadId,
  });
  const targetThread = sidebarThreadSummaryById[threadId];
  const activation = resolveThreadCommandActivation({
    threadId,
    threadExists: targetThread !== undefined,
    activeSidebarThreadId: routeThreadId,
    preferredSplitViewId: preferredSplit?.splitViewId ?? null,
    splitPaneId: preferredSplit?.paneId ?? null,
  });

  // 处理侧聊分屏激活
  const sidechatSplitActivation = resolveSidechatSplitActivation(input, {
    threadId,
    targetThread,
  });
  if (sidechatSplitActivation && activation.kind !== "split") {
    activateSidechatSplit(input, sidechatSplitActivation);
    return;
  }

  // 忽略操作
  if (activation.kind === "ignore") {
    return;
  }

  // 单线程激活
  if (activation.kind === "single") {
    activateThreadSingle(input, activation.threadId);
    return;
  }

  // 如果目标线程已经在当前路由中，无需重复导航
  if (routeThreadId === activation.threadId && routeSplitViewId === activation.splitViewId) {
    return;
  }

  // 执行激活操作
  prewarmThreadDetailForIntent(activation.threadId);
  setOptimisticActiveThreadId(activation.threadId);
  if (selectedThreadCount > 0) {
    clearSelection();
  }
  setSelectionAnchor(activation.threadId);
  setSplitFocusedPane(activation.splitViewId, activation.paneId);
  rememberLastThreadRouteNow({
    threadId: activation.threadId,
    splitViewId: activation.splitViewId,
  });
  void navigate({
    to: "/$threadId",
    params: { threadId: activation.threadId },
    search: (previous) => ({
      ...previous,
      splitViewId: activation.splitViewId,
    }),
  });
}

/**
 * 解析侧聊分屏激活意图
 *
 * @param input - 线程激活控制器输入参数
 * @param options - 解析选项
 * @param options.threadId - 目标线程 ID
 * @param options.targetThread - 目标线程摘要
 * @returns 侧聊分屏激活参数，如果不需要侧聊则返回 null
 */
function resolveSidechatSplitActivation(
  input: ThreadActivationControllerInput,
  options: {
    threadId: ThreadId;
    targetThread: SidebarThreadActivationSummary | undefined;
  },
): { threadId: ThreadId; sourceThreadId: ThreadId; ownerProjectId: ProjectId } | null {
  // 没有源线程 ID 时不需要侧聊
  if (!options.targetThread?.sidechatSourceThreadId) {
    return null;
  }
  const sourceThread = input.sidebarThreadSummaryById[options.targetThread.sidechatSourceThreadId];
  // 如果没有找到源线程或已有分屏路由，则不需要侧聊
  if (!sourceThread || input.routeSplitViewId) {
    return null;
  }
  return {
    threadId: options.threadId,
    sourceThreadId: options.targetThread.sidechatSourceThreadId,
    ownerProjectId: sourceThread.projectId,
  };
}

/**
 * 激活侧聊分屏
 *
 * @description
 * 侧聊行在没有活动分屏路由时重新打开为"源线程左侧 + 侧聊右侧"的布局。
 *
 * @param input - 线程激活控制器输入参数
 * @param activation - 侧聊分屏激活参数
 */
function activateSidechatSplit(
  input: ThreadActivationControllerInput,
  activation: {
    threadId: ThreadId;
    sourceThreadId: ThreadId;
    ownerProjectId: ProjectId;
  },
): void {
  input.prewarmThreadDetailForIntent(activation.sourceThreadId);
  input.prewarmThreadDetailForIntent(activation.threadId);
  input.setOptimisticActiveThreadId(activation.threadId);
  if (input.selectedThreadCount > 0) {
    input.clearSelection();
  }
  input.setSelectionAnchor(activation.threadId);

  // 创建侧聊分屏
  const splitViewId = input.openSidechatSplit({
    sourceThreadId: activation.sourceThreadId,
    ownerProjectId: activation.ownerProjectId,
    sidechatThreadId: activation.threadId,
  });
  input.rememberLastThreadRouteNow({
    threadId: activation.threadId,
    splitViewId,
  });
  void input.navigate({
    to: "/$threadId",
    params: { threadId: activation.threadId },
    search: (previous) => ({
      ...previous,
      splitViewId,
    }),
  });
}

/**
 * 激活单个线程
 *
 * @description
 * 将目标作为单个聊天打开，同时保留聊天 vs 终端的入口点。
 *
 * @param input - 线程激活控制器输入参数
 * @param threadId - 要激活的线程 ID
 */
function activateThreadSingle(input: ThreadActivationControllerInput, threadId: ThreadId): void {
  if (!input.sidebarThreadSummaryById[threadId]) return;

  input.prewarmThreadDetailForIntent(threadId);
  input.setOptimisticActiveThreadId(threadId);
  if (input.selectedThreadCount > 0) {
    input.clearSelection();
  }
  input.setSelectionAnchor(threadId);

  // 根据入口点决定打开聊天还是终端页面
  const threadEntryPoint = selectThreadTerminalState(
    input.terminalStateByThreadId,
    threadId,
  ).entryPoint;
  if (threadEntryPoint === "terminal") {
    input.openTerminalThreadPage(threadId);
  } else {
    input.openChatThreadPage(threadId);
  }

  void input.navigate({
    to: "/$threadId",
    params: { threadId },
    search: (previous) => ({
      ...previous,
      splitViewId: undefined,
    }),
  });
}

/**
 * 线程激活控制器 Hook
 *
 * @description
 * 提供线程激活功能，集中管理侧边栏线程激活相关的副作用逻辑。
 * 根据激活策略解析最佳的分屏位置，并执行相应的 UI 更新和路由跳转。
 *
 * @param input - 线程激活控制器输入参数
 * @returns 包含 activateThreadFromSidebarIntent 方法的对象
 */
export function useThreadActivationController(input: ThreadActivationControllerInput): {
  /** 从侧边栏意图激活线程 */
  activateThreadFromSidebarIntent: (threadId: ThreadId) => void;
} {
  const {
    activeSplitView,
    clearSelection,
    navigate,
    openChatThreadPage,
    openSidechatSplit,
    openTerminalThreadPage,
    prewarmThreadDetailForIntent,
    rememberLastThreadRouteNow,
    routeSplitViewId,
    routeThreadId,
    selectedThreadCount,
    setOptimisticActiveThreadId,
    setSelectionAnchor,
    setSplitFocusedPane,
    sidebarThreadSummaryById,
    splitViewsById,
    terminalStateByThreadId,
  } = input;

  const activateThread = useCallback(
    (threadId: ThreadId) => {
      activateThreadFromSidebarIntent(
        {
          activeSplitView,
          clearSelection,
          navigate,
          openChatThreadPage,
          openSidechatSplit,
          openTerminalThreadPage,
          prewarmThreadDetailForIntent,
          rememberLastThreadRouteNow,
          routeSplitViewId,
          routeThreadId,
          selectedThreadCount,
          setOptimisticActiveThreadId,
          setSelectionAnchor,
          setSplitFocusedPane,
          sidebarThreadSummaryById,
          splitViewsById,
          terminalStateByThreadId,
        },
        threadId,
      );
    },
    [
      activeSplitView,
      clearSelection,
      navigate,
      openChatThreadPage,
      openSidechatSplit,
      openTerminalThreadPage,
      prewarmThreadDetailForIntent,
      rememberLastThreadRouteNow,
      routeSplitViewId,
      routeThreadId,
      selectedThreadCount,
      setOptimisticActiveThreadId,
      setSelectionAnchor,
      setSplitFocusedPane,
      sidebarThreadSummaryById,
      splitViewsById,
      terminalStateByThreadId,
    ],
  );

  return { activateThreadFromSidebarIntent: activateThread };
}
