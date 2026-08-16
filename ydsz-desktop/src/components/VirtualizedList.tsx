/**
 * @file VirtualizedList.tsx
 * @description 通用虚拟化列表组件 - 基于 @tanstack/react-virtual 实现高效渲染
 *
 * 特性：
 * - 支持动态行高（消息列表高度不固定）
 * - 支持滚动到特定索引（如滚动到新消息）
 * - 支持滚动到顶部/底部
 * - 保持滚动位置在数据更新时稳定
 * - 支持键盘导航（方向键、PageUp/PageDown、Home/End）
 * - 支持减少动画偏好
 * - 无障碍支持（role="listbox", aria-activedescendant）
 *
 * @module components/VirtualizedList
 */

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  useVirtualizer,
  type VirtualItem,
  type VirtualizerOptions,
} from "@tanstack/react-virtual";
import { cn } from "~/lib/utils";

/** 虚拟化列表引用句柄 */
export interface VirtualizedListRef {
  /** 滚动到指定索引 */
  scrollToIndex: (index: number, options?: { align?: "start" | "center" | "end" }) => void;
  /** 滚动到顶部 */
  scrollToTop: () => void;
  /** 滚动到底部 */
  scrollToBottom: () => void;
  /** 获取当前滚动位置 */
  getScrollPosition: () => number;
  /** 获取虚拟化器实例 */
  getVirtualizer: () => ReturnType<typeof useVirtualizer<HTMLDivElement, Element>> | null;
}

/** 虚拟化列表属性 */
export interface VirtualizedListProps<T> {
  /** 数据数组 */
  items: T[];
  /** 渲染每个项目的函数 */
  renderItem: (item: T, index: number, virtualItem: VirtualItem) => ReactNode;
  /** 估计的项目高度(像素) */
  estimateSize?: number | ((index: number) => number);
  /** 溢出滚动容器的 overscan 像素数 */
  overscan?: number;
  /** 列表高度(像素),如果不提供则使用父容器高度 */
  height?: number;
  /** 列表宽度(像素或字符串) */
  width?: number | string;
  /** 是否启用动态高度测量 */
  enableDynamicHeight?: boolean;
  /** 自定义容器类名 */
  className?: string;
  /** 自定义容器样式 */
  style?: CSSProperties;
  /** 滚动事件处理器 */
  onScroll?: (event: React.UIEvent<HTMLDivElement>) => void;
  /** 滚动到底部事件 */
  onScrollToBottom?: () => void;
  /** 滚动到顶部事件 */
  onScrollToTop?: () => void;
  /** 是否显示在底部(用于外部控制) */
  isAtBottom?: boolean;
  /** 是否在底部变化时通知 */
  onIsAtBottomChange?: (isAtBottom: boolean) => void;
  /** 底部阈值(像素),距离底部多少像素内视为在底部 */
  bottomThreshold?: number;
  /** 顶部阈值(像素),距离顶部多少像素内视为在顶部 */
  topThreshold?: number;
  /** 是否启用键盘导航 */
  enableKeyboardNavigation?: boolean;
  /** 当前活动项索引(用于键盘导航) */
  activeIndex?: number;
  /** 活动项变化回调 */
  onActiveIndexChange?: (index: number) => void;
  /** 无障碍标签 */
  ariaLabel?: string;
  /** 是否跟随实时输出(新数据时自动滚动到底部) */
  followOutput?: boolean;
  /** 保持滚动位置在数据更新时稳定 */
  maintainScrollPosition?: boolean;
  /** 自定义虚拟化器选项 */
  virtualizerOptions?: Partial<VirtualizerOptions<HTMLDivElement, Element>>;
  /** 外部引用 */
  ref?: React.Ref<VirtualizedListRef>;
  /** 透传鼠标/指针/触摸事件,便于外部包装(选区/手势等) */
  onMouseUp?: React.MouseEventHandler<HTMLDivElement>;
  onPointerDown?: React.PointerEventHandler<HTMLDivElement>;
  onPointerUp?: React.PointerEventHandler<HTMLDivElement>;
  onPointerCancel?: React.PointerEventHandler<HTMLDivElement>;
  onTouchStart?: React.TouchEventHandler<HTMLDivElement>;
  onTouchMove?: React.TouchEventHandler<HTMLDivElement>;
  onTouchEnd?: React.TouchEventHandler<HTMLDivElement>;
  onWheel?: React.WheelEventHandler<HTMLDivElement>;
}

