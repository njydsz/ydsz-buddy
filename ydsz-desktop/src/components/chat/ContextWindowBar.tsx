/**
 * @file 上下文窗口横向进度条组件
 * @description P1-6:对标 Claude.ai / ChatGPT 的横向 context window 可视化条。
 *
 * 与 `ContextWindowMeter`(圆形 SVG 进度环)互补:
 * - `ContextWindowMeter`:紧凑圆形环,适合工具栏(BranchToolbar.RuntimeUsageControls)
 * - `ContextWindowBar`:横向进度条,适合 Composer 输入框下方,更醒目
 *
 * ## 颜色阈值(与 ContextWindowMeter 一致)
 *
 * - < 50%:  绿(low,正常)
 * - 50-80%: 黄(medium,留意)
 * - 80-100%:橙(high,建议压缩)
 * - > 100%: 红(over,立即压缩)
 *
 * ## 渲染条件
 *
 * - `usage.maxTokens === null`:模型未提供窗口大小,不渲染
 * - `usage.usedTokens === 0`:尚无 token 消耗,不渲染(避免空聊天页噪音)
 * - 其他情况渲染横向条
 *
 * ## data-testid
 *
 * - `context-window-bar` 根容器
 * - `context-window-bar-track` 进度条轨道
 * - `context-window-bar-fill` 进度条填充
 * - `context-window-bar-label` 百分比 + token 文案
 */
import {
  type ContextWindowSnapshot,
  deriveContextWindowMeterDisplay,
  formatContextWindowTokens,
  formatCostUsd,
} from "~/lib/contextWindow";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { cn } from "~/lib/utils";

interface ContextWindowBarProps {
  usage: ContextWindowSnapshot;
  cumulativeCostUsd?: number | null | undefined;
  activeWindowLabel?: string | null | undefined;
  pendingWindowLabel?: string | null | undefined;
  /** 紧凑模式:仅显示条 + 百分比,隐藏 token 数文字(用于窄屏) */
  compact?: boolean;
}

/** 根据使用百分比推导颜色档位 */
function resolveColorClass(percentage: number): {
  /** 填充条颜色 */
  fill: string;
  /** 文字颜色 */
  text: string;
} {
  if (percentage >= 100) {
    return {
      fill: "bg-red-500",
      text: "text-red-600 dark:text-red-400",
    };
  }
  if (percentage >= 80) {
    return {
      fill: "bg-orange-500",
      text: "text-orange-600 dark:text-orange-400",
    };
  }
  if (percentage >= 50) {
    return {
      fill: "bg-yellow-500",
      text: "text-yellow-600 dark:text-yellow-400",
    };
  }
  return {
    fill: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
  };
}

export function ContextWindowBar(props: ContextWindowBarProps) {
  const { usage, cumulativeCostUsd, activeWindowLabel, pendingWindowLabel, compact = false } = props;
  const display = deriveContextWindowMeterDisplay(usage);

  // 无窗口大小或无 token 消耗时,不渲染
  if (usage.maxTokens === null || usage.usedTokens === 0) {
    return null;
  }

  const percentage = Math.min(100, Math.max(0, display.normalizedPercentage));
  const color = resolveColorClass(percentage);

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={0}
        render={
          <div
            className="group flex items-center gap-2 px-2.5 pb-1 pt-0.5"
            data-testid="context-window-bar"
            role="meter"
            aria-valuenow={Math.round(percentage)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={display.ariaLabel}
          >
            {/* 横向进度条 */}
            <div
              className="h-1 flex-1 overflow-hidden rounded-full bg-muted"
              data-testid="context-window-bar-track"
            >
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none",
                  color.fill,
                )}
                style={{ width: `${percentage}%` }}
                data-testid="context-window-bar-fill"
              />
            </div>
            {/* 百分比 + token 数(紧凑模式只显示百分比) */}
            <div
              className={cn(
                "flex items-baseline gap-1 tabular-nums leading-none",
                color.text,
              )}
              data-testid="context-window-bar-label"
            >
              <span className="text-[10px] font-medium">
                {display.usedPercentageLabel ?? "0%"}
              </span>
              {!compact && display.hasReliableTokenRatio ? (
                <span className="text-[9px] text-muted-foreground/70">
                  {display.tokenUsageLabel}/{formatContextWindowTokens(usage.maxTokens)}
                </span>
              ) : null}
            </div>
          </div>
        }
      />
      <PopoverPopup tooltipStyle side="top" align="center" className="w-max max-w-none px-3 py-2">
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
                  <span className="mx-1">·</span>
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
