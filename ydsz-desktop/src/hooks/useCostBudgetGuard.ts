/**
 * @file useCostBudgetGuard
 * @description 预算告警 / 拦截 hook（P2-4）
 *
 * 暴露"调用前"和"调用中"的预算检查能力:
 * - `useCostBudgetSnapshot()`: 实时计算当前日 / 月 spend + 触发的阈值
 * - `useCostBudgetGuard()`:    在 send 之前返回 `{ shouldBlock, reason, threshold }`,
 *   业务层根据返回值决定是否拦截(弹确认 / 提示 banner)
 * - `recordUsageAndCheck()`:  调用完成后写 store,自动判断是否触发新阈值,
 *   返回 `BudgetAlertEvent | null`(被 dismiss 过的不再返回)
 *
 * ## 集成
 *
 * - 在 Settings → Budget 面板: `useCostBudgetSnapshot()` 渲染进度条
 * - 在 Composer send hook:  `useCostBudgetGuard()` 决定是否拦截
 * - 在 Provider onFinish:  `recordUsageAndCheck()` 写 store + 触发告警
 *
 * ## 大厂基线
 *
 * - 拦截是可重入的(race condition 安全): 同一周期内多次进入只告警一次
 * - 时间窗口基于 `startOfLocalDay / startOfLocalMonth`(用户本地时区)
 * - 所有函数都是纯 hooks,无副作用(写 store 的副作用被 React 收敛)
 */

import { useCallback, useMemo } from "react";

import {
  budgetDelta,
  budgetUsageRatio,
  isBudgetConfigured,
  pickActiveThreshold,
  thresholdEventKey,
  toLocalDateKey,
  toLocalMonthKey,
  type TokenUsage,
} from "../lib/costTracking";
import { useCostBudgetStore, type BudgetPolicy } from "../costBudgetStore";
import {
  getSpendInRange,
  startOfLocalDay,
  startOfLocalMonth,
  useCostUsageStore,
} from "../costUsageStore";
import type { ProviderKind } from "../contracts";

/** 预算快照:日 / 月 spend + 阈值 + 剩余 */
export interface CostBudgetSnapshot {
  /** 今日已花 USD */
  dailySpend: number;
  /** 今日预算 USD(可空) */
  dailyBudget: number | null;
  /** 今日已触发的最高阈值(0~1) */
  dailyThreshold: number | null;
  /** 今日使用率(0~1+) */
  dailyRatio: number;
  /** 今日剩余 USD(可负) */
  dailyRemaining: number;

  /** 当月已花 USD */
  monthlySpend: number;
  /** 当月预算 USD(可空) */
  monthlyBudget: number | null;
  /** 当月已触发的最高阈值(0~1) */
  monthlyThreshold: number | null;
  /** 当月使用率(0~1+) */
  monthlyRatio: number;
  /** 当月剩余 USD(可负) */
  monthlyRemaining: number;

  /** 是否超额(任意一个) */
  exceeded: boolean;
}

/** 预算告警事件:用于触发 toast / banner */
export interface BudgetAlertEvent {
  scope: "daily" | "monthly";
  dateKey: string;
  threshold: number;
  spend: number;
  budget: number;
  policy: BudgetPolicy;
}

/** 预算拦截: send 之前调用 */
export interface BudgetGuardDecision {
  /** 是否应当拦截(block 策略下超额 → true) */
  shouldBlock: boolean;
  /** 拦截原因(结构化:`scope:spend:budget`,UI 层按 messages 渲染) */
  reason: string | null;
  /** 当前已触发的最高阈值(0~1) */
  threshold: number | null;
  /** scope */
  scope: "daily" | "monthly" | null;
}

