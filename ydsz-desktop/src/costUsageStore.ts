/**
 * @file costUsageStore
 * @description AI 调用的用量 + 成本记录 store（P2-4）
 *
 * 每次模型调用完成时,`recordUsage` 追加一条记录;该记录是预算告警、
 * 用量统计和成本面板的"事实来源"。
 *
 * ## 数据模型
 *
 * - `UsageRecord`: 一次调用的快照(provider, model, usage, costUsd, ts, threadId?, turnId?)
 * - 按天 / 月维度做时间窗口聚合(`getSpendInRange`)
 *
 * ## 持久化
 *
 * - 存储 key: `ydsz-buddy:cost-usage:v1`
 * - 保留最近 90 天(过期自动剪枝)
 *
 * ## 集成方式
 *
 * - 在 `useProviderXxx` 的 onFinish / onUsage 钩子里调用 `recordUsage`
 * - 在 Settings → 预算面板里通过 `useCostUsageStore(s => s.records)` 渲染
 *
 * ## 大厂基线
 *
 * - localStorage 容量 5MB 限制 → 90 天 1000 次调用 ≈ 0.5MB,留出余量
 * - 单条记录保持精简(避免大字段)
 * - 同 id 去重(网络重试 / 事件重复)
 */

import { type ThreadId, type TurnId } from "@ydsz-buddy/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { roundTo6Decimals, type TokenUsage } from "./lib/costTracking";
import { getModelCost } from "./lib/providerPricing";
import type { ProviderKind } from "./contracts";
import type { ModelCost } from "./providerModelOptions";

/** 单条用量记录 */
export interface UsageRecord {
  /** 唯一 id(去重 key) */
  id: string;
  /** Provider 类型 */
  provider: ProviderKind;
  /** 模型 slug */
  model: string;
  /** token 用量 */
  usage: TokenUsage;
  /** 计算出的 USD 成本(>= 0) */
  costUsd: number;
  /** 时间戳 ms(调用完成时刻) */
  ts: number;
  /** 关联线程(可空) */
  threadId?: ThreadId | null;
  /** 关联 turn(可空) */
  turnId?: TurnId | null;
}

interface CostUsageStoreState {
  records: UsageRecord[];

  /** 追加一条用量记录(自动去重 + 剪枝) */
  recordUsage: (input: Omit<UsageRecord, "id" | "costUsd" | "ts"> & {
    /** 显式 ts 可选(测试用) */
    ts?: number;
    /** 显式 costUsd 可选(覆盖表内定价) */
    costUsd?: number;
  }) => UsageRecord;
  /** 删除一条 */
  deleteRecord: (id: string) => void;
  /** 清空全部 */
  clearAll: () => void;
  /** 手动触发 90 天剪枝 */
  pruneExpired: () => void;
}

