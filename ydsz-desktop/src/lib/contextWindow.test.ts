/**
 * @file contextWindow.ts 单元测试
 *
 * 覆盖：
 * - formatContextWindowTokens（k/m 单位换算）
 * - formatCostUsd（精度分档）
 * - formatContextWindowSelectionLabel（1M/200k/其他）
 * - inferContextWindowSelectionValue（基于最大 token 推断）
 * - deriveCumulativeCostUsd（cumulative + turn delta 累加）
 * - deriveContextWindowMeterDisplay（百分比/aria/compact）
 * - deriveSelectedContextWindowSnapshot（200k/1m/未知）
 * - deriveLatestContextWindowSnapshot（usage/configured 联合）
 */

import { describe, expect, it } from "vitest";
import {
  deriveContextWindowMeterDisplay,
  deriveCumulativeCostUsd,
  deriveLatestContextWindowSnapshot,
  deriveSelectedContextWindowSnapshot,
  formatContextWindowSelectionLabel,
  formatContextWindowTokens,
  formatCostUsd,
  inferContextWindowSelectionValue,
  type ContextWindowSnapshot,
} from "./contextWindow";
import type { OrchestrationThreadActivity } from "@ydsz-buddy/contracts";

const baseActivity = (kind: OrchestrationThreadActivity["kind"], payload: unknown): OrchestrationThreadActivity => ({
  id: `act-${Math.random()}` as never,
  threadId: "t1" as never,
  turnId: null,
  kind,
  payload,
  createdAt: "2026-06-01T00:00:00.000Z",
});

describe("formatContextWindowTokens", () => {
  it("null/undefined → '0'", () => {
    expect(formatContextWindowTokens(null)).toBe("0");
    expect(formatContextWindowTokens(undefined)).toBe("0");
  });

  it("< 1000 → 整数", () => {
    expect(formatContextWindowTokens(0)).toBe("0");
    expect(formatContextWindowTokens(999)).toBe("999");
  });

  it("1000-9999 → 带 1 位小数的 k", () => {
    expect(formatContextWindowTokens(1000)).toBe("1k");
    expect(formatContextWindowTokens(1500)).toBe("1.5k");
    expect(formatContextWindowTokens(2000)).toBe("2k");
  });

  it("10000-999999 → 取整 k", () => {
    expect(formatContextWindowTokens(10_000)).toBe("10k");
    expect(formatContextWindowTokens(123_456)).toBe("123k");
  });

  it(">= 1000000 → 带 1 位小数的 m", () => {
    expect(formatContextWindowTokens(1_000_000)).toBe("1m");
    expect(formatContextWindowTokens(1_500_000)).toBe("1.5m");
    expect(formatContextWindowTokens(2_000_000)).toBe("2m");
  });

  it("非数字 → '0'", () => {
    expect(formatContextWindowTokens(NaN)).toBe("0");
    expect(formatContextWindowTokens(Infinity)).toBe("0");
  });
});

describe("formatCostUsd", () => {
  it("< 0.0001 → 6 位小数", () => {
    expect(formatCostUsd(0.00001)).toBe("$0.000010");
  });

  it("< 0.001 → 5 位小数", () => {
    expect(formatCostUsd(0.0005)).toBe("$0.00050");
  });

  it("< 0.01 → 4 位小数", () => {
    expect(formatCostUsd(0.005)).toBe("$0.0050");
  });

  it("< 0.1 → 3 位小数", () => {
    expect(formatCostUsd(0.05)).toBe("$0.050");
  });

  it(">= 0.1 → 2 位小数", () => {
    expect(formatCostUsd(0.5)).toBe("$0.50");
    expect(formatCostUsd(12.34)).toBe("$12.34");
  });
});

describe("formatContextWindowSelectionLabel", () => {
  it("非字符串 → null", () => {
    // @ts-expect-error testing
    expect(formatContextWindowSelectionLabel(123)).toBeNull();
    // @ts-expect-error testing
    expect(formatContextWindowSelectionLabel(null)).toBeNull();
  });

  it("trim 后空字符串 → null", () => {
    expect(formatContextWindowSelectionLabel("   ")).toBeNull();
  });

  it("'1m' / '1M' → '1M'", () => {
    expect(formatContextWindowSelectionLabel("1m")).toBe("1M");
    expect(formatContextWindowSelectionLabel("1M")).toBe("1M");
  });

  it("'200k' → '200k'", () => {
    expect(formatContextWindowSelectionLabel("200k")).toBe("200k");
  });

  it("其他以 m 结尾的字符串 → M 后缀", () => {
    expect(formatContextWindowSelectionLabel("2m")).toBe("2M");
  });

  it("其他字符串原样返回（小写）", () => {
    expect(formatContextWindowSelectionLabel("  hello  ")).toBe("hello");
  });
});

