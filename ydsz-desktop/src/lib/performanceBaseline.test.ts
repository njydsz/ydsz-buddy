/**
 * @file performanceBaseline 单元测试
 *
 * 覆盖性能基线管理：
 * 1. 构造函数选项(warningThreshold / criticalThreshold / storageKey / updateInterval)
 * 2. loadBaseline / saveBaseline / getBaseline
 * 3. shouldUpdateBaseline - 7 天窗口判断
 * 4. buildBaselineFromCurrent - 基于 metricsCollector 数据构建基线
 * 5. resetBaseline - 清空 + 重新构建
 * 6. detectDegradation - 退化百分比 + 阈值
 * 7. detectAllDegradations / generateReport / exportReport
 *
 * 通过 mock localStorage 与 metricsCollector 实现隔离测试。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { metricsCollector, type PerformanceMetric } from "./performanceMetrics";
import { PerformanceBaselineManager } from "./performanceBaseline";

function makeMetric(overrides: Partial<PerformanceMetric> = {}): PerformanceMetric {
  return {
    type: "tauri_command",
    name: "sample_command",
    duration: 100,
    timestamp: Date.now(),
    success: true,
    ...overrides,
  };
}

function makeStoredEntry(overrides: Partial<{
  type: PerformanceMetric["type"];
  name: string;
  avg: number;
  median: number;
  p95: number;
  p99: number;
  stddev: number;
  sampleCount: number;
}> = {}) {
  return {
    type: "tauri_command" as const,
    name: "sample_command",
    avg: 100,
    median: 100,
    p95: 100,
    p99: 100,
    stddev: 0,
    sampleCount: 5,
    ...overrides,
  };
}

describe("performanceBaseline", () => {
  beforeEach(() => {
    // 准备 localStorage mock
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        store.delete(key);
      }),
      clear: vi.fn(() => {
        store.clear();
      }),
    });
    metricsCollector.clear();
  });

  afterEach(() => {
    metricsCollector.clear();
    vi.unstubAllGlobals();
  });

  describe("constructor / getBaseline", () => {
    it("无 localStorage 数据时 baseline 为 null", () => {
      const mgr = new PerformanceBaselineManager();
      expect(mgr.getBaseline()).toBeNull();
    });

    it("localStorage 已有基线时自动加载", () => {
      const stored = {
        version: 1,
        createdAt: 1000,
        updatedAt: 2000,
        entries: [makeStoredEntry()],
      };
      localStorage.setItem("ydsz-buddy:performance-baseline", JSON.stringify(stored));
      const mgr = new PerformanceBaselineManager();
      expect(mgr.getBaseline()?.version).toBe(1);
    });

    it("自定义 storageKey", () => {
      const mgr = new PerformanceBaselineManager({ storageKey: "custom:baseline" });
      const baseline = mgr.buildBaselineFromCurrent();
      expect(localStorage.setItem).toHaveBeenCalledWith(
        "custom:baseline",
        expect.any(String),
      );
      expect(baseline).toBeDefined();
    });

    it("自定义 warning / critical 阈值", () => {
      const stored = {
        version: 1,
        createdAt: 1000,
        updatedAt: 2000,
        entries: [makeStoredEntry({ avg: 100 })],
      };
      localStorage.setItem("ydsz-buddy:performance-baseline", JSON.stringify(stored));
      const mgr = new PerformanceBaselineManager({
        warningThreshold: 0.1,
        criticalThreshold: 0.3,
      });
      const result = mgr.detectDegradation("tauri_command", "sample_command", 140);
      // (140-100)/100 = 0.4 -> critical
      expect(result?.severity).toBe("critical");
    });
  });

  describe("saveBaseline", () => {
    it("baseline 为 null 时不写 localStorage", () => {
      const mgr = new PerformanceBaselineManager();
      mgr.saveBaseline();
      expect(localStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe("shouldUpdateBaseline", () => {
    it("无基线时返回 true", () => {
      const mgr = new PerformanceBaselineManager();
      expect(mgr.shouldUpdateBaseline()).toBe(true);
    });

    it("刚保存的基线(默认 7 天)不需要更新", () => {
      const mgr = new PerformanceBaselineManager();
      mgr.buildBaselineFromCurrent();
      expect(mgr.shouldUpdateBaseline()).toBe(false);
    });

    it("超过 updateIntervalMs 时返回 true", () => {
      const mgr = new PerformanceBaselineManager({ updateIntervalMs: 1_000 });
      // 写入一个 updatedAt = 1 的基线
      const stored = {
        version: 1,
        createdAt: 0,
        updatedAt: 1,
        entries: [],
      };
      localStorage.setItem("ydsz-buddy:performance-baseline", JSON.stringify(stored));
      mgr.loadBaseline();
      // 模拟时间流逝
      vi.spyOn(Date, "now").mockReturnValue(2_000);
      try {
        expect(mgr.shouldUpdateBaseline()).toBe(true);
      } finally {
        vi.restoreAllMocks();
      }
    });
  });

  describe("buildBaselineFromCurrent", () => {
    it("从 metricsCollector 收集所有 type 的指标", () => {
      // 添加多种 type 的指标
      metricsCollector.record(makeMetric({ type: "tauri_command", name: "op1", duration: 10 }));
      metricsCollector.record(makeMetric({ type: "tauri_command", name: "op1", duration: 20 }));
      metricsCollector.record(makeMetric({ type: "tauri_command", name: "op1", duration: 30 }));
      metricsCollector.record(makeMetric({ type: "provider_api", name: "codex", duration: 50 }));
      metricsCollector.record(makeMetric({ type: "provider_api", name: "codex", duration: 60 }));
      metricsCollector.record(makeMetric({ type: "provider_api", name: "codex", duration: 70 }));

      const mgr = new PerformanceBaselineManager();
      const baseline = mgr.buildBaselineFromCurrent();
      // 只 count >= 3 才会被收录
      expect(baseline.entries).toHaveLength(2);
      const op1 = baseline.entries.find((e) => e.name === "op1");
      const codex = baseline.entries.find((e) => e.name === "codex");
      expect(op1?.avg).toBe(20);
      expect(codex?.avg).toBe(60);
    });

    it("样本数小于 3 的指标不会被收录", () => {
      metricsCollector.record(makeMetric({ duration: 10 }));
      metricsCollector.record(makeMetric({ duration: 20 }));
      const mgr = new PerformanceBaselineManager();
      const baseline = mgr.buildBaselineFromCurrent();
      expect(baseline.entries).toHaveLength(0);
    });

    it("无指标时返回空 entries 但 baseline 仍存在", () => {
      const mgr = new PerformanceBaselineManager();
      const baseline = mgr.buildBaselineFromCurrent();
      expect(baseline.entries).toEqual([]);
      expect(baseline.version).toBe(1);
    });

    it("version 自增(从 0 开始)", () => {
      const mgr = new PerformanceBaselineManager();
      const first = mgr.buildBaselineFromCurrent();
      const second = mgr.buildBaselineFromCurrent();
      expect(first.version).toBe(1);
      expect(second.version).toBe(2);
    });
  });

  describe("resetBaseline", () => {
    it("清空 localStorage 并重新构建", () => {
      const mgr = new PerformanceBaselineManager();
      mgr.buildBaselineFromCurrent();
      mgr.resetBaseline();
      expect(localStorage.removeItem).toHaveBeenCalledWith("ydsz-buddy:performance-baseline");
    });
  });

  describe("detectDegradation", () => {
    function setupBaseline(overrides: Partial<{ avg: number }> = {}) {
      const stored = {
        version: 1,
        createdAt: 1000,
        updatedAt: 2000,
        entries: [makeStoredEntry({ avg: 100, ...overrides })],
      };
      localStorage.setItem("ydsz-buddy:performance-baseline", JSON.stringify(stored));
      return new PerformanceBaselineManager();
    }

    it("无基线时返回 null", () => {
      const mgr = new PerformanceBaselineManager();
      expect(mgr.detectDegradation("tauri_command", "op", 100)).toBeNull();
    });

    it("未在 entries 中的指标返回 null", () => {
      const mgr = setupBaseline();
      expect(mgr.detectDegradation("tauri_command", "unknown", 100)).toBeNull();
    });

    it("current < baseline 时 degradation 为负(改善)", () => {
      const mgr = setupBaseline({ avg: 100 });
      const result = mgr.detectDegradation("tauri_command", "sample_command", 50);
      expect(result?.degradationPercent).toBe(-0.5);
      expect(result?.severity).toBe("ok");
    });

    it("current = baseline 时 severity=ok", () => {
      const mgr = setupBaseline({ avg: 100 });
      const result = mgr.detectDegradation("tauri_command", "sample_command", 100);
      expect(result?.severity).toBe("ok");
    });

    it("20% ~ 50% 时 severity=warning", () => {
      const mgr = setupBaseline({ avg: 100 });
      const result = mgr.detectDegradation("tauri_command", "sample_command", 130);
      expect(result?.isWarning).toBe(true);
      expect(result?.isCritical).toBe(false);
      expect(result?.severity).toBe("warning");
    });

    it(">= 50% 时 severity=critical", () => {
      const mgr = setupBaseline({ avg: 100 });
      const result = mgr.detectDegradation("tauri_command", "sample_command", 200);
      expect(result?.isCritical).toBe(true);
      expect(result?.severity).toBe("critical");
    });

    it("current=0 时 degradation=-1", () => {
      const mgr = setupBaseline({ avg: 100 });
      const result = mgr.detectDegradation("tauri_command", "sample_command", 0);
      expect(result?.degradationPercent).toBe(-1);
    });
  });

  describe("detectAllDegradations", () => {
    it("无基线时返回空数组", () => {
      const mgr = new PerformanceBaselineManager();
      expect(mgr.detectAllDegradations()).toEqual([]);
    });

    it("对每个有指标 type/name 组合进行退化检测", () => {
      // 在 baseline 中放两个 entries
      const stored = {
        version: 1,
        createdAt: 1000,
        updatedAt: 2000,
        entries: [
          makeStoredEntry({ name: "a", avg: 100 }),
          makeStoredEntry({ name: "b", avg: 100, type: "provider_api" }),
        ],
      };
      localStorage.setItem("ydsz-buddy:performance-baseline", JSON.stringify(stored));

      // 当前指标中两个都出现,且平均值更高(退化)
      for (let i = 0; i < 5; i += 1) {
        metricsCollector.record(makeMetric({ name: "a", duration: 200 }));
        metricsCollector.record(
          makeMetric({ name: "b", duration: 200, type: "provider_api" }),
        );
      }
      const mgr = new PerformanceBaselineManager();
      const results = mgr.detectAllDegradations();
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("generateReport", () => {
    it("overallHealth=healthy 当无退化", () => {
      const mgr = new PerformanceBaselineManager();
      const report = mgr.generateReport();
      expect(report.overallHealth).toBe("healthy");
    });

    it("overallHealth=degraded 当存在 warning", () => {
      const stored = {
        version: 1,
        createdAt: 1000,
        updatedAt: 2000,
        entries: [makeStoredEntry({ avg: 100 })],
      };
      localStorage.setItem("ydsz-buddy:performance-baseline", JSON.stringify(stored));
      for (let i = 0; i < 3; i += 1) {
        metricsCollector.record(makeMetric({ duration: 130 }));
      }
      const mgr = new PerformanceBaselineManager();
      const report = mgr.generateReport();
      expect(report.overallHealth).toBe("degraded");
    });

    it("overallHealth=critical 当存在 critical(优先级最高)", () => {
      const stored = {
        version: 1,
        createdAt: 1000,
        updatedAt: 2000,
        entries: [makeStoredEntry({ avg: 100 })],
      };
      localStorage.setItem("ydsz-buddy:performance-baseline", JSON.stringify(stored));
      for (let i = 0; i < 3; i += 1) {
        metricsCollector.record(makeMetric({ duration: 200 }));
      }
      const mgr = new PerformanceBaselineManager();
      const report = mgr.generateReport();
      expect(report.overallHealth).toBe("critical");
    });

    it("report 包含 generatedAt / baseline / degradations / currentSummaries", () => {
      const mgr = new PerformanceBaselineManager();
      const report = mgr.generateReport();
      expect(typeof report.generatedAt).toBe("number");
      expect(Array.isArray(report.degradations)).toBe(true);
      expect(Array.isArray(report.currentSummaries)).toBe(true);
    });
  });

  describe("exportReport", () => {
    it("返回有效的 JSON 字符串", () => {
      const mgr = new PerformanceBaselineManager();
      const json = mgr.exportReport();
      expect(() => JSON.parse(json)).not.toThrow();
      const parsed = JSON.parse(json);
      expect(parsed.overallHealth).toBe("healthy");
    });
  });
});
