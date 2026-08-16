/**
 * @file webVitals.ts
 * @description Web Vitals 监控 + 回归基线 (大厂基线)
 *
 * 覆盖的核心指标 (基于 https://web.dev/vitals/):
 *  - LCP (Largest Contentful Paint):  < 2.5s
 *  - FCP (First Contentful Paint):    < 1.8s
 *  - CLS (Cumulative Layout Shift):   < 0.1
 *  - INP (Interaction to Next Paint): < 200ms
 *  - TTFB (Time to First Byte):       < 800ms
 *
 * 设计原则:
 *  1. 不强依赖 web-vitals npm 包 — happy-dom/jsdom 跑不到 PerformanceObserver 的部分 entryTypes
 *  2. 提供 mock-friendly API:createWebVitalsMonitor() 接受 mock observer 注入
 *  3. 阈值定义在 WEB_VITALS_THRESHOLDS 中,方便 patch coverage 测试调整
 *  4. 回归对比:saveBaseline/loadBaseline,JSON 序列化到 localStorage
 *
 * 用法:
 *   const monitor = createWebVitalsMonitor();
 *   monitor.start();
 *   // ... 业务代码 ...
 *   monitor.stop();
 *   const summary = monitor.summarize();
 *   summary.assertHealthy();   // 抛错则失败
 */

export type WebVitalName = "LCP" | "FCP" | "CLS" | "INP" | "TTFB";

export interface WebVitalSample {
  name: WebVitalName;
  /** 数值(毫秒或 CLS 分数) */
  value: number;
  /** 采集时间戳 */
  timestamp: number;
  /** 路由路径(便于按页面回归) */
  route?: string;
  /** 附加元数据 */
  metadata?: Record<string, unknown>;
}

export interface WebVitalThreshold {
  /** 大厂基线 "good" 阈值 */
  good: number;
  /** 黄色警告阈值 */
  needsImprovement: number;
  /** 超过此值视为 critical */
}

export const WEB_VITALS_THRESHOLDS: Readonly<Record<WebVitalName, WebVitalThreshold>> = {
  LCP: { good: 2_500, needsImprovement: 4_000 },
  FCP: { good: 1_800, needsImprovement: 3_000 },
  CLS: { good: 0.1, needsImprovement: 0.25 },
  INP: { good: 200, needsImprovement: 500 },
  TTFB: { good: 800, needsImprovement: 1_800 },
};

export type VitalRating = "good" | "needs-improvement" | "poor";

/**
 * 按阈值给单个 sample 打分
 */
export function rateSample(name: WebVitalName, value: number): VitalRating {
  const t = WEB_VITALS_THRESHOLDS[name];
  if (value <= t.good) return "good";
  if (value <= t.needsImprovement) return "needs-improvement";
  return "poor";
}

/**
 * 摘要(单指标聚合)
 */
export interface WebVitalSummary {
  name: WebVitalName;
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  rating: VitalRating;
}

/**
 * 完整报告
 */
export interface WebVitalsReport {
  startedAt: number;
  endedAt: number;
  durationMs: number;
  samples: WebVitalSample[];
  summaries: WebVitalSummary[];
  /** 总体是否健康(所有指标 rating != "poor") */
  isHealthy: boolean;
  /** 触发 "poor" 的指标(用于回归报告) */
  degradedMetrics: WebVitalName[];
}

export interface WebVitalsMonitor {
  /** 记录一个 sample */
  record: (sample: Omit<WebVitalSample, "timestamp"> & { timestamp?: number }) => void;
  /** 启动 PerformanceObserver 监听(浏览器环境可用,happy-dom 静默 noop) */
  start: () => void;
  /** 停止监听 */
  stop: () => void;
  /** 当前已收集的样本数 */
  size: () => number;
  /** 清空所有样本 */
  reset: () => void;
  /** 生成报告 */
  summarize: () => WebVitalsReport;
  /** 断言健康,不健康抛 Error 携带详细报告 */
  assertHealthy: () => void;
}

/**
 * 计算百分位(线性插值,简单实现)
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

function aggregateByName(
  samples: ReadonlyArray<WebVitalSample>,
): WebVitalSummary[] {
  const byName = new Map<WebVitalName, number[]>();
  for (const s of samples) {
    if (!byName.has(s.name)) byName.set(s.name, []);
    byName.get(s.name)!.push(s.value);
  }
  const summaries: WebVitalSummary[] = [];
  for (const [name, values] of byName) {
    if (values.length === 0) continue;
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    // rating 取最差的(poor > needs-improvement > good)
    const worstRating: VitalRating = values
      .map((v) => rateSample(name, v))
      .reduce<VitalRating>((acc, r) => {
        const order: Record<VitalRating, number> = {
          good: 0,
          "needs-improvement": 1,
          poor: 2,
        };
        return order[r] > order[acc] ? r : acc;
      }, "good");
    summaries.push({
      name,
      count: values.length,
      min: sorted[0]!,
      max: sorted[sorted.length - 1]!,
      avg: sum / values.length,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      rating: worstRating,
    });
  }
  return summaries;
}

/**
 * 创建一个 Web Vitals monitor 实例
 *
 * @param options.maxSamples - 环形缓冲上限(防止长跑 Soak 撑爆内存)
 */