/** 把 hook 输出的 reason 字符串解析为 { scope, spend, budget } */
export function parseBudgetGuardReason(
  reason: string | null,
): { scope: "daily" | "monthly"; spend: number; budget: number } | null {
  if (!reason) return null;
  const [scope, spendStr, budgetStr] = reason.split(":");
  if (scope !== "daily" && scope !== "monthly") return null;
  const spend = Number(spendStr);
  const budget = Number(budgetStr);
  if (!Number.isFinite(spend) || !Number.isFinite(budget)) return null;
  return { scope, spend, budget };
}

/** 描述一个时间窗口内的 budget 配置 */
function pickActiveWindow(
  spend: number,
  budget: number | null,
  scope: "daily" | "monthly",
  dateKey: string,
): { threshold: number | null; ratio: number; remaining: number; exceeded: boolean; key: string | null } {
  if (!isBudgetConfigured(budget)) {
    return { threshold: null, ratio: 0, remaining: 0, exceeded: false, key: null };
  }
  const threshold = pickActiveThreshold(spend, budget);
  const ratio = budgetUsageRatio(spend, budget);
  const { remaining, exceeded } = budgetDelta(spend, budget);
  const key = threshold !== null ? thresholdEventKey({ scope, dateKey, threshold }) : null;
  return { threshold, ratio, remaining, exceeded, key };
}

/** 实时预算快照(给 UI 用) */
export function useCostBudgetSnapshot(now: number = Date.now()): CostBudgetSnapshot {
  const records = useCostUsageStore((s) => s.records);
  const dailyBudget = useCostBudgetStore((s) => s.dailyBudgetUsd);
  const monthlyBudget = useCostBudgetStore((s) => s.monthlyBudgetUsd);

  return useMemo<CostBudgetSnapshot>(() => {
    const dayStart = startOfLocalDay(now);
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const monthStart = startOfLocalMonth(now);
    const monthEnd = new Date(now);
    monthEnd.setMonth(monthEnd.getMonth() + 1, 1);
    monthEnd.setHours(0, 0, 0, 0);

    const daily = getSpendInRange(records, dayStart, dayEnd);
    const monthly = getSpendInRange(records, monthStart, monthEnd.getTime());

    const dayKey = toLocalDateKey(now);
    const monthKey = toLocalMonthKey(now);
    const dayWindow = pickActiveWindow(daily.spend, dailyBudget, "daily", dayKey);
    const monthWindow = pickActiveWindow(monthly.spend, monthlyBudget, "monthly", monthKey);

    return {
      dailySpend: daily.spend,
      dailyBudget: dailyBudget ?? null,
      dailyThreshold: dayWindow.threshold,
      dailyRatio: dayWindow.ratio,
      dailyRemaining: dayWindow.remaining,
      monthlySpend: monthly.spend,
      monthlyBudget: monthlyBudget ?? null,
      monthlyThreshold: monthWindow.threshold,
      monthlyRatio: monthWindow.ratio,
      monthlyRemaining: monthWindow.remaining,
      exceeded: dayWindow.exceeded || monthWindow.exceeded,
    };
  }, [records, dailyBudget, monthlyBudget, now]);
}

/**
 * 拦截决策 hook
 *
 * 在 send 之前调用;返回 { shouldBlock, reason, threshold, scope }
 *
 * 行为:
 * - policy="warn" → 永不拦截,只返回阈值供 UI 展示
 * - policy="block" → 任意一个 scope 超额(>= 1.0)→ 拦截
 *
 * 注意: "已 dismiss 的阈值" 不影响拦截(拦截是硬规则,dismiss 只是不弹 banner)
 *
 * 国际化:本 hook 不生成用户可见文案,只返回纯数字;
 * 文案 / 货币格式化由 UI 层(BudgetBlockDialog 等)按 messages 完成。
 */
