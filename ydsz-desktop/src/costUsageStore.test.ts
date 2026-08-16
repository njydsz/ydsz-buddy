/**
 * @file costUsageStore 单元测试
 *
 * 覆盖：
 * 1. recordUsage: 自动 id / ts / costUsd 计算
 * 2. 缺定价的模型 costUsd = 0
 * 3. deleteRecord / clearAll
 * 4. pruneExpired: 90 天前记录被剪掉
 * 5. getSpendInRange: 时间窗口聚合
 * 6. startOfLocalDay / startOfLocalMonth
 * 7. 持久化 + 重复 id 归一化
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  costUsageStoreInternals,
  getSpendInRange,
  startOfLocalDay,
  startOfLocalMonth,
  useCostUsageStore,
  type UsageRecord,
} from "./costUsageStore";

const DAY_MS = 24 * 60 * 60 * 1000;

function resetStore(): void {
  useCostUsageStore.setState({ records: [] });
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.clear();
  }
}

describe("costUsageStore", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    resetStore();
  });

  describe("recordUsage", () => {
    it("自动生成 id / ts / 计算 costUsd", () => {
      const rec = useCostUsageStore.getState().recordUsage({
        provider: "codex",
        model: "gpt-4o",
        usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      });
      expect(rec.id.length).toBeGreaterThan(0);
      expect(rec.ts).toBeGreaterThan(0);
      // 1M input * $2.5 + 1M output * $10 = $12.5
      expect(rec.costUsd).toBe(12.5);
      expect(rec.provider).toBe("codex");
      expect(rec.model).toBe("gpt-4o");
    });

    it("缺定价的模型 → costUsd = 0", () => {
      const rec = useCostUsageStore.getState().recordUsage({
        provider: "codex",
        model: "gpt-fake-unknown",
        usage: { inputTokens: 1000, outputTokens: 1000 },
      });
      expect(rec.costUsd).toBe(0);
    });

    it("显式 costUsd 覆盖表内定价(后端报账优先)", () => {
      const rec = useCostUsageStore.getState().recordUsage({
        provider: "codex",
        model: "gpt-4o",
        usage: { inputTokens: 0, outputTokens: 0 },
        costUsd: 0.123,
      });
      expect(rec.costUsd).toBe(0.123);
    });

    it("显式 ts 用于测试", () => {
      const ts = new Date(2026, 5, 25, 12).getTime();
      const rec = useCostUsageStore.getState().recordUsage({
        provider: "codex",
        model: "gpt-4o",
        usage: { inputTokens: 1000, outputTokens: 1000 },
        ts,
      });
      expect(rec.ts).toBe(ts);
    });

    it("cached tokens 参与计费", () => {
      const rec = useCostUsageStore.getState().recordUsage({
        provider: "codex",
        model: "gpt-4o",
        usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 1_000_000 },
      });
      // 1M cached * $2.5 * 0.1 = $0.25
      expect(rec.costUsd).toBe(0.25);
    });

    it("threadId / turnId 透传(可空)", () => {
      const rec = useCostUsageStore.getState().recordUsage({
        provider: "codex",
        model: "gpt-4o",
        usage: { inputTokens: 0, outputTokens: 0 },
        threadId: "t1" as never,
        turnId: "tu1" as never,
      });
      expect(rec.threadId).toBe("t1");
      expect(rec.turnId).toBe("tu1");
    });

    it("负数 token 自动归零(防止越界)", () => {
      const rec = useCostUsageStore.getState().recordUsage({
        provider: "codex",
        model: "gpt-4o",
        usage: { inputTokens: -1000, outputTokens: -1000 },
      });
      expect(rec.usage.inputTokens).toBe(0);
      expect(rec.usage.outputTokens).toBe(0);
      expect(rec.costUsd).toBe(0);
    });
  });

  describe("deleteRecord / clearAll", () => {
    it("deleteRecord 按 id 删除", () => {
      const rec = useCostUsageStore.getState().recordUsage({
        provider: "codex",
        model: "gpt-4o",
        usage: { inputTokens: 1000, outputTokens: 1000 },
      });
      expect(useCostUsageStore.getState().records).toHaveLength(1);
      useCostUsageStore.getState().deleteRecord(rec.id);
      expect(useCostUsageStore.getState().records).toHaveLength(0);
    });

    it("clearAll 清空", () => {
      useCostUsageStore.getState().recordUsage({
        provider: "codex",
        model: "gpt-4o",
        usage: { inputTokens: 1000, outputTokens: 1000 },
      });
      useCostUsageStore.getState().recordUsage({
        provider: "codex",
        model: "gpt-4o-mini",
        usage: { inputTokens: 1000, outputTokens: 1000 },
      });
      expect(useCostUsageStore.getState().records).toHaveLength(2);
      useCostUsageStore.getState().clearAll();
      expect(useCostUsageStore.getState().records).toHaveLength(0);
    });
  });

  describe("pruneExpired 90 天", () => {
    it("过期记录被剪掉", () => {
      const now = Date.now();
      const oldTs = now - 100 * DAY_MS;
      const recentTs = now - 10 * DAY_MS;
      // 注入: 一条过期 + 一条新鲜
      const oldRec: UsageRecord = {
        id: "old",
        provider: "codex",
        model: "gpt-4o",
        usage: { inputTokens: 0, outputTokens: 0 },
        costUsd: 0,
        ts: oldTs,
      };
      const newRec: UsageRecord = {
        id: "new",
        provider: "codex",
        model: "gpt-4o",
        usage: { inputTokens: 0, outputTokens: 0 },
        costUsd: 0,
        ts: recentTs,
      };
      useCostUsageStore.setState({ records: [oldRec, newRec] });
      useCostUsageStore.getState().pruneExpired();
      const after = useCostUsageStore.getState().records;
      expect(after.map((r) => r.id).sort()).toEqual(["new"]);
    });
  });

  describe("getSpendInRange", () => {
    it("时间窗口内聚合 spend", () => {
      const base = new Date(2026, 5, 25, 12).getTime();
      const records: UsageRecord[] = [
        { id: "1", provider: "codex", model: "gpt-4o", usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 1.0, ts: base - 1000 },
        { id: "2", provider: "codex", model: "gpt-4o", usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 2.5, ts: base },
        { id: "3", provider: "codex", model: "gpt-4o", usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 0.5, ts: base + 1000 },
        { id: "4", provider: "codex", model: "gpt-4o", usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 99, ts: base + 10 * DAY_MS },
      ];
      const { spend, count } = getSpendInRange(records, base - 500, base + 5000);
      expect(count).toBe(2);
      expect(spend).toBe(3.0); // 1.0 + 2.5
    });

    it("空 records → spend 0 / count 0", () => {
      const { spend, count } = getSpendInRange([], 0, Date.now());
      expect(spend).toBe(0);
      expect(count).toBe(0);
    });
  });

  describe("startOfLocalDay / startOfLocalMonth", () => {
    it("startOfLocalDay 返回当天 0 点", () => {
      const ts = new Date(2026, 5, 25, 15, 30).getTime();
      expect(startOfLocalDay(ts)).toBe(new Date(2026, 5, 25).getTime());
    });
    it("startOfLocalMonth 返回当月 1 日 0 点", () => {
      const ts = new Date(2026, 5, 25, 15, 30).getTime();
      expect(startOfLocalMonth(ts)).toBe(new Date(2026, 5, 1).getTime());
    });
  });

  describe("持久化", () => {
    it("localStorage 中重复 id 归一化", () => {
      // 模拟持久化后存在重复 id
      const dup: UsageRecord = {
        id: "dup",
        provider: "codex",
        model: "gpt-4o",
        usage: { inputTokens: 0, outputTokens: 0 },
        costUsd: 1,
        ts: Date.now(),
      };
      const result = costUsageStoreInternals.normalizeRecords([dup, dup]);
      expect(result).toHaveLength(1);
    });
  });
});
