// Lightweight JSON-RPC over WebSocket client. This is the in-house
// replacement for the Effect-based `WsTransport` that lived in
// `apps/web/src/wsTransport.ts` — we want zero Effect dependencies
// in the migrated shell so the React tree stays easy to read and
// type-check. The protocol matches the contracts in
// `remi-contracts::rpc`.
//
// Reliability features (added in M1):
//   * Exponential backoff with full jitter for reconnects
//   * A `health` snapshot including lastConnectedAt / reconnectCount
//   * A heartbeat ping (`system.ping`) that fails fast when the
//     socket is half-open
//   * Each outbound call is tagged with a deadline; stalled calls are
//     rejected once the deadline elapses
//   * A `subscribe` / `subscribeHealth` API for React hooks

import type { ServerInfo } from "./nativeApi";

export type TransportState =
  | "idle"
  | "connecting"
  | "open"
  | "closed"
  | "reconnecting"
  | "disposed";

export type RpcRequest = {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
};

export type RpcResponse = {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export type RpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
};

export interface TransportHealth {
  state: TransportState;
  lastConnectedAt: number | null;
  lastDisconnectedAt: number | null;
  reconnectAttempts: number;
  lastError: string | null;
  latencyMs: number | null;
  url: string | null;
}

export interface StartTransportOptions {
  /** Resolver for the server host/port — re-evaluated on reconnect. */
  getServerInfo: () => ServerInfo | null;
  /** State change callback. */
  onState: (state: TransportState) => void;
  /** Optional notification handler. */
  onNotification?: (notification: RpcNotification) => void;
  /** Optional welcome handler (server-pushed first event). */
  onWelcome?: (payload: unknown) => void;
  /** Optional health snapshot callback (fires on state change + heartbeat tick). */
  onHealth?: (health: TransportHealth) => void;
  /** Reconnect backoff configuration. */
  backoff?: Partial<BackoffConfig>;
  /** Heartbeat interval in ms; 0 disables. */
  heartbeatMs?: number;
  /** Default per-call deadline in ms. */
  callTimeoutMs?: number;
}

export interface BackoffConfig {
  initialMs: number;
  maxMs: number;
  multiplier: number;
  jitterRatio: number;
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
  sentAt: number;
};

const DEFAULT_BACKOFF: BackoffConfig = {
  initialMs: 500,
  maxMs: 15_000,
  multiplier: 1.7,
  jitterRatio: 0.3,
};

const DEFAULT_HEARTBEAT_MS = 15_000;
const DEFAULT_CALL_TIMEOUT_MS = 30_000;

let socket: WebSocket | null = null;
let nextId = 1;
const pending = new Map<number | string, Pending>();
let state: TransportState = "idle";
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let currentOptions: StartTransportOptions | null = null;
let health: TransportHealth = {
  state: "idle",
  lastConnectedAt: null,
  lastDisconnectedAt: null,
  reconnectAttempts: 0,
  lastError: null,
  latencyMs: null,
  url: null,
};
const stateListeners = new Set<(s: TransportState) => void>();
const healthListeners = new Set<(s: TransportHealth) => void>();

function getBackoff(): BackoffConfig {
  return { ...DEFAULT_BACKOFF, ...(currentOptions?.backoff ?? {}) };
}

function getHeartbeatMs(): number {
  return currentOptions?.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
}

function getCallTimeoutMs(): number {
  return currentOptions?.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
}

function emitHealth() {
  health = { ...health, state };
  currentOptions?.onHealth?.(health);
  for (const listener of healthListeners) listener(health);
}

function setState(next: TransportState) {
  if (state === next) return;
  state = next;
  currentOptions?.onState(next);
  emitHealth();
  for (const listener of stateListeners) listener(next);
}

function resolveWsUrl(info: ServerInfo | null): string | null {
  if (!info) return null;
  return `ws://${info.host}:${info.port}/ws`;
}

function flushPending(error: Error) {
  for (const [id, entry] of pending) {
    if (entry.timer) clearTimeout(entry.timer);
    entry.reject(error);
    pending.delete(id);
  }
}

function dispatchNotification(notification: RpcNotification) {
  if (notification.method === "server.welcome") {
    currentOptions?.onWelcome?.(notification.params);
    return;
  }
  currentOptions?.onNotification?.(notification);
}

