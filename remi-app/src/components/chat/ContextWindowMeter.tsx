/**
 * @file 上下文窗口计量器组件
 *
 * 本组件以进度条形式展示当前线程的上下文窗口使用情况：
 *
 * - **使用率展示**：百分比 / 绝对值
 * - **状态颜色**：低（绿）/ 中（黄）/ 高（橙）/ 超限（红）
 * - **输入/输出分布**：分别展示 input / output token
 *
 * ## 核心导出
 *
 * - `ContextWindowMeter`：计量器组件
 * - `ContextWindowMeterDisplay`：展示数据
 *
 * ## 使用场景
 *
 * - Composer 底部状态栏
 * - 线程详情页的统计信息
 * - 自动压缩触发时的提示
 *
 * ## 注意事项
 *
 * - 超过 80% 触发警告
 * - 超过 100% 时建议立即压缩
 * - 模型上下文窗口大小来自模型元数据
 */

import {
  type ContextWindowSnapshot,
  deriveContextWindowMeterDisplay,
  formatContextWindowTokens,
  formatCostUsd,
} from "~/lib/contextWindow";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";

export function ContextWindowMeter(props: {
  usage: ContextWindowSnapshot;
  cumulativeCostUsd?: number | null | undefined;
  activeWindowLabel?: string | null | undefined;
  pendingWindowLabel?: string | null | undefined;
}) {
  const { usage, cumulativeCostUsd, activeWindowLabel, pendingWindowLabel } = props;
  const display = deriveContextWindowMeterDisplay(usage);
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (display.normalizedPercentage / 100) * circumference;

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={0}
        render={
          <button
            type="button"
            className="group inline-flex items-center gap-1.5 rounded-full px-1 py-0.5 text-[10px] text-muted-foreground/60 transition-colors hover:text-muted-foreground"
            aria-label={display.ariaLabel}
          >
            <span className="relative flex h-3.5 w-3.5 items-center justify-center">
              <svg
                viewBox="0 0 16 16"
                className="-rotate-90 absolute inset-0 h-full w-full transform-gpu"
                aria-hidden="true"
              >
                <circle
                  cx="8"
                  cy="8"
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  opacity="0.2"
                />
                <circle
                  cx="8"
                  cy="8"
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  className="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
                />
              </svg>
            </span>
            <span className="tabular-nums font-medium leading-none">{display.compactLabel}</span>
          </button>
        }
      />
      <PopoverPopup tooltipStyle side="top" align="end" className="w-max max-w-none px-3 py-2">
        <div className="space-y-1.5 leading-tight">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Context window
          </div>
          {pendingWindowLabel ? (
            <div className="text-xs text-muted-foreground">
              Current session: {activeWindowLabel ?? "Unknown"}
            </div>
          ) : null}
          {display.usedPercentageLabel ? (
            <div className="whitespace-nowrap text-xs font-medium text-foreground">
              <span>{display.usedPercentageLabel}</span>
              {display.hasReliableTokenRatio ? (
                <>
                  <span className="mx-1">⋅</span>
                  <span>{display.tokenUsageLabel}</span>
                  <span>/</span>
                  <span>{formatContextWindowTokens(usage.maxTokens)} context used</span>
                </>
              ) : (
                <span className="ml-1">context used</span>
              )}
            </div>
          ) : (
            <div className="text-sm text-foreground">
              {display.tokenUsageLabel} tokens used so far
            </div>
          )}
          {usage.maxTokens !== null ? (
            <div className="text-xs text-muted-foreground">
              Model window: {formatContextWindowTokens(usage.maxTokens)} tokens
            </div>
          ) : null}
          {pendingWindowLabel ? (
            <div className="text-xs text-muted-foreground">Next turn: {pendingWindowLabel}</div>
          ) : null}
          {(usage.totalProcessedTokens ?? null) !== null &&
          (usage.totalProcessedTokens ?? 0) > usage.usedTokens ? (
            <div className="text-xs text-muted-foreground">
              Total processed: {formatContextWindowTokens(usage.totalProcessedTokens ?? null)}{" "}
              tokens
            </div>
          ) : null}
          {usage.compactsAutomatically ? (
            <div className="text-xs text-muted-foreground">
              Automatically compacts its context when needed.
            </div>
          ) : null}
          {cumulativeCostUsd !== null && cumulativeCostUsd !== undefined ? (
            <div className="text-xs text-muted-foreground">
              Session cost: {formatCostUsd(cumulativeCostUsd)}
            </div>
          ) : null}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