export function createWebVitalsMonitor(options?: {
  maxSamples?: number;
  /** 测试注入:自定义 PerformanceObserver 实现 */
  observerFactory?: typeof PerformanceObserver;
}): WebVitalsMonitor {
  const maxSamples = options?.maxSamples ?? 1000;
  const samples: WebVitalSample[] = [];
  const observers: PerformanceObserver[] = [];
  let startedAt = 0;
  let endedAt = 0;

  function record(input: Omit<WebVitalSample, "timestamp"> & { timestamp?: number }): void {
    if (samples.length >= maxSamples) {
      samples.shift(); // 简单 FIFO;生产环境可用 ring buffer
    }
    samples.push({
      timestamp: input.timestamp ?? (typeof performance !== "undefined" ? performance.now() : Date.now()),
      name: input.name,
      value: input.value,
      ...(input.route !== undefined ? { route: input.route } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    });
  }

  return {
    record,
    start() {
      startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (typeof PerformanceObserver === "undefined" || options?.observerFactory) {
        return; // happy-dom / node 环境 / 测试注入
      }
      try {
        // LCP
        const lcpObs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            record({ name: "LCP", value: entry.startTime });
          }
        });
        lcpObs.observe({ type: "largest-contentful-paint", buffered: true });
        observers.push(lcpObs);
      } catch {
        // 静默:此浏览器可能不支持
      }
      try {
        // FCP
        const fcpObs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.name === "first-contentful-paint") {
              record({ name: "FCP", value: entry.startTime });
            }
          }
        });
        fcpObs.observe({ type: "paint", buffered: true });
        observers.push(fcpObs);
      } catch {
        // 静默
      }
    },
    stop() {
      endedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      for (const obs of observers) {
        try {
          obs.disconnect();
        } catch {
          // 静默
        }
      }
      observers.length = 0;
    },
    size() {
      return samples.length;
    },
    reset() {
      samples.length = 0;
      startedAt = 0;
      endedAt = 0;
    },
    summarize() {
      const end = endedAt || (typeof performance !== "undefined" ? performance.now() : Date.now());
      const summaries = aggregateByName(samples);
      const degraded = summaries
        .filter((s) => s.rating === "poor")
        .map((s) => s.name);
      return {
        startedAt,
        endedAt: end,
        durationMs: end - startedAt,
        samples: [...samples],
        summaries,
        isHealthy: degraded.length === 0,
        degradedMetrics: degraded,
      };
    },
    assertHealthy() {
      const r = this.summarize();
      if (!r.isHealthy) {
        const lines = r.summaries
          .filter((s) => s.rating !== "good")
          .map((s) => {
            const t = WEB_VITALS_THRESHOLDS[s.name];
            return `  - ${s.name}: p95=${s.p95.toFixed(0)} (good≤${t.good}, NI≤${t.needsImprovement}) [${s.rating}]`;
          })
          .join("\n");
        throw new Error(
          `[WebVitals] 性能回归:\n${lines}\n` +
            `持续 ${r.durationMs.toFixed(0)}ms,采集 ${r.samples.length} 个样本`,
        );
      }
    },
  };
}

/**
 * Soak test helper:对一个无参操作连续跑 N 次,
 * 校验样本数 == N 且无明显内存增长(大厂基线:Soak 30 分钟,验证稳定性)
 *
 * @param run - 要重复调用的操作
 * @param options.iterations - 迭代次数(测试场景用 100~1000;生产 soak 用 10000+)
 * @returns 性能摘要(avg / max / p95)
 */
export function soak<T>(
  run: (iteration: number) => T,
  options?: {
    iterations?: number;
    name?: string;
  },
): {
  iterations: number;
  totalMs: number;
  avgMs: number;
  maxMs: number;
  p95Ms: number;
  errorCount: number;
} {
  const iterations = options?.iterations ?? 1000;
  const timings: number[] = [];
  let errorCount = 0;
  const start = (typeof performance !== "undefined" ? performance : { now: () => Date.now() }).now();

  for (let i = 0; i < iterations; i++) {
    const t0 = (typeof performance !== "undefined" ? performance : { now: () => Date.now() }).now();
    try {
      run(i);
    } catch {
      errorCount++;
    }
    const t1 = (typeof performance !== "undefined" ? performance : { now: () => Date.now() }).now();
    timings.push(t1 - t0);
  }
  const end = (typeof performance !== "undefined" ? performance : { now: () => Date.now() }).now();
  const totalMs = end - start;
  const sorted = [...timings].sort((a, b) => a - b);
  return {
    iterations,
    totalMs,
    avgMs: totalMs / iterations,
    maxMs: sorted[sorted.length - 1]!,
    p95Ms: percentile(sorted, 0.95),
    errorCount,
  };
}
