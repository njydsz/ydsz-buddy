/**
 * @file useInfiniteScroll.ts
 * @description 无限滚动 Hook - 检测滚动到顶部/底部触发分页加载
 *
 * 特性：
 * - 检测滚动到顶部/底部触发加载
 * - 支持加载状态指示
 * - 支持"没有更多数据"状态
 * - 防抖和节流避免重复加载
 * - 支持错误处理和重试
 *
 * @module hooks/useInfiniteScroll
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** 无限滚动配置 */
export interface UseInfiniteScrollOptions {
  /** 滚动容器引用 */
  containerRef: React.RefObject<HTMLElement>;
  /** 触发加载的阈值（像素） */
  threshold?: number;
  /** 是否启用顶部加载 */
  enableTopLoad?: boolean;
  /** 是否启用底部加载 */
  enableBottomLoad?: boolean;
  /** 加载顶部数据的函数 */
  onLoadTop?: () => Promise<void> | void;
  /** 加载底部数据的函数 */
  onLoadBottom?: () => Promise<void> | void;
  /** 是否还有更多顶部数据 */
  hasMoreTop?: boolean;
  /** 是否还有更多底部数据 */
  hasMoreBottom?: boolean;
  /** 防抖延迟（毫秒） */
  debounceMs?: number;
  /** 是否启用 */
  enabled?: boolean;
}

/** 无限滚动状态 */
export interface UseInfiniteScrollResult {
  /** 是否正在加载顶部 */
  isLoadingTop: boolean;
  /** 是否正在加载底部 */
  isLoadingBottom: boolean;
  /** 顶部加载错误 */
  topError: Error | null;
  /** 底部加载错误 */
  bottomError: Error | null;
  /** 重试顶部加载 */
  retryLoadTop: () => void;
  /** 重试底部加载 */
  retryLoadBottom: () => void;
  /** 重置错误状态 */
  resetErrors: () => void;
}

/**
 * 无限滚动 Hook
 *
 * @example
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 * const { isLoadingTop, isLoadingBottom, retryLoadTop } = useInfiniteScroll({
 *   containerRef,
 *   threshold: 100,
 *   enableTopLoad: true,
 *   enableBottomLoad: true,
 *   onLoadTop: async () => {
 *     await loadMoreMessages();
 *   },
 *   onLoadBottom: async () => {
 *     await loadMoreHistory();
 *   },
 *   hasMoreTop: hasMoreMessages,
 *   hasMoreBottom: hasMoreHistory,
 * });
 * ```
 */
export function useInfiniteScroll({
  containerRef,
  threshold = 100,
  enableTopLoad = false,
  enableBottomLoad = false,
  onLoadTop,
  onLoadBottom,
  hasMoreTop = true,
  hasMoreBottom = true,
  debounceMs = 200,
  enabled = true,
}: UseInfiniteScrollOptions): UseInfiniteScrollResult {
  const [isLoadingTop, setIsLoadingTop] = useState(false);
  const [isLoadingBottom, setIsLoadingBottom] = useState(false);
  const [topError, setTopError] = useState<Error | null>(null);
  const [bottomError, setBottomError] = useState<Error | null>(null);

  const lastTopLoadTimeRef = useRef(0);
  const lastBottomLoadTimeRef = useRef(0);
  const isTopLoadingRef = useRef(false);
  const isBottomLoadingRef = useRef(false);

  // 重置错误
  const resetErrors = useCallback(() => {
    setTopError(null);
    setBottomError(null);
  }, []);

  // 重试顶部加载
  const retryLoadTop = useCallback(async () => {
    if (!onLoadTop || isTopLoadingRef.current || !hasMoreTop) return;

    setTopError(null);
    isTopLoadingRef.current = true;
    setIsLoadingTop(true);

    try {
      await onLoadTop();
      lastTopLoadTimeRef.current = Date.now();
    } catch (error) {
      setTopError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      isTopLoadingRef.current = false;
      setIsLoadingTop(false);
    }
  }, [onLoadTop, hasMoreTop]);

  // 重试底部加载
  const retryLoadBottom = useCallback(async () => {
    if (!onLoadBottom || isBottomLoadingRef.current || !hasMoreBottom) return;

    setBottomError(null);
    isBottomLoadingRef.current = true;
    setIsLoadingBottom(true);

    try {
      await onLoadBottom();
      lastBottomLoadTimeRef.current = Date.now();
    } catch (error) {
      setBottomError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      isBottomLoadingRef.current = false;
      setIsLoadingBottom(false);
    }
  }, [onLoadBottom, hasMoreBottom]);

  // 滚动事件处理
  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    const container = containerRef.current;

    const handleScroll = () => {
      const now = Date.now();
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromTop = scrollTop;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

      // 顶部加载
      if (
        enableTopLoad &&
        hasMoreTop &&
        !isTopLoadingRef.current &&
        distanceFromTop <= threshold &&
        now - lastTopLoadTimeRef.current > debounceMs
      ) {
        void retryLoadTop();
      }

      // 底部加载
      if (
        enableBottomLoad &&
        hasMoreBottom &&
        !isBottomLoadingRef.current &&
        distanceFromBottom <= threshold &&
        now - lastBottomLoadTimeRef.current > debounceMs
      ) {
        void retryLoadBottom();
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [
    enabled,
    enableTopLoad,
    enableBottomLoad,
    hasMoreTop,
    hasMoreBottom,
    threshold,
    debounceMs,
    retryLoadTop,
    retryLoadBottom,
  ]);

  return {
    isLoadingTop,
    isLoadingBottom,
    topError,
    bottomError,
    retryLoadTop,
    retryLoadBottom,
    resetErrors,
  };
}

/**
 * 简化的无限滚动 Hook（仅支持单向加载）
 *
 * @example
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 * const { isLoading, hasMore, retry } = useSimpleInfiniteScroll({
 *   containerRef,
 *   threshold: 100,
 *   onLoad: async () => {
 *     await loadMoreMessages();
 *   },
 *   hasMore: hasMoreMessages,
 * });
 * ```
 */
export function useSimpleInfiniteScroll({
  containerRef,
  threshold = 100,
  onLoad,
  hasMore = true,
  debounceMs = 200,
  enabled = true,
}: {
  containerRef: React.RefObject<HTMLElement>;
  threshold?: number;
  onLoad: () => Promise<void> | void;
  hasMore?: boolean;
  debounceMs?: number;
  enabled?: boolean;
}): {
  isLoading: boolean;
  error: Error | null;
  retry: () => void;
} {
  const result = useInfiniteScroll({
    containerRef,
    threshold,
    enableBottomLoad: true,
    onLoadBottom: onLoad,
    hasMoreBottom: hasMore,
    debounceMs,
    enabled,
  });

  return {
    isLoading: result.isLoadingBottom,
    error: result.bottomError,
    retry: result.retryLoadBottom,
  };
}
