/**
 * @file providerUsageSnapshot 单元测试
 *
 * 覆盖服务端 Provider 用量快照归一化的两个核心函数:
 *
 * 1. normalizeServerProviderUsageRateLimit - 归一化为 ProviderRateLimit
 * 2. normalizeServerProviderUsageLines - 归一化为用量文本行
 *
 * 关键边界:
 *
 * - null / undefined 输入
 * - 空数组 limits / usageLines
 * - 字段缺失时不写入(undefined 不传播)
 */

import { describe, expect, it } from "vitest";

import {
  normalizeServerProviderUsageLines,
  normalizeServerProviderUsageRateLimit,
} from "./providerUsageSnapshot";

describe("providerUsageSnapshot", () => {
  describe("normalizeServerProviderUsageRateLimit", () => {
    it("null snapshot 返回 null", () => {
      expect(normalizeServerProviderUsageRateLimit(null)).toBeNull();
    });

    it("undefined snapshot 返回 null", () => {
      expect(normalizeServerProviderUsageRateLimit(undefined)).toBeNull();
    });

    it("空 limits 返回 null", () => {
      expect(
        normalizeServerProviderUsageRateLimit({
          provider: "codex",
          updatedAt: "2026-06-24T00:00:00.000Z",
          limits: [],
          usageLines: [],
        }),
      ).toBeNull();
    });

    it("完整字段归一化", () => {
      const result = normalizeServerProviderUsageRateLimit({
        provider: "codex",
        updatedAt: "2026-06-24T00:00:00.000Z",
        limits: [
          {
            window: "5h",
            usedPercent: 30,
            resetsAt: "2026-06-24T05:00:00.000Z",
            windowDurationMins: 300,
          },
        ],
        usageLines: [],
      });
      expect(result).toEqual({
        provider: "codex",
        updatedAt: "2026-06-24T00:00:00.000Z",
        limits: [
          {
            window: "5h",
            usedPercent: 30,
            resetsAt: "2026-06-24T05:00:00.000Z",
            windowDurationMins: 300,
          },
        ],
      });
    });

    it("字段缺失时不写入结果", () => {
      const result = normalizeServerProviderUsageRateLimit({
        provider: "claudeAgent",
        updatedAt: "2026-06-24T00:00:00.000Z",
        limits: [
          {
            window: "5h",
            // usedPercent / resetsAt / windowDurationMins 都缺失
          },
        ],
        usageLines: [],
      });
      expect(result).toEqual({
        provider: "claudeAgent",
        updatedAt: "2026-06-24T00:00:00.000Z",
        limits: [{ window: "5h" }],
      });
    });

    it("多 limits 保留顺序", () => {
      const result = normalizeServerProviderUsageRateLimit({
        provider: "codex",
        updatedAt: "2026-06-24T00:00:00.000Z",
        limits: [
          { window: "5h", usedPercent: 20 },
          { window: "Weekly", usedPercent: 50 },
          { window: "Sonnet", usedPercent: 10 },
        ],
        usageLines: [],
      });
      expect(result?.limits).toHaveLength(3);
      expect(result?.limits!.map((l) => l.window)).toEqual(["5h", "Weekly", "Sonnet"]);
    });
  });

  describe("normalizeServerProviderUsageLines", () => {
    it("null snapshot 返回空数组", () => {
      expect(normalizeServerProviderUsageLines(null)).toEqual([]);
    });

    it("undefined snapshot 返回空数组", () => {
      expect(normalizeServerProviderUsageLines(undefined)).toEqual([]);
    });

    it("空 usageLines 返回空数组", () => {
      expect(
        normalizeServerProviderUsageLines({
          provider: "codex",
          updatedAt: "2026-06-24T00:00:00.000Z",
          limits: [],
          usageLines: [],
        }),
      ).toEqual([]);
    });

    it("完整字段归一化", () => {
      const result = normalizeServerProviderUsageLines({
        provider: "codex",
        updatedAt: "2026-06-24T00:00:00.000Z",
        limits: [],
        usageLines: [
          { label: "Tokens today", value: "12.5K", subtitle: "of 250K" },
        ],
      });
      expect(result).toEqual([
        { label: "Tokens today", value: "12.5K", subtitle: "of 250K" },
      ]);
    });

    it("subtitle 缺失时不写入", () => {
      const result = normalizeServerProviderUsageLines({
        provider: "codex",
        updatedAt: "2026-06-24T00:00:00.000Z",
        limits: [],
        usageLines: [{ label: "Cost", value: "$0.50" }],
      });
      expect(result).toEqual([{ label: "Cost", value: "$0.50" }]);
      expect(result[0]).not.toHaveProperty("subtitle");
    });
  });
});
