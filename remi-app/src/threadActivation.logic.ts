/**
 * @file threadActivation.logic.ts
 * 线程激活的纯路由决策模块�? *
 * 负责决定侧边栏点击、键盘快捷键、搜索等操作打开线程时，
 * 应以单聊模式还是分屏面板模式呈现。导出分屏感知的激活解析器�? * 供侧边栏点击、键盘导航和搜索流程共享使用�? */

import type { ThreadId } from "~/contracts";
import {
  resolveSplitViewPaneIdForThread,
  type PaneId,
  type SplitView,
  type SplitViewId,
} from "./splitViewStore";

/**
 * 线程命令激活结果类型�? *
 * 描述侧边�?搜索/键盘激活线程时应执行的操作�? * - `ignore`：忽略激活（线程不存在或已是当前活跃线程�? * - `single`：以单聊模式打开线程
 * - `split`：在分屏面板中打开线程
 */
export type ThreadCommandActivation =
  | { kind: "ignore" }
  | { kind: "single"; threadId: ThreadId }
  | { kind: "split"; threadId: ThreadId; splitViewId: SplitViewId; paneId: PaneId };

/**
 * 解析侧边�?搜索/键盘激活线程时应执行的操作�? *
 * 调用方决定哪个分屏（如果有）�?首�?的。首选顺序为�? * 当前活跃的分屏优先，其次按确定性归属规则查找持久化的分屏�? *
 * 决策逻辑�? * 1. 线程不存�?�?忽略
 * 2. 线程有首选分屏和面板 �?分屏模式
 * 3. 线程已是当前侧边栏活跃线�?�?忽略（避免重复激活）
 * 4. 其他情况 �?单聊模式
 *
 * @param input - 激活参�? * @param input.threadId - 要激活的线程 ID
 * @param input.threadExists - 线程是否存在
 * @param input.activeSidebarThreadId - 当前侧边栏活跃线�?ID
 * @param input.preferredSplitViewId - 首选分屏视�?ID
 * @param input.splitPaneId - 首选面�?ID
 * @returns 激活结果，包含操作类型和相关信�? *
 * @example
 * // 线程不存在时忽略
 * resolveThreadCommandActivation({ threadId: "t1", threadExists: false, ... })
 * // �?{ kind: "ignore" }
 *
 * @example
 * // 线程在分屏中时返回分屏激�? * resolveThreadCommandActivation({
 *   threadId: "t1", threadExists: true,
 *   preferredSplitViewId: "sv1", splitPaneId: "p1", ...
 * })
 * // �?{ kind: "split", threadId: "t1", splitViewId: "sv1", paneId: "p1" }
 */
export function resolveThreadCommandActivation(input: {
  threadId: ThreadId;
  threadExists: boolean;
  activeSidebarThreadId: ThreadId | null | undefined;
  preferredSplitViewId: SplitViewId | null;
  splitPaneId: PaneId | null;
}): ThreadCommandActivation {
  // 线程不存在时忽略激�?  if (!input.threadExists) {
    return { kind: "ignore" };
  }

  // 有首选分屏和面板时，以分屏模式激�?  if (input.preferredSplitViewId && input.splitPaneId) {
    return {
      kind: "split",
      threadId: input.threadId,
      splitViewId: input.preferredSplitViewId,
      paneId: input.splitPaneId,
    };
  }

  // 线程已是当前侧边栏活跃线程时忽略，避免重复激�?  if (input.threadId === input.activeSidebarThreadId) {
    return { kind: "ignore" };
  }

  // 默认以单聊模式激�?  return { kind: "single", threadId: input.threadId };
}

/**
 * 解析线程激活时应落入哪个分屏面板�? *
 * 当存在活跃分屏时，优先在该分屏中查找线程对应的面板；
 * 否则遍历所有持久化的分屏视图，按确定性归属规则查找：
 * 优先匹配源线程，若非源线程且存在多个匹配则回退到单聊模式，
 * 避免按最近使用猜测导致不确定性�? *
 * @param input - 查找参数
 * @param input.activeSplitView - 当前活跃的分屏视图，无活跃分屏时�?null
 * @param input.splitViewsById - 所有分屏视图的映射�? * @param input.threadId - 要查找的线程 ID
 * @returns 匹配的分屏视�?ID 和面�?ID，未找到时返�?null
 */
export function resolvePreferredSplitForCommand(input: {
  activeSplitView: SplitView | null;
  splitViewsById: Record<SplitViewId, SplitView | undefined>;
  threadId: ThreadId;
}): { splitViewId: SplitViewId; paneId: PaneId } | null {
  if (input.activeSplitView) {
    // 活跃分屏优先：如果线程在当前活跃的分屏中，直接返回对应面�?    const paneId = resolveSplitViewPaneIdForThread(input.activeSplitView, input.threadId);
    if (paneId) {
      return { splitViewId: input.activeSplitView.id, paneId };
    }
  }

  // 遍历所有持久化分屏，收集包含该线程的分屏及面板信息
  const matchingSplits = Object.values(input.splitViewsById)
    .filter((splitView): splitView is SplitView => splitView !== undefined)
    .map((splitView) => ({
      splitView,
      paneId: resolveSplitViewPaneIdForThread(splitView, input.threadId),
    }))
    .filter((match): match is { splitView: SplitView; paneId: PaneId } => match.paneId !== null);

  // 优先匹配源线程归属；若非源线程且存在多个匹配则放弃，避免不确定�?  const sourceMatch = matchingSplits.find(
    ({ splitView }) => splitView.sourceThreadId === input.threadId,
  );
  const match = sourceMatch ?? (matchingSplits.length === 1 ? matchingSplits[0] : null);
  return match ? { splitViewId: match.splitView.id, paneId: match.paneId } : null;
}
