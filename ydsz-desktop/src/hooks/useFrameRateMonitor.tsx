/**
 * @file 帧率监控 Hook
 *
 * 持续监控 UI 帧率，自动降级动画：
 * - 帧率 < 50fps → 降级动画（关闭模糊/阴影/过渡）
 * - 帧率 < 30fps → 弹"性能模式？"建议
 * - 长任务 > 5s → 弹"是否切换到性能模式"
 *
 * ## 核心功能
 *
 * - **帧率监控**：requestAnimationFrame 计数
 * - **自动降级**：根据帧率自动调整动画
 * - **性能模式**：用户可手动切换
 * - **CSS 注入**：将当前模式写入 `<html data-performance-mode>` 和
 *   `data-reduce-motion` 属性,让全局 CSS 同步生效
 * - **脱敏上报**：将帧率数据按 5fps 桶聚合,只上报聚合统计,
 *   避免泄露用户操作节律;不持久化到 localStorage
 *
 * ## 使用场景
 *
 * - 全局性能监控
 * - 长任务性能优化
 * - 用户体验优化
 *
 * ## 注意事项
 *
 * - 不影响主线程
 * - 降级策略渐进式
 * - 用户可手动覆盖
 * - 上报频率限制为每 30s 一次,避免日志爆炸
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { metricsCollector } from "../lib/performanceMetrics";

/** 性能模式 */
export type PerformanceMode = "normal" | "reduced" | "minimal";

interface UseFrameRateMonitorOptions {
  /** 是否启用 */
  enabled?: boolean;
  /** 采样间隔（毫秒） */
  sampleIntervalMs?: number;
  /** 降级阈值 */
  reducedThreshold?: number;
  /** 最小阈值 */
  minimalThreshold?: number;
  /**
   * 启动保护期（毫秒）：启动后这段时间内不触发性能建议，避免 Vite 编译导致误判。
   * 默认 8000ms。测试时可设为 0 禁用。
   */
  startupGracePeriodMs?: number;
  /**
   * 连续低 fps 采样次数阈值：连续多少次低 fps 才触发建议。
   * 默认 3。测试时可设为 1 立即触发。
   */
  lowFpsStreakThreshold?: number;
  /**
   * 上报回调(可选)。当帧率样本就绪时调用,
   * 传入已经脱敏、聚合的统计对象。
   * 默认行为是写入 `metricsCollector` 供内部仪表盘消费。
   */
  onReport?: (snapshot: FrameRateReportSnapshot) => void;
}

interface UseFrameRateMonitorResult {
  /** 当前帧率 */
  frameRate: number;
  /** 当前性能模式 */
  performanceMode: PerformanceMode;
  /** 是否应该降级动画 */
  shouldReduceMotion: boolean;
  /** 手动设置性能模式(并锁定为用户偏好) */
  setPerformanceMode: (mode: PerformanceMode) => void;
  /**
   * 清除用户手动覆盖,回到 auto 模式(由帧率自动决定)。
   * 下一次采样时若 fps < minimalThreshold 会再次降级。
   */
  clearPerformanceOverride: () => void;
  /** 当前是否被用户手动锁定(`true` = 已覆盖,`false` = 跟随帧率) */
  hasUserOverride: boolean;
  /** 是否显示性能建议 */
  showPerformanceSuggestion: boolean;
  /** 关闭性能建议 */
  dismissPerformanceSuggestion: () => void;
  /**
   * 最近的脱敏上报快照(用于调试/UI 展示)。
   * `null` 表示尚未生成。
   */
  lastReport: FrameRateReportSnapshot | null;
}

/** 帧率脱敏上报快照 */
export interface FrameRateReportSnapshot {
  /** 5fps 桶聚合后的样本数 */
  sampleCount: number;
  /** 平均帧率(已经按桶聚合) */
  averageFps: number;
  /** 最低帧率 */
  minFps: number;
  /** 最高帧率 */
  maxFps: number;
  /** 当前性能模式 */
  mode: PerformanceMode;
  /** 采样区间起始时间(已脱敏为分钟级) */
  bucketStart: number;
}

