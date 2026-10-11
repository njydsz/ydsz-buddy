/**
 * @file Web Vitals 性能监控模块
 * @description 使用浏览器原生 PerformanceObserver API 采集 Core Web Vitals 指标
 * 并通过 Tauri command 上报到后端遥测系统。
 *
 * 监控指标：
 * - LCP (Largest Contentful Paint) — 最大内容绘制，衡量加载性能
 * - CLS (Cumulative Layout Shift) — 累积布局偏移，衡量视觉稳定性
 * - TTFB (Time to First Byte) — 首字节时间，衡量服务器响应速度
 * - INP (Interaction to Next Paint) — 交互延迟，衡量交互响应性
 *
 * 设计原则：
 * - 零依赖：仅使用浏览器原生 API
 * - 轻量：仅在页面加载时注册 Observer，采样结束后自动清理
 * - 降级：非浏览器环境（SSR、旧浏览器）下 no-op
 */

import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// 类型定义
// ============================================================================

/** Web Vitals 指标数据 */
interface WebVitalsMetric {
  /** 指标名称 */
  name: "LCP" | "CLS" | "TTFB" | "INP" | "FCP";
  /** 指标值（毫秒或分数） */
  value: number;
  /** 指标评级：good / needs-improvement / poor */
  rating: "good" | "needs-improvement" | "poor";
  /** 采集时间戳 */
  timestamp: number;
  /** 页面 URL */
  url: string;
}

// ============================================================================
// 评级阈值（对齐 Google Web Vitals 推荐值）
// ============================================================================

const LCP_THRESHOLDS = { good: 2500, needsImprovement: 4000 }; // ms
const CLS_THRESHOLDS = { good: 0.1, needsImprovement: 0.25 }; // score
const TTFB_THRESHOLDS = { good: 800, needsImprovement: 1800 }; // ms
const INP_THRESHOLDS = { good: 200, needsImprovement: 500 }; // ms
const FCP_THRESHOLDS = { good: 1800, needsImprovement: 3000 }; // ms

/** 根据阈值判断评级 */
function getRating(
  value: number,
  thresholds: { good: number; needsImprovement: number },
): "good" | "needs-improvement" | "poor" {
  if (value <= thresholds.good) return "good";
  if (value <= thresholds.needsImprovement) return "needs-improvement";
  return "poor";
}

// ============================================================================
// 上报后端
// ============================================================================

/**
 * 通过 Tauri command 将 Web Vitals 数据上报到后端遥测系统。
 * 失败时静默降级，不影响用户体验。
 */
async function reportToBackend(metric: WebVitalsMetric): Promise<void> {
  try {
    await invoke("telemetry_record_event", {
      event: {
        WebVitals: metric,
      },
    });
  } catch {
    // 降级：如果不可用，输出到 console（dev mode）
    import.meta.env.DEV &&
      console.debug("[webVitals] backend report failed:", metric.name, metric.value);
  }
}

/**
 * 上报指标输出到 console（开发模式下调试用）
 */
function logMetric(metric: WebVitalsMetric): void {
  const emoji =
    metric.rating === "good" ? "🟢" : metric.rating === "needs-improvement" ? "🟡" : "🔴";
  console.log(
    `[WebVitals] ${emoji} ${metric.name}: ${metric.value.toFixed(metric.name === "CLS" ? 4 : 1)}${metric.name === "CLS" ? "" : "ms"} (${metric.rating})`,
  );
}

// ============================================================================
// Observer 注册
// ============================================================================

/** 当前已注册的观察器，用于清理 */
const observers: PerformanceObserver[] = [];

/** 已上报的指标计数 */
let reportedCount = 0;

/** 上报防抖定时器 */
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** 待上报的指标缓冲 */
const pendingMetrics: WebVitalsMetric[] = [];

function setupLCPObserver(): void {
  try {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      if (!lastEntry) return;

      const value = lastEntry.startTime;
      enqueueMetric({
        name: "LCP",
        value,
        rating: getRating(value, LCP_THRESHOLDS),
        timestamp: Date.now(),
        url: window.location.href,
      });
    });
    observer.observe({ type: "largest-contentful-paint", buffered: true });
    observers.push(observer);
  } catch {
    // LCP not supported
  }
}