describe("inferContextWindowSelectionValue", () => {
  it("null/0/负数 → null", () => {
    expect(inferContextWindowSelectionValue(null)).toBeNull();
    expect(inferContextWindowSelectionValue(0)).toBeNull();
    expect(inferContextWindowSelectionValue(-100)).toBeNull();
  });

  it("NaN/Infinity → null", () => {
    expect(inferContextWindowSelectionValue(NaN)).toBeNull();
    expect(inferContextWindowSelectionValue(Infinity)).toBeNull();
  });

  it("200_000 → '200k'（距离 0%）", () => {
    expect(inferContextWindowSelectionValue(200_000)).toBe("200k");
  });

  it("1_000_000 → '1m'（距离 0%）", () => {
    expect(inferContextWindowSelectionValue(1_000_000)).toBe("1m");
  });

  it("差值在 20% 以内匹配", () => {
    // 210_000 与 200_000 差 5%
    expect(inferContextWindowSelectionValue(210_000)).toBe("200k");
    // 1_100_000 与 1_000_000 差 10%
    expect(inferContextWindowSelectionValue(1_100_000)).toBe("1m");
  });

  it("差值超过 20% → null", () => {
    // 100_000 与 200_000 差 50%
    expect(inferContextWindowSelectionValue(100_000)).toBeNull();
    // 50_000 与 200_000 差 75%
    expect(inferContextWindowSelectionValue(50_000)).toBeNull();
  });
});

describe("deriveCumulativeCostUsd", () => {
  it("空活动列表 → null", () => {
    expect(deriveCumulativeCostUsd([])).toBeNull();
  });

  it("无 turn.completed → null", () => {
    const acts: OrchestrationThreadActivity[] = [
      baseActivity("message.appended", { text: "hi" }),
    ];
    expect(deriveCumulativeCostUsd(acts)).toBeNull();
  });

  it("使用 cumulativeCostUsd 直接返回", () => {
    const acts: OrchestrationThreadActivity[] = [
      baseActivity("turn.completed", { cumulativeCostUsd: 1.23 }),
    ];
    expect(deriveCumulativeCostUsd(acts)).toBe(1.23);
  });

  it("cumulative + 后续 turn delta 累加", () => {
    const acts: OrchestrationThreadActivity[] = [
      baseActivity("turn.completed", { cumulativeCostUsd: 1.0 }),
      baseActivity("turn.completed", { totalCostUsd: 0.5 }),
    ];
    expect(deriveCumulativeCostUsd(acts)).toBe(1.5);
  });

  it("无 cumulative 时累加 turn delta", () => {
    const acts: OrchestrationThreadActivity[] = [
      baseActivity("turn.completed", { totalCostUsd: 0.5 }),
      baseActivity("turn.completed", { totalCostUsd: 0.3 }),
    ];
    expect(deriveCumulativeCostUsd(acts)).toBe(0.8);
  });
});

describe("deriveSelectedContextWindowSnapshot", () => {
  it("null/undefined/空 → null", () => {
    expect(deriveSelectedContextWindowSnapshot(null)).toBeNull();
    expect(deriveSelectedContextWindowSnapshot(undefined)).toBeNull();
    expect(deriveSelectedContextWindowSnapshot("")).toBeNull();
    expect(deriveSelectedContextWindowSnapshot("   ")).toBeNull();
  });

  it("'200k' → 200_000 tokens", () => {
    const snap = deriveSelectedContextWindowSnapshot("200k");
    expect(snap?.maxTokens).toBe(200_000);
    expect(snap?.usedTokens).toBe(0);
    expect(snap?.remainingTokens).toBe(200_000);
    expect(snap?.usedPercentage).toBe(0);
  });

  it("'1m' → 1_000_000 tokens", () => {
    const snap = deriveSelectedContextWindowSnapshot("1m");
    expect(snap?.maxTokens).toBe(1_000_000);
  });

  it("未知值 → null", () => {
    expect(deriveSelectedContextWindowSnapshot("foo")).toBeNull();
  });

  it("大小写不敏感", () => {
    expect(deriveSelectedContextWindowSnapshot("200K")?.maxTokens).toBe(200_000);
    expect(deriveSelectedContextWindowSnapshot("1M")?.maxTokens).toBe(1_000_000);
  });
});

