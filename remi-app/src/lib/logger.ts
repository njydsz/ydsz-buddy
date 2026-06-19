// Frontend observability bridge. Wires three concerns together:
//
//   1. Console capture (info / warn / error / debug) → so user
//      `console.log` calls show up in the same log stream.
//   2. Tauri log plugin events (`log://log`) → forwarded from Rust
//      `tracing` calls.
//   3. RPC error capture → the WS transport pushes any non-fatal
//      error through the toast store AND the log.
//
// The actual log target is a ring buffer that the `<LogPanel />` (a
// dev-only floating window) and the toast queue can read from.

import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";

import { pushToast } from "./toast";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  ts: number;
  level: LogLevel;
  source: "console" | "tauri" | "rpc" | "app";
  message: string;
  fields?: Record<string, unknown>;
}

const RING_LIMIT = 500;
let nextLogId = 1;
const ring: LogEntry[] = [];
const listeners = new Set<(entry: LogEntry) => void>();

export function recordLog(entry: Omit<LogEntry, "id" | "ts">) {
  const full: LogEntry = {
    id: `log_${nextLogId++}`,
    ts: Date.now(),
    ...entry,
  };
  ring.push(full);
  if (ring.length > RING_LIMIT) ring.shift();
  for (const listener of listeners) listener(full);

  // Auto-escalate to a toast for high-severity entries. The toast
  // store already deduplicates by id; we want loud visibility for
  // error / warn levels so users notice connection issues.
  if (entry.level === "error") {
    pushToast({
      variant: "error",
      title: entry.source === "tauri" ? "Server error" : "Error",
      message: entry.message,
      duration: 8_000,
      source: `log:${entry.source}`,
    });
  } else if (entry.level === "warn") {
    pushToast({
      variant: "warning",
      message: entry.message,
      source: `log:${entry.source}`,
      duration: 4_000,
    });
  }
}

export function getLogRing(): readonly LogEntry[] {
  return ring;
}

export function subscribeLog(listener: (entry: LogEntry) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Convenience loggers so the rest of the app can be terse. */
export const log = {
  trace: (message: string, fields?: Record<string, unknown>) =>
    recordLog({ level: "trace", source: "app", message, fields }),
  debug: (message: string, fields?: Record<string, unknown>) =>
    recordLog({ level: "debug", source: "app", message, fields }),
  info: (message: string, fields?: Record<string, unknown>) =>
    recordLog({ level: "info", source: "app", message, fields }),
  warn: (message: string, fields?: Record<string, unknown>) =>
    recordLog({ level: "warn", source: "app", message, fields }),
  error: (message: string, fields?: Record<string, unknown>) =>
    recordLog({ level: "error", source: "app", message, fields }),
};

let bridgeStarted = false;

/**
 * Idempotent — safe to call multiple times. Once mounted, this hook
 * keeps the global `console` / Tauri event / RPC error channels
 * routed into the log ring buffer.
 */
export function useLogBridge() {
  const installed = useRef(false);
  useEffect(() => {
    if (installed.current) return;
    installed.current = true;
    startLogBridge();
  }, []);
}

async function startLogBridge() {
  if (bridgeStarted) return;
  bridgeStarted = true;

  // 1. Tauri-side logs. The `tauri-plugin-log` plugin emits
  //    "log://log" events on the JS side. Each event payload is
  //    `[level, message, target, fields]` per the plugin docs.
  try {
    await listen<[number, string, string, Record<string, unknown>?]>(
      "log://log",
      (event) => {
        const [levelNum, message, target, fields] = event.payload ?? [];
        const level = tauriLogLevelToLevel(levelNum);
        recordLog({
          level,
          source: "tauri",
          message: typeof message === "string" ? message : String(message),
          fields: { target, ...(fields ?? {}) },
        });
      },
    );
  } catch (err) {
    // The plugin isn't always available (e.g. when running the dev
    // server outside Tauri). Log to console only.
    // eslint-disable-next-line no-console
    console.warn("[remi-app] tauri log bridge unavailable", err);
  }

  // 2. Console capture. Replace the global console methods with
  //    wrappers that fan out to the log ring.
  patchConsole();

  // 3. Unhandled rejections / errors are caught at the root and
  //    routed through the same ring.
  if (typeof window !== "undefined") {
    window.addEventListener("error", (event) => {
      recordLog({
        level: "error",
        source: "app",
        message: event.message,
        fields: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error instanceof Error ? event.error.stack : undefined,
        },
      });
    });
    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason;
      recordLog({
        level: "error",
        source: "app",
        message:
          reason instanceof Error ? reason.message : String(reason ?? ""),
        fields: {
          stack: reason instanceof Error ? reason.stack : undefined,
        },
      });
    });
  }
}

function tauriLogLevelToLevel(n: number): LogLevel {
  switch (n) {
    case 0:
    case 1:
      return "trace";
    case 2:
      return "debug";
    case 3:
      return "info";
    case 4:
      return "warn";
    case 5:
    case 6:
      return "error";
    default:
      return "info";
  }
}

function patchConsole() {
  if (typeof window === "undefined") return;
  const w = window as Window & {
    __remiConsolePatched__?: boolean;
  };
  if (w.__remiConsolePatched__) return;
  w.__remiConsolePatched__ = true;

  const original = {
    debug: console.debug.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    log: console.log.bind(console),
  };

  function joinArgs(args: unknown[]): string {
    return args
      .map((a) => {
        if (typeof a === "string") return a;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(" ");
  }

  console.debug = (...args: unknown[]) => {
    recordLog({
      level: "debug",
      source: "console",
      message: joinArgs(args),
    });
    original.debug(...args);
  };
  console.info = (...args: unknown[]) => {
    recordLog({
      level: "info",
      source: "console",
      message: joinArgs(args),
    });
    original.info(...args);
  };
  console.warn = (...args: unknown[]) => {
    recordLog({
      level: "warn",
      source: "console",
      message: joinArgs(args),
    });
    original.warn(...args);
  };
  console.error = (...args: unknown[]) => {
    recordLog({
      level: "error",
      source: "console",
      message: joinArgs(args),
    });
    original.error(...args);
  };
  console.log = (...args: unknown[]) => {
    recordLog({
      level: "info",
      source: "console",
      message: joinArgs(args),
    });
    original.log(...args);
  };
}
