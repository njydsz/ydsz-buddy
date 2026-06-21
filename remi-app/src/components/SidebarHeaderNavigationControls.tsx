// FILE: SidebarHeaderNavigationControls.tsx
// Purpose: Keeps the collapsed-sidebar trigger and desktop route arrows in one header cluster.
// Layer: Shared web shell chrome
// Depends on: Sidebar state plus AppNavigationButtons
/**
 * @file 侧边栏头部导航控件
 *
 * 顶部 chrome 的"侧边栏折叠按钮 + 桌面端返回/前进"组合：
 *
 * - **侧边栏触发器**：通过 `useSidebar` 切换折叠态
 * - **导航按钮**：桌面端独占，引用 `AppNavigationButtons`
 * - **品牌 wordmark**：Remi Claw logo
 *
 * ## 核心导出
 *
 * - `SidebarHeaderNavigationControls`：主组件
 *
 * ## 使用场景
 *
 * - 应用主窗口顶部 chrome
 *
 * ## 注意事项
 *
 * - 桌面端的导航按钮在 web 端会被 `AppNavigationButtons` 内部过滤
 * - logo 资源：`/remi-claw.png`
 */
import { AppNavigationButtons } from "./AppNavigationButtons";
import { SidebarHeaderTrigger, useSidebar } from "./ui/sidebar";
import { isDesktop } from "~/env";

function RemiClawWordmark() {
  return (
    <img
      alt="Remi Claw"
      className="size-5 shrink-0 rounded-[5px] object-cover"
      draggable={false}
      src="/remi-claw.png"
    />
  );
}

export function SidebarHeaderNavigationControls() {
  const { isMobile, open } = useSidebar();

  return (
    <div className="flex shrink-0 items-center gap-2">
      {isDesktop && !open && (
        <div className="flex min-w-0 items-center gap-1">
          <RemiClawWordmark />
        </div>
      )}
      <AppNavigationButtons className="ms-0" />
      <SidebarHeaderTrigger className="size-7 shrink-0" />
    </div>
  );
}
