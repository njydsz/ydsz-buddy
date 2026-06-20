/**
 * @file PickerPanelShell.tsx
 * @description 选择器面板外壳，为聊天界面中的组合框式选择器提供统一的搜索栏和内容区域布局。
 */

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "~/lib/utils";
import { Input } from "../ui/input";

/** 菜单导航按键集合，搜索框中这些按键不会被阻止传播 */
const MENU_NAVIGATION_KEYS = new Set([
  "ArrowDown",
  "ArrowUp",
  "Home",
  "End",
  "PageDown",
  "PageUp",
  "Enter",
  "Escape",
]);

/**
 * PickerPanelShell 组件
 * @description 选择器面板外壳，提供搜索栏、内容区域和可选的底部区域
 * @param props.searchPlaceholder - 搜索框占位文本
 * @param props.query - 当前搜索关键词
 * @param props.onQueryChange - 搜索关键词变更回调
 * @param props.stopSearchKeyPropagation - 是否阻止搜索框中非导航按键的传播
 * @param props.autoFocusSearch - 是否自动聚焦搜索框
 * @param props.children - 面板内容
 * @param props.footer - 面板底部内容
 * @param props.widthClassName - 面板宽度类名
 * @param props.bleedParentPadding - 是否消除父级内边距
 */
export function PickerPanelShell(props: {
  searchPlaceholder?: string;
  query?: string;
  onQueryChange?: (query: string) => void;
  stopSearchKeyPropagation?: boolean;
  autoFocusSearch?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  widthClassName?: string;
  bleedParentPadding?: boolean;
}) {
  const {
    searchPlaceholder = "Search",
    query = "",
    onQueryChange,
    stopSearchKeyPropagation = false,
    autoFocusSearch = false,
    children,
    footer,
    widthClassName = "w-72",
    bleedParentPadding = false,
  } = props;
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!autoFocusSearch || !onQueryChange) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });

    return () => cancelAnimationFrame(frame);
  }, [autoFocusSearch, onQueryChange]);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col",
        widthClassName,
        bleedParentPadding ? "-m-1 overflow-clip rounded-xl" : null,
      )}
    >
      {onQueryChange ? (
        <div
          className={cn(
            "sticky z-20 overflow-clip border-b border-border bg-[var(--composer-surface)] p-1",
            bleedParentPadding ? "-top-1 pt-2" : "top-0",
          )}
        >
          <Input
            className="rounded-md border-border/60 bg-background shadow-none before:hidden has-focus-visible:border-neutral-500/15 has-focus-visible:ring-0 [&_input]:font-sans"
            nativeInput
            ref={searchInputRef}
            size="sm"
            type="search"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDownCapture={
              stopSearchKeyPropagation
                ? (event) => {
                    if (!MENU_NAVIGATION_KEYS.has(event.key)) {
                      event.stopPropagation();
                    }
                  }
                : undefined
            }
          />
        </div>
      ) : null}
      <div className="min-h-0 flex-1">{children}</div>
      {footer ? <div className="border-t p-1">{footer}</div> : null}
    </div>
  );
}
