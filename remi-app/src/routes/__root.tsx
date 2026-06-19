import { Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAppStore } from "@/store";
import { APP_DISPLAY_NAME, APP_VERSION, isTauri } from "@/lib/branding";
import { EventRouter } from "@/components/EventRouter";
import { ThemeProvider } from "@/hooks/useTheme";
import { useLogBridge } from "@/hooks/useLogBridge";
import { useTransportState } from "@/hooks/useTransport";
import { useLanguage } from "@/i18n";
import { LogPanel } from "@/components/LogPanel";
import { TransportStatusBanner } from "@/components/TransportStatusBanner";
import { log } from "@/lib/logger";

export function RootRouteView() {
  useLogBridge();
  const serverReady = useAppStore((s) => s.serverReady);
  const transport = useTransportState();
  const [language, setLanguage] = useLanguage();

  useEffect(() => {
    document.title = APP_DISPLAY_NAME;
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (serverReady && transport === "open") {
      log.debug("transport ready", { language, version: APP_VERSION });
    }
  }, [serverReady, transport, language]);

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
      <LogPanel />
      <div className="pointer-events-none fixed bottom-2 right-2 z-30 text-[10px] text-muted-foreground/40">
        <span className="pointer-events-auto">
          <select
            value={language}
            onChange={(e) =>
              setLanguage(e.target.value as "en" | "zh-CN")
            }
            className="rounded border border-border/40 bg-card/60 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
            aria-label="Language"
          >
            <option value="en">EN</option>
            <option value="zh-CN">中文</option>
          </select>
        </span>
        <span className="ml-2">{isTauri ? "Tauri" : "Web"}</span>
      </div>
    </ThemeProvider>
  );
}

// Re-export the banner so the chat layout can include it.
export { TransportStatusBanner };