describe("deriveContextWindowMeterDisplay", () => {
  const baseUsage: ContextWindowSnapshot = {
    usedTokens: 0,
    usedPercent: null,
    totalProcessedTokens: null,
    maxTokens: 200_000,
    remainingTokens: 200_000,
    usedPercentage: 0,
    remainingPercentage: 100,
    inputTokens: null,
    cachedInputTokens: null,
    outputTokens: null,
    reasoningOutputTokens: null,
    lastUsedTokens: null,
    lastInputTokens: null,
    lastCachedInputTokens: null,
    lastOutputTokens: null,
    lastReasoningOutputTokens: null,
    toolUses: null,
    durationMs: null,
    compactsAutomatically: false,
    updatedAt: "2026-06-01T00:00:00.000Z",
  };

  it("usedPercentage=0 时 usedPercentageLabel='0%'", () => {
    const display = deriveContextWindowMeterDisplay(baseUsage);
    expect(display.usedPercentageLabel).toBe("0%");
    expect(display.compactLabel).toBe("0%");
    expect(display.tokenUsageLabel).toBe("0");
    expect(display.hasReliableTokenRatio).toBe(true);
  });

  it("usedPercentage=null 时 usedPercentageLabel=null, compactLabel 用 token 数", () => {
    const display = deriveContextWindowMeterDisplay({
      ...baseUsage,
      usedPercentage: null,
      usedPercent: null,
    });
    expect(display.usedPercentageLabel).toBeNull();
    expect(display.tokenUsageLabel).toBe("0");
    expect(display.hasReliableTokenRatio).toBe(true);
    expect(display.compactLabel).toBe("0");
  });

  it("usedPercentage=5.5 → 5.5%（< 10 用 1 位小数）", () => {
    const display = deriveContextWindowMeterDisplay({
      ...baseUsage,
      usedTokens: 11_000,
      usedPercentage: 5.5,
    });
    expect(display.usedPercentageLabel).toBe("5.5%");
    expect(display.normalizedPercentage).toBe(5.5);
  });

  it("usedPercentage=50 → 50%（>= 10 用取整）", () => {
    const display = deriveContextWindowMeterDisplay({
      ...baseUsage,
      usedPercentage: 50,
    });
    expect(display.usedPercentageLabel).toBe("50%");
    expect(display.compactLabel).toBe("50%");
  });

  it("ariaLabel 在 usedPercentage 缺失时回退到 token 数", () => {
    const display = deriveContextWindowMeterDisplay(baseUsage);
    expect(display.ariaLabel).toMatch(/Context window/);
  });
});

describe("deriveLatestContextWindowSnapshot", () => {
  it("无相关活动 → null", () => {
    const acts: OrchestrationThreadActivity[] = [
      baseActivity("message.appended", { text: "hi" }),
    ];
    expect(deriveLatestContextWindowSnapshot(acts)).toBeNull();
  });

  it("只有 usage 活动", () => {
    const acts: OrchestrationThreadActivity[] = [
      baseActivity("context-window.updated", {
        usedTokens: 1000,
        maxTokens: 200_000,
      }),
    ];
    const snap = deriveLatestContextWindowSnapshot(acts);
    expect(snap?.maxTokens).toBe(200_000);
    expect(snap?.usedTokens).toBe(1000);
    expect(snap?.usedPercentage).toBeCloseTo(0.5, 2);
  });

  it("usage + configured 联合：configured 优先", () => {
    const acts: OrchestrationThreadActivity[] = [
      baseActivity("context-window.updated", { usedTokens: 1000, maxTokens: 100_000 }),
      baseActivity("context-window.configured", { maxTokens: 1_000_000 }),
    ];
    const snap = deriveLatestContextWindowSnapshot(acts);
    expect(snap?.maxTokens).toBe(1_000_000);
  });

  it("usedPercent 直接透传", () => {
    const acts: OrchestrationThreadActivity[] = [
      baseActivity("context-window.updated", { usedPercent: 25 }),
    ];
    const snap = deriveLatestContextWindowSnapshot(acts);
    expect(snap?.usedPercentage).toBe(25);
  });
});
