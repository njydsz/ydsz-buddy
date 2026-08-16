// FILE: AppNavigationButtons.tsx
// Purpose: Renders desktop-only browser-style route back/forward controls.
// Layer: Shared web shell chrome
// Depends on: appNavigation history helpers, header Button/Tooltip primitives

import { goBackInAppHistory, goForwardInAppHistory, useAppNavigationState } from "~/appNavigation";
import { isDesktop } from "~/env";
import { cn } from "~/lib/utils";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { Button } from "./ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

/**
 * @file 应用导航按钮（返回/前进）
 *
 * 本组件在桌面端顶部栏渲染浏览器风格的"返回 / 前进"按钮，
 * 与主窗口内的 `appNavigation` 历史栈联动，支持键盘快捷键提示。
 *
 * ## 核心导出
 *
 * - `AppNavigationButtons`：返回/前进按钮组
 *
 * ## 使用场景
 *
 * - 应用主窗口顶部 chrome 区域
 * - 桌面端（Tauri/桌面壳）独占
 *
 * ## 注意事项
 *
 * - Web 端不渲染（非桌面环境直接返回 `null`）
 * - 快捷键提示根据 macOS / 其他平台自动切换（⌘[ / ⌘] 或 Alt+Left / Alt+Right）
 * - 历史栈为空时按钮自动禁用
 * - `data-no-drag` 避免在自定义标题栏中触发拖拽
 */
export function AppNavigationButtons({ className }: { className?: string }) {
  const { canGoBack, canGoForward } = useAppNavigationState();
  const platform = typeof navigator === "undefined" ? "" : navigator.platform;
  const isMac = /Mac|iPhone|iPad|iPod/i.test(platform);
  const backShortcutLabel = isMac ? "⌘[" : "Alt+Left";
  const forwardShortcutLabel = isMac ? "⌘]" : "Alt+Right";

  if (!isDesktop) {
    return null;
  }

  return (
    <div
      className={cn(
        "-ms-1 flex shrink-0 items-center gap-0.5",
        className,
      )}
      data-no-drag
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-8 rounded-lg"
              aria-label="Back"
              disabled={!canGoBack}
              onClick={() => goBackInAppHistory()}
            />
          }
        >
          <FiChevronLeft className="size-5" />
        </TooltipTrigger>
        <TooltipPopup side="bottom">Back ({backShortcutLabel})</TooltipPopup>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-8 rounded-lg"
              aria-label="Forward"
              disabled={!canGoForward}
              onClick={() => goForwardInAppHistory()}
            />
          }
        >
          <FiChevronRight className="size-5" />
        </TooltipTrigger>
        <TooltipPopup side="bottom">Forward ({forwardShortcutLabel})</TooltipPopup>
      </Tooltip>
    </div>
  );
}
