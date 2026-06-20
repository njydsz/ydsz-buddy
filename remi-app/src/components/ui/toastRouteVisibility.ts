/**
 * @file toastRouteVisibility
 * @description Toast 路由可见性解析工具，根据当前路由的活动线程和分屏状态，
 * 判断哪些线程的 Toast 应该在当前视图中显示。
 */

import type { ThreadId } from "~/contracts";
import { resolveSplitViewThreadIds, type SplitView } from "../../splitViewStore";

/**
 * 根据活动线程和分屏状态解析当前可见的 Toast 线程 ID 集合
 * @param input - 包含活动线程 ID 和分屏状态的输入对象
 * @returns 可见线程 ID 的只读集合
 */
export function resolveVisibleToastThreadIds(input: {
  activeThreadId: ThreadId | null;
  splitView: SplitView | null;
}): ReadonlySet<ThreadId> {
  if (input.splitView) {
    return new Set(resolveSplitViewThreadIds(input.splitView));
  }
  return input.activeThreadId ? new Set([input.activeThreadId]) : new Set<ThreadId>();
}

/**
 * 判断指定 Toast 是否应该在当前可见线程中渲染
 * @param input - 包含跨线程可见性标志、Toast 线程 ID 和可见线程集合的输入对象
 * @returns 是否应该渲染该 Toast
 */
export function shouldRenderToastForVisibleThreads(input: {
  allowCrossThreadVisibility?: boolean | undefined;
  toastThreadId?: ThreadId | null | undefined;
  visibleThreadIds: ReadonlySet<ThreadId>;
}): boolean {
  if (input.allowCrossThreadVisibility) {
    return true;
  }
  const toastThreadId = input.toastThreadId;
  if (!toastThreadId) {
    return true;
  }
  return input.visibleThreadIds.has(toastThreadId);
}
