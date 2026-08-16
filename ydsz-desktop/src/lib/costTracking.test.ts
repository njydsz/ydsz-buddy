/**
 * @file costTracking 单元测试
 *
 * 覆盖：
 * 1. roundTo6Decimals: NaN / 正常 / 边界
 * 2. calculateUsageCost: 正常 / 缺 cost / 缺 input|output / cached tokens / 非法数字
 * 3. isBudgetConfigured: 0 / 负数 / NaN / 正常
 * 4. pickActiveThreshold: 5/8/9.5/10 跨越 + 默认阈值排序
 * 5. budgetUsageRatio: 0 / 正常 / 超额
 * 6. toLocalDateKey / toLocalMonthKey: 格式化正确
 * 7. thresholdEventKey: key 形状
 * 8. budgetDelta: 正/负剩余
 * 9. formatUsd: 0 / 0.001 / 999 / 1000 / 负数
 */

import { describe, expect, it } from "vitest";

import {
  budgetDelta,
  budgetUsageRatio,
  calculateUsageCost,
  DEFAULT_ALERT_THRESHOLDS,
  formatUsd,
  isBudgetConfigured,
  pickActiveThreshold,
  roundTo6Decimals,
  thresholdEventKey,
  toLocalDateKey,
  toLocalMonthKey,
  type TokenUsage,
} from "./costTracking";

const USAGE_1K_IN_1K_OUT: TokenUsage = { inputTokens: 1000, outputTokens: 1000 };

