// FILE: ThreadRunningSpinner.tsx
// Purpose: Shared running/pulse spinner for sidebar thread rows.
// Layer: Sidebar UI primitive
// Exports: ThreadRunningSpinner
/**
 * @file 线程运行指示器
 *
 * 侧边栏线程行的"运行中"指示：
 *
 * - **两种展示**：`overlay` / `inline`
 * - **动画**：1.6s 自旋
 * - **a11y**：`aria-hidden` 父级承载语义
 *
 * ## 核心导出
 *
 * - `ThreadRunningSpinner`：主组件
 *
 * ## 使用场景
 *
 * - Sidebar 线程行
 *
 * ## 注意事项
 *
 * - 仅展示，不与 store 联动
 * - 由父组件根据线程活动状态控制是否显示
 */
import { cn } from "~/lib/utils";

export function ThreadRunningSpinner({
  presentation,
  className,
}: {
  presentation: "overlay" | "inline";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-3 shrink-0 animate-spin rounded-full text-muted-foreground/55 [animation-duration:1.6s]",
        presentation === "overlay"
          ? "pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 transition-opacity"
          : "inline-block",
        className,
      )}
      style={{
        background: "conic-gradient(from 0deg, transparent 25%, currentColor)",
        mask: "radial-gradient(farthest-side, transparent calc(100% - 1.5px), black calc(100% - 1.5px))",
        WebkitMask:
          "radial-gradient(farthest-side, transparent calc(100% - 1.5px), black calc(100% - 1.5px))",
      }}
    />
  );
}
