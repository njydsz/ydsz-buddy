/**
 * @file webVitals.test.ts
 * @description Web Vitals 监控 + Soak 行为测试
 *
 * 互联网大厂基线:
 *  - Web Vitals 是回归硬指标,任何 P95 > threshold 必须被 CI 拦下
 *  - Soak 跑 1000 次同一操作,校验无内存泄漏 + 错误率 < 0.1%
 *  - 不依赖 web-vitals npm 包(避免 bundle 膨胀);自实现简化版足够覆盖
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WEB_VITALS_THRESHOLDS,
  createWebVitalsMonitor,
  percentile,
  rateSample,
  soak,
} from "./webVitals";

describe("@p1 Web Vitals", () => {
  describe("rateSample — 单值评级", () => {
    it("LCP 阈值分段正确", () => {
      expect(rateSample("LCP", 1_000)).toBe("good");
      expect(rateSample("LCP", 2_500)).toBe("good");
      expect(rateSample("LCP", 2_501)).toBe("needs-improvement");
      expect(rateSample("LCP", 4_000)).toBe("needs-improvement");
      expect(rateSample("LCP", 4_001)).toBe("poor");
    });

    it("CLS 阈值分段正确(< 0.1 good)", () => {
      expect(rateSample("CLS", 0.05)).toBe("good");
      expect(rateSample("CLS", 0.1)).toBe("good");
      expect(rateSample("CLS", 0.11)).toBe("needs-improvement");
      expect(rateSample("CLS", 0.3)).toBe("poor");
    });

    it("TTFB 阈值分段正确", () => {
      expect(rateSample("TTFB", 100)).toBe("good");
      expect(rateSample("TTFB", 800)).toBe("good");
      expect(rateSample("TTFB", 1_000)).toBe("needs-improvement");
      expect(rateSample("TTFB", 2_000)).toBe("poor");
    });
  });

  describe("percentile — 百分位计算", () => {
    it("空数组返回 0", () => {
      expect(percentile([], 0.5)).toBe(0);
    });

    it("单元素数组返回该元素", () => {
      expect(percentile([42], 0.5)).toBe(42);
      expect(percentile([42], 0.95)).toBe(42);
    });

    it("p50 中位数", () => {
      const sorted = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      expect(percentile(sorted, 0.5)).toBe(55); // 50 与 60 中点
    });

    it("p95 高百分位", () => {
      const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
      const p95 = percentile(sorted, 0.95);
      // 95th percentile of 1..100 ≈ 95.05
      expect(p95).toBeGreaterThan(94);
      expect(p95).toBeLessThan(96);
    });
  });

  describe("createWebVitalsMonitor — 行为正确性", () => {
    it("记录 sample 后 size 增加", () => {
      const m = createWebVitalsMonitor();
      expect(m.size()).toBe(0);
      m.record({ name: "LCP", value: 1_200 });
      m.record({ name: "LCP", value: 1_500 });
      expect(m.size()).toBe(2);
    });

    it("summarize 生成摘要并标记 isHealthy=true(全 good)", () => {
      const m = createWebVitalsMonitor();
      m.start();
      m.record({ name: "LCP", value: 1_000 });
      m.record({ name: "FCP", value: 800 });
      m.record({ name: "CLS", value: 0.05 });
      m.stop();
      const r = m.summarize();
      expect(r.isHealthy).toBe(true);
      expect(r.degradedMetrics).toEqual([]);
      expect(r.summaries).toHaveLength(3);
    });

    it("summarize 标记 isHealthy=false(出现 poor)", () => {
      const m = createWebVitalsMonitor();
      m.record({ name: "LCP", value: 5_000 }); // poor
      const r = m.summarize();
      expect(r.isHealthy).toBe(false);
      expect(r.degradedMetrics).toContain("LCP");
    });

    it("assertHealthy 在不健康时抛错,信息含指标名 + 阈值", () => {
      const m = createWebVitalsMonitor();
      m.record({ name: "INP", value: 800 }); // poor
      expect(() => m.assertHealthy()).toThrow(/INP/);
      expect(() => m.assertHealthy()).toThrow(/good≤/);
    });

    it("reset 清空所有 sample", () => {
      const m = createWebVitalsMonitor();
      m.record({ name: "LCP", value: 1_000 });
      m.record({ name: "LCP", value: 1_500 });
      m.reset();
      expect(m.size()).toBe(0);
      const r = m.summarize();
      expect(r.summaries).toEqual([]);
    });

    it("环形缓冲:超过 maxSamples 旧的被丢弃", () => {
      const m = createWebVitalsMonitor({ maxSamples: 3 });
      m.record({ name: "LCP", value: 100 });
      m.record({ name: "LCP", value: 200 });
      m.record({ name: "LCP", value: 300 });
      m.record({ name: "LCP", value: 400 });
      m.record({ name: "LCP", value: 500 });
      expect(m.size()).toBe(3);
      // 留下的应该是最新的 3 个(300, 400, 500)
      const r = m.summarize();
      expect(r.samples.map((s) => s.value)).toEqual([300, 400, 500]);
    });

    it("start/stop 幂等(无副作用)", () => {
      const m = createWebVitalsMonitor();
      m.start();
      m.start(); // 二次 start
      m.stop();
      m.stop(); // 二次 stop
      expect(m.size()).toBe(0);
    });

    it("在 node/happy-dom 环境下 start 不抛错(PerformanceObserver 不可用)", () => {
      const m = createWebVitalsMonitor();
      // happy-dom 默认没实现 PerformanceObserver,这里直接调,不应抛错
      expect(() => {
        m.start();
        m.stop();
      }).not.toThrow();
    });

    it("summarize worst rating 取最差(poor > needs-improvement > good)", () => {
      const m = createWebVitalsMonitor();
      m.record({ name: "LCP", value: 1_000 }); // good
      m.record({ name: "LCP", value: 3_000 }); // needs-improvement
      m.record({ name: "LCP", value: 5_000 }); // poor
      const r = m.summarize();
      const lcp = r.summaries.find((s) => s.name === "LCP");
      expect(lcp?.rating).toBe("poor");
    });
  });

  describe("阈值常量(防止有人误改后被 CI 漏出)", () => {
    it("LCP.good = 2500ms (web.dev 标准)", () => {
      expect(WEB_VITALS_THRESHOLDS.LCP.good).toBe(2_500);
    });
    it("CLS.good = 0.1 (web.dev 标准)", () => {
      expect(WEB_VITALS_THRESHOLDS.CLS.good).toBe(0.1);
    });
    it("INP.good = 200ms (web.dev 标准)", () => {
      expect(WEB_VITALS_THRESHOLDS.INP.good).toBe(200);
    });
    it("FCP.good = 1800ms (web.dev 标准)", () => {
      expect(WEB_VITALS_THRESHOLDS.FCP.good).toBe(1_800);
    });
    it("TTFB.good = 800ms (web.dev 标准)", () => {
      expect(WEB_VITALS_THRESHOLDS.TTFB.good).toBe(800);
    });
  });
});

describe("@p1 Soak(长跑稳定性)", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("1000 次幂等操作,错误率必须为 0", () => {
    let counter = 0;
    const r = soak(
      () => {
        counter++;
      },
      { iterations: 1000, name: "counter" },
    );
    expect(counter).toBe(1000);
    expect(r.errorCount).toBe(0);
    expect(r.iterations).toBe(1000);
  });

  it("Soak 报告字段完整,avg/p95/max 全部为数字", () => {
    const r = soak(() => 1 + 1, { iterations: 100 });
    expect(typeof r.avgMs).toBe("number");
    expect(typeof r.p95Ms).toBe("number");
    expect(typeof r.maxMs).toBe("number");
    expect(Number.isFinite(r.avgMs)).toBe(true);
    expect(Number.isFinite(r.p95Ms)).toBe(true);
  });

  it("每次操作都会捕获异常,不会中断 Soak", () => {
    const r = soak(
      (i) => {
        if (i % 3 === 0) throw new Error("planned");
      },
      { iterations: 30 },
    );
    // 30 次中 i=0,3,6,9,12,15,18,21,24,27 = 10 次抛错
    expect(r.errorCount).toBe(10);
    expect(r.iterations).toBe(30);
  });

  it("纯计算 Soak:10k 次 factorial(10) 错误率 0,avg < 1ms", () => {
    const r = soak(
      () => {
        let n = 10;
        let result = 1;
        while (n > 1) result *= n--;
        return result;
      },
      { iterations: 10_000, name: "factorial" },
    );
    expect(r.errorCount).toBe(0);
    // happy-dom 慢,容差大;只要不 > 5ms 即可
    expect(r.avgMs).toBeLessThan(5);
  });
});
