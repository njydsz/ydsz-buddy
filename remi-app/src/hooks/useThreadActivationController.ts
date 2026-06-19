/**
 * @file useThreadActivationController.ts
 * @description 线程激活控制器 Hook - 集中管理侧边栏线程激活的副作用链
 * @module hooks/useThreadActivationController
 */

import { useCallback } from "react";
import type { useNavigate } from "@tanstack/react-router";
import type { ProjectId, ThreadId } from "@remi-code/contracts";
import type { LastThreadRoute } from "../chatRouteRestore";
import { type PaneId, type SplitView, type SplitViewId } from "../splitViewStore";
import { selectThreadTerminalState } from "../terminalStateStore";
import type { SidebarThreadSummary } from "../types";
import {
  resolvePreferredSplitForCommand,
  resolveThreadCommandActivation,
} from "../threadActivation.logic";

type Navigate = ReturnType<typeof useNavigate>;
type ThreadTerminalStateById = Parameters<typeof selectThreadTerminalState>[0];
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
  /** 清除当前选择 */
  clearSelection: () => void;
  /** 路由导航函数 */
  navigate: Navigate;
  /** 打开聊天线程页面 */
  openChatThreadPage: (threadId: ThreadId) => void;
  /** 打开侧边聊天分屏 */
  openSidechatSplit: (input: {
    sidechatThreadId: ThreadId;
    sourceThreadId: ThreadId;
    ownerProjectId: ProjectId;
  }) => SplitViewId;
  /** 打开终端线程页面 */
  openTerminalThreadPage: (threadId: ThreadId) => void;
  /** 预热线程详情（提前加载数据） */
  prewarmThreadDetailForIntent: (threadId: ThreadId) => void;
  /** 记住上一次的路由信息 */
  rememberLastThreadRouteNow: (nextLastThreadRoute: LastThreadRoute) => void;
  /** 路由中的分屏视图 ID */
  routeSplitViewId: string | null | undefined;
  /** 路由中的线程 ID */
  routeThreadId: ThreadId | null | undefined;
  /** 当前选中的线程数量 */
  selectedThreadCount: number;
  /** 乐观设置活动线程 ID */
  setOptimisticActiveThreadId: (threadId: ThreadId) => void;
  /** 设置选择锚点 */
  setSelectionAnchor: (threadId: ThreadId) => void;
  /** 设置分屏聚焦面板 */
  setSplitFocusedPane: (splitViewId: SplitViewId, paneId: PaneId) => void;
  /** 侧边栏线程摘要映射 */
  sidebarThreadSummaryById: Readonly<Partial<Record<ThreadId, SidebarThreadActivationSummary>>>;
  /** 分屏视图映射 */
  splitViewsById: Record<SplitViewId, SplitView | undefined>;
  /** 终端状态映射 */
  terminalStateByThreadId: ThreadTerminalStateById;
};

/**
 * 从侧边栏意图激活线程
 *
 * @description
 * 执行完整的侧边栏线程激活副作用链。处理逻辑：
 * 1. 确定首选分屏视图（活动分屏优先）
 * 2. 解析激活类型（忽略/单页/分屏）
 * 3. 处理侧边聊天的特殊分屏逻辑
 * 4. 执行导航和状态更新
 *
 * @param input - 控制器输入参数
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
    openChatThreadPage,
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

  // 活动分屏优先；否则每个持久化的分屏块都可以确定性地恢复
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

  // 检查是否为侧边聊天分屏激活
  const sidechatSplitActivation = resolveSidechatSplitActivation(input, {
    threadId,
    targetThread,
  });
  if (sidechatSplitActivation && activation.kind !== "split") {
    activateSidechatSplit(input, sidechatSplitActivation);
    return;
  }

  // 忽略该激活请求
  if (activation.kind === "ignore") {
    return;
  }

  // 单页激活模式
  if (activation.kind === "single") {
    activateThreadSingle(input, activation.threadId);
    return;
  }

  // 如果已经在目标位置，无需导航
  if (routeThreadId === activation.threadId && routeSplitViewId === activation.splitViewId) {
    return;
  }

  // 执行完整的激活流程
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
 * 解析侧边聊天分屏激活条件
 *
 * @description
 * 当目标线程是侧边聊天且有源线程，且当前没有分屏路由时，返回激活信息
 */
function resolveSidechatSplitActivation(
  input: ThreadActivationControllerInput,
  options: {
    threadId: ThreadId;
    targetThread: SidebarThreadActivationSummary | undefined;
  },
): { threadId: ThreadId; sourceThreadId: ThreadId; ownerProjectId: ProjectId } | null {
  if (!options.targetThread?.sidechatSourceThreadId) {
    return null;
  }
  const sourceThread = input.sidebarThreadSummaryById[options.targetThread.sidechatSourceThreadId];
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
 * 激活侧边聊天分屏
 *
 * @description
 * 当没有分屏路由激活时，侧边聊天行重新打开为"源线程在左 + 侧边聊天在右"的布局
 */
function activateSidechatSplit(
  input: ThreadActivationControllerInput,
  activation: {
    threadId: ThreadId;
    sourceThreadId: ThreadId;
    ownerProjectId: ProjectId;
  },
): void {
  // 预热两个线程的详情
  input.prewarmThreadDetailForIntent(activation.sourceThreadId);
  input.prewarmThreadDetailForIntent(activation.threadId);
  input.setOptimisticActiveThreadId(activation.threadId);
  if (input.selectedThreadCount > 0) {
    input.clearSelection();
  }
  input.setSelectionAnchor(activation.threadId);

  // 打开侧边聊天分屏
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
 * 以单页模式激活线程
 *
 * @description
 * 将目标作为单个聊天打开，同时保留聊天 vs 终端的入口点选择
 */
function activateThreadSingle(input: ThreadActivationControllerInput, threadId: ThreadId): void {
  if (!input.sidebarThreadSummaryById[threadId]) return;

  input.prewarmThreadDetailForIntent(threadId);
  input.setOptimisticActiveThreadId(threadId);
  if (input.selectedThreadCount > 0) {
    input.clearSelection();
  }
  input.setSelectionAnchor(threadId);

  // 根据入口点类型打开对应页面
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
 * 集中管理侧边栏线程激活的副作用链。
 * 将纯激活策略与 React 副作用绑定在一起。
 *
 * @param input - 控制器输入参数
 * @returns 包含激活方法的对象
 *
 * @example
 * ```tsx
 * const { activateThreadFromSidebarIntent } = useThreadActivationController({
 *   activeSplitView,
 *   navigate,
 *   // ... 其他参数
 * });
 *
 * // 激活某个线程
 * activateThreadFromSidebarIntent(threadId);
 * ```
 */
export function useThreadActivationController(input: ThreadActivationControllerInput): {
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
