// React hook wrapping the singleton WS transport. Components that
// need the current state (e.g. a "Reconnecting…" banner) can use
// `useTransportState()`; components that need the latency / error
// snapshot can use `useTransportHealth()`.

import { useSyncExternalStore } from "react";
import {
  getTransportHealth,
  getTransportState,
  subscribe,
  subscribeHealth,
  type TransportHealth,
  type TransportState,
} from "@/lib/wsTransport";

export function useTransportState(): TransportState {
  return useSyncExternalStore(
    (listener) => subscribe(listener),
    () => getTransportState(),
    () => "idle" as TransportState,
  );
}

export function useTransportHealth(): TransportHealth {
  return useSyncExternalStore(
    (listener) => subscribeHealth(listener),
    () => getTransportHealth(),
    () => getTransportHealth(),
  );
}

/** Convenience predicate: is the transport currently connected? */
export function useIsOnline(): boolean {
  return useTransportState() === "open";
}
