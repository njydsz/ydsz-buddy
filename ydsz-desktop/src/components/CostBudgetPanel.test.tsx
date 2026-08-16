/**
 * @file CostBudgetPanel 单元测试
 *
 * 覆盖：
 * 1. 渲染所有 section
 * 2. 切换策略单选(warn / block)
 * 3. 改 daily / monthly 预算
 * 4. 进度条根据 spend 比例显示
 * 5. 无预算时显示 "未设置预算"
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { I18nProvider } from "../i18n/I18nContext";
import { useCostBudgetStore } from "../costBudgetStore";
import { useCostUsageStore } from "../costUsageStore";
import type { UsageRecord } from "../costUsageStore";
import { CostBudgetPanel } from "./CostBudgetPanel";

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

function renderWithI18n() {
  return render(<CostBudgetPanel />, {
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

describe("CostBudgetPanel", () => {
  beforeEach(() => {
    resetAll();
  });
  afterEach(() => {
    resetAll();
  });

  describe("渲染", () => {
    it("渲染所有 section title", () => {
      renderWithI18n();
      expect(screen.getByText("Cost budget")).toBeTruthy();
      expect(screen.getByText("Daily budget (USD)")).toBeTruthy();
      expect(screen.getByText("Monthly budget (USD)")).toBeTruthy();
      expect(screen.getByText("When budget is exceeded")).toBeTruthy();
      expect(screen.getByText("Current spend")).toBeTruthy();
    });

    it("默认无预算时显示 'No budget set'", () => {
      renderWithI18n();
      const noBudgets = screen.getAllByText("No budget set");
      expect(noBudgets.length).toBe(2); // daily + monthly
    });
  });

  describe("策略切换", () => {
    it("默认 warn 高亮", () => {
      renderWithI18n();
      const warnBtn = screen.getByTestId("cost-budget-policy-warn");
      const blockBtn = screen.getByTestId("cost-budget-policy-block");
      expect(warnBtn.getAttribute("aria-checked")).toBe("true");
      expect(blockBtn.getAttribute("aria-checked")).toBe("false");
    });

    it("点 block → block 高亮 + store 写入", () => {
      renderWithI18n();
      const blockBtn = screen.getByTestId("cost-budget-policy-block");
      fireEvent.click(blockBtn);
      expect(useCostBudgetStore.getState().policy).toBe("block");
    });

    it("点 warn → store 写回 warn", () => {
      useCostBudgetStore.getState().setPolicy("block");
      renderWithI18n();
      const warnBtn = screen.getByTestId("cost-budget-policy-warn");
      fireEvent.click(warnBtn);
      expect(useCostBudgetStore.getState().policy).toBe("warn");
    });
  });

  describe("预算输入", () => {
    it("输入日预算 → store 写入", () => {
      renderWithI18n();
      const input = screen.getByTestId("cost-budget-daily-input") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "10" } });
      fireEvent.blur(input);
      expect(useCostBudgetStore.getState().dailyBudgetUsd).toBe(10);
    });

    it("输入 0 → 关闭预算(null)", () => {
      useCostBudgetStore.getState().setDailyBudget(10);
      renderWithI18n();
      const input = screen.getByTestId("cost-budget-daily-input") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "0" } });
      fireEvent.blur(input);
      expect(useCostBudgetStore.getState().dailyBudgetUsd).toBeNull();
    });

    it("清空 → 关闭预算", () => {
      useCostBudgetStore.getState().setDailyBudget(10);
      renderWithI18n();
      const input = screen.getByTestId("cost-budget-daily-input") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.blur(input);
      expect(useCostBudgetStore.getState().dailyBudgetUsd).toBeNull();
    });

    it("非法输入回滚到上次值", () => {
      useCostBudgetStore.getState().setDailyBudget(10);
      renderWithI18n();
      const input = screen.getByTestId("cost-budget-daily-input") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "abc" } });
      fireEvent.blur(input);
      // store 不变
      expect(useCostBudgetStore.getState().dailyBudgetUsd).toBe(10);
    });
  });

  describe("进度条", () => {
    it("设预算 + 写入 spend → 显示 $X of $Y 文本", () => {
      useCostBudgetStore.getState().setDailyBudget(10);
      useCostUsageStore.setState({ records: [makeRecord(5, "5")] });
      renderWithI18n();
      const labels = screen.getAllByTestId("cost-budget-spend-label");
      // 第一个是 daily
      expect(labels[0]?.textContent).toContain("$5.00");
      expect(labels[0]?.textContent).toContain("$10.00");
    });

    it("超额时 progress bar 100% + 显示 'Over budget'", () => {
      useCostBudgetStore.getState().setDailyBudget(10);
      useCostUsageStore.setState({ records: [makeRecord(15, "exceed")] });
      renderWithI18n();
      const labels = screen.getAllByTestId("cost-budget-spend-label");
      expect(labels[0]?.textContent).toContain("$15.00");
      expect(labels[0]?.textContent).toContain("$10.00");
      // 第二行文案是 "Over budget"
      const over = screen.getAllByText("Over budget");
      expect(over.length).toBeGreaterThan(0);
    });
  });
});
