// Transport connection status banner. Mirrors the
// `ConnectionStatusBanner` that lived in
// `apps/web/src/components/ConnectionStatusBanner.tsx` in the
// original Peak Code web app, but consumes the new lightweight
// `useTransportState` / `useTransportHealth` hooks.

import { useTransportHealth, useTransportState } from "@/hooks/useTransport";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export function TransportStatusBanner() {
  const state = useTransportState();
  const health = useTransportHealth();

  // Wait one frame before showing "disconnected" so we don't flash
  // the banner during a fast reconnect.
  const [showStale, setShowStale] = useState(false);
  useEffect(() => {
    if (state === "open" || state === "idle") {
      setShowStale(false);
      return;
    }
    const t = setTimeout(() => setShowStale(true), 800);
    return () => clearTimeout(t);
  }, [state]);

  if (state === "open" || state === "idle") return null;
  if (!showStale) return null;

  const isError = state === "closed" || state === "disposed";

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border-b px-3 py-1.5 text-xs",
        isError
          ? "border-red-500/40 bg-red-500/10 text-red-300"
          : "border-amber-500/40 bg-amber-500/10 text-amber-200",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
        <span className="truncate">
          {state === "reconnecting" && health.reconnectAttempts > 0
            ? `Reconnecting (attempt ${health.reconnectAttempts})…`
            : state === "connecting"
              ? "Connecting to server…"
              : state === "reconnecting"
                ? "Reconnecting…"
                : state === "disposed"
                  ? "Transport disposed"
                  : "Disconnected from server"}
        </span>
        {health.url ? (
          <span className="truncate text-foreground/60">{health.url}</span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {health.latencyMs != null ? (
          <span className="text-foreground/60">{health.latencyMs}ms</span>
        ) : null}
        <button
          className="rounded border border-current/30 px-2 py-0.5 text-[10px] hover:bg-current/10"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    </div>
  );
}
