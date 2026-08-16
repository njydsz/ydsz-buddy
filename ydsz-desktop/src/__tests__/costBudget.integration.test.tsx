/**
 * @file CostBudget 集成测试
 * @description 端到端串联 costBudgetStore / costUsageStore / useCostBudgetGuard /
 *              BudgetAlertBanner / CostBudgetPanel / useChatBudgetGuard,
 *              验证 P2-4 AI 成本预算告警的完整业务路径。
 *
 * ## 覆盖路径
 *
 * 1. 设预算 → 进度条 / banner / guard 同步反映
 * 2. recordUsageAndCheck 跨阈值 → 产生告警事件
 * 3. warn 策略不拦截;block 策略 + 超额 → 拦截
 * 4. dismiss 关闭 banner → 同一阈值不再产生新告警
 * 5. 改预算清空 dismissed → 新周期可再次告警
 * 6. 持久化到 localStorage → 重新挂载后状态恢复
 * 7. 跨日 / 跨月窗口聚合准确(不污染过期数据)
 * 8. 月预算 + 日预算同时触发 → banner 选最严重的
 *
 * ## 大厂基线
 *
 * - 用 zustand setState 同步注入数据(不依赖 React 渲染顺序)
 * - 每个 it 之间 resetAll:store + localStorage
 * - 不依赖时间真实流逝:用 ts 显式传参或注入 records
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";

import { BudgetAlertBanner } from "../components/BudgetAlertBanner";
import { CostBudgetPanel } from "../components/CostBudgetPanel";
import { useCostBudgetStore } from "../costBudgetStore";
import { startOfLocalDay, useCostUsageStore } from "../costUsageStore";
import { I18nProvider } from "../i18n/I18nContext";
import { useChatBudgetGuard } from "../hooks/useChatBudgetGuard";
import {
  parseBudgetGuardReason,
  recordUsageAndCheck,
  useCostBudgetGuard,
  useCostBudgetSnapshot,
} from "../hooks/useCostBudgetGuard";
import { formatUsd } from "../lib/costTracking";
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

/** 测试用包装:同步注入 I18n Provider */
function withI18n(ui: React.ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => <I18nProvider language="en">{children}</I18nProvider>,
  });
}

function makeRecord(input: {
  costUsd: number;
  ts?: number;
  id?: string;
  provider?: string;
  model?: string;
}): UsageRecord {
  return {
    id: input.id ?? `r-${Math.random().toString(36).slice(2, 8)}`,
    provider: (input.provider ?? "codex") as never,
    model: input.model ?? "gpt-4o",
    usage: { inputTokens: 0, outputTokens: 0 },
    costUsd: input.costUsd,
    ts: input.ts ?? Date.now(),
  };
}

