/**
 * @file 失败任务按 Turn 的重试进度跟踪 Hook
 *
 * 解决 `FailedTaskQueue` 中"已自动尝试 X/Y"提示的**进度数据不准确**问题。
 *
 * ## 背景
 *
 * 原实现直接复用 `useSmartRetry` 的全局 `currentAttempt` / `maxRetries`：
 *
 * ```ts
 * // ChatView.tsx
 * const failedTaskRetryAttemptsMap = useMemo(() => {
 *   const map = {};
 *   for (const turnId of failedTasksState.retryQueue) {
 *     map[turnId] = {
 *       attempt: smartRetry.currentAttempt,  // ← 全局共享，不区分 turn
 *       maxRetries: smartRetry.maxRetries,
 *     };
 *   }
 *   return map;
 * }, [failedTasksState.retryQueue, smartRetry.currentAttempt, smartRetry.maxRetries]);
 * ```
 *
 * 这在「同一时间只有一个 turn 在重试」时勉强可用，但一旦：
 *
 * - 多个 turn 同时在重试队列中
 * - 不同 turn 的重试进度不一致
 * - 一个 turn 触发了故障转移、另一个 turn 没触发
 *
 * 所有失败任务就会显示**同一个数字**，对用户来说就是错误的提示。
 *
 * ## 解决思路
 *
 * 用一份「按 turn 维度」的进度表，替换全局共享的 `currentAttempt`：
 *
 * - 每个 turn 独立维护 `attempt` / `maxRetries` / `status`
 * - 调用方在每次重试的关键节点（开始 / 自增 / 成功 / 用尽）调用 hook 暴露的方法
 * - hook 派生出一份 `retryAttemptsMap`，可直接传给 `FailedTaskQueue`
 *
 * ## 状态机
 *
 * ```
 *                        recordStart
 *                           │
 *                           ▼
 *        ┌─ recordExhausted ──── exhausted
 *        │           ▲
 *   retrying ── recordAttempt ──▶ retrying (attempt++)
 *        │   ▲
 *        │   └─ recordStart
 *        ▼
 *   success ── recordSuccess
 *        │
 *        └─ clearTurn ──▶ (remove)
 * ```
 *
 * ## 使用方式
 *
 * ```ts
 * const retryProgress = useFailedTaskRetryProgress();
 *
 * // 用户点击「重试」按钮
 * retryProgress.recordStart(turnId, 5);
 *
 * // 每次发起重试请求前自增
 * retryProgress.recordAttempt(turnId, 1); // 第 1 次尝试
 * retryProgress.recordAttempt(turnId, 2); // 第 2 次尝试
 *
 * // 成功 / 用尽
 * retryProgress.recordSuccess(turnId);
 * retryProgress.recordExhausted(turnId);
 *
 * // 传给 FailedTaskQueue
 * <FailedTaskQueue retryAttemptsMap={retryProgress.retryAttemptsMap} ... />
 * ```
 *
 * ## 注意事项
 *
 * - 进度数据是**内存态**，刷新页面后会重置
 * - 不同 turn 的进度是**完全独立**的，互不影响
 * - `clearTurn` 之后可以重新 `recordStart`（允许「重置后再次重试」场景）
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { TurnId } from "~/contracts";

/** 单个 turn 的重试状态机阶段 */
export type RetryProgressStatus = "retrying" | "success" | "exhausted";

/** 单个 turn 的重试进度 */
export interface TurnRetryProgress {
  /** 当前尝试序号（从 1 开始；0 表示尚未发起） */
  attempt: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 当前状态 */
  status: RetryProgressStatus;
  /** 最近一次更新时间戳（毫秒） */
  updatedAt: number;
  /** 进度信息（可选），用于调试 / 上报 */
  lastErrorClass?: string;
}

/** 简化的「attempts map」结构（兼容 FailedTaskQueue 的入参） */
export interface RetryAttemptEntry {
  /** 当前尝试序号（从 1 开始） */
  attempt: number;
  /** 最大重试次数 */
  maxRetries: number;
}