/** 检测用户是否偏好减少动画 */
function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  return prefersReducedMotion;
}

/**
 * 通用虚拟化列表组件
 *
 * @example
 * ```tsx
 * const listRef = useRef<VirtualizedListRef>(null);
 *
 * <VirtualizedList
 *   ref={listRef}
 *   items={messages}
 *   renderItem={(message, index) => <MessageRow key={message.id} message={message} />}
 *   estimateSize={80}
 *   followOutput={true}
 *   onScrollToBottom={() => console.log("Scrolled to bottom")}
 * />
 * ```
 */
export function VirtualizedList<T>({
  items,
  renderItem,
  estimateSize = 50,
  overscan = 5,
  height,
  width = "100%",
  enableDynamicHeight = true,
  className,
  style,
  onScroll,
  onScrollToBottom,
  onScrollToTop,
  isAtBottom: externalIsAtBottom,
  onIsAtBottomChange,
  bottomThreshold = 50,
  topThreshold = 50,
  enableKeyboardNavigation = true,
  activeIndex: externalActiveIndex,
  onActiveIndexChange,
  ariaLabel,
  followOutput = false,
  maintainScrollPosition = true,
  virtualizerOptions,
  onMouseUp,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onWheel,
  ref,
}: VirtualizedListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [internalActiveIndex, setInternalActiveIndex] = useState(0);
  const [isAtBottomInternal, setIsAtBottomInternal] = useState(true);
  const [isAtTopInternal, setIsAtTopInternal] = useState(false);
  const previousScrollHeightRef = useRef(0);
  const previousScrollTopRef = useRef(0);
  const prefersReducedMotion = usePrefersReducedMotion();

  const activeIndex = externalActiveIndex ?? internalActiveIndex;
  const isAtBottom = externalIsAtBottom ?? isAtBottomInternal;

  const resolvedEstimateSize = useMemo(() => {
    if (typeof estimateSize === "function") {
      return estimateSize;
    }
    return () => estimateSize;
  }, [estimateSize]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: resolvedEstimateSize,
    overscan,
    ...virtualizerOptions,
  });

  // 暴露引用句柄
  useImperativeHandle(
    ref,
    () => ({
      scrollToIndex: (index, options) => {
        virtualizer.scrollToIndex(index, {
          align: options?.align ?? "start",
          behavior: prefersReducedMotion ? "instant" : "smooth",
        });
      },
      scrollToTop: () => {
        virtualizer.scrollToIndex(0, {
          align: "start",
          behavior: prefersReducedMotion ? "instant" : "smooth",
        });
      },
      scrollToBottom: () => {
        virtualizer.scrollToIndex(items.length - 1, {
          align: "end",
          behavior: prefersReducedMotion ? "instant" : "smooth",
        });
      },
      getScrollPosition: () => {
        return parentRef.current?.scrollTop ?? 0;
      },
      getVirtualizer: () => virtualizer,
    }),
    [virtualizer, items.length, prefersReducedMotion],
  );

  // 检测滚动位置并触发事件
  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const element = event.currentTarget;
      const { scrollTop, scrollHeight, clientHeight } = element;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      const distanceFromTop = scrollTop;

      const newIsAtBottom = distanceFromBottom <= bottomThreshold;
      const newIsAtTop = distanceFromTop <= topThreshold;

      if (newIsAtBottom !== isAtBottomInternal) {
        setIsAtBottomInternal(newIsAtBottom);
        onIsAtBottomChange?.(newIsAtBottom);
      }

      if (newIsAtTop && !isAtTopInternal) {
        onScrollToTop?.();
      }

      if (newIsAtBottom && !isAtBottomInternal) {
        onScrollToBottom?.();
      }

      setIsAtTopInternal(newIsAtTop);
      onScroll?.(event);
    },
    [
      bottomThreshold,
      topThreshold,
      isAtBottomInternal,
      isAtTopInternal,
      onScroll,
      onScrollToBottom,
      onScrollToTop,
      onIsAtBottomChange,
    ],
  );

  // 保持滚动位置稳定（当数据在顶部插入时）
  useEffect(() => {
    if (!maintainScrollPosition || !parentRef.current) return;

    const element = parentRef.current;
    const currentScrollHeight = element.scrollHeight;
    const previousScrollHeight = previousScrollHeightRef.current;
    const previousScrollTop = previousScrollTopRef.current;

    // 如果滚动高度增加且用户不在底部，调整滚动位置以保持视觉稳定
    if (currentScrollHeight > previousScrollHeight && !isAtBottom) {
      const heightDifference = currentScrollHeight - previousScrollHeight;
      element.scrollTop = previousScrollTop + heightDifference;
    }

    previousScrollHeightRef.current = currentScrollHeight;
    previousScrollTopRef.current = element.scrollTop;
  }, [items.length, maintainScrollPosition, isAtBottom]);

  // 跟随输出：当新数据添加且用户在底部时，自动滚动到底部
  useEffect(() => {
    if (!followOutput || !isAtBottom || items.length === 0) return;

    // 使用 requestAnimationFrame 确保在渲染完成后滚动
    const frameId = requestAnimationFrame(() => {
      virtualizer.scrollToIndex(items.length - 1, {
        align: "end",
        behavior: prefersReducedMotion ? "instant" : "smooth",
      });
    });

    return () => cancelAnimationFrame(frameId);
  }, [items.length, followOutput, isAtBottom, virtualizer, prefersReducedMotion]);

  // 键盘导航处理
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!enableKeyboardNavigation) return;

      let nextIndex = activeIndex;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          nextIndex = Math.min(activeIndex + 1, items.length - 1);
          break;
        case "ArrowUp":
          event.preventDefault();
          nextIndex = Math.max(activeIndex - 1, 0);
          break;
        case "Home":
          event.preventDefault();
          nextIndex = 0;
          break;
        case "End":
          event.preventDefault();
          nextIndex = items.length - 1;
          break;
        case "PageDown":
          event.preventDefault();
          // 向下翻页，大约 10 个项目
          nextIndex = Math.min(activeIndex + 10, items.length - 1);
          break;
        case "PageUp":
          event.preventDefault();
          // 向上翻页，大约 10 个项目
          nextIndex = Math.max(activeIndex - 10, 0);
          break;
        default:
          return;
      }

      if (nextIndex !== activeIndex) {
        if (onActiveIndexChange) {
          onActiveIndexChange(nextIndex);
        } else {
          setInternalActiveIndex(nextIndex);
        }
        // 确保活动项可见
        virtualizer.scrollToIndex(nextIndex, {
          align: "center",
          behavior: prefersReducedMotion ? "instant" : "auto",
        });
      }
    },
    [
      enableKeyboardNavigation,
      activeIndex,
      items.length,
      onActiveIndexChange,
      virtualizer,
      prefersReducedMotion,
    ],
  );

  // 动态高度测量回调 - 使用 @tanstack/react-virtual v3 的 measureElement API
  // v3 中 virtualizer.measureElement 接受元素作为参数，自动测量并更新尺寸
  const measureElementCallback = useCallback(
    (el: HTMLElement | null) => {
      if (!el || !enableDynamicHeight) return;
      virtualizer.measureElement(el);
    },
    [enableDynamicHeight, virtualizer],
  );

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className={cn("overflow-auto", className)}
      style={{
        height: height ?? "100%",
        width,
        ...style,
      }}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      onMouseUp={onMouseUp}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onWheel={onWheel}
      role="listbox"
      aria-label={ariaLabel}
      aria-activedescendant={
        enableKeyboardNavigation && items[activeIndex]
          ? `virtualized-list-item-${activeIndex}`
          : undefined
      }
      tabIndex={enableKeyboardNavigation ? 0 : undefined}
      data-virtualized-list="true"
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index];
          if (!item) return null;

          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={measureElementCallback}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualItem.start}px)`,
              }}
              id={`virtualized-list-item-${virtualItem.index}`}
              role="option"
              aria-selected={virtualItem.index === activeIndex}
            >
              {renderItem(item, virtualItem.index, virtualItem)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 虚拟化列表分隔符组件
 * 用于在列表中插入分隔符/分组标题
 */
export interface VirtualizedListSectionHeader {
  type: "section-header";
  id: string;
  title: string;
}

export interface VirtualizedListItem<T> {
  type: "item";
  id: string;
  data: T;
}

export type VirtualizedListEntry<T> = VirtualizedListSectionHeader | VirtualizedListItem<T>;
