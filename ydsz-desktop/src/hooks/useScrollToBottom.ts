/**
 * @file useScrollToBottom.ts
 * @description 智能滚动到底部 Hook - 自动跟踪新内容或保持用户位置
 *
 * 特性：
 * - 新消息自动滚动到底部
 * - 用户滚动时保持位置
 * - 支持手动滚动到底部
 * - 支持"是否显示滚动到底部按钮"状态
 *
 * @module hooks/useScrollToBottom
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** 滚动到底部配置 */
export interface UseScrollToBottomOptions {
  /** 滚动容器引用 */
  containerRef: React.RefObject<HTMLElement>;
  /** 是否启用自动滚动（当用户在底部时） */
  autoScroll?: boolean;
  /** 距离底部多少像素内视为在底部 */
  threshold?: number;
  /** 滚动行为 */
  behavior?: ScrollBehavior;
  /** 是否在内容变化时检查滚动 */
  watchContentChanges?: boolean;
}

/** 滚动到底部状态 */
export interface UseScrollToBottomResult {
  /** 是否显示滚动到底部按钮（用户不在底部） */
  shouldShowScrollButton: boolean;
  /** 手动滚动到底部 */
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  /** 是否在底部 */
  isAtBottom: boolean;
}

/**
 * 智能滚动到底部 Hook
 *
 * @example
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 * const { shouldShowScrollButton, scrollToBottom, isAtBottom } = useScrollToBottom({
 *   containerRef,
 *   autoScroll: true,
 *   threshold: 50,
 * });
 *
 * // 在 JSX 中
 * <div ref={containerRef} onScroll={handleScroll}>
 *   {messages.map(msg => <Message key={msg.id} {...msg} />)}
 * </div>
 * {shouldShowScrollButton && (
 *   <button onClick={() => scrollToBottom()}>
 *     滚动到底部
 *   </button>
 * )}
 * ```
 */
export function useScrollToBottom({
  containerRef,
  autoScroll = true,
  threshold = 50,
  behavior = "smooth",
  watchContentChanges = true,
}: UseScrollToBottomOptions): UseScrollToBottomResult {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [shouldShowScrollButton, setShouldShowScrollButton] = useState(false);
  const userHasScrolledRef = useRef(false);
  const lastScrollHeightRef = useRef(0);

  // 滚动到底部
  const scrollToBottom = useCallback(
    (scrollBehavior?: ScrollBehavior) => {
      if (!containerRef.current) return;

      const element = containerRef.current;
      element.scrollTo({
        top: element.scrollHeight,
        behavior: scrollBehavior ?? behavior,
      });

      // 重置用户滚动标记
      userHasScrolledRef.current = false;
    },
    [containerRef, behavior],
  );

  // 检测是否在底部
  const checkIfAtBottom = useCallback(() => {
    if (!containerRef.current) return;

    const element = containerRef.current;
    const { scrollTop, scrollHeight, clientHeight } = element;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    const atBottom = distanceFromBottom <= threshold;
    setIsAtBottom(atBottom);
    setShouldShowScrollButton(!atBottom);

    return atBottom;
  }, [containerRef, threshold]);

  // 监听滚动事件
  useEffect(() => {
    if (!containerRef.current) return;

    const element = containerRef.current;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = element;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

      // 如果用户向上滚动超过阈值，标记为用户已滚动
      if (distanceFromBottom > threshold) {
        userHasScrolledRef.current = true;
      } else {
        // 用户滚动到底部
        userHasScrolledRef.current = false;
      }

      checkIfAtBottom();
    };

    element.addEventListener("scroll", handleScroll, { passive: true });

    // 初始检查
    checkIfAtBottom();

    return () => element.removeEventListener("scroll", handleScroll);
  }, [containerRef, threshold, checkIfAtBottom]);

  // 监听内容变化并自动滚动
  useEffect(() => {
    if (!autoScroll || !watchContentChanges || !containerRef.current) return;

    const element = containerRef.current;
    const currentScrollHeight = element.scrollHeight;
    const previousScrollHeight = lastScrollHeightRef.current;

    // 如果内容高度增加且用户没有主动滚动，自动滚动到底部
    if (currentScrollHeight > previousScrollHeight && !userHasScrolledRef.current) {
      // 使用 requestAnimationFrame 确保在渲染完成后滚动
      const frameId = requestAnimationFrame(() => {
        if (!userHasScrolledRef.current) {
          scrollToBottom("auto");
        }
      });

      lastScrollHeightRef.current = currentScrollHeight;

      return () => cancelAnimationFrame(frameId);
    }

    lastScrollHeightRef.current = currentScrollHeight;
  }, [autoScroll, watchContentChanges, containerRef, scrollToBottom]);

  return {
    shouldShowScrollButton,
    scrollToBottom,
    isAtBottom,
  };
}

/**
 * 简化的滚动跟踪 Hook（仅跟踪是否在底部）
 *
 * @example
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 * const isAtBottom = useScrollTracking({ containerRef });
 *
 * useEffect(() => {
 *   if (isAtBottom) {
 *     console.log("User is at bottom");
 *   }
 * }, [isAtBottom]);
 * ```
 */
export function useScrollTracking({
  containerRef,
  threshold = 50,
}: {
  containerRef: React.RefObject<HTMLElement>;
  threshold?: number;
}): boolean {
  const [isAtBottom, setIsAtBottom] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;

    const element = containerRef.current;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = element;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      setIsAtBottom(distanceFromBottom <= threshold);
    };

    element.addEventListener("scroll", handleScroll, { passive: true });

    // 初始检查
    handleScroll();

    return () => element.removeEventListener("scroll", handleScroll);
  }, [containerRef, threshold]);

  return isAtBottom;
}
