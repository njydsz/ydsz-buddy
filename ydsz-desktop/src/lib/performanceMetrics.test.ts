/**
 * @file performanceMetrics 单元测试
 *
 * 覆盖性能指标收集器：
 * 1. record / getAllMetrics / getMetricsByType / getMetricsInRange / clear
 * 2. startTimer - 成功路径
 * 3. measureTauriCommand / measureProviderApi / measureFilesystem - 成功 + 失败路径
 * 4. recordMemoryUsage - 在无 performance.memory 时安全跳过
 * 5. calculateSummary - 包含 min/max/avg/median/p95/p99/stddev
 * 6. importFromJSON / exportToJSON
 * 7. 上限保护(超过 maxMetricsCount 时切片)
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  PerformanceMetricsCollector,
  type PerformanceMetric,
} from "./performanceMetrics";

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

describe("performanceMetrics", () => {
  let collector: PerformanceMetricsCollector;

  afterEach(() => {
    collector?.clear();
  });

  describe("record / getAllMetrics", () => {
    it("记录并读取指标", () => {
      collector = new PerformanceMetricsCollector();
      collector.record(makeMetric({ name: "a" }));
      collector.record(makeMetric({ name: "b" }));
      const all = collector.getAllMetrics();
      expect(all).toHaveLength(2);
      expect(all.map((m) => m.name)).toEqual(["a", "b"]);
    });

    it("getAllMetrics 返回副本,外部修改不影响内部", () => {
      collector = new PerformanceMetricsCollector();
      collector.record(makeMetric({ name: "a" }));
      const all = collector.getAllMetrics();
      all.pop();
      expect(collector.getAllMetrics()).toHaveLength(1);
    });

    it("超过 maxMetricsCount 时只保留最新 10000 条", () => {
      collector = new PerformanceMetricsCollector();
      // 直接 push 10001 条以触发上限
      for (let i = 0; i < 10001; i += 1) {
        collector.record(makeMetric({ timestamp: i, name: `m_${i}` }));
      }
      const all = collector.getAllMetrics();
      expect(all).toHaveLength(10000);
      // 最早的那条应被丢弃
      expect(all[0].name).toBe("m_1");
      expect(all[all.length - 1].name).toBe("m_10000");
    });
  });

  describe("getMetricsByType", () => {
    it("按 type 过滤", () => {
      collector = new PerformanceMetricsCollector();
      collector.record(makeMetric({ type: "tauri_command", name: "a" }));
      collector.record(makeMetric({ type: "provider_api", name: "b" }));
      collector.record(makeMetric({ type: "tauri_command", name: "c" }));
      const tauri = collector.getMetricsByType("tauri_command");
      expect(tauri).toHaveLength(2);
      expect(tauri.map((m) => m.name)).toEqual(["a", "c"]);
    });
  });

  describe("getMetricsInRange", () => {
    it("按时间范围过滤(闭区间)", () => {
      collector = new PerformanceMetricsCollector();
      collector.record(makeMetric({ name: "a", timestamp: 100 }));
      collector.record(makeMetric({ name: "b", timestamp: 200 }));
      collector.record(makeMetric({ name: "c", timestamp: 300 }));
      const range = collector.getMetricsInRange(150, 250);
      expect(range.map((m) => m.name)).toEqual(["b"]);
    });

    it("边界值包含在内", () => {
      collector = new PerformanceMetricsCollector();
      collector.record(makeMetric({ name: "a", timestamp: 100 }));
      collector.record(makeMetric({ name: "b", timestamp: 200 }));
      const range = collector.getMetricsInRange(100, 200);
      expect(range.map((m) => m.name)).toEqual(["a", "b"]);
    });
  });

  describe("startTimer", () => {
    it("endTimer 触发后记录 success=true 指标", () => {
      collector = new PerformanceMetricsCollector();
      const end = collector.startTimer("tauri_command", "demo");
      end();
      const all = collector.getAllMetrics();
      expect(all).toHaveLength(1);
      expect(all[0].success).toBe(true);
      expect(all[0].type).toBe("tauri_command");
      expect(all[0].name).toBe("demo");
      expect(all[0].duration).toBeGreaterThanOrEqual(0);
    });

    it("endTimer 接受 metadata 参数", () => {
      collector = new PerformanceMetricsCollector();
      const end = collector.startTimer("tauri_command", "demo", { foo: "bar" });
      end();
      expect(collector.getAllMetrics()[0].metadata).toEqual({ foo: "bar" });
    });
  });

  describe("measureTauriCommand", () => {
    it("成功路径返回 command 结果并记录 success=true", async () => {
      collector = new PerformanceMetricsCollector();
      const result = await collector.measureTauriCommand("op", async () => "ok");
      expect(result).toBe("ok");
      const all = collector.getAllMetrics();
      expect(all).toHaveLength(1);
      expect(all[0].success).toBe(true);
    });

    it("失败路径抛出 + 记录 success=false", async () => {
      collector = new PerformanceMetricsCollector();
      await expect(
        collector.measureTauriCommand("op", async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      const all = collector.getAllMetrics();
      expect(all).toHaveLength(1);
      expect(all[0].success).toBe(false);
      expect(all[0].error).toBe("boom");
    });

    it("非 Error 抛出时 error 字段使用 String() 转换", async () => {
      collector = new PerformanceMetricsCollector();
      await expect(
        collector.measureTauriCommand("op", async () => {
          throw "raw-string";
        }),
      ).rejects.toBe("raw-string");
      expect(collector.getAllMetrics()[0].error).toBe("raw-string");
    });
  });

  describe("measureProviderApi", () => {
    it("成功路径记录", async () => {
      collector = new PerformanceMetricsCollector();
      const result = await collector.measureProviderApi("codex", async () => 42);
      expect(result).toBe(42);
      const all = collector.getAllMetrics();
      expect(all[0].type).toBe("provider_api");
      expect(all[0].success).toBe(true);
    });

    it("失败路径记录", async () => {
      collector = new PerformanceMetricsCollector();
      await expect(
        collector.measureProviderApi("codex", async () => {
          throw new Error("api-fail");
        }),
      ).rejects.toThrow("api-fail");
      const all = collector.getAllMetrics();
      expect(all[0].success).toBe(false);
      expect(all[0].error).toBe("api-fail");
    });
  });

  describe("measureFilesystem", () => {
    it("成功路径记录", async () => {
      collector = new PerformanceMetricsCollector();
      const result = await collector.measureFilesystem("read", async () => "data");
      expect(result).toBe("data");
      const all = collector.getAllMetrics();
      expect(all[0].type).toBe("filesystem");
      expect(all[0].success).toBe(true);
    });

    it("失败路径记录", async () => {
      collector = new PerformanceMetricsCollector();
      await expect(
        collector.measureFilesystem("read", async () => {
          throw new Error("fs-fail");
        }),
      ).rejects.toThrow("fs-fail");
      expect(collector.getAllMetrics()[0].error).toBe("fs-fail");
    });
  });

  describe("recordMemoryUsage", () => {
    it("无 performance.memory 时安全跳过(不抛错)", () => {
      collector = new PerformanceMetricsCollector();
      // 浏览器/Node 默认 performance 都没有 memory 字段
      expect(() => collector.recordMemoryUsage()).not.toThrow();
      expect(collector.getAllMetrics()).toHaveLength(0);
    });
  });

  describe("calculateSummary", () => {
    it("空集合返回 null", () => {
      collector = new PerformanceMetricsCollector();
      expect(collector.calculateSummary("tauri_command")).toBeNull();
    });

    it("计算 min/max/avg/median/p95/p99/stddev", () => {
      collector = new PerformanceMetricsCollector();
      // 1..20
      for (let i = 1; i <= 20; i += 1) {
        collector.record(makeMetric({ duration: i, name: "op" }));
      }
      const summary = collector.calculateSummary("tauri_command", "op");
      expect(summary).not.toBeNull();
      expect(summary!.count).toBe(20);
      expect(summary!.min).toBe(1);
      expect(summary!.max).toBe(20);
      expect(summary!.avg).toBe(10.5);
      expect(summary!.median).toBeCloseTo(10.5, 1);
      expect(summary!.p95).toBeGreaterThan(18);
      expect(summary!.p99).toBeGreaterThan(19);
      expect(summary!.stddev).toBeGreaterThan(0);
    });

    it("按 type 但不指定 name 时聚合所有 name", () => {
      collector = new PerformanceMetricsCollector();
      collector.record(makeMetric({ name: "a", duration: 10 }));
      collector.record(makeMetric({ name: "b", duration: 20 }));
      const summary = collector.calculateSummary("tauri_command");
      expect(summary?.count).toBe(2);
      expect(summary?.name).toBe("all");
    });

    it("name 不匹配时返回 null", () => {
      collector = new PerformanceMetricsCollector();
      collector.record(makeMetric({ name: "a" }));
      expect(collector.calculateSummary("tauri_command", "b")).toBeNull();
    });

    it("单元素时所有统计值相同", () => {
      collector = new PerformanceMetricsCollector();
      collector.record(makeMetric({ duration: 42, name: "op" }));
      const summary = collector.calculateSummary("tauri_command", "op");
      expect(summary?.min).toBe(42);
      expect(summary?.max).toBe(42);
      expect(summary?.avg).toBe(42);
      expect(summary?.stddev).toBe(0);
    });
  });

  describe("clear", () => {
    it("清空后 getAllMetrics 返回空数组", () => {
      collector = new PerformanceMetricsCollector();
      collector.record(makeMetric());
      collector.clear();
      expect(collector.getAllMetrics()).toEqual([]);
    });
  });

  describe("exportToJSON / importFromJSON", () => {
    it("导出后导入恢复所有指标", () => {
      const source = new PerformanceMetricsCollector();
      source.record(makeMetric({ name: "a" }));
      source.record(makeMetric({ name: "b" }));
      const json = source.exportToJSON();

      const target = new PerformanceMetricsCollector();
      target.importFromJSON(json);
      const restored = target.getAllMetrics();
      expect(restored).toHaveLength(2);
      expect(restored.map((m) => m.name)).toEqual(["a", "b"]);
    });

    it("非法 JSON 静默失败(不抛错)", () => {
      collector = new PerformanceMetricsCollector();
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      try {
        collector.importFromJSON("not-json{");
        expect(collector.getAllMetrics()).toEqual([]);
        expect(consoleSpy).toHaveBeenCalled();
      } finally {
        consoleSpy.mockRestore();
      }
    });
  });
});
