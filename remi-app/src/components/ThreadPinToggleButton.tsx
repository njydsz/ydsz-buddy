/**
 * @file ThreadPinToggleButton.tsx
 * @description 线程置顶/取消置顶图标按钮，被侧边栏线程行复用，
 *              支持覆盖层和内联两种展示模式。
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
