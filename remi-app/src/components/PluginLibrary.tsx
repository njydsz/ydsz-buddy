// FILE: PluginLibrary.tsx
// Purpose: Dispatches the /plugins route to either the PluginsView or the SkillsView
//          based on the `?tab=` URL search parameter. Each view owns its own layout;
//          they share the provider discovery data via useProviderDiscoveryData.
// Layer: Route dispatcher
// Exports: PluginLibrary
/**
 * @file 插件库路由分派
 *
 * 把 `/plugins` 路由根据 `?tab=` 参数分派到 `PluginsView` 或 `SkillsView`：
 *
 * - `?tab=skills` → `SkillsView`
 * - 其他（含缺省）→ `PluginsView`
 *
 * ## 核心导出
 *
 * - `PluginLibrary`：路由分派组件
 *
 * ## 使用场景
 *
 * - 路由 `/plugins`
 *
 * ## 注意事项
 *
 * - 不持有任何 UI 状态，所有展示由子视图负责
 * - `useSearch` 使用 `strict: false` 避免在子路由上抛错
 */
import { useSearch } from "@tanstack/react-router";
import { PluginsView } from "./PluginsView";
import { SkillsView } from "./SkillsView";

export function PluginLibrary() {
  const routeSearch = useSearch({ strict: false }) as { tab?: "plugins" | "skills" };
  if (routeSearch.tab === "skills") {
    return <SkillsView />;
  }
  return <PluginsView />;
}