/** 帧率桶宽度(fps) */
const FRAME_RATE_BUCKET_SIZE = 5;
/** 上报聚合窗口(毫秒) */
const REPORT_WINDOW_MS = 30_000;
/** 启动保护期(毫秒)：启动后这段时间内不触发性能建议，避免 Vite 编译导致误判 */
const STARTUP_GRACE_PERIOD_MS = 8_000;
/** 连续低 fps 采样次数阈值：连续多少次低 fps 才触发建议 */
const LOW_FPS_STREAK_THRESHOLD = 3;
/** DOM 属性: data-performance-mode */
const DATA_PERF_MODE_ATTR = "data-performance-mode";
/** DOM 属性: data-reduce-motion */
const DATA_REDUCE_MOTION_ATTR = "data-reduce-motion";

/**
 * 将单帧帧率按桶聚合,避免上报连续精确值。
 *
 * 例如 47fps → bucket 45;63fps → bucket 65。
 */
function bucketFrameRate(fps: number): number {
  if (!Number.isFinite(fps) || fps < 0) return 0;
  return Math.round(fps / FRAME_RATE_BUCKET_SIZE) * FRAME_RATE_BUCKET_SIZE;
}

/**
 * 将毫秒时间戳脱敏到分钟级(去除秒/毫秒)。
 *
 * 这样上报的时间只能精确到分钟,既保留时序信息,又无法反推
 * 用户操作的具体秒数。
 */
function desensitizeTimestamp(timestamp: number): number {
  const ONE_MINUTE = 60_000;
  return Math.floor(timestamp / ONE_MINUTE) * ONE_MINUTE;
}

/**
 * 将当前性能模式写入 <html> 标签,让全局 CSS 同步生效。
 *
 * - normal: data-performance-mode="normal" data-reduce-motion="false"
 * - reduced: data-performance-mode="reduced" data-reduce-motion="true"
 * - minimal: data-performance-mode="minimal" data-reduce-motion="true"
 *
 * 全局样式表可通过 `[data-reduce-motion="true"] *` 选择器统一关闭动画/过渡。
 */
function applyPerformanceModeToDom(mode: PerformanceMode): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!root) return;
  root.setAttribute(DATA_PERF_MODE_ATTR, mode);
  root.setAttribute(
    DATA_REDUCE_MOTION_ATTR,
    mode === "normal" ? "false" : "true",
  );
}

/**
 * 帧率监控 Hook
 */
