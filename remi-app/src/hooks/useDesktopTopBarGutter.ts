/**
 * @file useDesktopTopBarGutter.ts
 * @description 桌面端顶部栏间距 Hook - 处理 macOS 交通灯按钮的间距
 * @module hooks/useDesktopTopBarGutter
 * @layer 共享 Web Shell 装饰层
 */

import type { SidebarSide } from "~/appSettings";
import { useAppSettings } from "~/appSettings";
import { isDesktop } from "~/env";
import { useSidebar } from "~/components/ui/sidebar";
import { isMacPlatform } from "~/lib/utils";

/**
 * 桌面端顶部栏交通灯按钮间距的 Tailwind 类名
 *
 * @description
 * 用于清除 macOS 交通灯按钮集群（位于 x=16, y=18）的间距。
 * 同时输出基础和 sm: 变体，确保该间距能覆盖任何响应式水平内边距类
 * （例如 sm:px-5），因为 twMerge 只在同一断点内解决冲突。
 *
 * 作为模块级常量，确保所有顶部栏使用相同的间距宽度。
 */
export const DESKTOP_TOP_BAR_TRAFFIC_LIGHT_GUTTER_CLASS = "pl-[90px] sm:pl-[90px]";

/**
 * 纯函数：判断顶部栏是否需要为 macOS 交通灯按钮预留空间
 *
 * @description
 * 交通灯按钮位于渲染区域内（titleBarStyle = "hiddenInset"），
 * 因此任何紧贴窗口左边缘的装饰表面都需要间距，否则其前导控件
 * 会与关闭/最小化/缩放按钮冲突。
 *
 * 当侧边栏在左侧且可见时，侧边栏提供间距；否则右侧的下一个表面需要提供间距。
 *
 * @param input - 输入参数对象
 * @param input.isDesktop - 是否为桌面端
 * @param input.isMacDesktop - 是否为 macOS 桌面端
 * @param input.sidebarSide - 侧边栏位置（left 或 right）
 * @param input.sidebarOpen - 侧边栏是否打开
 * @param input.isMobile - 是否为移动端
 *
 * @returns 是否需要预留交通灯按钮间距
 */
export function shouldReserveDesktopTopBarTrafficLightGutter(input: {
  isDesktop: boolean;
  isMacDesktop: boolean;
  sidebarSide: SidebarSide;
  sidebarOpen: boolean;
  isMobile: boolean;
}): boolean {
  if (!input.isDesktop) return false;
  if (!input.isMacDesktop) return false;
  // 侧边栏在右侧时，左侧需要间距
  if (input.sidebarSide === "right") return true;
  // 移动端抽屉浮动在内容上方，而不是预留列，因此聊天头部始终拥有左边缘
  if (input.isMobile) return true;
  // 侧边栏未打开时需要间距
  return !input.sidebarOpen;
}

/**
 * 桌面端顶部栏交通灯间距类名 Hook
 *
 * @description
 * {@link shouldReserveDesktopTopBarTrafficLightGutter} 的 React Hook 变体，
 * 返回间距类名（或不需要间距时返回 null）。
 *
 * 用于任何顶部栏可能紧贴窗口左边缘的装饰表面：
 * 聊天头部、设置头部、工作区头部等。
 *
 * @returns 间距类名或 null
 *
 * @example
 * ```tsx
 * const gutterClass = useDesktopTopBarTrafficLightGutterClassName();
 * return <header className={gutterClass}>...</header>;
 * ```
 */
export function useDesktopTopBarTrafficLightGutterClassName(): string | null {
  const { settings } = useAppSettings();
  const { isMobile, open } = useSidebar();
  const isMacDesktop = typeof navigator !== "undefined" ? isMacPlatform(navigator.platform) : false;
  return shouldReserveDesktopTopBarTrafficLightGutter({
    isDesktop,
    isMacDesktop,
    sidebarSide: settings.sidebarSide,
    sidebarOpen: open,
    isMobile,
  })
    ? DESKTOP_TOP_BAR_TRAFFIC_LIGHT_GUTTER_CLASS
    : null;
}