const COST_USAGE_STORAGE_KEY = "ydsz-buddy:cost-usage:v1";
const RETAIN_DAYS = 90;
const MAX_PERSISTED_RECORDS = 5000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function randomRecordId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `usg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 计算记录的 costUsd
 *
 * 调用方传 costUsd(已有值,来自后端)→ 优先使用
 * 否则按 (provider, model) 查表 + 内部 `calculateUsageCost` 计算
 */
function computeCostUsd(
  usage: TokenUsage,
  provider: ProviderKind,
  model: string,
  override?: number,
): number {
  if (typeof override === "number" && Number.isFinite(override) && override >= 0) {
    return roundTo6Decimals(override);
  }
  const cost: ModelCost | null = getModelCost(provider, model);
  // 复用 costTracking.calculateUsageCost 公式(避免重复实现)
  if (!cost) return 0;
  const inputPrice = typeof cost.input === "number" && cost.input > 0 ? cost.input : 0;
  const outputPrice = typeof cost.output === "number" && cost.output > 0 ? cost.output : 0;
  const inTokens = Math.max(0, usage.inputTokens ?? 0);
  const outTokens = Math.max(0, usage.outputTokens ?? 0);
  const cachedTokens = Math.max(0, usage.cachedInputTokens ?? 0);
  const costUsd =
    (inTokens / 1_000_000) * inputPrice +
    (outTokens / 1_000_000) * outputPrice +
    (cachedTokens / 1_000_000) * inputPrice * 0.1;
  return roundTo6Decimals(costUsd);
}

function pruneExpiredAndCap(records: readonly UsageRecord[], now: number = Date.now()): UsageRecord[] {
  const cutoff = now - RETAIN_DAYS * MS_PER_DAY;
  const fresh = records.filter((r) => r.ts >= cutoff);
  if (fresh.length <= MAX_PERSISTED_RECORDS) return [...fresh];
  // 按 ts 降序,保留最近 MAX_PERSISTED_RECORDS 条
  return [...fresh]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, MAX_PERSISTED_RECORDS);
}

function normalizeRecords(records: readonly UsageRecord[]): UsageRecord[] {
  const seen = new Set<string>();
  const out: UsageRecord[] = [];
  for (const r of records) {
    if (!r.id || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

export const useCostUsageStore = create<CostUsageStoreState>()(
  persist(
    (set) => ({
      records: [],

      recordUsage: (input) => {
        const id = randomRecordId();
        const ts = typeof input.ts === "number" ? input.ts : Date.now();
        const costUsd = computeCostUsd(input.usage, input.provider, input.model, input.costUsd);
        const record: UsageRecord = {
          id,
          provider: input.provider,
          model: input.model,
          usage: {
            inputTokens: Math.max(0, input.usage.inputTokens ?? 0),
            outputTokens: Math.max(0, input.usage.outputTokens ?? 0),
            ...(typeof input.usage.cachedInputTokens === "number"
              ? { cachedInputTokens: Math.max(0, input.usage.cachedInputTokens) }
              : {}),
          },
          costUsd,
          ts,
          threadId: input.threadId ?? null,
          turnId: input.turnId ?? null,
        };
        set((state) => ({
          records: pruneExpiredAndCap([...state.records, record], ts),
        }));
        return record;
      },

      deleteRecord: (id) => {
        set((state) => ({
          records: state.records.filter((r) => r.id !== id),
        }));
      },

      clearAll: () => {
        set({ records: [] });
      },

      pruneExpired: () => {
        set((state) => ({
          records: pruneExpiredAndCap(state.records),
        }));
      },
    }),
    {
      name: COST_USAGE_STORAGE_KEY,
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
      partialize: (state) => ({ records: normalizeRecords(state.records) }),
      merge: (persistedState, currentState) => {
        const p = (persistedState ?? {}) as { records?: UsageRecord[] };
        return {
          ...currentState,
          records: normalizeRecords(p.records ?? []),
        };
      },
    },
  ),
);

/** 暴露给测试的内部工具集合 */
export const costUsageStoreInternals = {
  normalizeRecords,
  pruneExpiredAndCap,
};

// ─────────────────────────── Selectors ───────────────────────────

/**
 * 在 [from, to) 时间窗口内聚合花费(毫秒边界)
 *
 * 返回总 USD 和对应记录数;不修改 store 状态。
 */
export function getSpendInRange(
  records: readonly UsageRecord[],
  fromMs: number,
  toMs: number,
): { spend: number; count: number } {
  let spend = 0;
  let count = 0;
  for (const r of records) {
    if (r.ts >= fromMs && r.ts < toMs) {
      spend += r.costUsd;
      count += 1;
    }
  }
  return { spend: roundTo6Decimals(spend), count };
}

/** 当天 0:00 起的 ms(本地时区) */
export function startOfLocalDay(now: number = Date.now()): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** 当月 1 日 0:00 起的 ms(本地时区) */
export function startOfLocalMonth(now: number = Date.now()): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}
