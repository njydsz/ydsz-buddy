// FILE: PluginLibrary.tsx
// Purpose: Dispatches the /plugins route to either the PluginsView or the SkillsView
//          based on the `?tab=` URL search parameter. Each view owns its own layout;
//          they share the provider discovery data via useProviderDiscoveryData.
// Layer: Route dispatcher
// Exports: PluginLibrary

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
