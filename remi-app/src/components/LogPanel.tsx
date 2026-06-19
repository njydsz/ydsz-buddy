// Floating dev-tools log panel. Mounts only in dev builds; in
// production it short-circuits to `null`. Toggled with Cmd/Ctrl+`.
//
// Mirrors the `apps/web/src/components/DebugLogsPanel.tsx` (the
// Peak Code web app shipped a similar widget).

import { useEffect, useRef, useState } from "react";
import { isTauri } from "@/lib/env";
import { getLogRing, subscribeLog, type LogEntry, type LogLevel } from "@/lib/logger";
import { cn } from "@/lib/utils";

const LEVELS: LogLevel[] = ["trace", "debug", "info", "warn", "error"];

const LEVEL_STYLES: Record<LogLevel, string> = {
  trace: "text-muted-foreground",
  debug: "text-foreground/80",
  info: "text-foreground",
  warn: "text-amber-300",
  error: "text-red-300",
};

export function LogPanel() {
  if (!import.meta.env.DEV) return null;

  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<LogLevel>("info");
  const [filter, setFilter] = useState("");
  const [entries, setEntries] = useState<LogEntry[]>(() => getLogRing().slice());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const off = subscribeLog(() => {
      setEntries(getLogRing().slice());
    });
    return off;
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "`") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [entries, open]);

  const filtered = entries.filter((entry) => {
    if (LEVELS.indexOf(entry.level) < LEVELS.indexOf(level)) return false;
    if (!filter) return true;
    return entry.message.toLowerCase().includes(filter.toLowerCase());
  });

  if (!open) return null;

  return (
    <div className="fixed bottom-2 right-2 z-40 flex h-72 w-[40rem] max-w-[90vw] flex-col overflow-hidden rounded-md border border-border bg-background/95 shadow-xl">
      <header className="flex items-center justify-between border-b border-border bg-card/60 px-2 py-1 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Log</span>
          <span className="text-muted-foreground">({entries.length})</span>
          <select
            className="rounded border border-border bg-background px-1 py-0.5"
            value={level}
            onChange={(e) => setLevel(e.target.value as LogLevel)}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <input
            className="rounded border border-border bg-background px-1 py-0.5"
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">
            {isTauri ? "Tauri" : "Web"}
          </span>
          <button
            className="rounded px-2 py-0.5 text-muted-foreground hover:bg-muted"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-auto p-2 font-mono text-[11px] leading-5">
        {filtered.map((entry) => (
          <div
            key={entry.id}
            className={cn("flex items-start gap-2 whitespace-pre-wrap", LEVEL_STYLES[entry.level])}
          >
            <span className="shrink-0 text-muted-foreground">
              {new Date(entry.ts).toISOString().slice(11, 23)}
            </span>
            <span className="shrink-0 uppercase">{entry.level}</span>
            <span className="shrink-0 text-muted-foreground">[{entry.source}]</span>
            <span className="break-words">{entry.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
