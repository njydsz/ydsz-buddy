/**
 * @file useCodingPlanQuota
 * @description 国内 Coding Plan 配额拉取 Hook（G6 目标：GLM/DeepSeek/Moonshot/Qwen 4 家）
 *
 * 集中管理 4 家国内 Coding Plan 订阅的剩余额度：
 *
 * - **拉取**：从后端 `coding_plan_get_quota` RPC 拉取（mock 数据用本地模拟）
 * - **状态**：每家 Provider 一个 `CodingPlanQuotaSnapshot` 状态
 * - **刷新**：支持单家刷新 + 批量刷新
 * - **降级**：未绑定 / 网络错误时回退到 `errorMessage` / `bound=false`
 *
 * ## 关键设计
 *
 * - **未绑定 → 不拉取**：未绑定的 Provider 直接返回 `bound: false` 占位，避免无谓的 RPC
 * - **5s 防抖**：刷新按钮有 5s 防抖，避免连点
 * - **轮询**：默认 60s 拉一次（用户可关闭）
 *
 * @module hooks/useCodingPlanQuota
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { readNativeApi } from "~/nativeApi";
import type {
  CodingPlanProviderId,
  CodingPlanQuotaSnapshot,
} from "~/components/CodingPlanQuotaPanel";

const DEFAULT_POLLING_INTERVAL_MS = 60_000;
const REFRESH_DEBOUNCE_MS = 5_000;

const PROVIDER_IDS: ReadonlyArray<CodingPlanProviderId> = [
  "glm",
  "deepseek",
  "moonshot",
  "qwen",
];

function makeEmptySnapshot(provider: CodingPlanProviderId): CodingPlanQuotaSnapshot {
  return {
    provider,
    bound: false,
    fetching: false,
    remainingPercent: null,
    resetsAt: null,
    errorMessage: null,
    updatedAt: new Date(0).toISOString(),
  };
}

export interface UseCodingPlanQuotaOptions {
  /** 是否启用自动轮询（默认 false） */
  enablePolling?: boolean;
  /** 轮询间隔（毫秒，默认 60s） */
  pollingIntervalMs?: number;
  /** 自定义获取函数（测试时 mock） */
  fetcher?: (provider: CodingPlanProviderId) => Promise<CodingPlanQuotaSnapshot>;
}

export interface UseCodingPlanQuotaResult {
  /** 4 家 Provider 的快照列表 */
  snapshots: ReadonlyArray<CodingPlanQuotaSnapshot>;
  /** 刷新单家 Provider */
  refresh: (provider: CodingPlanProviderId) => Promise<void>;
  /** 批量刷新所有 Provider */
  refreshAll: () => Promise<void>;
  /** 是否有任何 Provider 正在拉取 */
  isAnyFetching: boolean;
}

/**
 * 国内 Coding Plan 配额拉取 Hook
 */
export function useCodingPlanQuota(
  options: UseCodingPlanQuotaOptions = {},
): UseCodingPlanQuotaResult {
  const {
    enablePolling = false,
    pollingIntervalMs = DEFAULT_POLLING_INTERVAL_MS,
    fetcher: customFetcher,
  } = options;

  // 默认 fetcher：通过 readNativeApi() 调用后端 RPC
  const defaultFetcher = useCallback(
    async (provider: CodingPlanProviderId): Promise<CodingPlanQuotaSnapshot> => {
      const api = readNativeApi();
      if (!api) {
        return {
          provider,
          bound: false,
          fetching: false,
          remainingPercent: null,
          resetsAt: null,
          errorMessage: "Native API unavailable",
          updatedAt: new Date().toISOString(),
        };
      }
      // 尝试通过原生 API 拉取配额；若不存在则返回未绑定占位
      const codingPlanApi = (api as { codingPlan?: { getQuota?: (input: { provider: CodingPlanProviderId }) => Promise<{ bound: boolean; remainingPercent?: number | null; resetsAt?: string | null }> } }).codingPlan;
      if (!codingPlanApi?.getQuota) {
        return makeEmptySnapshot(provider);
      }
      try {
        const result = await codingPlanApi.getQuota({ provider });
        return {
          provider,
          bound: result.bound,
          fetching: false,
          remainingPercent: result.remainingPercent ?? null,
          resetsAt: result.resetsAt ?? null,
          errorMessage: null,
          updatedAt: new Date().toISOString(),
        };
      } catch (err) {
        return {
          provider,
          bound: false,
          fetching: false,
          remainingPercent: null,
          resetsAt: null,
          errorMessage: err instanceof Error ? err.message : "Failed to fetch quota",
          updatedAt: new Date().toISOString(),
        };
      }
    },
    [],
  );

  const fetcher = customFetcher ?? defaultFetcher;

  // ── 4 家 Provider 各自的快照 ──
  const [snapshots, setSnapshots] = useState<Record<CodingPlanProviderId, CodingPlanQuotaSnapshot>>(
    () => {
      const init: Record<CodingPlanProviderId, CodingPlanQuotaSnapshot> = {
        glm: makeEmptySnapshot("glm"),
        deepseek: makeEmptySnapshot("deepseek"),
        moonshot: makeEmptySnapshot("moonshot"),
        qwen: makeEmptySnapshot("qwen"),
      };
      return init;
    },
  );

  // ── 防止连点刷新 ──
  const lastRefreshAtRef = useRef<Record<CodingPlanProviderId, number>>({
    glm: 0,
    deepseek: 0,
    moonshot: 0,
    qwen: 0,
  });

  const updateSnapshot = useCallback(
    (next: CodingPlanQuotaSnapshot) => {
      setSnapshots((prev) => ({ ...prev, [next.provider]: next }));
    },
    [],
  );

  const refresh = useCallback(
    async (provider: CodingPlanProviderId) => {
      // 防抖
      const now = Date.now();
      if (now - lastRefreshAtRef.current[provider] < REFRESH_DEBOUNCE_MS) {
        return;
      }
      lastRefreshAtRef.current[provider] = now;

      // 标记 fetching
      updateSnapshot({
        ...snapshots[provider],
        provider,
        fetching: true,
      });

      const next = await fetcher(provider);
      updateSnapshot(next);
    },
    [fetcher, snapshots, updateSnapshot],
  );

  const refreshAll = useCallback(async () => {
    await Promise.all(PROVIDER_IDS.map((p) => refresh(p)));
  }, [refresh]);

  // ── 自动轮询 ──
  useEffect(() => {
    if (!enablePolling) return;
    const timer = setInterval(() => {
      void refreshAll();
    }, pollingIntervalMs);
    return () => clearInterval(timer);
  }, [enablePolling, pollingIntervalMs, refreshAll]);

  // ── 初始拉取 ──
  useEffect(() => {
    void refreshAll();
    // 只在挂载时拉一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snapshotsList: ReadonlyArray<CodingPlanQuotaSnapshot> = PROVIDER_IDS.map(
    (id) => snapshots[id],
  );

  return {
    snapshots: snapshotsList,
    refresh,
    refreshAll,
    isAnyFetching: snapshotsList.some((s) => s.fetching),
  };
}
