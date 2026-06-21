// FILE: SidebarHeaderNavigationControls.tsx
// Purpose: Keeps the collapsed-sidebar trigger and desktop route arrows in one header cluster.
// Layer: Shared web shell chrome
// Depends on: Sidebar state plus AppNavigationButtons

import { AppNavigationButtons } from "./AppNavigationButtons";
import { SidebarHeaderTrigger, useSidebar } from "./ui/sidebar";
import { isDesktop } from "~/env";

function RemiCodeWordmark() {
  return (
    <span aria-label="Remi Code" className="shrink-0 text-[14px] font-semibold text-foreground">
      Remi
    </span>
  );
}

export function SidebarHeaderNavigationControls() {
  const { isMobile, open } = useSidebar();
  const triggerVisible = isMobile || !open;

  if (!triggerVisible) {
    return null;
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      {isDesktop && !open && (
        <div className="flex min-w-0 items-center gap-1">
          <RemiCodeWordmark />
          <span className="truncate text-[14px] font-semibold text-foreground/89">Code</span>
        </div>
      )}
      <AppNavigationButtons className="ms-0" />
      <SidebarHeaderTrigger className="size-7 shrink-0" />
    </div>
  );
}