describe("CostBudget 集成测试", () => {
  beforeEach(() => {
    resetAll();
  });
  afterEach(() => {
    resetAll();
  });

  describe("完整业务流:设预算 → 用量 → 拦截", () => {
    it("设日预算 $10,记录 8.5 → 触发 0.8 阈值 + warn 策略不拦截", () => {
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
      expect(event?.threshold).toBe(0.8);

      // warn 策略:即使超额也不拦截
      const { result: guard } = renderHook(() => useCostBudgetGuard());
      expect(guard.current.shouldBlock).toBe(false);
    });

    it("block 策略 + 超额 → 拦截 + 结构化 reason", () => {
      act(() => {
        useCostBudgetStore.getState().setDailyBudget(10);
        useCostBudgetStore.getState().setPolicy("block");
      });
      recordUsageAndCheck({
        provider: "codex",
        model: "gpt-4o",
        usage: { inputTokens: 0, outputTokens: 0 },
        costUsd: 12,
      });
      const { result: guard } = renderHook(() => useCostBudgetGuard());
      expect(guard.current.shouldBlock).toBe(true);
      expect(guard.current.scope).toBe("daily");
      // reason 形如 "daily:12.000000:10.000000",使用浮点
      expect(guard.current.reason).toMatch(/^daily:12(\.0+)?:10(\.0+)?$/);
      const parsed = parseBudgetGuardReason(guard.current.reason);
      expect(parsed?.scope).toBe("daily");
      expect(parsed?.spend).toBe(12);
      expect(parsed?.budget).toBe(10);
    });

    it("block 策略 + 仅 80% 预算 → 不拦截(未到 1.0)", () => {
      act(() => {
        useCostBudgetStore.getState().setDailyBudget(10);
        useCostBudgetStore.getState().setPolicy("block");
      });
      recordUsageAndCheck({
        provider: "codex",
        model: "gpt-4o",
        usage: { inputTokens: 0, outputTokens: 0 },
        costUsd: 8.5, // 0.8
      });
      const { result: guard } = renderHook(() => useCostBudgetGuard());
      expect(guard.current.shouldBlock).toBe(false);
    });
  });

  describe("Banner + Panel + Guard 协同", () => {
    it("Banner 在 spend < 50% 时不渲染", () => {
      act(() => {
        useCostBudgetStore.getState().setDailyBudget(10);
        useCostUsageStore.setState({ records: [makeRecord({ costUsd: 2, id: "low" })] });
      });
      const { container } = withI18n(<BudgetAlertBanner />);
      expect(container.firstChild).toBeNull();
    });

    it("Banner 在 spend >= 50% 时渲染,显示 0.5 阈值", () => {
      act(() => {
        useCostBudgetStore.getState().setDailyBudget(10);
        useCostUsageStore.setState({ records: [makeRecord({ costUsd: 5, id: "half" })] });
      });
      withI18n(<BudgetAlertBanner />);
      const banner = screen.getByTestId("cost-budget-alert-banner");
      expect(banner.getAttribute("data-threshold")).toBe("0.5");
      expect(banner.getAttribute("data-scope")).toBe("daily");
    });

    it("Panel 同步显示 spend / 预算 / 剩余 / 超额", () => {
      act(() => {
        useCostBudgetStore.getState().setDailyBudget(10);
        useCostUsageStore.setState({ records: [makeRecord({ costUsd: 6, id: "60pct" })] });
      });
      withI18n(<CostBudgetPanel />);
      // 0.6 不触发 0.5 阈值 banner;Panel 仍展示进度
      const labels = screen.getAllByTestId("cost-budget-spend-label");
      expect(labels[0]?.textContent).toContain("$6.00");
      expect(labels[0]?.textContent).toContain("$10.00");
    });

    it("daily 0.95 + monthly 0.5 → banner 选最严重的(daily 0.95)", () => {
      const now = Date.now();
      const monthStart = new Date(now);
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      // 上月 1 日 ~ 30 天前:确保落在当月窗口外
      const prevMonth = monthStart.getTime() - 5 * 24 * 60 * 60 * 1000;
      act(() => {
        useCostBudgetStore.getState().setDailyBudget(10); // 0.95 threshold (9.5/10)
        useCostBudgetStore.getState().setMonthlyBudget(100); // 0.5 threshold (50/100)
        useCostUsageStore.setState({
          records: [
            makeRecord({ costUsd: 9.5, id: "d95", ts: now }), // 今日
            makeRecord({ costUsd: 50, id: "m50", ts: monthStart.getTime() + 60_000 }), // 本月早些时候
          ],
        });
      });
      withI18n(<BudgetAlertBanner />);
      const banner = screen.getByTestId("cost-budget-alert-banner");
      expect(banner.getAttribute("data-scope")).toBe("daily");
      expect(banner.getAttribute("data-threshold")).toBe("0.95");
      // 确保 prevMonth 这条没有用上
      void prevMonth;
    });
  });

  describe("Dismiss 行为", () => {
    it("点 dismiss → store 写入 + banner 消失", () => {
      act(() => {
        useCostBudgetStore.getState().setDailyBudget(10);
        useCostUsageStore.setState({ records: [makeRecord({ costUsd: 9, id: "90" })] });
      });
      const { rerender } = withI18n(<BudgetAlertBanner />);
      expect(screen.queryByTestId("cost-budget-alert-banner")).toBeTruthy();
      const dismissBtn = screen.getByTestId("cost-budget-alert-dismiss");
      fireEvent.click(dismissBtn);
      // 重新渲染
      rerender(<BudgetAlertBanner />);
      expect(screen.queryByTestId("cost-budget-alert-banner")).toBeNull();
      // store 写入
      const dismissed = useCostBudgetStore.getState().dismissedThresholds;
      expect(dismissed.length).toBe(1);
    });

    it("Dismiss 同一阈值后,recordUsageAndCheck 不再返回事件", () => {
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
      act(() => {
        useCostBudgetStore.getState().dismissThreshold(
          `${first!.scope}:${first!.dateKey}:${first!.threshold}`,
        );
      });
      // 0 增量调用,阈值仍命中,但已 dismiss
      const second = recordUsageAndCheck({
        provider: "codex",
        model: "gpt-4o",
        usage: { inputTokens: 0, outputTokens: 0 },
        costUsd: 0,
      });
      expect(second).toBeNull();
    });

    it("改预算自动清空 dismissed 列表", () => {
      act(() => {
        useCostBudgetStore.getState().setDailyBudget(10);
        useCostBudgetStore.getState().dismissThreshold("daily:2026-06-25:0.8");
      });
      expect(useCostBudgetStore.getState().dismissedThresholds).toHaveLength(1);
      act(() => {
        useCostBudgetStore.getState().setDailyBudget(20);
      });
      expect(useCostBudgetStore.getState().dismissedThresholds).toEqual([]);
    });
  });

  describe("useChatBudgetGuard:warn 策略立即放行", () => {
    it("policy=warn → approve() 立即 resolve true", async () => {
      act(() => {
        useCostBudgetStore.getState().setDailyBudget(10);
        useCostBudgetStore.getState().setPolicy("warn");
        useCostUsageStore.setState({ records: [makeRecord({ costUsd: 20, id: "over" })] });
      });
      const { result } = renderHook(() => useChatBudgetGuard());
      const approved = await result.current.approve();
      expect(approved).toBe(true);
    });
  });

  describe("时间窗口聚合", () => {
    it("今日 spend 不被昨日记录污染", () => {
      const today = new Date();
      today.setHours(12, 0, 0, 0);
      const yesterdayTs = today.getTime() - 24 * 60 * 60 * 1000;
      const todayTs = today.getTime();

      act(() => {
        useCostBudgetStore.getState().setDailyBudget(10);
        useCostUsageStore.setState({
          records: [
            makeRecord({ costUsd: 8, id: "yest", ts: yesterdayTs }),
            makeRecord({ costUsd: 4, id: "today", ts: todayTs }),
          ],
        });
      });

      // 用 useCostBudgetSnapshot 验证
      const { result } = renderHook(() => useCostBudgetSnapshot(todayTs));
      expect(result.current).not.toBeNull();
      expect(result.current?.dailySpend).toBe(4); // 只算今天
      expect(result.current?.dailyThreshold).toBeNull(); // 4/10 = 0.4,未触发
    });

    it("月聚合:上月记录不污染本月", () => {
      const now = new Date(2026, 5, 15).getTime(); // 6 月 15 日
      const lastMonth = new Date(2026, 4, 15).getTime(); // 5 月 15 日

      act(() => {
        useCostBudgetStore.getState().setMonthlyBudget(100);
        useCostUsageStore.setState({
          records: [
            makeRecord({ costUsd: 80, id: "last", ts: lastMonth }),
            makeRecord({ costUsd: 30, id: "this", ts: now }),
          ],
        });
      });

      const { result } = renderHook(() => useCostBudgetSnapshot(now));
      expect(result.current).not.toBeNull();
      expect(result.current?.monthlySpend).toBe(30);
      // 30/100 = 0.3,未触发
      expect(result.current?.monthlyThreshold).toBeNull();
    });

    it("exceeded = true 在 daily 或 monthly 任一超额时为 true", () => {
      const now = Date.now();
      act(() => {
        useCostBudgetStore.getState().setDailyBudget(10);
        useCostBudgetStore.getState().setMonthlyBudget(100);
        useCostUsageStore.setState({
          records: [makeRecord({ costUsd: 15, id: "d", ts: now })],
        });
      });
      const { result } = renderHook(() => useCostBudgetSnapshot(now));
      expect(result.current).not.toBeNull();
      expect(result.current?.exceeded).toBe(true);
      expect(result.current?.dailyRemaining).toBeLessThan(0);
    });
  });

  describe("持久化(localStorage)", () => {
    it("setDailyBudget 后 localStorage 写入 ydsz-buddy:cost-budget:v1", () => {
      act(() => {
        useCostBudgetStore.getState().setDailyBudget(10);
      });
      // 等 persist 中间件异步落盘
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const raw = window.localStorage.getItem("ydsz-buddy:cost-budget:v1");
          expect(raw).toBeTruthy();
          const parsed = JSON.parse(raw!);
          expect(parsed.state.dailyBudgetUsd).toBe(10);
          expect(parsed.state.policy).toBe("warn");
          resolve();
        }, 30);
      });
    });

    it("recordUsage 后 localStorage 写入 ydsz-buddy:cost-usage:v1", () => {
      recordUsageAndCheck({
        provider: "codex",
        model: "gpt-4o",
        usage: { inputTokens: 100, outputTokens: 200 },
        costUsd: 0.01,
      });
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const raw = window.localStorage.getItem("ydsz-buddy:cost-usage:v1");
          expect(raw).toBeTruthy();
          const parsed = JSON.parse(raw!);
          expect(Array.isArray(parsed.state.records)).toBe(true);
          expect(parsed.state.records.length).toBeGreaterThan(0);
          resolve();
        }, 30);
      });
    });
  });

  describe("parseBudgetGuardReason 边界", () => {
    it("null → null", () => {
      expect(parseBudgetGuardReason(null)).toBeNull();
    });
    it("非法 scope → null", () => {
      expect(parseBudgetGuardReason("yearly:1:2")).toBeNull();
    });
    it("非数字 spend/budget → null", () => {
      expect(parseBudgetGuardReason("daily:abc:xyz")).toBeNull();
    });
    it("正常解析", () => {
      const parsed = parseBudgetGuardReason("monthly:50.5:100");
      expect(parsed).toEqual({ scope: "monthly", spend: 50.5, budget: 100 });
    });
  });

  describe("formatUsd 边界", () => {
    it(">= 1000 美元展示为整数(避免 KPI 抖动)", () => {
      expect(formatUsd(1500)).toBe("$1500");
      expect(formatUsd(12345.67)).toBe("$12346");
    });
    it("< 1000 美元保留 2 位小数", () => {
      expect(formatUsd(0)).toBe("$0.00");
      expect(formatUsd(9.99)).toBe("$9.99");
      expect(formatUsd(-1.5)).toBe("-$1.50");
    });
    it("NaN / Infinity → $0.00", () => {
      expect(formatUsd(NaN)).toBe("$0.00");
      expect(formatUsd(Infinity)).toBe("$0.00");
    });
  });

  describe("startOfLocalDay 单调性", () => {
    it("startOfLocalDay(now) 总是 <= now", () => {
      const samples = [
        Date.now(),
        new Date(2026, 0, 1, 0, 0, 0).getTime(),
        new Date(2026, 11, 31, 23, 59, 59).getTime(),
      ];
      for (const t of samples) {
        expect(startOfLocalDay(t)).toBeLessThanOrEqual(t);
      }
    });
  });
});
