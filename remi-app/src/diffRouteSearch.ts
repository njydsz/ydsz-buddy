/**
 * @file Diff 路由搜索参数处理
 *
 * 解析和管理聊天界面中与 Diff 视图相关的 URL 搜索参数。
 * 支持面板类型（浏览器/Diff）、Diff 开关、Diff 轮次 ID 和文件路径等参数的解析与清理。
 */

import { TurnId } from "@remi-code/contracts";

/** 聊天右侧面板类型 */
export type ChatRightPanel = "browser" | "diff";

/**
 * Diff 路由的搜索参数结构。
 * 对应 URL 中 diff 相关的查询参数。
 */
export interface DiffRouteSearch {
  /** 分屏视图 ID */
  splitViewId?: string | undefined;
  /** 面板类型：浏览器或 Diff */
  panel?: ChatRightPanel | undefined;
  /** Diff 是否打开，"1" 表示打开 */
  diff?: "1" | undefined;
  /** Diff 轮次 ID */
  diffTurnId?: TurnId | undefined;
  /** Diff 文件路径 */
  diffFilePath?: string | undefined;
}

/**
 * 判断值是否表示 Diff 打开状态。
 * 接受 "1"、数字 1 或布尔值 true。
 *
 * @param value - 待判断的值
 * @returns 是否表示 Diff 打开
 */
function isDiffOpenValue(value: unknown): boolean {
  return value === "1" || value === 1 || value === true;
}

/**
 * 标准化搜索参数中的字符串值，去除首尾空格，空字符串返回 undefined。
 *
 * @param value - 原始值
 * @returns 标准化后的字符串，无效时返回 undefined
 */
function normalizeSearchString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

/**
 * 从搜索参数中移除 Diff 相关的参数，保留其他参数不变。
 *
 * @param params - 原始搜索参数对象
 * @returns 去除 Diff 相关参数后的对象
 */
export function stripDiffSearchParams<T extends Record<string, unknown>>(
  params: T,
): Omit<T, "panel" | "diff" | "diffTurnId" | "diffFilePath"> {
  const {
    panel: _panel,
    diff: _diff,
    diffTurnId: _diffTurnId,
    diffFilePath: _diffFilePath,
    ...rest
  } = params;
  return rest as Omit<T, "panel" | "diff" | "diffTurnId" | "diffFilePath">;
}

/**
 * 解析 URL 搜索参数为 Diff 路由搜索对象。
 * 处理面板类型、Diff 开关、轮次 ID 和文件路径等参数的标准化和关联逻辑。
 *
 * @param search - URL 搜索参数对象
 * @returns 解析后的 DiffRouteSearch 对象
 */
export function parseDiffRouteSearch(search: Record<string, unknown>): DiffRouteSearch {
  const splitViewId = normalizeSearchString(search.splitViewId);
  const panelRaw = normalizeSearchString(search.panel);
  const panel: ChatRightPanel | undefined =
    panelRaw === "browser" ? "browser" : panelRaw === "diff" ? "diff" : undefined;
  const diff = panel === "diff" || isDiffOpenValue(search.diff) ? "1" : undefined;
  const resolvedPanel = panel ?? (diff ? "diff" : undefined);
  const diffTurnIdRaw = diff ? normalizeSearchString(search.diffTurnId) : undefined;
  const diffTurnId = diffTurnIdRaw ? TurnId.makeUnsafe(diffTurnIdRaw) : undefined;
  const diffFilePath = diff && diffTurnId ? normalizeSearchString(search.diffFilePath) : undefined;

  return {
    ...(splitViewId ? { splitViewId } : {}),
    ...(resolvedPanel ? { panel: resolvedPanel } : {}),
    ...(diff ? { diff } : {}),
    ...(diffTurnId ? { diffTurnId } : {}),
    ...(diffFilePath ? { diffFilePath } : {}),
  };
}
