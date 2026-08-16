/**
 * @file costTracking
 * @description AI 成本计算与预算工具函数（P2-4）
 *
 * 纯函数模块:不依赖 React / Zustand / Tauri,可在任意环境(浏览器/Node/Rust 侧)复用。
 *
 * ## 数据来源
 *
 * - 每次模型调用的 usage: `{ inputTokens, outputTokens, ... }`
 * - 模型定价: 来自 `ProviderModelOption.cost`(`ModelCost`),单位 USD / 1M tokens
 *
 * ## 公式
 *
 * cost_usd = inputTokens / 1_000_000 * input_price + outputTokens / 1_000_000 * output_price
 *
 * 缺定价 → 返回 0(不让预算告警逻辑对未知模型瞎报);UI 层在拿到 cost=null 时自行提示用户
 * 补全定价。
 *
 * ## 大厂基线
 *
 * - 货币精度: 用 6 位小数 USD(`roundTo6Decimals`),避免浮点累加漂移
 * - 预算阈值: 默认 [0.5, 0.8, 0.95, 1.0](50% / 80% / 95% / 100%)
 * - 漂移预算: 预算为 0 / null / 负数 → 视为"未设预算",不触发告警
 */
import type { ModelCost } from "../providerModelOptions";

/** 单次调用的 token 用量 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** 缓存命中的输入 token(OpenAI / Anthropic 等支持,部分计费、部分不计费,默认不计) */
  cachedInputTokens?: number;
}

/** 把 USD 金额四舍五入到 6 位小数(防累加漂移) */
export function roundTo6Decimals(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * 计算单次调用的 USD 成本
 *
 * @param usage token 用量
 * @param cost 模型定价(USD / 1M tokens),可空
 * @returns USD 金额(>= 0);缺定价返回 0
 */
export function calculateUsageCost(usage: TokenUsage, cost: ModelCost | undefined | null): number {
  if (!cost) return 0;
  const inputPrice = typeof cost.input === "number" && cost.input > 0 ? cost.input : 0;
  const outputPrice = typeof cost.output === "number" && cost.output > 0 ? cost.output : 0;
  const inTokens = Math.max(0, usage.inputTokens ?? 0);
  const outTokens = Math.max(0, usage.outputTokens ?? 0);
  // cached tokens 单独计费(单价为 input 的 10%,这是 OpenAI 公开参考;不准确时由 UI 提示)
  const cachedTokens = Math.max(0, usage.cachedInputTokens ?? 0);
  const costUsd =
    (inTokens / 1_000_000) * inputPrice +
    (outTokens / 1_000_000) * outputPrice +
    (cachedTokens / 1_000_000) * inputPrice * 0.1;
  return roundTo6Decimals(costUsd);
}

/** 默认告警阈值(百分比 0~1) */
export const DEFAULT_ALERT_THRESHOLDS: ReadonlyArray<number> = [0.5, 0.8, 0.95, 1.0];

/** 预算是否已设置(> 0 USD) */
export function isBudgetConfigured(budgetUsd: number | null | undefined): budgetUsd is number {
  return typeof budgetUsd === "number" && Number.isFinite(budgetUsd) && budgetUsd > 0;
}

/**
 * 找出"当前花费"已跨越的最高阈值
 *
 * 用例: 用户预算 $10,当天已花 $8.5 → 应触发 0.8 阈值;再花到 $9.5 → 触发 0.95。
 *
 * @param spend 当前花费 USD
 * @param budget 预算 USD
 * @param thresholds 阈值数组(默认 [0.5, 0.8, 0.95, 1.0])
 * @returns 已跨越的最高阈值;无预算或未跨越任何阈值 → 返回 null
 */
export function pickActiveThreshold(
  spend: number,
  budget: number | null | undefined,
  thresholds: ReadonlyArray<number> = DEFAULT_ALERT_THRESHOLDS,
): number | null {
  if (!isBudgetConfigured(budget)) return null;
  if (spend < 0) return null;
  const sorted = [...thresholds].sort((a, b) => b - a);
  for (const t of sorted) {
    if (spend >= budget * t) return t;
  }
  return null;
}

/** 预算使用率(0~1+;>1 表示超额) */
export function budgetUsageRatio(
  spend: number,
  budget: number | null | undefined,
): number {
  if (!isBudgetConfigured(budget)) return 0;
  if (spend <= 0) return 0;
  return spend / budget;
}

/** 把日期戳转成 YYYY-MM-DD(本地时区) */
export function toLocalDateKey(timestampMs: number): string {
  const d = new Date(timestampMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 把日期戳转成 YYYY-MM(本地时区) */
export function toLocalMonthKey(timestampMs: number): string {
  const d = new Date(timestampMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * 阈值事件唯一 key
 * 例: 2026-06-25 触发 0.8 日预算 → "daily:2026-06-25:0.8"
 *
 * 用作 dismissed 集合的 key,确保同一(日期,scope,threshold)只告警一次。
 */
export function thresholdEventKey(input: {
  scope: "daily" | "monthly";
  dateKey: string;
  threshold: number;
}): string {
  return `${input.scope}:${input.dateKey}:${input.threshold}`;
}

/** 把"超额 USD" / "剩余 USD" 算出来 */
export interface BudgetDelta {
  /** 剩余 USD(可负数,负数表示超额) */
  remaining: number;
  /** 是否超额 */
  exceeded: boolean;
}

export function budgetDelta(spend: number, budget: number | null | undefined): BudgetDelta {
  if (!isBudgetConfigured(budget)) {
    return { remaining: 0, exceeded: false };
  }
  const remaining = roundTo6Decimals(budget - spend);
  return { remaining, exceeded: remaining < 0 };
}

/** 格式化 USD 金额为短显示(2 位小数) */
export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "$0.00";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1000) {
    return `${sign}$${abs.toFixed(0)}`;
  }
  return `${sign}$${abs.toFixed(2)}`;
}
