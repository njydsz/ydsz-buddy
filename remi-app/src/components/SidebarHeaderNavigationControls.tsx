/**
 * @file SidebarHeaderNavigationControls.tsx
 * @description 侧边栏头部导航控件集群，整合折叠侧边栏触发器和桌面端路由箭头按钮。
 */

import { AppNavigationButtons } from "./AppNavigationButtons";
import { SidebarHeaderTrigger, useSidebar } from "./ui/sidebar";

export function SidebarHeaderNavigationControls() {
  const { isMobile, open } = useSidebar();
  const triggerVisible = isMobile || !open;

  if (!triggerVisible) {
    return null;
  }

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <AppNavigationButtons className="ms-0" />
      <SidebarHeaderTrigger className="size-7 shrink-0" />
    </div>
  );
}
