export type PluginsTab = "plugins" | "skills";

export interface PluginsRouteSearch {
  tab?: PluginsTab;
}

function normalizeTab(value: unknown): PluginsTab | undefined {
  return value === "skills" ? "skills" : value === "plugins" ? "plugins" : undefined;
}

export function parsePluginsRouteSearch(search: Record<string, unknown>): PluginsRouteSearch {
  const tab = normalizeTab(search.tab);
  return {
    ...(tab ? { tab } : {}),
  };
}
