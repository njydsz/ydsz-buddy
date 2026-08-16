/**
 * @file 启动阶段进度展示组件
 * @description 渲染当前启动阶段的分阶段进度（总进度条 + 阶段列表）。
 *   订阅 `useBootProgressStore`，状态变化即时反映。
 * @module components/BootProgressView
 */

import { Check, Circle, AlertCircle, Loader2, Lock } from "lucide-react";
import {
  BOOT_STAGE_IDS,
  DEFAULT_BOOT_STAGE_LABELS,
  computeBootProgress,
  isFatalBootErrorType,
  useBootProgressStore,
  type BootStageId,
  type BootStageStatus,
} from "../shared/bootProgressStore";
import { useMicroAnimation } from "../hooks/useMicroAnimation";
import { cn } from "../lib/utils";

/**
 * 启动阶段进度展示组件
 *
 * @description
 * - 顶部：品牌 logo
 * - 中部：分阶段进度条 + 百分比
 * - 底部：阶段列表（图标 + 标签 + 状态）
 * - 错误态：显示错误信息 + 重试按钮
 *   - 非 fatal 错误：可重试
 *   - fatal 错误：显示锁定图标 + "Configuration required" 提示（不显示重试）
 */
export function BootProgressView({ onRetry }: { onRetry?: (() => void) | null }) {
  const stages = useBootProgressStore((state) => state.stages);
  const isBootCompleted = useBootProgressStore((state) => state.isBootCompleted);
  const bootError = useBootProgressStore((state) => state.bootError);
  const bootErrorType = useBootProgressStore((state) => state.bootErrorType);
  const hasFatalError = useBootProgressStore((state) => state.hasFatalError);
  const anim = useMicroAnimation();

  const progress = computeBootProgress(stages);
  const percent = Math.round(progress * 100);
  const hasError = Boolean(bootError);
  const fatal = hasFatalError || isFatalBootErrorType(bootErrorType);
  const showRetry = hasError && !fatal && Boolean(onRetry);

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6 px-6 select-none">
      {/* 总进度条 */}
      <div className="w-full space-y-2">
        <div className="flex items-center justify-between text-[11px] font-medium tracking-[0.16em] text-muted-foreground/80 uppercase">
          <span>
            {isBootCompleted ? "Ready" : hasError ? (fatal ? "Configuration required" : "Boot failed") : "Starting"}
          </span>
          <span className="tabular-nums" data-testid="boot-progress-percent">
            {percent}%
          </span>
        </div>
        <div
          className="relative h-1.5 w-full overflow-hidden rounded-full bg-(--sidebar-accent)/50"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="Application boot progress"
        >
          <div
            className={cn(
              "h-full rounded-full bg-foreground/85 transition-[width]",
              hasError && !fatal && "bg-red-500/80",
              fatal && "bg-amber-500/80",
            )}
            style={{
              width: `${percent}%`,
              transition: anim.durationMs === 0
                ? "none"
                : `width ${anim.durationMs}ms ${anim.isReducedMotionEnabled ? "linear" : "cubic-bezier(0.4, 0, 0.2, 1)"}`,
            }}
          />
        </div>
      </div>

      {/* 阶段列表 */}
      <ol className="w-full space-y-1.5" aria-label="Boot stages">
        {BOOT_STAGE_IDS.map((id) => (
          <BootStageRow key={id} stageId={id} />
        ))}
      </ol>

      {/* 错误信息 */}
      {hasError ? (
        <div
          className={cn(
            "flex w-full flex-col items-center gap-3 rounded-lg border px-4 py-3 text-center",
            fatal
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-red-500/30 bg-red-500/5",
          )}
          data-testid="boot-error"
          data-fatal={fatal ? "true" : "false"}
        >
          <div className="flex items-center gap-1.5 text-xs font-medium">
            {fatal ? (
              <Lock className="size-3.5 text-amber-600 dark:text-amber-400" aria-label="fatal" />
            ) : null}
            <span
              className={cn(
                fatal
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-red-600/90 dark:text-red-400/90",
              )}
              data-testid="boot-error-message"
            >
              {bootError}
            </span>
          </div>
          {fatal ? (
            <span className="text-[11px] text-muted-foreground/70">
              请检查配置或授权后重启应用
            </span>
          ) : null}
          {showRetry ? (
            <button
              type="button"
              className="rounded-md border border-border/70 px-3 py-1.5 text-xs text-foreground/85 transition-colors hover:bg-(--sidebar-accent)"
              onClick={onRetry ?? undefined}
              data-testid="boot-retry"
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BootStageRow({ stageId }: { stageId: BootStageId }) {
  const stage = useBootProgressStore((state) => state.stages[stageId]);
  const status: BootStageStatus = stage?.status ?? "pending";
  const label = stage?.label ?? DEFAULT_BOOT_STAGE_LABELS[stageId];

  return (
    <li
      className="flex items-center gap-2.5 text-xs"
      data-testid={`boot-stage-${stageId}`}
      data-status={status}
      data-fatal={stage?.fatal ? "true" : undefined}
    >
      <BootStageIcon status={status} />
      <span
        className={cn(
          "flex-1 transition-colors",
          status === "pending" && "text-muted-foreground/55",
          status === "in_progress" && "font-medium text-foreground/85",
          status === "done" && "text-foreground/70",
          status === "error" && !stage?.fatal && "text-red-600/90 dark:text-red-400/90",
          status === "error" && stage?.fatal && "text-amber-700 dark:text-amber-300",
        )}
      >
        {label}
      </span>
      {status === "error" && stage?.fatal ? (
        <Lock className="size-3 shrink-0 text-amber-600 dark:text-amber-400" aria-label="fatal error" />
      ) : null}
    </li>
  );
}

function BootStageIcon({ status }: { status: BootStageStatus }) {
  switch (status) {
    case "done":
      return <Check className="size-3.5 shrink-0 text-foreground/70" aria-label="completed" />;
    case "in_progress":
      return <Loader2 className="size-3.5 shrink-0 animate-spin text-foreground/85" aria-label="in progress" />;
    case "error":
      return <AlertCircle className="size-3.5 shrink-0 text-red-500" aria-label="error" />;
    case "pending":
    default:
      return <Circle className="size-3.5 shrink-0 text-muted-foreground/40" aria-label="pending" />;
  }
}
