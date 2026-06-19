// Provider health summary bar. The Rust `remi-providers` registry
// reports each adapter's health through the `server.welcome` and
// `server.providerStatuses.updated` push events. This component
// turns that data into a slim status pill row at the top of the
// sidebar.

import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/lib/rpc";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export interface ProviderStatus {
  id: string;
  label: string;
  state: "ok" | "degraded" | "offline" | "unknown";
  message?: string;
}

interface Props {
  className?: string;
  /** Hide the bar when every provider is `ok`. */
  hideWhenHealthy?: boolean;
}

const STATE_COLORS: Record<ProviderStatus["state"], string> = {
  ok: "bg-emerald-500/80",
  degraded: "bg-amber-500/80",
  offline: "bg-red-500/80",
  unknown: "bg-muted-foreground/40",
};

const STATE_LABELS: Record<ProviderStatus["state"], string> = {
  ok: "Ready",
  degraded: "Degraded",
  offline: "Offline",
  unknown: "Unknown",
};

/**
 * Static renderer for the providers view. The full status (auth,
 * quota, model availability) is fetched from `system.providers`.
 * Falls back to a static list of known providers until the server
 * exposes the RPC.
 */
export function ProviderHealthBar({ className, hideWhenHealthy = true }: Props) {
  const [pushed, setPushed] = useState<ProviderStatus[]>([]);

  // Listen for `server.providerStatuses.updated` push events so the
  // bar reflects live health without polling.
  useEffect(() => {
    let mounted = true;
    void import("@/lib/notifications").then(({ onServerProviderStatusesUpdated }) => {
      if (!mounted) return;
      return onServerProviderStatusesUpdated((payload) => {
        if (
          payload &&
          typeof payload === "object" &&
          "providers" in (payload as Record<string, unknown>)
        ) {
          const list = (payload as { providers: ProviderStatus[] }).providers;
          setPushed(list);
        }
      });
    });
    return () => {
      mounted = false;
    };
  }, []);

  const fallback = useQuery({
    queryKey: ["providers", "static"],
    queryFn: async () => {
      try {
        // The full RPC call lives behind `provider.listCommands`
        // (M2), but we just need the static list of provider ids.
        const list = await rpc.providerListCommands("__all__").catch(() => []);
        return Array.isArray(list) ? list.map((c) => c.id) : [];
      } catch {
        return [];
      }
    },
    staleTime: 5 * 60_000,
  });

  const allHealthy = pushed.length > 0 && pushed.every((p) => p.state === "ok");
  if (hideWhenHealthy && allHealthy) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b border-border/60 bg-card/30 px-3 py-1.5 text-[10px] text-muted-foreground",
        className,
      )}
    >
      <span className="font-semibold uppercase tracking-wide text-foreground/70">
        Providers
      </span>
      {pushed.length === 0 ? (
        <span className="text-muted-foreground/60">
          {(fallback.data ?? []).length} configured
        </span>
      ) : (
        pushed.map((p) => (
          <span
            key={p.id}
            className="flex items-center gap-1 rounded-full bg-background/40 px-2 py-0.5"
            title={p.message ?? STATE_LABELS[p.state]}
          >
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                STATE_COLORS[p.state],
              )}
            />
            {p.label}
          </span>
        ))
      )}
    </div>
  );
}
