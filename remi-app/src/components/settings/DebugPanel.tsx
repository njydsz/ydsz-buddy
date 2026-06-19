// Debug panel. Toggles verbose logging, frame recording, and exposes
// a developer console. The actual frame ring buffer lives in
// `useLogBridge`; this panel controls its retention and verbosity.

import { useState } from "react";
import { useSettingsStore } from "@/store/settings";
import { useT } from "@/i18n";
import { LogPanel } from "@/components/LogPanel";
import { toast } from "@/lib/toast";

export function DebugPanel() {
  const t = useT();
  const debug = useSettingsStore((s) => s.debug);
  const setDebug = useSettingsStore((s) => s.setDebug);
  const logs = useLogBridge();
  const [showLogs, setShowLogs] = useState(false);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t("settings.debug.intro")}</p>

      <div className="space-y-2 rounded-md border border-border/60 bg-card/40 p-3">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={debug.verboseLogging}
            onChange={(e) => setDebug({ verboseLogging: e.target.checked })}
          />
          {t("settings.debug.verbose")}
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={debug.recordFrames}
            onChange={(e) => {
              setDebug({ recordFrames: e.target.checked });
              toast.info(
                e.target.checked
                  ? t("settings.debug.framesOn")
                  : t("settings.debug.framesOff"),
                { source: "settings" },
              );
            }}
          />
          {t("settings.debug.recordFrames")}
        </label>
        <label className="block text-[11px] text-muted-foreground">
          {t("settings.debug.maxFrames")}
          <input
            type="number"
            min={16}
            max={4096}
            step={16}
            className="mt-1 w-32 rounded-md border border-border bg-background px-2 py-1 text-xs"
            value={debug.maxFrames}
            onChange={(e) =>
              setDebug({ maxFrames: Math.max(16, Number(e.target.value) || 256) })
            }
          />
        </label>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          className="rounded-md border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground"
          onClick={() => setShowLogs((s) => !s)}
        >
          {showLogs ? t("settings.debug.hideLogs") : t("settings.debug.showLogs")}
        </button>
        <span className="text-[10px] text-muted-foreground">
          {t("settings.debug.logCount", { n: debug.maxFrames })}
        </span>
      </div>

      {showLogs ? <LogPanel /> : null}
    </div>
  );
}
