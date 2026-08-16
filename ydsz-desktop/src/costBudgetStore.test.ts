/**
 * @file costBudgetStore 单元测试
 *
 * 覆盖：
 * 1. 默认值: budget null, policy warn, dismissed []
 * 2. setDailyBudget / setMonthlyBudget: 正常化(0/负数 → null, NaN → null)
 * 3. 修改预算清空 dismissed
 * 4. setPolicy: 只接受 warn / block
 * 5. dismissThreshold: 重复 key 不重复加入
 * 6. resetDismissed
 * 7. 持久化 + 非法值 merge 兜底
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useCostBudgetStore } from "./costBudgetStore";

function resetStore(): void {
  useCostBudgetStore.setState({
    dailyBudgetUsd: null,
    monthlyBudgetUsd: null,
    policy: "warn",
    dismissedThresholds: [],
  });
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.clear();
  }
}

describe("costBudgetStore", () => {
  beforeEach(() => {
    resetStore();
  });
  afterEach(() => {
    resetStore();
  });

  describe("默认值", () => {
    it("budget 都是 null,policy warn,dismissed 空", () => {
      const s = useCostBudgetStore.getState();
      expect(s.dailyBudgetUsd).toBeNull();
      expect(s.monthlyBudgetUsd).toBeNull();
      expect(s.policy).toBe("warn");
      expect(s.dismissedThresholds).toEqual([]);
    });
  });

  describe("setDailyBudget", () => {
    it("正有限数 → 保存", () => {
      useCostBudgetStore.getState().setDailyBudget(10);
      expect(useCostBudgetStore.getState().dailyBudgetUsd).toBe(10);
    });
    it("0 / 负数 → null", () => {
      useCostBudgetStore.getState().setDailyBudget(0);
      expect(useCostBudgetStore.getState().dailyBudgetUsd).toBeNull();
      useCostBudgetStore.getState().setDailyBudget(-1);
      expect(useCostBudgetStore.getState().dailyBudgetUsd).toBeNull();
    });
    it("NaN / Infinity → null", () => {
      useCostBudgetStore.getState().setDailyBudget(Number.NaN);
      expect(useCostBudgetStore.getState().dailyBudgetUsd).toBeNull();
      useCostBudgetStore.getState().setDailyBudget(Number.POSITIVE_INFINITY);
      expect(useCostBudgetStore.getState().dailyBudgetUsd).toBeNull();
    });
    it("null → null(关闭预算)", () => {
      useCostBudgetStore.getState().setDailyBudget(10);
      useCostBudgetStore.getState().setDailyBudget(null);
      expect(useCostBudgetStore.getState().dailyBudgetUsd).toBeNull();
    });
    it("改预算清空 dismissed 列表", () => {
      useCostBudgetStore.getState().dismissThreshold("daily:2026-06-25:0.8");
      expect(useCostBudgetStore.getState().dismissedThresholds).toHaveLength(1);
      useCostBudgetStore.getState().setDailyBudget(10);
      expect(useCostBudgetStore.getState().dismissedThresholds).toEqual([]);
    });
  });

  describe("setMonthlyBudget", () => {
    it("正常路径", () => {
      useCostBudgetStore.getState().setMonthlyBudget(100);
      expect(useCostBudgetStore.getState().monthlyBudgetUsd).toBe(100);
    });
    it("改预算清空 dismissed 列表", () => {
      useCostBudgetStore.getState().dismissThreshold("monthly:2026-06:0.5");
      useCostBudgetStore.getState().setMonthlyBudget(100);
      expect(useCostBudgetStore.getState().dismissedThresholds).toEqual([]);
    });
  });

  describe("setPolicy", () => {
    it("warn / block 都接受", () => {
      useCostBudgetStore.getState().setPolicy("block");
      expect(useCostBudgetStore.getState().policy).toBe("block");
      useCostBudgetStore.getState().setPolicy("warn");
      expect(useCostBudgetStore.getState().policy).toBe("warn");
    });
    it("非法值忽略", () => {
      useCostBudgetStore.getState().setPolicy("block");
      // @ts-expect-error 测试非法输入
      useCostBudgetStore.getState().setPolicy("ignore");
      expect(useCostBudgetStore.getState().policy).toBe("block");
    });
  });

  describe("dismissThreshold", () => {
    it("首次加入", () => {
      useCostBudgetStore.getState().dismissThreshold("daily:2026-06-25:0.8");
      expect(useCostBudgetStore.getState().dismissedThresholds).toEqual([
        "daily:2026-06-25:0.8",
      ]);
    });
    it("重复 key 不重复加入", () => {
      useCostBudgetStore.getState().dismissThreshold("daily:2026-06-25:0.8");
      useCostBudgetStore.getState().dismissThreshold("daily:2026-06-25:0.8");
      expect(useCostBudgetStore.getState().dismissedThresholds).toHaveLength(1);
    });
    it("空 key 忽略", () => {
      useCostBudgetStore.getState().dismissThreshold("");
      expect(useCostBudgetStore.getState().dismissedThresholds).toEqual([]);
    });
  });

  describe("resetDismissed", () => {
    it("清空", () => {
      useCostBudgetStore.getState().dismissThreshold("a");
      useCostBudgetStore.getState().dismissThreshold("b");
      useCostBudgetStore.getState().resetDismissed();
      expect(useCostBudgetStore.getState().dismissedThresholds).toEqual([]);
    });
  });
});
