/**
 * @file costBudgetStore
 * @description AI 成本预算 + 拦截策略 store（P2-4）
 *
 * 用户在 Settings 里设置"日预算 / 月预算",并选择"超额后的行为":
 * - `warn`:  继续执行,只弹 banner 警告
 * - `block`: 拦截下一次模型调用,要求用户确认后才放行
 *
 * ## 数据模型
 *
 * - `dailyBudgetUsd` / `monthlyBudgetUsd`: USD 数值(> 0 启用,0 / null 关闭)
 * - `policy`:  超额后行为(warn | block)
 * - `dismissedThresholds`: 用户已确认/忽略的阈值事件集合
 *   - key 形如 `daily:2026-06-25:0.8`(用 `thresholdEventKey` 生成)
 *   - 同一阈值 24h 内只弹一次
 *
 * ## 持久化
 *
 * - 存储 key: `ydsz-buddy:cost-budget:v1`
 *
 * ## 大厂基线
 *
 * - 默认值保守: 预算为 null(未设),policy = "warn",dismissed = []
 * - 修改预算立即生效(无 debounce,避免用户调大预算后还被旧阈值拦)
 * - 任何"删除"操作提供 confirmation toast(交给 UI 层)
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 拦截策略 */
export type BudgetPolicy = "warn" | "block";

interface CostBudgetStoreState {
  /** 日预算 USD(> 0 启用,null/0 视为未设) */
  dailyBudgetUsd: number | null;
  /** 月预算 USD(> 0 启用) */
  monthlyBudgetUsd: number | null;
  /** 拦截策略:超额后 warn(放行+提示) / block(拦截+确认) */
  policy: BudgetPolicy;
  /** 已 dismiss 的阈值事件 key 列表 */
  dismissedThresholds: string[];

  // 写入
  setDailyBudget: (usd: number | null) => void;
  setMonthlyBudget: (usd: number | null) => void;
  setPolicy: (policy: BudgetPolicy) => void;
  /** 标记某个阈值事件为"已确认"(本周期不再提示) */
  dismissThreshold: (key: string) => void;
  /** 周期切换后清空 dismissed 列表(由 UI 调度) */
  resetDismissed: () => void;
}

const COST_BUDGET_STORAGE_KEY = "ydsz-buddy:cost-budget:v1";

function normalizeBudget(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value)) return null;
  if (value <= 0) return null;
  return value;
}

function normalizeDismissed(list: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of list) {
    if (typeof k !== "string" || k.length === 0) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

export const useCostBudgetStore = create<CostBudgetStoreState>()(
  persist(
    (set) => ({
      dailyBudgetUsd: null,
      monthlyBudgetUsd: null,
      policy: "warn",
      dismissedThresholds: [],

      setDailyBudget: (usd) => {
        set((state) => ({
          dailyBudgetUsd: normalizeBudget(usd),
          // 预算变化时清空 dismissed,避免旧阈值在新预算下复活
          dismissedThresholds: usd !== state.dailyBudgetUsd ? [] : state.dismissedThresholds,
        }));
      },

      setMonthlyBudget: (usd) => {
        set((state) => ({
          monthlyBudgetUsd: normalizeBudget(usd),
          dismissedThresholds: usd !== state.monthlyBudgetUsd ? [] : state.dismissedThresholds,
        }));
      },

      setPolicy: (policy) => {
        if (policy !== "warn" && policy !== "block") return;
        set({ policy });
      },

      dismissThreshold: (key) => {
        if (!key) return;
        set((state) => {
          if (state.dismissedThresholds.includes(key)) return state;
          return {
            dismissedThresholds: [...state.dismissedThresholds, key],
          };
        });
      },

      resetDismissed: () => {
        set({ dismissedThresholds: [] });
      },
    }),
    {
      name: COST_BUDGET_STORAGE_KEY,
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          return {
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined,
          };
        }
        return window.localStorage;
      }),
      version: 1,
      partialize: (state) => ({
        dailyBudgetUsd: state.dailyBudgetUsd,
        monthlyBudgetUsd: state.monthlyBudgetUsd,
        policy: state.policy,
        dismissedThresholds: normalizeDismissed(state.dismissedThresholds),
      }),
      merge: (persistedState, currentState) => {
        const p = (persistedState ?? {}) as Partial<CostBudgetStoreState>;
        return {
          ...currentState,
          dailyBudgetUsd: normalizeBudget(p.dailyBudgetUsd),
          monthlyBudgetUsd: normalizeBudget(p.monthlyBudgetUsd),
          policy: p.policy === "block" ? "block" : "warn",
          dismissedThresholds: normalizeDismissed(p.dismissedThresholds ?? []),
        };
      },
    },
  ),
);
