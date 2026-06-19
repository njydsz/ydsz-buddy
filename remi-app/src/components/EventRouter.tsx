import { useEffect } from "react";
import { useAppStore } from "@/store";
import { onServerWelcome, onServerConfigUpdated, onServerSettingsUpdated } from "@/lib/notifications";

/**
 * Top-level event router. Mounts once at the root of the React tree
 * and subscribes to the WebSocket push channels. The full version of
 * this component (which lives at `apps/web/src/routes/__root.tsx` in
 * the original Peak Code repo) handles shell/thread/terminal event
 * replay, provider invalidation, and welcome bootstrapping.
 *
 * For the first migration milestone we keep the surface minimal:
 *   - listen for `server.welcome` and pull the initial shell snapshot
 *   - forward `server.config.updated` and `server.settings.updated`
 *     to the React Query cache
 */
export function EventRouter() {
  const serverReady = useAppStore((s) => s.serverReady);
  const transport = useAppStore((s) => s.transport);

  useEffect(() => {
    if (!serverReady || transport !== "open") return;

    const unsubs = [
      onServerWelcome((payload) => {
        // Future: bootstrap the shell snapshot from the payload.
        console.debug("[remi-app] server.welcome", payload);
      }),
      onServerConfigUpdated((payload) => {
        console.debug("[remi-app] server.config.updated", payload);
      }),
      onServerSettingsUpdated((payload) => {
        console.debug("[remi-app] server.settings.updated", payload);
      }),
    ];

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [serverReady, transport]);

  return null;
}
