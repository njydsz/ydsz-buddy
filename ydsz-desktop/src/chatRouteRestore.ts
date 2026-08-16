/**
 * @file 聊天路由恢复
 * @description 在应用启动或侧边栏导航时，验证已保存的聊天路由是否仍然有效，
 * 并在可用线程集合中解析出可安全恢复的路由信息。
 */

/**
 * 上次访问的线程路由信息
 *
 * @description 记录用户最后访问的线程 ID 及可选的分屏视图 ID，
 * 用于在应用启动时恢复到上次的聊天位置。
 */
export type LastThreadRoute = {
  /** 线程 ID */
  threadId: string;
  /** 分屏视图 ID，可选 */
  splitViewId?: string | undefined;
};

/**
 * 解析可恢复的线程路由
 *
 * @description 根据当前可用的线程和分屏视图集合，验证上次路由是否仍然有效。
 * 若线程不存在则返回 null；若分屏视图不存在则降级为仅线程路由。
 *
 * @param input - 输入参数
 * @param input.lastThreadRoute - 上次保存的路由信息，为 null 时直接返回 null
 * @param input.availableThreadIds - 当前可用的线程 ID 集合
 * @param input.availableSplitViewIds - 当前可用的分屏视图 ID 集合，可选
 * @returns 验证后的可恢复路由，若不可恢复则返回 null
 *
 * @example
 * ```ts
 * // 线程存在且分屏视图也存在 → 完整恢复
 * resolveRestorableThreadRoute({
 *   lastThreadRoute: { threadId: "t1", splitViewId: "s1" },
 *   availableThreadIds: new Set(["t1"]),
 *   availableSplitViewIds: new Set(["s1"]),
 * }); // => { threadId: "t1", splitViewId: "s1" }
 *
 * // 线程存在但分屏视图不存在 → 降级恢复
 * resolveRestorableThreadRoute({
 *   lastThreadRoute: { threadId: "t1", splitViewId: "s1" },
 *   availableThreadIds: new Set(["t1"]),
 *   availableSplitViewIds: new Set(["s2"]),
 * }); // => { threadId: "t1" }
 *
 * // 线程不存在 → 不可恢复
 * resolveRestorableThreadRoute({
 *   lastThreadRoute: { threadId: "t1" },
 *   availableThreadIds: new Set(["t2"]),
 * }); // => null
 * ```
 */
export function resolveRestorableThreadRoute(input: {
  lastThreadRoute: LastThreadRoute | null;
  availableThreadIds: ReadonlySet<string>;
  availableSplitViewIds?: ReadonlySet<string>;
}): LastThreadRoute | null {
  const { lastThreadRoute, availableThreadIds, availableSplitViewIds } = input;
  if (!lastThreadRoute) {
    return null;
  }

  if (!availableThreadIds.has(lastThreadRoute.threadId)) {
    return null;
  }

  // 分屏视图已不可用，降级为仅线程路由
  if (
    lastThreadRoute.splitViewId &&
    availableSplitViewIds &&
    !availableSplitViewIds.has(lastThreadRoute.splitViewId)
  ) {
    return { threadId: lastThreadRoute.threadId };
  }

  return lastThreadRoute;
}
