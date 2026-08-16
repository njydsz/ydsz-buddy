/**
 * @file 终端滚动到底部按钮
 *
 * 当终端滚动到上方时显示的"快速回到底部"浮动按钮：
 *
 * - **监听滚动**：通过 `requestAnimationFrame` 节流检查
 * - **缓冲判断**：比较 `viewportY` 与 `baseY`
 * - **平滑滚动**：调用 `terminal.scrollToBottom()`
 *
 * ## 核心导出
 *
 * - `TerminalScrollToBottom`：主组件
 * - `TerminalScrollToBottomProps`：组件 props
 *
 * ## 使用场景
 *
 * - 终端面板右下角
 *
 * ## 注意事项
 *
 * - 仅在视口与缓冲底部不一致时可见
 * - 使用 `onScroll` 订阅（来自 xterm）
 */
import type { Terminal } from "@xterm/xterm";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";

interface TerminalScrollToBottomProps {
  terminal: Terminal | null;
}

export function TerminalScrollToBottom({ terminal }: TerminalScrollToBottomProps) {
  const [isVisible, setIsVisible] = useState(false);
  const visibilityRafRef = useRef<number | null>(null);

  const checkPosition = useCallback(() => {
    if (!terminal) return;
    const buf = terminal.buffer.active;
    const nextVisible = buf.viewportY < buf.baseY;
    setIsVisible((current) => (current === nextVisible ? current : nextVisible));
  }, [terminal]);

  const scheduleVisibilityCheck = useCallback(() => {
    if (visibilityRafRef.current !== null) {
      return;
    }
    visibilityRafRef.current = window.requestAnimationFrame(() => {
      visibilityRafRef.current = null;
      checkPosition();
    });
  }, [checkPosition]);

  useEffect(() => {
    if (!terminal) {
      setIsVisible(false);
      return;
    }
    scheduleVisibilityCheck();
    const d1 = terminal.onWriteParsed(scheduleVisibilityCheck);
    const d2 = terminal.onScroll(scheduleVisibilityCheck);
    return () => {
      if (visibilityRafRef.current !== null) {
        window.cancelAnimationFrame(visibilityRafRef.current);
        visibilityRafRef.current = null;
      }
      d1.dispose();
      d2.dispose();
    };
  }, [terminal, scheduleVisibilityCheck]);

  const handleClick = () => terminal?.scrollToBottom();

  return (
    <div
      className={cn(
        "absolute bottom-4 left-1/2 z-10 -translate-x-1/2 transition-all duration-200",
        isVisible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <button
        type="button"
        onClick={handleClick}
        className="flex size-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Scroll to bottom"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="size-3.5"
        >
          <path
            fillRule="evenodd"
            d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  );
}
