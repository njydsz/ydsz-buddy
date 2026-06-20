/**
 * @file TerminalActivityIndicator.tsx
 * @description 终端活动状态指示器组件，用于紧凑地展示终端的运行、注意和审查状态。
 * 属于终端展示原语层。
 */

import type { TerminalVisualState } from "~/shared/terminalThreads";

import { cn } from "~/lib/utils";

/**
 * 终端活动状态指示器组件的 Props 接口。
 */
interface TerminalActivityIndicatorProps {
  /** 自定义样式类名 */
  className?: string;
  /** 终端视觉状态，排除 idle 状态（idle 时不渲染指示器） */
  state?: Exclude<TerminalVisualState, "idle">;
}

/** 运行状态指示器各点的动画延迟（毫秒），用于错开动画节奏 */
const RUNNING_INDICATOR_OFFSETS_MS = [0, 160, 320, 480] as const;

/**
 * 终端活动状态指示器组件。
 * - attention 状态：渲染琥珀色圆点
 * - review 状态：渲染翠绿色圆点
 * - running 状态：渲染 2×2 网格动画圆点，使用 CSS 动画避免 React 重渲染
 *
 * @param props.className - 自定义样式类名
 * @param props.state - 终端视觉状态，默认为 "running"
 */
export default function TerminalActivityIndicator({
  className,
  state = "running",
}: TerminalActivityIndicatorProps) {
  if (state === "attention" || state === "review") {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex size-1.5 shrink-0 rounded-full",
          state === "attention"
            ? "bg-amber-500 dark:bg-amber-300/90"
            : "bg-emerald-500 dark:bg-emerald-300/90",
          className,
        )}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid h-2.5 w-2.5 shrink-0 grid-cols-2 grid-rows-2 gap-px text-current",
        className,
      )}
    >
      {RUNNING_INDICATOR_OFFSETS_MS.map((delayMs) => (
        <span
          // CSS animation keeps busy terminal indicators out of React's render loop.
          key={delayMs}
          className="terminal-running-indicator__dot block size-1 rounded-full bg-current"
          style={{ animationDelay: `${delayMs}ms` }}
        />
      ))}
    </span>
  );
}