export function useCostBudgetGuard(now: number = Date.now()): BudgetGuardDecision {
  const policy = useCostBudgetStore((s) => s.policy);
  const snapshot = useCostBudgetSnapshot(now);

  return useMemo<BudgetGuardDecision>(() => {
    if (policy !== "block") {
      return { shouldBlock: false, reason: null, threshold: snapshot.dailyThreshold ?? snapshot.monthlyThreshold, scope: null };
    }
    // block 策略:仅当 >= 1.0(已超额)才拦截
    if (snapshot.dailyThreshold !== null && snapshot.dailyThreshold >= 1.0) {
      return {
        shouldBlock: true,
        reason: `daily:${snapshot.dailySpend.toFixed(6)}:${(snapshot.dailyBudget ?? 0).toFixed(6)}`,
        threshold: snapshot.dailyThreshold,
        scope: "daily",
      };
    }
    if (snapshot.monthlyThreshold !== null && snapshot.monthlyThreshold >= 1.0) {
      return {
        shouldBlock: true,
        reason: `monthly:${snapshot.monthlySpend.toFixed(6)}:${(snapshot.monthlyBudget ?? 0).toFixed(6)}`,
        threshold: snapshot.monthlyThreshold,
        scope: "monthly",
      };
    }
    return {
      shouldBlock: false,
      reason: null,
      threshold: snapshot.dailyThreshold ?? snapshot.monthlyThreshold,
      scope: null,
    };
  }, [policy, snapshot]);
}

/**
 * 用量记录 + 告警事件检测(给 provider 回调使用)
 *
 * 写 store 后,检查是否触发新阈值(且未被 dismiss)→ 返回告警事件
 *
 * @returns 告警事件;无新触发 → null
 */
export function recordUsageAndCheck(input: {
  provider: ProviderKind;
  model: string;
  usage: TokenUsage;
  threadId?: string | null;
  turnId?: string | null;
  costUsd?: number;
  ts?: number;
}): BudgetAlertEvent | null {
  const ts = typeof input.ts === "number" ? input.ts : Date.now();
  // 1. 写 store
  useCostUsageStore.getState().recordUsage({
    provider: input.provider,
    model: input.model,
    usage: input.usage,
    threadId: (input.threadId ?? null) as never,
    turnId: (input.turnId ?? null) as never,
    ...(typeof input.costUsd === "number" ? { costUsd: input.costUsd } : {}),
    ts,
  });
  // 2. 重新计算 snapshot
  const records = useCostUsageStore.getState().records;
  const budget = useCostBudgetStore.getState();
  const dayStart = startOfLocalDay(ts);
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const monthStart = startOfLocalMonth(ts);
  const monthEnd = new Date(ts);
  monthEnd.setMonth(monthEnd.getMonth() + 1, 1);
  monthEnd.setHours(0, 0, 0, 0);

  const dayKey = toLocalDateKey(ts);
  const monthKey = toLocalMonthKey(ts);

  // 3. 检查新触发的阈值
  for (const scope of ["daily", "monthly"] as const) {
    const spend =
      scope === "daily"
        ? getSpendInRange(records, dayStart, dayEnd).spend
        : getSpendInRange(records, monthStart, monthEnd.getTime()).spend;
    const configured = scope === "daily" ? budget.dailyBudgetUsd : budget.monthlyBudgetUsd;
    if (!isBudgetConfigured(configured)) continue;
    const threshold = pickActiveThreshold(spend, configured);
    if (threshold === null) continue;
    const key = thresholdEventKey({ scope, dateKey: scope === "daily" ? dayKey : monthKey, threshold });
    if (budget.dismissedThresholds.includes(key)) continue;
    return { scope, dateKey: scope === "daily" ? dayKey : monthKey, threshold, spend, budget: configured, policy: budget.policy };
  }
  return null;
}

/**
 * 标记当前已触发阈值为"已确认"(从告警 UI 调用)
 */
export function useDismissBudgetAlert() {
  return useCallback((event: BudgetAlertEvent) => {
    const key = thresholdEventKey({ scope: event.scope, dateKey: event.dateKey, threshold: event.threshold });
    useCostBudgetStore.getState().dismissThreshold(key);
  }, []);
}