function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function startHeartbeat() {
  if (heartbeatTimer) return;
  const interval = getHeartbeatMs();
  if (interval <= 0) return;
  heartbeatTimer = setInterval(async () => {
    if (state !== "open") return;
    try {
      const t0 = Date.now();
      // `system.ping` is a generic liveness RPC. The Rust side can
      // either no-op or echo back; we only care about the round trip.
      await call<unknown>("system.ping", undefined, { timeoutMs: 5_000 });
      health = { ...health, latencyMs: Date.now() - t0, lastError: null };
      emitHealth();
    } catch (err) {
      health = {
        ...health,
        lastError: err instanceof Error ? err.message : String(err),
      };
      emitHealth();
    }
  }, interval);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function connect() {
  if (!currentOptions) return;
  if (state === "connecting" || state === "open") return;
  const info = currentOptions.getServerInfo();
  const url = resolveWsUrl(info);
  if (!url) {
    health = { ...health, url: null };
    emitHealth();
    scheduleReconnect();
    return;
  }

  health = { ...health, url };
  setState("connecting");

  let ws: WebSocket;
  try {
    ws = new WebSocket(url);
  } catch (err) {
    health = {
      ...health,
      lastError: err instanceof Error ? err.message : String(err),
    };
    emitHealth();
    scheduleReconnect();
    return;
  }
  socket = ws;

  ws.addEventListener("open", () => {
    health = {
      ...health,
      lastConnectedAt: Date.now(),
      lastError: null,
      reconnectAttempts: 0,
    };
    setState("open");
    startHeartbeat();
  });

  ws.addEventListener("close", (event) => {
    stopHeartbeat();
    health = {
      ...health,
      lastDisconnectedAt: Date.now(),
      lastError:
        event && event.code !== 1000
          ? `WS closed (code=${event.code})`
          : health.lastError,
    };
    setState("closed");
    flushPending(new Error("WebSocket connection closed"));
    scheduleReconnect();
  });

  ws.addEventListener("error", () => {
    health = {
      ...health,
      lastError: "WebSocket error",
    };
    setState("closed");
  });

  ws.addEventListener("message", (event) => {
    if (typeof event.data === "string") {
      handleMessage(event.data);
      return;
    }
    if (event.data instanceof Blob) {
      void event.data.text().then((s) => {
        try {
          handleMessage(s);
        } catch (err) {
          console.warn("[remi-app] failed to handle blob frame", err);
        }
      });
      return;
    }
    // Other binary frame types are ignored for now.
  });
}

function handleMessage(text: string) {
  if (!text) return;
  let payload: RpcResponse | RpcNotification;
  try {
    payload = JSON.parse(text) as RpcResponse | RpcNotification;
  } catch (err) {
    console.warn("[remi-app] failed to parse WS message", err);
    return;
  }
  if ("id" in payload) {
    const response = payload as RpcResponse;
    const entry = pending.get(response.id);
    if (!entry) return;
    pending.delete(response.id);
    if (entry.timer) clearTimeout(entry.timer);
    if (response.error) {
      entry.reject(new Error(response.error.message));
    } else {
      entry.resolve(response.result);
    }
  } else {
    dispatchNotification(payload as RpcNotification);
  }
}

function scheduleReconnect() {
  if (!currentOptions) return;
  if (reconnectTimer) return;
  if (state === "disposed") return;
  const backoff = getBackoff();
  const attempt = health.reconnectAttempts;
  const base = Math.min(
    backoff.initialMs * Math.pow(backoff.multiplier, attempt),
    backoff.maxMs,
  );
  // Full jitter — the actual delay is uniform in [base*(1-j), base*(1+j)].
  const jitter = base * backoff.jitterRatio;
  const delay = base - jitter + Math.random() * 2 * jitter;
  setState("reconnecting");
  health = { ...health, reconnectAttempts: attempt + 1 };
  emitHealth();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, Math.max(0, delay));
}

export async function startTransport(
  options: StartTransportOptions,
): Promise<void> {
  // Allow re-start with a fresh options object — in practice this
  // happens when the server is restarted through the `restartServer`
  // IPC command.
  if (currentOptions) {
    stopHeartbeat();
    clearReconnect();
    if (socket) {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      socket = null;
    }
  }
  currentOptions = options;
  health = {
    state: "idle",
    lastConnectedAt: null,
    lastDisconnectedAt: null,
    reconnectAttempts: 0,
    lastError: null,
    latencyMs: null,
    url: null,
  };
  setState("idle");
  connect();
}

export function stopTransport() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  stopHeartbeat();
  if (socket) {
    try {
      socket.close();
    } catch {
      /* ignore */
    }
    socket = null;
  }
  flushPending(new Error("Transport stopped"));
  setState("disposed");
  currentOptions = null;
  health = {
    state: "disposed",
    lastConnectedAt: null,
    lastDisconnectedAt: null,
    reconnectAttempts: 0,
    lastError: null,
    latencyMs: null,
    url: null,
  };
}

export interface CallOptions {
  /** Per-call timeout in ms; defaults to the transport's callTimeoutMs. */
  timeoutMs?: number;
}

export function call<T = unknown>(
  method: string,
  params?: unknown,
  options: CallOptions = {},
): Promise<T> {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return Promise.reject(
      new Error(`WS not connected (state=${state}, method=${method})`),
    );
  }
  const id = nextId++;
  const timeoutMs = options.timeoutMs ?? getCallTimeoutMs();
  return new Promise<T>((resolve, reject) => {
    const entry: Pending = {
      resolve: (v) => resolve(v as T),
      reject,
      sentAt: Date.now(),
      timer: null,
    };
    if (timeoutMs > 0) {
      entry.timer = setTimeout(() => {
        pending.delete(id);
        reject(
          new Error(
            `RPC "${method}" timed out after ${timeoutMs}ms (id=${id})`,
          ),
        );
      }, timeoutMs);
    }
    pending.set(id, entry);
    const request: RpcRequest = { jsonrpc: "2.0", id, method, params };
    try {
      socket!.send(JSON.stringify(request));
    } catch (err) {
      pending.delete(id);
      if (entry.timer) clearTimeout(entry.timer);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export function getTransportState(): TransportState {
  return state;
}

export function getTransportHealth(): TransportHealth {
  return health;
}

/**
 * Synchronously subscribe to state changes. Returns an unsubscribe
 * function. Used by the `useTransport` hook in `hooks/useTransport`.
 */
export function subscribe(
  listener: (next: TransportState) => void,
): () => void {
  stateListeners.add(listener);
  // Fire the current value once so subscribers don't have to seed
  // their own state with `getTransportState()`.
  listener(state);
  return () => {
    stateListeners.delete(listener);
  };
}

/** Subscribe to transport health snapshots. */
export function subscribeHealth(
  listener: (snapshot: TransportHealth) => void,
): () => void {
  healthListeners.add(listener);
  listener(health);
  return () => {
    healthListeners.delete(listener);
  };
}