/** Hook 返回值 */
export interface UseFailedTaskRetryProgressResult {
  /** 按 turnId 索引的完整进度（包含 status / updatedAt） */
  progressMap: Readonly<Record<string, TurnRetryProgress>>;
  /** 派生的「attempts map」，可直接传给 FailedTaskQueue */
  retryAttemptsMap: Readonly<Record<string, RetryAttemptEntry>>;
  /** 当前在 retrying 状态的 turnIds */
  retryingTurnIds: ReadonlyArray<string>;
  /** 已用尽次数的 turnIds（可提示「需手动接管」） */
  exhaustedTurnIds: ReadonlyArray<string>;
  /** 记录「重试开始」——通常在 enqueueRetry 之后立即调用 */
  recordStart: (turnId: TurnId, maxRetries: number) => void;
  /** 记录「第 N 次尝试」——每次发起请求前调用 */
  recordAttempt: (turnId: TurnId, attempt: number, options?: { errorClass?: string }) => void;
  /** 记录「重试成功」——成功响应后调用 */
  recordSuccess: (turnId: TurnId) => void;
  /** 记录「重试用尽」——达到 maxRetries 后调用 */
  recordExhausted: (turnId: TurnId, options?: { errorClass?: string }) => void;
  /** 清除某个 turn 的进度（用户主动出队 / 跳过后） */
  clearTurn: (turnId: TurnId) => void;
  /** 清除所有 turn 的进度（线程切换 / 清理） */
  clearAll: () => void;
  /** 查询单个 turn 的进度（hook 外部使用，例如上报） */
  getProgress: (turnId: TurnId) => TurnRetryProgress | undefined;
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

/**
 * 从完整 `progressMap` 派生出 `retryAttemptsMap`。
 * 仅暴露 `attempt` / `maxRetries` 字段，传递给 UI 组件。
 */
function deriveAttemptsMap(
  source: Readonly<Record<string, TurnRetryProgress>>,
): Record<string, RetryAttemptEntry> {
  const result: Record<string, RetryAttemptEntry> = {};
  for (const [turnId, progress] of Object.entries(source)) {
    result[turnId] = {
      attempt: progress.attempt,
      maxRetries: progress.maxRetries,
    };
  }
  return result;
}

function deriveTurnIdList(
  source: Readonly<Record<string, TurnRetryProgress>>,
  predicate: (progress: TurnRetryProgress) => boolean,
): string[] {
  const result: string[] = [];
  for (const [turnId, progress] of Object.entries(source)) {
    if (predicate(progress)) result.push(turnId);
  }
  return result;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * 失败任务按 Turn 维度的重试进度跟踪 Hook。
 *
 * @example
 * ```tsx
 * const { retryAttemptsMap, recordStart, recordAttempt, recordSuccess } =
 *   useFailedTaskRetryProgress();
 *
 * // 用户点击「重试」按钮
 * function handleRetryClick(turnId: TurnId) {
 *   failedTasksState.enqueueRetry(turnId);
 *   recordStart(turnId, 5);
 *   void runRetry(turnId, 1);
 * }
 *
 * async function runRetry(turnId: TurnId, attempt: number) {
 *   recordAttempt(turnId, attempt);
 *   try {
 *     await sendTurn(turnId);
 *     recordSuccess(turnId);
 *     failedTasksState.dequeueRetry(turnId);
 *   } catch (err) {
 *     if (attempt >= 5) {
 *       recordExhausted(turnId);
 *     } else {
 *       void runRetry(turnId, attempt + 1);
 *     }
 *   }
 * }
 *
 * <FailedTaskQueue
 *   retryAttemptsMap={retryAttemptsMap}
 *   ...
 * />
 * ```
 */
export function useFailedTaskRetryProgress(): UseFailedTaskRetryProgressResult {
  const [progressMap, setProgressMap] = useState<Record<string, TurnRetryProgress>>({});

  // 用 ref 持有最新状态，便于回调函数读取（避免回调闭包陷阱）
  const stateRef = useRef<Record<string, TurnRetryProgress>>({});
  useEffect(() => {
    stateRef.current = progressMap;
  }, [progressMap]);

  const recordStart = useCallback((turnId: TurnId, maxRetries: number) => {
    if (!turnId) return;
    const safeMax = Math.max(1, Math.floor(maxRetries) || 1);
    setProgressMap((prev) => {
      const previous = prev[turnId];
      // 已存在且处于「成功 / 用尽」状态时，可以重置为新的 retrying
      const next: TurnRetryProgress = {
        attempt: 0,
        maxRetries: safeMax,
        status: "retrying",
        updatedAt: Date.now(),
        ...(previous?.lastErrorClass ? { lastErrorClass: previous.lastErrorClass } : {}),
      };
      return { ...prev, [turnId]: next };
    });
  }, []);

  const recordAttempt = useCallback(
    (turnId: TurnId, attempt: number, options?: { errorClass?: string }) => {
      if (!turnId) return;
      const safeAttempt = Math.max(0, Math.floor(attempt) || 0);
      setProgressMap((prev) => {
        const previous = prev[turnId];
        const maxRetries = previous?.maxRetries ?? 5;
        const next: TurnRetryProgress = {
          attempt: safeAttempt,
          maxRetries,
          status: "retrying",
          updatedAt: Date.now(),
          ...(options?.errorClass ? { lastErrorClass: options.errorClass } : previous?.lastErrorClass ? { lastErrorClass: previous.lastErrorClass } : {}),
        };
        return { ...prev, [turnId]: next };
      });
    },
    [],
  );

  const recordSuccess = useCallback((turnId: TurnId) => {
    if (!turnId) return;
    setProgressMap((prev) => {
      const previous = prev[turnId];
      if (!previous) {
        // 没有 start 直接 success：仅记录成功
        return {
          ...prev,
          [turnId]: {
            attempt: 1,
            maxRetries: 1,
            status: "success",
            updatedAt: Date.now(),
          },
        };
      }
      return {
        ...prev,
        [turnId]: {
          ...previous,
          status: "success",
          updatedAt: Date.now(),
        },
      };
    });
  }, []);

  const recordExhausted = useCallback(
    (turnId: TurnId, options?: { errorClass?: string }) => {
      if (!turnId) return;
      setProgressMap((prev) => {
        const previous = prev[turnId];
        const maxRetries = previous?.maxRetries ?? 5;
        return {
          ...prev,
          [turnId]: {
            attempt: maxRetries,
            maxRetries,
            status: "exhausted",
            updatedAt: Date.now(),
            ...(options?.errorClass ? { lastErrorClass: options.errorClass } : previous?.lastErrorClass ? { lastErrorClass: previous.lastErrorClass } : {}),
          },
        };
      });
    },
    [],
  );

  const clearTurn = useCallback((turnId: TurnId) => {
    if (!turnId) return;
    setProgressMap((prev) => {
      if (!(turnId in prev)) return prev;
      const next = { ...prev };
      delete next[turnId];
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setProgressMap({});
  }, []);

  const getProgress = useCallback(
    (turnId: TurnId): TurnRetryProgress | undefined => {
      return stateRef.current[turnId];
    },
    [],
  );

  // 派生数据
  const retryAttemptsMap = deriveAttemptsMap(progressMap);
  const retryingTurnIds = deriveTurnIdList(progressMap, (p) => p.status === "retrying");
  const exhaustedTurnIds = deriveTurnIdList(progressMap, (p) => p.status === "exhausted");

  return {
    progressMap,
    retryAttemptsMap,
    retryingTurnIds,
    exhaustedTurnIds,
    recordStart,
    recordAttempt,
    recordSuccess,
    recordExhausted,
    clearTurn,
    clearAll,
    getProgress,
  };
}
