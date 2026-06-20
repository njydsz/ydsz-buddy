/**
 * @file AppNavigationButtons.tsx
 * @description 桌面端浏览器风格的路由前进/后退导航按钮，
 *              仅在桌面端显示，移动端不渲染。
 */

import { goBackInAppHistory, goForwardInAppHistory, useAppNavigationState } from "~/appNavigation";
import { isDesktop } from "~/env";
import { cn } from "~/lib/utils";
import { IoIosArrowRoundBack, IoIosArrowRoundForward } from "react-icons/io";
import { Button } from "./ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

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
        "-ms-1 flex shrink-0 items-center gap-0.5 [-webkit-app-region:no-drag]",
        className,
      )}
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
          <IoIosArrowRoundBack className="size-6" />
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
          <IoIosArrowRoundForward className="size-6" />
        </TooltipTrigger>
        <TooltipPopup side="bottom">Forward ({forwardShortcutLabel})</TooltipPopup>
      </Tooltip>
    </div>
  );
}
