/**
 * @file SkipToContent 跳过链接
 *
 * D-1 键盘可达性核心组件:让键盘/读屏用户能一键跳过侧边栏、
 * 顶部装饰、命令栏等重复区域,直接跳到主内容区。
 *
 * ## 设计要点
 *
 * - 默认视觉上完全隐藏(避免污染布局),仅在获得 Tab 焦点时显示
 *   高对比度、带阴影、位于屏幕左上角的"跳到主内容"按钮
 * - 通过 `href="#main-content"` 锚点跳转,并在 `onClick` 主动调用
 *   `focus()` 让 SPA 路由的 `<main>` (tabindex=-1) 也能接收焦点,
 *   避免后续 Tab 仍从侧边栏开始
 * - 暴露 `targetId`/`label` 字段便于多场景扩展(例如未来跳到 Composer)
 *
 * ## 使用方式
 *
 * 在根路由最外层(WindowCaptionButtons 之后)挂载一次即可:
 *
 * ```tsx
 * <SkipToContent />
 * <Outlet />
 * ```
 *
 * 主内容容器需要打上 `id="main-content"` 与 `tabIndex={-1}`。
 */

import { useCallback } from "react";
import { useMessages } from "~/i18n";

export interface SkipToContentProps {
  /**
   * 目标元素 id(默认 `main-content`)。
   * 必须与主内容区 `<main id={targetId} tabIndex={-1}>` 匹配。
   */
  targetId?: string;
  /**
   * 自定义文案。默认从 i18n 取 `a11y.skipToContent`。
   */
  label?: string;
}

const DEFAULT_TARGET_ID = "main-content";

export function SkipToContent({
  targetId = DEFAULT_TARGET_ID,
  label,
}: SkipToContentProps = {}) {
  const messages = useMessages();
  const resolvedLabel = label ?? messages.a11y.skipToContent;

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      const target = typeof document !== "undefined" ? document.getElementById(targetId) : null;
      if (!target) {
        // 没有目标时不要做破坏性默认行为(浏览器已经会跳锚点)
        return;
      }
      // 让 `<main tabIndex={-1}>` 也能获得键盘焦点
      event.preventDefault();
      target.scrollIntoView({ block: "start" });
      const focusable = target as HTMLElement & { focus?: (options?: FocusOptions) => void };
      focusable.focus({ preventScroll: true });
      // 更新 URL 锚点,保留前进/后退行为
      if (typeof window !== "undefined" && window.history?.replaceState) {
        window.history.replaceState(null, "", `#${targetId}`);
      }
    },
    [targetId],
  );

  return (
    <a
      href={`#${targetId}`}
      onClick={handleClick}
      // sr-only-focusable:非聚焦时视觉隐藏,聚焦时变为可见的左上角浮层
      className="sr-only-focusable focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[1000] focus:rounded-md focus:border focus:border-ring focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-slot="skip-to-content"
    >
      {resolvedLabel}
    </a>
  );
}
