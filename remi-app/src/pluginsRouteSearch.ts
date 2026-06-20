/**
 * @file 插件路由搜索参数模块
 * @description 定义和解析插件页面的路由搜索参数（tab 切换）。
 */

/** 插件页面的标签页类型 */
export type PluginsTab = "plugins" | "skills";

/**
 * 插件路由搜索参数
 * @property tab - 当前激活的标签页
 */
export interface PluginsRouteSearch {
  tab?: PluginsTab;
}

/**
 * 归一化标签页参数值
 * @param value - 原始参数值
 * @returns 归一化后的标签页类型，无效值返回 undefined
 */
function normalizeTab(value: unknown): PluginsTab | undefined {
  return value === "skills" ? "skills" : value === "plugins" ? "plugins" : undefined;
}

/**
 * 解析插件路由的搜索参数
 * @param search - 路由搜索参数对象
 * @returns 解析后的插件路由搜索参数
 */
export function parsePluginsRouteSearch(search: Record<string, unknown>): PluginsRouteSearch {
  const tab = normalizeTab(search.tab);
  return {
    ...(tab ? { tab } : {}),
  };
}
