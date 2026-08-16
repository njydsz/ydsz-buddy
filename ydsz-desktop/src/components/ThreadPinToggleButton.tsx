// FILE: ThreadPinToggleButton.tsx
// Purpose: Shared pin/unpin icon button reused by sidebar thread rows.
// Layer: Sidebar UI primitive
// Exports: ThreadPinToggleButton
/**
 * @file 线程固定切换按钮
 *
 * 侧边栏线程行的"固定 / 取消固定"图标按钮：
 *
 * - **两种展示**：`overlay`（悬停显示）/ `inline`（始终显示）
 * - **状态**：通过 `pinned` 控制图标
 * - **点击**：通过 `onToggle` 通知父组件
 *
 * ## 核心导出
 *
 * - `ThreadPinToggleButton`：主组件
 *
 * ## 使用场景
 *
 * - Sidebar 线程行
 * - 线程右键菜单
 *
 * ## 注意事项
 *
 * - `toneClassName` 用于覆盖默认色（如选中态）
 * - 图标：`PinIcon`
 */
import type React from "react";
import { PinIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";

export function ThreadPinToggleButton({
  pinned,
  presentation,
  toneClassName,
  onToggle,
}: {
  pinned: boolean;
  presentation: "overlay" | "inline";
  toneClassName?: string;
  onToggle: (event: React.MouseEvent<HTMLButtonElement> | React.MouseEvent) => void;
}) {
  const label = pinned ? "Unpin thread" : "Pin thread";

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pinned}
      title={label}
      className={cn(
        "sidebar-icon-button pointer-events-auto inline-flex size-5 transition-all hover:text-foreground/82",
        toneClassName ?? "text-muted-foreground/34",
        presentation === "overlay"
          ? cn(
              "absolute left-1.5 top-1/2 z-30 -translate-y-1/2",
              pinned
                ? "opacity-100"
                : "opacity-0 group-hover/thread-row:opacity-100 focus-visible:opacity-100",
            )
          : "relative z-10 shrink-0",
      )}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={onToggle}
    >
      <PinIcon className="size-3.5" />
    </button>
  );
}
