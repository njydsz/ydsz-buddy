/**
 * @file RateLimitSummaryList.tsx
 * @description 速率限制摘要列表组件，渲染紧凑的速率限制行，
 *              被本地弹出面板和专用速率限制面板共享使用。
 */

import { useMemo } from "react";

import type { ProviderRateLimit } from "~/lib/rateLimits";
import {
  deriveVisibleRateLimitRows,
  formatRateLimitRemainingPercent,
  formatRateLimitResetTime,
} from "~/lib/rateLimits";

export function RateLimitSummaryList({
  rateLimits,
}: {
  rateLimits: ReadonlyArray<ProviderRateLimit>;
}) {
  const rows = useMemo(() => deriveVisibleRateLimitRows(rateLimits), [rateLimits]);

  if (rows.length === 0) {
    return (
      <p className="text-[length:var(--app-font-size-chat-meta,10px)] text-muted-foreground">
        No rate limit data yet.
      </p>
    );
  }

  return (
    <>
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex items-center justify-between text-[length:var(--app-font-size-chat,12px)]"
        >
          <span className="font-medium text-foreground">{row.label}</span>
          <span className="flex items-center gap-2 tabular-nums text-[length:var(--app-font-size-chat-meta,10px)] text-muted-foreground">
            <span className="text-foreground">
              {formatRateLimitRemainingPercent(row.remainingPercent)}
            </span>
            {row.resetsAt ? <span>{formatRateLimitResetTime(row.resetsAt)}</span> : null}
          </span>
        </div>
      ))}
    </>
  );
}
