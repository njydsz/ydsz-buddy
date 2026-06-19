import { Outlet } from "@tanstack/react-router";
import { Sidebar } from "@/components/Sidebar";
import { AppNavigationButtons } from "@/components/AppNavigationButtons";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

export function ChatLayout() {
  const isMobile = useIsMobile();
  return (
    <div
      className={cn(
        "flex h-screen w-screen overflow-hidden bg-background text-foreground",
        isMobile ? "flex-col" : "flex-row",
      )}
    >
      {!isMobile && <Sidebar />}
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <AppNavigationButtons />
        <div className="flex-1 overflow-hidden">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