function setupCLSObserver(): void {
  try {
    let clsValue = 0;
    let sessionValue = 0;
    let sessionEntries: PerformanceEntry[] = [];

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const layoutShiftEntry = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
        // 忽略最近 500ms 内有用户输入的布局偏移
        if (layoutShiftEntry.hadRecentInput) continue;

        const firstEntry = sessionEntries[0];
        const lastEntry = sessionEntries[sessionEntries.length - 1];

        if (
          sessionValue &&
          layoutShiftEntry.startTime - (lastEntry?.endTime ?? 0) < 1000 &&
          layoutShiftEntry.startTime - (firstEntry?.startTime ?? 0) < 5000
        ) {
          sessionValue += layoutShiftEntry.value;
          sessionEntries.push(entry);
        } else {
          sessionValue = layoutShiftEntry.value;
          sessionEntries = [entry];
        }

        if (sessionValue > clsValue) {
          clsValue = sessionValue;
          enqueueMetric({
            name: "CLS",
            value: clsValue,
            rating: getRating(clsValue, CLS_THRESHOLDS),
            timestamp: Date.now(),
            url: window.location.href,
          });
        }
      }
    });
    observer.observe({ type: "layout-shift", buffered: true });
    observers.push(observer);
  } catch {
    // CLS not supported
  }
}

function setupINPObserver(): void {
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const eventTiming = entry as PerformanceEntry & { processingStart?: number; duration?: number };
        // 使用 duration 作为 INP 近似值
        const duration = eventTiming.duration ?? entry.duration;
        if (duration < 16) continue; // 过滤极短的交互

        enqueueMetric({
          name: "INP",
          value: duration,
          rating: getRating(duration, INP_THRESHOLDS),
          timestamp: Date.now(),
          url: window.location.href,
        });
      }
    });
    observer.observe({ type: "event", buffered: true, durationThreshold: 16 });
    observers.push(observer);
  } catch {
    // INP not supported (durationThreshold 或 event type)
  }
}

function setupFCPObserver(): void {
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === "first-contentful-paint") {
          const value = entry.startTime;
          enqueueMetric({
            name: "FCP",
            value,
            rating: getRating(value, FCP_THRESHOLDS),
            timestamp: Date.now(),
            url: window.location.href,
          });
        }
      }
    });
    observer.observe({ type: "paint", buffered: true });
    observers.push(observer);
  } catch {
    // FCP not supported
  }
}

function measureTTFB(): void {
  try {
    const navEntry = performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming | undefined;
    if (navEntry) {
      const ttfb = navEntry.responseStart - navEntry.requestStart;
      enqueueMetric({
        name: "TTFB",
        value: ttfb,
        rating: getRating(ttfb, TTFB_THRESHOLDS),
        timestamp: Date.now(),
        url: window.location.href,
      });
    }
  } catch {
    // TTFB not available
  }
}

/** 将指标加入待上报缓冲区，并调度批量上报 */
function enqueueMetric(metric: WebVitalsMetric): void {
  logMetric(metric);
  pendingMetrics.push(metric);
  reportedCount++;

  // 防抖：500ms 内不重复上报
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushMetrics, 500);
}

/** 批量上报缓冲区中的指标 */
async function flushMetrics(): Promise<void> {
  if (pendingMetrics.length === 0) return;

  const metrics = [...pendingMetrics];
  pendingMetrics.length = 0;

  for (const metric of metrics) {
    await reportToBackend(metric);
  }
}

// ============================================================================
// 公开 API
// ============================================================================

/**
 * 初始化 Web Vitals 监控
 *
 * 注册所有可用的 PerformanceObserver，开始采集 Core Web Vitals。
 * 应用启动时调用一次即可，多次调用不会重复注册。
 *
 * @example
 * ```ts
 * import { initWebVitals } from "./webVitals";
 * initWebVitals();
 * ```
 */
export function initWebVitals(): void {
  // 非浏览器环境或旧浏览器不支持则跳过
  if (typeof window === "undefined" || !window.PerformanceObserver) {
    console.debug("[WebVitals] PerformanceObserver not available, skipping");
    return;
  }

  // 避免重复初始化
  if (observers.length > 0) return;

  // 测量 TTFB（导航完成后）
  if (document.readyState === "complete") {
    measureTTFB();
  } else {
    window.addEventListener("load", measureTTFB, { once: true });
  }

  setupLCPObserver();
  setupCLSObserver();
  setupFCPObserver();
  setupINPObserver();

  // 页面卸载前尝试上报剩余指标
  window.addEventListener("pagehide", flushMetrics);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushMetrics();
    }
  });

  console.debug("[WebVitals] Core Web Vitals monitoring initialized");
}

/** 清理所有 Observer（主要用于测试） */
export function cleanupWebVitals(): void {
  for (const observer of observers) {
    observer.disconnect();
  }
  observers.length = 0;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

/** 获取当前采集到的 metrics 数量（调试用） */
export function getWebVitalsReportCount(): number {
  return reportedCount;
}
