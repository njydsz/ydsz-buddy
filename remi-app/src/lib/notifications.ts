// Server-pushed notification subscriptions. Each helper returns the
// `off` function for the underlying listener so callers can clean up
// in `useEffect` returns.

import type { RpcNotification } from "./wsTransport";
import { call, getTransportState } from "./wsTransport";

type Listener<T> = (payload: T) => void;
const subscribers = new Map<string, Set<Listener<unknown>>>();

function subscribe<T>(method: string, listener: Listener<T>): () => void {
  let bucket = subscribers.get(method);
  if (!bucket) {
    bucket = new Set();
    subscribers.set(method, bucket);
  }
  bucket.add(listener as Listener<unknown>);
  return () => {
    bucket?.delete(listener as Listener<unknown>);
  };
}

function dispatch(notification: RpcNotification) {
  const bucket = subscribers.get(notification.method);
  if (!bucket) return;
  for (const listener of bucket) {
    try {
      listener(notification.params);
    } catch (err) {
      console.warn(
        `[remi-app] notification listener for ${notification.method} threw`,
        err,
      );
    }
  }
}

// Hook the transport into our dispatcher. Called once from the
// bootstrap path.
let dispatchHooked = false;
export function ensureNotificationBridge() {
  if (dispatchHooked) return;
  dispatchHooked = true;
  // The transport module is the only place that receives push events.
  // We monkey-patch the singleton through a dynamic import so the
  // dependency graph stays acyclic.
  void import("./wsTransport").then((mod) => {
    const original = mod.startTransport;
    mod.startTransport = (options) => {
      return original({
        ...options,
        onNotification: (notification) => {
          dispatch(notification);
          options.onNotification?.(notification);
        },
      });
    };
  });
}

export function onServerWelcome(listener: Listener<unknown>): () => void {
  return subscribe("server.welcome", listener);
}

export function onServerConfigUpdated(listener: Listener<unknown>): () => void {
  return subscribe("server.config.updated", listener);
}

export function onServerProviderStatusesUpdated(
  listener: Listener<unknown>,
): () => void {
  return subscribe("server.providerStatuses.updated", listener);
}

export function onServerSettingsUpdated(listener: Listener<unknown>): () => void {
  return subscribe("server.settings.updated", listener);
}

export function onShellEvent(listener: Listener<unknown>): () => void {
  return subscribe("orchestration.shellEvent", listener);
}

export function onThreadEvent(listener: Listener<unknown>): () => void {
  return subscribe("orchestration.threadEvent", listener);
}

export function onTerminalEvent(listener: Listener<unknown>): () => void {
  return subscribe("terminal.event", listener);
}

export function isConnected(): boolean {
  return getTransportState() === "open";
}

// Re-export so call sites don't need to import from the transport
// module directly.
export { call };
