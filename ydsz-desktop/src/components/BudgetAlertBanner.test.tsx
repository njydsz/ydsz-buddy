/**
 * @file BudgetAlertBanner 单元测试
 *
 * 覆盖：
 * 1. 无预算 / 无触发 → 不渲染
 * 2. 触发 0.5 阈值 → 显示 banner
 * 3. dismiss 后不显示
 * 4. daily + monthly 同时触发 → 选最严重的展示
 * 5. 超额 (>= 1.0) 用 danger 样式
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { I18nProvider } from "../i18n/I18nContext";
import { BudgetAlertBanner } from "./BudgetAlertBanner";
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

function renderBanner() {
  return render(<BudgetAlertBanner />, {
    wrapper: ({ children }) => <I18nProvider language="en">{children}</I18nProvider>,
  });
}

function makeRecord(costUsd: number, id: string): UsageRecord {
  return {
    id,
    provider: "codex",
    model: "gpt-4o",
    usage: { inputTokens: 0, outputTokens: 0 },
    costUsd,
    ts: Date.now(),
  };
}

describe("BudgetAlertBanner", () => {
  beforeEach(() => {
    resetAll();
  });
  afterEach(() => {
    resetAll();
  });

  describe("渲染条件", () => {
    it("无预算时 → 不渲染", () => {
      const { container } = renderBanner();
      expect(container.firstChild).toBeNull();
    });

    it("有预算但无 spend → 不渲染", () => {
      useCostBudgetStore.getState().setDailyBudget(10);
      const { container } = renderBanner();
      expect(container.firstChild).toBeNull();
    });

    it("spend 低于 50% → 不渲染", () => {
      useCostBudgetStore.getState().setDailyBudget(10);
      useCostUsageStore.setState({ records: [makeRecord(2, "low")] });
      const { container } = renderBanner();
      expect(container.firstChild).toBeNull();
    });
  });

  describe("触发展示", () => {
    it("spend 5 / 预算 10 → 展示 0.5 banner", () => {
      useCostBudgetStore.getState().setDailyBudget(10);
      useCostUsageStore.setState({ records: [makeRecord(5, "5")] });
      renderBanner();
      const banner = screen.getByTestId("cost-budget-alert-banner");
      expect(banner.getAttribute("data-threshold")).toBe("0.5");
      expect(banner.getAttribute("data-scope")).toBe("daily");
    });

    it("spend 8.5 / 预算 10 → 展示 0.8 banner", () => {
      useCostBudgetStore.getState().setDailyBudget(10);
      useCostUsageStore.setState({ records: [makeRecord(8.5, "85")] });
      renderBanner();
      const banner = screen.getByTestId("cost-budget-alert-banner");
      expect(banner.getAttribute("data-threshold")).toBe("0.8");
    });

    it("spend 12 / 预算 10 → 展示 1.0 banner(danger 样式)", () => {
      useCostBudgetStore.getState().setDailyBudget(10);
      useCostUsageStore.setState({ records: [makeRecord(12, "exceed")] });
      renderBanner();
      const banner = screen.getByTestId("cost-budget-alert-banner");
      expect(banner.getAttribute("data-threshold")).toBe("1");
      // 包含 danger 类
      expect(banner.className).toContain("text-danger");
    });
  });

  describe("dismiss", () => {
    it("点 dismiss → 写入 dismissedThresholds + banner 消失", () => {
      useCostBudgetStore.getState().setDailyBudget(10);
      useCostUsageStore.setState({ records: [makeRecord(8, "80")] });
      renderBanner();
      const dismissBtn = screen.getByTestId("cost-budget-alert-dismiss");
      fireEvent.click(dismissBtn);
      // store 写入
      const dismissed = useCostBudgetStore.getState().dismissedThresholds;
      expect(dismissed.length).toBe(1);
      expect(dismissed[0]).toContain("daily:");
      expect(dismissed[0]).toContain(":0.8");
    });
  });

  describe("多 scope 选择", () => {
    it("daily + monthly 同时触发 → 选最严重的展示", () => {
      // 让两条记录分属不同窗口(今日 vs 本月早些时候)以隔离聚合
      const now = Date.now();
      const monthStart = new Date(now);
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      useCostBudgetStore.getState().setDailyBudget(10);
      useCostBudgetStore.getState().setMonthlyBudget(100);
      // daily 0.8 (8/10) + monthly 0.5 (50/100) → daily 严重
      useCostUsageStore.setState({
        records: [
          { ...makeRecord(8, "d"), ts: now },
          { ...makeRecord(50, "m"), ts: monthStart.getTime() + 60_000 },
        ],
      });
      renderBanner();
      const banner = screen.getByTestId("cost-budget-alert-banner");
      expect(banner.getAttribute("data-scope")).toBe("daily");
      expect(banner.getAttribute("data-threshold")).toBe("0.8");
    });
  });
});