export function useFrameRateMonitor(
  options: UseFrameRateMonitorOptions = {},
): UseFrameRateMonitorResult {
  const {
    enabled = true,
    sampleIntervalMs = 1000,
    reducedThreshold = 50,
    minimalThreshold = 30,
    startupGracePeriodMs = STARTUP_GRACE_PERIOD_MS,
    lowFpsStreakThreshold = LOW_FPS_STREAK_THRESHOLD,
    onReport,
  } = options;

  const [frameRate, setFrameRate] = useState(60);
  const [performanceMode, setPerformanceModeState] = useState<PerformanceMode>("normal");
  const [hasUserOverride, setHasUserOverride] = useState(false);
  const [showPerformanceSuggestion, setShowPerformanceSuggestion] = useState(false);
  const [lastReport, setLastReport] = useState<FrameRateReportSnapshot | null>(null);

  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const animationFrameRef = useRef<number | null>(null);
  const userOverrideRef = useRef(false);
  const startupTimeRef = useRef(performance.now());
  const lowFpsStreakRef = useRef(0);

  // 脱敏上报聚合:累积一个上报窗口内的桶聚合数据
  const windowSamplesRef = useRef<{
    bucketStart: number;
    samples: number[];
    minFps: number;
    maxFps: number;
  }>({
    bucketStart: Date.now(),
    samples: [],
    minFps: Number.POSITIVE_INFINITY,
    maxFps: Number.NEGATIVE_INFINITY,
  });
  const lastReportAtRef = useRef<number>(0);

  /**
   * 把一次采样结果计入聚合窗口,达到上报窗口时生成快照
   */
  const recordSampleForReport = useCallback(
    (rawFps: number) => {
      const bucketedFps = bucketFrameRate(rawFps);
      const windowState = windowSamplesRef.current;
      const now = Date.now();

      // 滚动窗口:超过上报窗口则 flush
      if (now - windowState.bucketStart >= REPORT_WINDOW_MS) {
        const sampleCount = windowState.samples.length;
        if (sampleCount > 0) {
          const sum = windowState.samples.reduce((acc, fps) => acc + fps, 0);
          const snapshot: FrameRateReportSnapshot = {
            sampleCount,
            averageFps: Math.round(sum / sampleCount),
            minFps: windowState.minFps,
            maxFps: windowState.maxFps,
            mode: performanceModeRef.current,
            bucketStart: desensitizeTimestamp(windowState.bucketStart),
          };
          // 写入指标收集器(类型 frame_rate)
          metricsCollector.record({
            type: "frame_rate",
            name: "ui.fps.window",
            duration: snapshot.averageFps,
            timestamp: now,
            metadata: {
              sampleCount: snapshot.sampleCount,
              minFps: snapshot.minFps,
              maxFps: snapshot.maxFps,
              mode: snapshot.mode,
              bucketStart: snapshot.bucketStart,
            },
          });
          if (onReport) {
            try {
              onReport(snapshot);
            } catch (error) {
              console.error("[frame-rate-monitor] onReport callback threw:", error);
            }
          }
          setLastReport(snapshot);
          lastReportAtRef.current = now;
        }
        // 重置窗口
        windowSamplesRef.current = {
          bucketStart: now,
          samples: [],
          minFps: Number.POSITIVE_INFINITY,
          maxFps: Number.NEGATIVE_INFINITY,
        };
      }

      // 累计本次样本
      windowState.samples.push(bucketedFps);
      if (bucketedFps < windowState.minFps) {
        windowState.minFps = bucketedFps;
      }
      if (bucketedFps > windowState.maxFps) {
        windowState.maxFps = bucketedFps;
      }
    },
    [onReport],
  );

  // 镜像 performanceMode 的最新值,避免在 recordSampleForReport 闭包里陈旧
  const performanceModeRef = useRef<PerformanceMode>(performanceMode);
  useEffect(() => {
    performanceModeRef.current = performanceMode;
  }, [performanceMode]);

  // 帧率计数
  const countFrame = useCallback(() => {
    frameCountRef.current++;

    const now = performance.now();
    const elapsed = now - lastTimeRef.current;

    if (elapsed >= sampleIntervalMs) {
      const fps = Math.round((frameCountRef.current * 1000) / elapsed);

      // 仅在 fps 数值变化时才 setFrameRate,避免每秒无意义重渲染
      // (RootRouteView 订阅了 frameRate,无变化的 setState 会触发
      //  整棵子树重新渲染,叠加 _dbg fetch 风暴曾导致启动卡死)
      setFrameRate((prev) => (prev === fps ? prev : fps));

      // 自动降级（如果用户没有手动覆盖）
      if (!userOverrideRef.current) {
        const nextMode: PerformanceMode =
          fps < minimalThreshold
            ? "minimal"
            : fps < reducedThreshold
              ? "reduced"
              : "normal";
        // 仅在性能模式实际变化时才 setState,减少不必要的重渲染
        setPerformanceModeState((prev) =>
          prev === nextMode ? prev : nextMode,
        );
        const elapsedSinceStartup = now - startupTimeRef.current;
        const inGracePeriod = elapsedSinceStartup < startupGracePeriodMs;
        if (nextMode === "minimal" && !inGracePeriod) {
          lowFpsStreakRef.current += 1;
          if (lowFpsStreakRef.current >= lowFpsStreakThreshold) {
            setShowPerformanceSuggestion(true);
          }
        } else {
          lowFpsStreakRef.current = 0;
          if (nextMode === "normal") {
            setShowPerformanceSuggestion(false);
          }
        }
      }

      // 重置计数
      frameCountRef.current = 0;
      lastTimeRef.current = now;

      // 脱敏上报(默认 30s 聚合窗口)
      recordSampleForReport(fps);
    }

    animationFrameRef.current = requestAnimationFrame(countFrame);
  }, [sampleIntervalMs, reducedThreshold, minimalThreshold, startupGracePeriodMs, lowFpsStreakThreshold, recordSampleForReport]);
  // 启动/停止监控
  useEffect(() => {
    if (!enabled) return;

    animationFrameRef.current = requestAnimationFrame(countFrame);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [enabled, countFrame]);

  // 将性能模式同步到 DOM,让全局 CSS 选择器生效
  useEffect(() => {
    applyPerformanceModeToDom(performanceMode);
  }, [performanceMode]);

  // 组件卸载时 flush 一次未上报窗口
  useEffect(() => {
    return () => {
      const windowState = windowSamplesRef.current;
      if (windowState.samples.length === 0) return;
      const sampleCount = windowState.samples.length;
      const sum = windowState.samples.reduce((acc, fps) => acc + fps, 0);
      const snapshot: FrameRateReportSnapshot = {
        sampleCount,
        averageFps: Math.round(sum / sampleCount),
        minFps: windowState.minFps,
        maxFps: windowState.maxFps,
        mode: performanceModeRef.current,
        bucketStart: desensitizeTimestamp(windowState.bucketStart),
      };
      if (onReport) {
        try {
          onReport(snapshot);
        } catch {
          // 卸载阶段不再抛出
        }
      }
    };
  }, [onReport]);

  // 手动设置性能模式
  const setPerformanceMode = useCallback((mode: PerformanceMode) => {
    userOverrideRef.current = true;
    setHasUserOverride(true);
    setPerformanceModeState(mode);
    setShowPerformanceSuggestion(false);
  }, []);

  // 清除用户覆盖,回到 auto 模式
  const clearPerformanceOverride = useCallback(() => {
    userOverrideRef.current = false;
    setHasUserOverride(false);
    setShowPerformanceSuggestion(false);
  }, []);

  // 关闭性能建议
  const dismissPerformanceSuggestion = useCallback(() => {
    setShowPerformanceSuggestion(false);
  }, []);

  // 是否应该降级动画
  const shouldReduceMotion = performanceMode !== "normal";

  return {
    frameRate,
    performanceMode,
    shouldReduceMotion,
    setPerformanceMode,
    clearPerformanceOverride,
    hasUserOverride,
    showPerformanceSuggestion,
    dismissPerformanceSuggestion,
    lastReport,
  };
}

/**
 * 性能建议对话框
 */
export function PerformanceSuggestionDialog({
  isOpen,
  frameRate,
  onEnablePerformanceMode,
  onDismiss,
}: {
  isOpen: boolean;
  frameRate: number;
  onEnablePerformanceMode: () => void;
  onDismiss: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border border-border bg-card p-4 shadow-lg"
      role="dialog"
      aria-modal="false"
      aria-labelledby="perf-suggestion-title"
      aria-describedby="perf-suggestion-description"
    >
      <h3 id="perf-suggestion-title" className="mb-2 text-sm font-semibold">
        性能建议
      </h3>
      <p id="perf-suggestion-description" className="mb-3 text-xs text-muted-foreground">
        检测到帧率较低（{frameRate} fps），建议开启性能模式以获得更流畅的体验。
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={onEnablePerformanceMode}
          className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          开启性能模式
        </button>
        <button
          onClick={onDismiss}
          className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
        >
          忽略
        </button>
      </div>
    </div>
  );
}
