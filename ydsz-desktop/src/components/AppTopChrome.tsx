// FILE: AppTopChrome.tsx
// Purpose: Shared top chrome bar for the main app surface (Work/Code modes, default landing).
//          Provides a consistent height, padding, drag region, and macOS traffic-light gutter
//          so the main content area header stays aligned across surfaces.
// Layer: Shared web shell chrome
// Depends on: SidebarHeaderNavigationControls, WindowCaptionButtons, useDesktopTopBarGutter
/**
 * @file 共享顶部 chrome 栏
 *
 * 主窗口（Work / Code 模式、默认落地页等）顶部 chrome 栏的统一样式容器：
 *
 * - **结构**：`<header>` + `drag-region` + `h-[44px]`
 * - **左**：`SidebarHeaderNavigationControls`（桌面端返回/前进）
 * - **中**：标题 slot（可点击重命名）
 * - **右**：操作 slot + 窗口控制按钮
 * - **桌面端**：预留 macOS 交通灯按钮间距
 *
 * ## 核心导出
 *
 * - `AppTopChrome`：主组件
 *
 * ## 使用场景
 *
 * - Workspace 视图头部
 * - 默认聊天落地页头部
 * - 任何需要统一 chrome 样式的主内容区域
 *
 * ## 注意事项
 *
 * - 标题 slot 负责呈现具体文本 / 重命名输入，组件本身不持有重命名态
 * - 窗口控制按钮在 macOS 上不渲染（保留原生 traffic light）
 */
import { type ReactNode } from "react";
import { SidebarHeaderNavigationControls } from "./SidebarHeaderNavigationControls";
import { SidebarTrigger, useSidebar } from "./ui/sidebar";
import { WindowCaptionButtons } from "./WindowCaptionButtons";
import { WorkspaceAiSharePanel } from "./WorkspaceAiSharePanel";
import { useDesktopTopBarTrafficLightGutterClassName } from "~/hooks/useDesktopTopBarGutter";
import { cn } from "~/lib/utils";

interface AppTopChromeProps {
  /** Title slot rendered in the center of the chrome. */
  title?: ReactNode;
  /** Right-side actions slot (e.g. Terminal / Settings buttons). */
  actions?: ReactNode;
  /** 是否在右侧 actions 之前显示 workspace 级别 AI 占比紧凑摘要。默认 false。 */
  showWorkspaceAiShare?: boolean;
  /** Whether to show the window caption buttons. Default: true on desktop. */
  showWindowControls?: boolean;
  /** Optional extra class names appended to the inner drag-region row. */
  className?: string;
  /** Logo element to display on the left side when sidebar is collapsed. */
  logo?: ReactNode;
}

/**
 * Unified top chrome bar for the main app surface.
 *
 * Mirrors the styling used by ChatHeader and WorkspaceView so the Work
 * (default landing / threads) and Code (workspace) modes share the same
 * header height, padding, and traffic-light gutter.
 */
export function AppTopChrome({
  title,
  actions,
  showWorkspaceAiShare = false,
  showWindowControls = true,
  className,
  logo,
}: AppTopChromeProps) {
  const desktopTopBarTrafficLightGutterClassName = useDesktopTopBarTrafficLightGutterClassName();
  const { state, isMobile } = useSidebar();
  const sidebarCollapsed = !isMobile && state === "collapsed";

  return (
    <header
      className={cn(
        "border-b border-border px-3 sm:px-5",
        desktopTopBarTrafficLightGutterClassName,
      )}
    >
      <div
        className={cn(
          "drag-region flex h-[44px] items-center gap-2 sm:gap-3",
          className,
        )}
      >
        {sidebarCollapsed && (
          <div className="flex h-7 items-center gap-2">
            {logo}
            <SidebarTrigger
              className="size-7 shrink-0 text-muted-foreground/75 hover:text-foreground"
              aria-label="Toggle sidebar"
            />
          </div>
        )}
        <SidebarHeaderNavigationControls />
        <div className="flex h-7 min-w-0 flex-1 items-center gap-2">{title}</div>
        <div className="flex shrink-0 items-center gap-1.5" data-no-drag>
          {showWorkspaceAiShare ? (
            <WorkspaceAiSharePanel variant="compact" />
          ) : null}
          {actions}
          {showWindowControls ? <WindowCaptionButtons /> : null}
        </div>
      </div>
    </header>
  );
}
