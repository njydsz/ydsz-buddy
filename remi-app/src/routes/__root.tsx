import { Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAppStore } from "@/store";
import { APP_DISPLAY_NAME } from "@/lib/branding";
import { isTauri } from "@/lib/env";
import { EventRouter } from "@/components/EventRouter";
import { ThemeProvider } from "@/hooks/useTheme";

export function RootRouteView() {
  const serverReady = useAppStore((s) => s.serverReady);
  const transport = useAppStore((s) => s.transport);

  useEffect(() => {
    // Apply the document title once on mount — the React router will
    // keep it updated through `meta` entries in the future.
    document.title = APP_DISPLAY_NAME;
  }, []);

  if (!serverReady) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">
          Connecting to {APP_DISPLAY_NAME} server…
        </p>
      </div>
    );
  }

  if (transport === "closed" || transport === "disposed") {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">
          Reconnecting to {APP_DISPLAY_NAME} server…
        </p>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <EventRouter />
      <Outlet />
      <div className="fixed bottom-2 right-2 text-[10px] text-muted-foreground/40">
        {isTauri ? "Tauri" : "Web"} · v{APP_DISPLAY_NAME}
      </div>
    </ThemeProvider>
  );
}
