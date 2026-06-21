// FILE: RateLimitsPanel.tsx
// Purpose: Wraps the shared rate-limit summary UI in a collapsible panel fed by
// orchestration thread activities.
/**
 * @file 速率限制面板
 *
 * 由 orchestrator 线程活动聚合的速率限制面板：
 *
 * - **聚合**：从多个线程活动派生 `ProviderRateLimit[]`
 * - **折叠**：可最小化节省空间
 * - **Learn more**：根据当前限制类型指向文档
 *
 * ## 核心导出
 *
 * - `RateLimitsPanel`（默认导出）：面板主组件
 *
 * ## 使用场景
 *
 * - Sidebar 中的速率限制卡片
 *
 * ## 注意事项
 *
 * - 数据源：`OrchestrationThread.activities[]`
 * - 派生函数：`deriveAccountRateLimits`
 * - 默认折叠
 */
import { useMemo, useState } from "react";
import type { OrchestrationThread } from "~/contracts";
import { ChevronDownIcon, ExternalLinkIcon } from "~/lib/icons";
import { deriveAccountRateLimits, deriveRateLimitLearnMoreHref } from "~/lib/rateLimits";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "./ui/collapsible";
import { cn } from "~/lib/utils";
import { RateLimitSummaryList } from "./RateLimitSummaryList";

export default function RateLimitsPanel({
  threads,
}: {
  threads: ReadonlyArray<Pick<OrchestrationThread, "activities">>;
}) {
  const [open, setOpen] = useState(false);
  const rateLimits = useMemo(() => deriveAccountRateLimits(threads), [threads]);
  const learnMoreHref = useMemo(() => deriveRateLimitLearnMoreHref(rateLimits), [rateLimits]);

  if (rateLimits.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="mx-auto w-full max-w-3xl px-3">
        <div className="rounded-lg border border-border/60 bg-card/50">
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
            <span className="flex items-center gap-1.5">
              <svg
                className="size-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span className="font-medium">Rate limits remaining</span>
            </span>
            <ChevronDownIcon
              className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")}
            />
          </CollapsibleTrigger>
          <CollapsiblePanel>
            <div className="space-y-3 border-t border-border/40 px-3 pb-3 pt-2">
              <RateLimitSummaryList rateLimits={rateLimits} />
              {learnMoreHref ? (
                <a
                  href={learnMoreHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:underline"
                >
                  Learn more
                  <ExternalLinkIcon className="size-3" />
                </a>
              ) : null}
            </div>
          </CollapsiblePanel>
        </div>
      </div>
    </Collapsible>
  );
}