describe("costTracking", () => {
  describe("roundTo6Decimals", () => {
    it("NaN 返回 0(graceful)", () => {
      expect(roundTo6Decimals(Number.NaN)).toBe(0);
    });
    it("非有限数(±Infinity)返回 0", () => {
      expect(roundTo6Decimals(Number.POSITIVE_INFINITY)).toBe(0);
      expect(roundTo6Decimals(Number.NEGATIVE_INFINITY)).toBe(0);
    });
    it("正常四舍五入到 6 位", () => {
      expect(roundTo6Decimals(0.123456789)).toBe(0.123457);
      expect(roundTo6Decimals(1.0000004)).toBe(1);
      expect(roundTo6Decimals(0.0000001)).toBe(0);
    });
  });

  describe("calculateUsageCost", () => {
    it("缺 cost → 0", () => {
      expect(calculateUsageCost(USAGE_1K_IN_1K_OUT, null)).toBe(0);
      expect(calculateUsageCost(USAGE_1K_IN_1K_OUT, undefined)).toBe(0);
    });

    it("正常: input $2.5 / 1M, output $10 / 1M, 1k+1k tokens", () => {
      // 1000 / 1M * 2.5 = 0.0025
      // 1000 / 1M * 10  = 0.01
      // total = 0.0125
      expect(calculateUsageCost(USAGE_1K_IN_1K_OUT, { input: 2.5, output: 10 })).toBe(0.0125);
    });

    it("input 为 0(只算 output)", () => {
      expect(calculateUsageCost({ inputTokens: 0, outputTokens: 1000 }, { input: 2.5, output: 10 }))
        .toBe(0.01);
    });

    it("output 为 0(只算 input)", () => {
      expect(calculateUsageCost({ inputTokens: 1000, outputTokens: 0 }, { input: 2.5, output: 10 }))
        .toBe(0.0025);
    });

    it("cached tokens 按 input 10% 计费", () => {
      // input $2.5, cached 1000 → (1000/1M)*2.5*0.1 = 0.00025
      expect(
        calculateUsageCost(
          { inputTokens: 0, outputTokens: 0, cachedInputTokens: 1000 },
          { input: 2.5, output: 10 },
        ),
      ).toBe(0.00025);
    });

    it("负数 tokens 视作 0(防止越界)", () => {
      expect(
        calculateUsageCost(
          { inputTokens: -100, outputTokens: -100 },
          { input: 2.5, output: 10 },
        ),
      ).toBe(0);
    });

    it("负 cost 视作 0", () => {
      expect(calculateUsageCost(USAGE_1K_IN_1K_OUT, { input: -2.5, output: 10 })).toBe(0.01);
    });

    it("input/output 缺字段视作 0", () => {
      expect(calculateUsageCost(USAGE_1K_IN_1K_OUT, {})).toBe(0);
    });
  });

  describe("isBudgetConfigured", () => {
    it("null / undefined → false", () => {
      expect(isBudgetConfigured(null)).toBe(false);
      expect(isBudgetConfigured(undefined)).toBe(false);
    });
    it("0 / 负数 → false", () => {
      expect(isBudgetConfigured(0)).toBe(false);
      expect(isBudgetConfigured(-1)).toBe(false);
    });
    it("NaN / Infinity → false", () => {
      expect(isBudgetConfigured(Number.NaN)).toBe(false);
      expect(isBudgetConfigured(Number.POSITIVE_INFINITY)).toBe(false);
    });
    it("正有限数 → true", () => {
      expect(isBudgetConfigured(0.01)).toBe(true);
      expect(isBudgetConfigured(10)).toBe(true);
    });
  });

  describe("pickActiveThreshold", () => {
    it("无预算 → null", () => {
      expect(pickActiveThreshold(5, null)).toBeNull();
      expect(pickActiveThreshold(5, 0)).toBeNull();
    });

    it("未达任何阈值 → null", () => {
      expect(pickActiveThreshold(1, 10)).toBeNull();
    });

    it("花费 5 / 预算 10 → 0.5", () => {
      expect(pickActiveThreshold(5, 10)).toBe(0.5);
    });

    it("花费 8.5 / 预算 10 → 0.8", () => {
      expect(pickActiveThreshold(8.5, 10)).toBe(0.8);
    });

    it("花费 9.5 / 预算 10 → 0.95", () => {
      expect(pickActiveThreshold(9.5, 10)).toBe(0.95);
    });

    it("花费 10 / 预算 10 → 1.0", () => {
      expect(pickActiveThreshold(10, 10)).toBe(1.0);
    });

    it("花费 100(超额) / 预算 10 → 1.0", () => {
      expect(pickActiveThreshold(100, 10)).toBe(1.0);
    });

    it("负 spend → null", () => {
      expect(pickActiveThreshold(-1, 10)).toBeNull();
    });

    it("自定义 thresholds 也工作", () => {
      expect(pickActiveThreshold(3, 10, [0.25, 0.5, 0.75])).toBe(0.25);
      expect(pickActiveThreshold(7.5, 10, [0.25, 0.5, 0.75])).toBe(0.75);
    });

    it("默认阈值就是 [0.5, 0.8, 0.95, 1.0]", () => {
      expect(DEFAULT_ALERT_THRESHOLDS).toEqual([0.5, 0.8, 0.95, 1.0]);
    });
  });

  describe("budgetUsageRatio", () => {
    it("无预算 → 0", () => {
      expect(budgetUsageRatio(5, null)).toBe(0);
    });
    it("spend 0 → 0", () => {
      expect(budgetUsageRatio(0, 10)).toBe(0);
    });
    it("spend 5 / budget 10 → 0.5", () => {
      expect(budgetUsageRatio(5, 10)).toBe(0.5);
    });
    it("spend 20 / budget 10 → 2(超额)", () => {
      expect(budgetUsageRatio(20, 10)).toBe(2);
    });
  });

  describe("toLocalDateKey / toLocalMonthKey", () => {
    it("date 格式 YYYY-MM-DD", () => {
      // 2026-06-25 本地中午
      const ts = new Date(2026, 5, 25, 12, 0, 0).getTime();
      expect(toLocalDateKey(ts)).toBe("2026-06-25");
    });
    it("month 格式 YYYY-MM", () => {
      const ts = new Date(2026, 5, 25, 12, 0, 0).getTime();
      expect(toLocalMonthKey(ts)).toBe("2026-06");
    });
  });

  describe("thresholdEventKey", () => {
    it("key 形如 scope:dateKey:threshold", () => {
      expect(
        thresholdEventKey({ scope: "daily", dateKey: "2026-06-25", threshold: 0.8 }),
      ).toBe("daily:2026-06-25:0.8");
    });
    it("monthly 同样工作", () => {
      expect(
        thresholdEventKey({ scope: "monthly", dateKey: "2026-06", threshold: 0.5 }),
      ).toBe("monthly:2026-06:0.5");
    });
  });

  describe("budgetDelta", () => {
    it("无预算 → remaining 0, exceeded false", () => {
      expect(budgetDelta(5, null)).toEqual({ remaining: 0, exceeded: false });
    });
    it("spend 5 / budget 10 → remaining 5", () => {
      expect(budgetDelta(5, 10)).toEqual({ remaining: 5, exceeded: false });
    });
    it("spend 12 / budget 10 → remaining -2, exceeded true", () => {
      expect(budgetDelta(12, 10)).toEqual({ remaining: -2, exceeded: true });
    });
  });

  describe("formatUsd", () => {
    it("0 → $0.00", () => {
      expect(formatUsd(0)).toBe("$0.00");
    });
    it("0.001 → $0.00", () => {
      expect(formatUsd(0.001)).toBe("$0.00");
    });
    it("0.5 → $0.50", () => {
      expect(formatUsd(0.5)).toBe("$0.50");
    });
    it("999.99 → $999.99", () => {
      expect(formatUsd(999.99)).toBe("$999.99");
    });
    it(">= 1000 走无小数: $1234", () => {
      expect(formatUsd(1234.56)).toBe("$1235");
    });
    it("负数带 -", () => {
      expect(formatUsd(-2.5)).toBe("-$2.50");
    });
    it("NaN → $0.00(graceful)", () => {
      expect(formatUsd(Number.NaN)).toBe("$0.00");
    });
  });
});
