/**
 * @file splitViewRoute.ts
 * @description 分屏视图路由桥接模块�? * 连接路由搜索参数与分屏视图状态，使路由消费者可以专注于 UI 逻辑�? * 为聊天界面、侧边栏和线程级 UI 提供共享的路由辅助函数�? */

import { type ThreadId } from "~/contracts";
import { type DiffRouteSearch } from "./diffRouteSearch";
import {
  resolveSplitViewFocusedThreadId,
  resolveSplitViewPaneIdForThread,
  type PaneId,
  type SplitView,
} from "./splitViewStore";

/**
 * 解析当前活跃的分屏视图及其聚焦线程和路由面板 ID�? * 如果没有分屏视图，聚焦线程回退到路由线�?ID�? *
 * @param input.splitView - 当前分屏视图，无分屏时为 null
 * @param input.routeThreadId - 路由中的线程 ID
 * @returns 包含分屏视图、聚焦线�?ID 和路由面�?ID 的对�? */
export function resolveActiveSplitView(input: {
  splitView: SplitView | null;
  routeThreadId: ThreadId | null;
}): {
  splitView: SplitView | null;
  focusedThreadId: ThreadId | null;
  routePaneId: PaneId | null;
} {
  const { routeThreadId, splitView } = input;
  if (!splitView) {
    return {
      splitView: null,
      focusedThreadId: routeThreadId,
      routePaneId: null,
    };
  }

  return {
    splitView,
    focusedThreadId: resolveSplitViewFocusedThreadId(splitView),
    routePaneId: resolveSplitViewPaneIdForThread(splitView, routeThreadId),
  };
}

/**
 * 判断路由搜索参数是否表示分屏路由
 *
 * @param search - 路由搜索参数
 * @returns 是否为分屏路�? */
export function isSplitRoute(search: DiffRouteSearch): boolean {
  return typeof search.splitViewId === "string" && search.splitViewId.length > 0;
}
