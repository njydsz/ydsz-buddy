/**
 * @file useCostBudgetGuard 单元测试
 *
 * 覆盖：
 * 1. useCostBudgetSnapshot: 无预算时 threshold=null/remaining=0
 * 2. 设预算 + recordUsage → snapshot 反映 spend
 * 3. useCostBudgetGuard policy=warn → 永不拦截
 * 4. useCostBudgetGuard policy=block + 超额 → shouldBlock=true
 * 5. recordUsageAndCheck 触发新阈值 → 返回事件
 * 6. 同一阈值 dismiss 后 → 不再返回
 * 7. 无预算 → recordUsageAndCheck 返回 null
 *
 * 设计要点: 用 zustand 的 setState API 直接同步注入数据,
 * 通过 setState 的 persist 中间件不会触发 persist 写入(useCostBudgetStore.persist 不参与)。
 * React 渲染只读 store,无中间渲染,无"未在 act 中更新"警告。
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";

import {
  recordUsageAndCheck,
  useCostBudgetGuard,
  useCostBudgetSnapshot,
  useDismissBudgetAlert,
} from "./useCostBudgetGuard";
import { useCostBudgetStore } from "../costBudgetStore";
import { useCostUsageStore } from "../costUsageStore";
import type { UsageRecord } from "../costUsageStore";

function resetAll(): void {
  useCostBudgetStore.setState({
    dailyBudgetUsd: null,
    monthlyBudgetUsd: null,
    policy: "warn",
    dismissedThresholds: [],
  });
  useCostUsageStore.setState({ records: [] });
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.clear();
  }
}

/** 同步注入数据(直接覆盖 store,无中间渲染) */
function seedStore(input: {
  budget?: { daily?: number | null; monthly?: number | null; policy?: "warn" | "block" };
  records?: UsageRecord[];
}): void {
  if (input.budget) {
    useCostBudgetStore.setState((s) => ({
      ...s,
      dailyBudgetUsd: input.budget!.daily !== undefined ? input.budget!.daily : s.dailyBudgetUsd,
      monthlyBudgetUsd: input.budget!.monthly !== undefined ? input.budget!.monthly : s.monthlyBudgetUsd,
      policy: input.budget!.policy ?? s.policy,
    }));
  }
  if (input.records) {
    useCostUsageStore.setState({ records: input.records });
  }
}

function makeRecord(costUsd: number, idSuffix: string = ""): UsageRecord {
  return {
    id: `seed-${idSuffix || String(costUsd)}`,
    provider: "codex",
    model: "gpt-4o",
    usage: { inputTokens: 0, outputTokens: 0 },
    costUsd,
    ts: Date.now(),
  };
}

describe("useCostBudgetGuard", () => {
  beforeEach(() => {
    resetAll();
  });
  afterEach(() => {
    resetAll();
  });

  describe("useCostBudgetSnapshot", () => {
    it("无预算时 daily/monthly threshold 都为 null", () => {
      const { result } = renderHook(() => useCostBudgetSnapshot());
      expect(result.current.dailyThreshold).toBeNull();
      expect(result.current.monthlyThreshold).toBeNull();
      expect(result.current.dailyBudget).toBeNull();
      expect(result.current.monthlyBudget).toBeNull();
      expect(result.current.exceeded).toBe(false);
    });

    it("设预算 + 写入 spend → snapshot 反映", () => {
      // 在 renderHook 之前同步注入数据(无 React 渲染参与)
      seedStore({
        budget: { daily: 10 },
        records: [makeRecord(5, "50pct")],
      });
      const { result } = renderHook(() => useCostBudgetSnapshot());
      expect(result.current.dailySpend).toBe(5);
      expect(result.current.dailyThreshold).toBe(0.5);
      expect(result.current.dailyRatio).toBe(0.5);
      expect(result.current.dailyRemaining).toBe(5);
    });
  });

  describe("useCostBudgetGuard", () => {
    it("policy=warn → 永不拦截(即使超额)", () => {
      seedStore({
        budget: { daily: 10, policy: "warn" },
        records: [makeRecord(20, "over")],
      });
      const { result } = renderHook(() => useCostBudgetGuard());
      expect(result.current.shouldBlock).toBe(false);
      expect(result.current.threshold).toBe(1.0);
    });

    it("policy=block + 80% 预算 → 不拦截(未到 1.0)", () => {
      seedStore({
        budget: { daily: 10, policy: "block" },
        records: [makeRecord(8, "80pct")],
      });
      const { result } = renderHook(() => useCostBudgetGuard());
      expect(result.current.shouldBlock).toBe(false);
    });

    it("policy=block + 超额 → shouldBlock=true + reason 包含美元数", () => {
      seedStore({
        budget: { daily: 10, policy: "block" },
        records: [makeRecord(12, "exceed")],
      });
      const { result } = renderHook(() => useCostBudgetGuard());
      expect(result.current.shouldBlock).toBe(true);
      expect(result.current.scope).toBe("daily");
      expect(result.current.reason).toContain("12");
      expect(result.current.reason).toContain("10");
    });
  });

  describe("recordUsageAndCheck", () => {
    it("无预算 → 返回 null", () => {
      const event = recordUsageAndCheck({
        provider: "codex",
        model: "gpt-4o",
        usage: { inputTokens: 0, outputTokens: 0 },
        costUsd: 100,
      });
      expect(event).toBeNull();
    });

    it("触发新阈值 → 返回事件", () => {
      act(() => {
        useCostBudgetStore.getState().setDailyBudget(10);
      });
      const event = recordUsageAndCheck({
        provider: "codex",
        model: "gpt-4o",
        usage: { inputTokens: 0, outputTokens: 0 },
        costUsd: 8.5, // 触发 0.8
      });
      expect(event).not.toBeNull();
      expect(event?.scope).toBe("daily");
      expect(event?.threshold).toBe(0.8);
      expect(event?.spend).toBe(8.5);
    });

    it("同一阈值 dismiss 后不再返回", () => {
      act(() => {
        useCostBudgetStore.getState().setDailyBudget(10);
      });
      const first = recordUsageAndCheck({
        provider: "codex",
        model: "gpt-4o",
        usage: { inputTokens: 0, outputTokens: 0 },
        costUsd: 8.5,
      });
      expect(first).not.toBeNull();
      // dismiss
      act(() => {
        useCostBudgetStore.getState().dismissThreshold(
          `${first!.scope}:${first!.dateKey}:${first!.threshold}`,
        );
      });
      // 再调一次(花费不变)
      const second = recordUsageAndCheck({
        provider: "codex",
        model: "gpt-4o",
        usage: { inputTokens: 0, outputTokens: 0 },
        costUsd: 0, // 0 增量
      });
      // 仍会再次 record,但 threshold 已经被 dismiss,所以 null
      expect(second).toBeNull();
    });
  });

  describe("useDismissBudgetAlert", () => {
    it("调用后写入 store", () => {
      act(() => {
        useCostBudgetStore.getState().setDailyBudget(10);
      });
      const event = recordUsageAndCheck({
        provider: "codex",
        model: "gpt-4o",
        usage: { inputTokens: 0, outputTokens: 0 },
        costUsd: 8.5,
      });
      expect(event).not.toBeNull();
      const { result } = renderHook(() => useDismissBudgetAlert());
      act(() => {
        result.current(event!);
      });
      const dismissed = useCostBudgetStore.getState().dismissedThresholds;
      expect(dismissed.length).toBeGreaterThan(0);
    });
  });
});
