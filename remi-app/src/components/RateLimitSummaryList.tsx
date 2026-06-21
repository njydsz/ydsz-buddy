// FILE: RateLimitSummaryList.tsx
// Purpose: Renders the compact rate-limit rows shared by the local popover and
// the dedicated rate-limit panel.
/**
 * @file 速率限制摘要列表
 *
 * 紧凑展示 provider 速率限制行：
 *
 * - **行展示**：剩余百分比、reset 时间
 * - **隐藏空行**：通过 `deriveVisibleRateLimitRows` 过滤
 *
 * ## 核心导出
 *
 * - `RateLimitSummaryList`：主组件
 *
 * ## 使用场景
 *
 * - ProviderUsagePanelContent
 * - RateLimitsPanel
 *
 * ## 注意事项
 *
 * - 仅展示，不包含标题
 * - 使用 `useMemo` 减少重算
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
