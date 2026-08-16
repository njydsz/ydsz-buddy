/**
 * @file BudgetAlertBanner
 * @description 成本预算告警条（P2-4）
 *
 * 订阅 useCostBudgetStore 中 dismissedThresholds 之外的"已触发阈值事件",
 * 在 Chat 顶部 / 全局 chrome 显示一条可关闭的横幅。
 *
 * ## 大厂基线
 *
 * - 一周期内同一阈值只告警一次(由 recordUsageAndCheck 内部去重)
 * - 关闭后写入 dismissed,store 自动管理
 * - 进度条用 accent / warning / danger 三色
 */

import { useEffect, useMemo, useState } from "react";

import { useTranslation } from "~/i18n";
import { formatUsd } from "~/lib/costTracking";
import { useCostBudgetStore } from "~/costBudgetStore";
import { useCostUsageStore } from "~/costUsageStore";
import { getSpendInRange, startOfLocalDay, startOfLocalMonth } from "~/costUsageStore";
import {
  isBudgetConfigured,
  pickActiveThreshold,
  thresholdEventKey,
  toLocalDateKey,
  toLocalMonthKey,
} from "~/lib/costTracking";
import { cn } from "~/lib/utils";

interface BudgetAlert {
  scope: "daily" | "monthly";
  threshold: number;
  spend: number;
  budget: number;
  key: string;
}

/** 计算当前未 dismiss 的告警列表(从 store 派生) */
function useActiveBudgetAlerts(): BudgetAlert[] {
  const records = useCostUsageStore((s) => s.records);
  const dailyBudget = useCostBudgetStore((s) => s.dailyBudgetUsd);
  const monthlyBudget = useCostBudgetStore((s) => s.monthlyBudgetUsd);
  const dismissed = useCostBudgetStore((s) => s.dismissedThresholds);

  return useMemo<BudgetAlert[]>(() => {
    const out: BudgetAlert[] = [];
    const now = Date.now();
    const dayStart = startOfLocalDay(now);
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const monthStart = startOfLocalMonth(now);
    const monthEnd = (() => {
      const d = new Date(now);
      d.setMonth(d.getMonth() + 1, 1);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    })();

    if (isBudgetConfigured(dailyBudget)) {
      const spend = getSpendInRange(records, dayStart, dayEnd).spend;
      const t = pickActiveThreshold(spend, dailyBudget);
      if (t !== null) {
        const key = thresholdEventKey({
          scope: "daily",
          dateKey: toLocalDateKey(now),
          threshold: t,
        });
        if (!dismissed.includes(key)) {
          out.push({ scope: "daily", threshold: t, spend, budget: dailyBudget!, key });
        }
      }
    }
    if (isBudgetConfigured(monthlyBudget)) {
      const spend = getSpendInRange(records, monthStart, monthEnd).spend;
      const t = pickActiveThreshold(spend, monthlyBudget);
      if (t !== null) {
        const key = thresholdEventKey({
          scope: "monthly",
          dateKey: toLocalMonthKey(now),
          threshold: t,
        });
        if (!dismissed.includes(key)) {
          out.push({ scope: "monthly", threshold: t, spend, budget: monthlyBudget!, key });
        }
      }
    }
    return out;
  }, [records, dailyBudget, monthlyBudget, dismissed]);
}

export function BudgetAlertBanner() {
  const { messages } = useTranslation();
  const t = messages.costBudget;
  const alerts = useActiveBudgetAlerts();
  const dismissThreshold = useCostBudgetStore((s) => s.dismissThreshold);
  const [hidden, setHidden] = useState(false);

  // 关键: dismissed 列表变化时,重置 hidden 让新告警可以显示
  useEffect(() => {
    if (alerts.length === 0) {
      setHidden(false);
    }
  }, [alerts.length]);

  if (alerts.length === 0 || hidden) return null;
  // 取最严重的告警(daily > monthly, threshold 大 > 小)
  const sorted = [...alerts].sort((a, b) => {
    if (a.scope !== b.scope) return a.scope === "daily" ? -1 : 1;
    return b.threshold - a.threshold;
  });
  const top = sorted[0]!;
  const exceeded = top.threshold >= 1.0;

  return (
    <div
      role="alert"
      data-testid="cost-budget-alert-banner"
      data-scope={top.scope}
      data-threshold={top.threshold}
      className={cn(
        "flex items-start gap-3 border-b px-4 py-2.5 text-sm",
        exceeded
          ? "border-danger/40 bg-danger/10 text-danger"
          : "border-warning/40 bg-warning/10 text-warning-fg",
      )}
    >
      <div className="flex-1 space-y-0.5">
        <p className="font-medium">{t.alert.title}</p>
        <p className="text-xs text-fg-muted">
          {t.alert.description(top.threshold, formatUsd(top.spend), formatUsd(top.budget))}
        </p>
      </div>
      <button
        type="button"
        className={cn(
          "rounded-md px-2.5 py-1 text-xs font-medium",
          "bg-bg-elevated/60 text-fg hover:bg-bg-elevated",
          "focus:outline-none focus:ring-2 focus:ring-accent/40",
        )}
        onClick={() => {
          dismissThreshold(top.key);
        }}
        data-testid="cost-budget-alert-dismiss"
      >
        {t.alert.dismiss}
      </button>
    </div>
  );
}
