// FILE: WindowCaptionButtons.tsx
// Purpose: Renders custom window caption buttons (minimize / maximize / close)
//          for the frameless top bar on Windows & Linux. On macOS the native
//          traffic-light buttons are retained (titleBarStyle: "Overlay"), so
//          this component renders nothing there.
// Layer: Shared web shell chrome
// Depends on: tauriBridge window actions, isDesktop / isMacPlatform helpers

import { tauriBridge } from "~/lib/tauri-bridge";
import { isDesktop } from "~/env";
import { cn, isMacPlatform } from "~/lib/utils";
import { LuMinus, LuSquare, LuX } from "react-icons/lu";

/**
 * 窗口标题栏控制按钮（min / max / close）
 *
 * 仅在桌面端、非 macOS 平台渲染：macOS 由原生交通灯按钮承担（titleBarStyle: "Overlay"）。
 * 容器标记为 `no-drag`，确保在可拖拽的顶栏内仍可点击。
 */
export function WindowCaptionButtons({ className }: { className?: string }) {
  if (!isDesktop || isMacPlatform(navigator.platform)) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center [-webkit-app-region:no-drag]",
        className,
      )}
    >
      <CaptionButton
        aria-label="Minimize"
        onClick={() => void tauriBridge.window.minimize()}
      >
        <LuMinus className="size-[14px]" />
      </CaptionButton>
      <CaptionButton
        aria-label="Maximize"
        onClick={() => void tauriBridge.window.maximize()}
      >
        <LuSquare className="size-[12px]" />
      </CaptionButton>
      <CaptionButton
        aria-label="Close"
        variant="danger"
        onClick={() => void tauriBridge.window.close()}
      >
        <LuX className="size-[15px]" />
      </CaptionButton>
    </div>
  );
}

/** 单个标题栏按钮：Windows 风格的无边框方块，hover 高亮 */
function CaptionButton({
  children,
  onClick,
  "aria-label": ariaLabel,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  "aria-label": string;
  variant?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        "inline-flex size-11 items-center justify-center text-muted-foreground transition-colors",
        variant === "danger"
          ? "hover:bg-destructive hover:text-white"
          : "hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
