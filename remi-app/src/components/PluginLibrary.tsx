/**
 * @file PluginLibrary.tsx
 * @description 插件/技能库路由分发器，根据 URL `?tab=` 参数
 *              在 PluginsView 和 SkillsView 之间切换渲染。
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
