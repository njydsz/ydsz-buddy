// Lightweight JSON-RPC over WebSocket client. This is the in-house
// replacement for the Effect-based `WsTransport` that lived in
// `apps/web/src/wsTransport.ts` — we want zero Effect dependencies
// in the migrated shell so the React tree stays easy to read and
// type-check. The protocol matches the contracts in
// `remi-contracts::rpc`.

import type { ServerInfo } from "./nativeApi";

export type TransportState = "connecting" | "open" | "closed" | "disposed";

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

export interface StartTransportOptions {
  /** Resolver for the server host/port — re-evaluated on reconnect. */
  getServerInfo: () => ServerInfo | null;
  /** State change callback. */
  onState: (state: TransportState) => void;
  /** Optional notification handler. */
  onNotification?: (notification: RpcNotification) => void;
  /** Optional welcome handler (server-pushed first event). */
  onWelcome?: (payload: unknown) => void;
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

let socket: WebSocket | null = null;
let nextId = 1;
const pending = new Map<number | string, Pending>();
let state: TransportState = "closed";
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let currentOptions: StartTransportOptions | null = null;

function setState(next: TransportState) {
  if (state === next) return;
  state = next;
  currentOptions?.onState(next);
}

function resolveWsUrl(info: ServerInfo | null): string | null {
  if (!info) return null;
  return `ws://${info.host}:${info.port}/ws`;
}

function flushPending(error: Error) {
  for (const [id, entry] of pending) {
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

function connect() {
  if (!currentOptions) return;
  const info = currentOptions.getServerInfo();
  const url = resolveWsUrl(info);
  if (!url) {
    scheduleReconnect();
    return;
  }

  setState("connecting");
  const ws = new WebSocket(url);
  socket = ws;

  ws.addEventListener("open", () => setState("open"));
  ws.addEventListener("close", () => {
    setState("closed");
    flushPending(new Error("WebSocket connection closed"));
    scheduleReconnect();
  });
  ws.addEventListener("error", () => {
    setState("closed");
  });
  ws.addEventListener("message", (event) => {
    const text =
      typeof event.data === "string"
        ? event.data
        : event.data instanceof Blob
          ? // Browser fallback — convert to text before parsing.
            ""
          : "";
    if (!text) return;
    try {
      const payload = JSON.parse(text) as RpcResponse | RpcNotification;
      if ("id" in payload) {
        const response = payload as RpcResponse;
        const entry = pending.get(response.id);
        if (!entry) return;
        pending.delete(response.id);
        if (response.error) {
          entry.reject(new Error(response.error.message));
        } else {
          entry.resolve(response.result);
        }
      } else {
        dispatchNotification(payload as RpcNotification);
      }
    } catch (err) {
      console.warn("[remi-app] failed to parse WS message", err);
    }
  });
}

function scheduleReconnect() {
  if (!currentOptions) return;
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 1_000);
}

export async function startTransport(options: StartTransportOptions): Promise<void> {
  currentOptions = options;
  connect();
}

export function stopTransport() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  socket?.close();
  socket = null;
  setState("disposed");
  currentOptions = null;
}

export function call<T = unknown>(method: string, params?: unknown): Promise<T> {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error(`WS not connected (method=${method})`));
  }
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: (v) => resolve(v as T), reject });
    const request: RpcRequest = { jsonrpc: "2.0", id, method, params };
    socket!.send(JSON.stringify(request));
  });
}

export function getTransportState(): TransportState {
  return state;
}
