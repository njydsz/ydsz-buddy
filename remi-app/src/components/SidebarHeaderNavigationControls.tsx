// FILE: SidebarHeaderNavigationControls.tsx
// Purpose: Keeps the collapsed-sidebar trigger and desktop route arrows in one header cluster.
// Layer: Shared web shell chrome
// Depends on: Sidebar state plus AppNavigationButtons

import { AppNavigationButtons } from "./AppNavigationButtons";
import { SidebarHeaderTrigger, useSidebar } from "./ui/sidebar";
import { isDesktop } from "~/env";

function RemiCodeWordmark() {
  return (
    <img
      alt="Remi Code"
      className="size-5 shrink-0 rounded-[5px] object-cover"
      draggable={false}
      src="/remicode.png"
    />
  );
}

export function SidebarHeaderNavigationControls() {
  const { isMobile, open } = useSidebar();

  return (
    <div className="flex shrink-0 items-center gap-2">
      {isDesktop && !open && (
        <div className="flex min-w-0 items-center gap-1">
          <RemiCodeWordmark />
        </div>
      )}
      <AppNavigationButtons className="ms-0" />
      <SidebarHeaderTrigger className="size-7 shrink-0" />
    </div>
  );
}
