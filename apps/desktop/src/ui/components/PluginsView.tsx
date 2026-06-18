// FILE: PluginsView.tsx
// Purpose: Plugin browser surface for the /plugins route. Reads the same provider
//          discovery data as the SkillsView and renders the marketplace-grouped plugin
//          grid with a hero, search, and provider toolbar.
// Layer: Route-level screen
// Exports: PluginsView

import { useDeferredValue } from "react";
import { SearchIcon } from "~/lib/icons";
import { SidebarInset } from "./ui/sidebar";
import { SidebarHeaderNavigationControls } from "./SidebarHeaderNavigationControls";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "./ui/input-group";
import { Skeleton } from "./ui/skeleton";
import {
  EmptyPanel,
  InlineWarning,
  PluginGridItem,
  ProviderDiscoveryToolbar,
  SectionHeader,
  pluginEntryKey,
  sectionTitle,
} from "./PluginLibraryPresentation";
import { useProviderDiscoveryData } from "./useProviderDiscoveryData";

export function PluginsView() {
  const data = useProviderDiscoveryData("plugins");
  const deferredPluginSearch = useDeferredValue(data.pluginSearch);

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden isolate">
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 sm:px-6">
          <SidebarHeaderNavigationControls />
          <div className="flex-1" />
          <ProviderDiscoveryToolbar
            providerCapabilities={data.providerCapabilities}
            providerLabel={data.providerLabel}
            selectedProvider={data.selectedProvider}
            onSelectProvider={data.setSelectedProvider}
            onRequestTabSwitch={undefined}
            activeTab="plugins"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-6 py-10 text-center">
            <h1 className="text-[28px] font-semibold text-foreground">
              Make {data.providerLabel} work your way
            </h1>
          </div>

          <div className="mx-auto max-w-2xl px-6 pb-6">
            <InputGroup className="rounded-xl bg-background/70 shadow-xs">
              <InputGroupAddon>
                <InputGroupText>
                  <SearchIcon className="size-4 text-muted-foreground/60" />
                </InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                value={data.pluginSearch}
                onChange={(e) => data.setPluginSearch(e.target.value)}
                placeholder="Search plugins"
                className="text-sm"
              />
            </InputGroup>
          </div>

          {(!!data.pluginsQuery.data?.remoteSyncError ||
            (data.pluginsQuery.data?.marketplaceLoadErrors.length ?? 0) > 0) && (
            <div className="mx-auto max-w-2xl space-y-1.5 px-6 pb-4">
              {data.pluginsQuery.data?.remoteSyncError ? (
                <InlineWarning>{data.pluginsQuery.data.remoteSyncError}</InlineWarning>
              ) : null}
              {(data.pluginsQuery.data?.marketplaceLoadErrors.length ?? 0) > 0 ? (
                <InlineWarning>
                  {data.pluginsQuery.data?.marketplaceLoadErrors
                    .map((err) => `${sectionTitle(err.marketplacePath)}: ${err.message}`)
                    .join(" • ")}
                </InlineWarning>
              ) : null}
            </div>
          )}

          <div className="px-3 pb-10 sm:px-5">
            {!data.canListPlugins ? (
              <div className="mx-auto max-w-2xl">
                <EmptyPanel
                  title={`Plugins unavailable for ${data.providerLabel}`}
                  description="This provider does not expose plugin discovery."
                />
              </div>
            ) : data.pluginsQuery.isLoading && data.pluginEntries.length === 0 ? (
              <div className="space-y-1">
                {["1", "2", "3", "4", "5", "6"].map((k) => (
                  <Skeleton key={k} className="h-[68px] w-full rounded-xl" />
                ))}
              </div>
            ) : data.filteredPluginEntries.length === 0 ? (
              <EmptyPanel
                title="No installed plugins found"
                description="This view only shows plugins already available in your Codex setup."
              />
            ) : (
              <div className="space-y-6">
                {data.marketplaceSections.map((section) => (
                  <div key={section.key}>
                    <SectionHeader title={section.title} />
                    <div className="grid grid-cols-1 sm:grid-cols-2">
                      {section.entries.map((entry) => (
                        <PluginGridItem key={pluginEntryKey(entry)} entry={entry} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}
