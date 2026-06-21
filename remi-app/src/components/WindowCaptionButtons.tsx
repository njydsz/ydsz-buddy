// FILE: WindowCaptionButtons.tsx
// Purpose: Renders custom window caption buttons (minimize / maximize / close)
//          for the frameless top bar on Windows & Linux. On macOS the native
//          traffic-light buttons are retained (titleBarStyle: "Overlay"), so
//          this component renders nothing there.
// Layer: Shared web shell chrome
// Depends on: tauriBridge window actions, isDesktop / isMacPlatform helpers
/**
 * @file 窗口标题栏按钮
 *
 * 桌面端无边框窗口的自定义标题栏按钮（最小化 / 最大化 / 关闭）：
 *
 * - **macOS**：保留原生 traffic light 按钮（`titleBarStyle: "Overlay"`）
 * - **Windows / Linux**：渲染自定义三连按钮
 * - **Tauri 调用**：通过 `tauriBridge` 调用窗口操作
 *
 * ## 核心导出
 *
 * - `WindowCaptionButtons`：主组件
 *
 * ## 使用场景
 *
 * - 桌面端顶部 chrome 右侧
 *
 * ## 注意事项
 *
 * - 运行时检测 Tauri 上下文（Tauri 2 早期只注入 `__TAURI_INTERNALS__`）
 * - 平台检测：`isMacPlatform`
 * - Web 端不渲染
 */
import { tauriBridge } from "~/lib/tauri-bridge";
import { cn, isMacPlatform } from "~/lib/utils";
import { LuMinus, LuSquare, LuX } from "react-icons/lu";

/**
 * 运行时检测 Tauri 上下文。Tauri 2 在 WebView 加载早期只注入
 * `__TAURI_INTERNALS__`，旧的 `__TAURI__` 会在脚本执行后才挂上；
 * 模块加载期用 `isDesktop` 判断会误判为 false，因此改为运行时检测。
 */
function isTauriContext(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "__TAURI_INTERNALS__" in window ||
    "__TAURI__" in window ||
    // tauri-plugin-shell 等会暴露 invoke 桥
    // @ts-expect-error - 动态探测
    typeof window.__TAURI_INTERNALS__?.invoke === "function"
  );
}

/**
 * 窗口标题栏控制按钮（min / max / close）
 *
 * 仅在桌面端、非 macOS 平台渲染：macOS 由原生交通灯按钮承担（titleBarStyle: "Overlay"）。
 * 容器标记为 `no-drag`，确保在可拖拽的顶栏内仍可点击。
 */
export function WindowCaptionButtons({ className }: { className?: string }) {
  if (!isTauriContext() || isMacPlatform(navigator.platform)) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center",
        className,
      )}
      data-no-drag
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
