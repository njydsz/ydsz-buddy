/**
 * @file 启动优化 Hook
 *
 * 实现启动性能优化：
 * - 懒加载非关键组件
 * - 延迟初始化 Provider
 * - 预加载关键数据
 * - 启动时间监控
 *
 * ## 核心功能
 *
 * - **懒加载**：React.lazy + Suspense
 * - **延迟初始化**：非关键 Provider 延迟 500ms
 * - **预加载**：启动时预加载最近会话
 * - **性能监控**：记录启动时间
 *
 * ## 使用场景
 *
 * - 应用启动优化
 * - 首屏加载加速
 * - 用户体验提升
 *
 * ## 注意事项
 *
 * - 不影响关键路径
 * - 监控启动性能
 * - 渐进式加载
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface UseStartupOptimizationOptions {
  /** 是否启用优化 */
  enabled?: boolean;
  /** Provider 延迟初始化时间（毫秒） */
  providerDelayMs?: number;
}

interface UseStartupOptimizationResult {
  /** 启动阶段 */
  phase: "initializing" | "loading-critical" | "loading-non-critical" | "ready";
  /** 启动时间（毫秒） */
  startupTime: number;
  /** 是否就绪 */
  isReady: boolean;
  /** 预加载数据 */
  preloadData: PreloadData | null;
}

interface PreloadData {
  /** 最近的会话列表 */
  recentThreads: Array<{ id: string; title: string }>;
  /** 当前 Provider 状态 */
  providerStatus: Record<string, boolean>;
}

/**
 * 启动优化 Hook
 */
export function useStartupOptimization(
  options: UseStartupOptimizationOptions = {},
): UseStartupOptimizationResult {
  const { enabled = true, providerDelayMs = 500 } = options;

  const [phase, setPhase] = useState<UseStartupOptimizationResult["phase"]>("initializing");
  const [startupTime, setStartupTime] = useState(0);
  const [preloadData, setPreloadData] = useState<PreloadData | null>(null);

  const startTimeRef = useRef(performance.now());

  // 阶段 1: 加载关键数据
  useEffect(() => {
    if (!enabled) return;

    const loadCriticalData = async () => {
      setPhase("loading-critical");

      try {
        // 预加载最近的会话
        const threads = await invoke<Array<{ id: string; title: string }>>("threads_list_recent", {
          limit: 10,
        });

        // 预加载当前 Provider 状态
        const providerStatus = await invoke<Record<string, boolean>>("provider_status_all");

        setPreloadData({
          recentThreads: threads,
          providerStatus,
        });

        // 阶段 2: 延迟加载非关键组件
        setTimeout(() => {
          setPhase("loading-non-critical");

          // 阶段 3: 就绪
          setTimeout(() => {
            setPhase("ready");
            setStartupTime(performance.now() - startTimeRef.current);

            // TODO: 上报启动时间
            console.log(`[Startup] Ready in ${Math.round(performance.now() - startTimeRef.current)}ms`);
          }, 100);
        }, providerDelayMs);
      } catch (error) {
        console.error("Failed to preload data:", error);
        setPhase("ready");
        setStartupTime(performance.now() - startTimeRef.current);
      }
    };

    void loadCriticalData();
  }, [enabled, providerDelayMs]);

  const isReady = phase === "ready";

  return {
    phase,
    startupTime,
    isReady,
    preloadData,
  };
}

/**
 * 懒加载包装器
 */
export function lazyLoad<T>(importFn: () => Promise<{ default: T }>) {
  return async () => {
    const startTime = performance.now();
    const module = await importFn();
    const loadTime = performance.now() - startTime;

    // TODO: 上报加载时间
    if (loadTime > 100) {
      console.warn(`[LazyLoad] Slow load: ${Math.round(loadTime)}ms`);
    }

    return module;
  };
}

/**
 * 启动性能监控
 */
export function useStartupPerformance() {
  const metricsRef = useRef({
    domReady: 0,
    firstPaint: 0,
    firstContentfulPaint: 0,
    timeToInteractive: 0,
  });

  useEffect(() => {
    // 监听性能事件
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === "domContentLoadedEventEnd") {
          metricsRef.current.domReady = entry.startTime;
        } else if (entry.name === "first-paint") {
          metricsRef.current.firstPaint = entry.startTime;
        } else if (entry.name === "first-contentful-paint") {
          metricsRef.current.firstContentfulPaint = entry.startTime;
        }
      }
    });

    observer.observe({ entryTypes: ["navigation", "paint"] });

    return () => observer.disconnect();
  }, []);

  const getMetrics = useCallback(() => {
    return metricsRef.current;
  }, []);

  return { getMetrics };
}
