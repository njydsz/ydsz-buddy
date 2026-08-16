/**
 * @file 失败任务自动重试 Hook
 *
 * 把 `useFailedTasks`（失败聚合）+ `useSmartRetry`（指数退避）+ `useProviderFailover`
 * （Provider 切换）三者串起来，做到：
 *
 * 1. **自动入队**：当 `thread.turn-failed` 事件到达，且失败类型属于可重试集合
 *    （network / timeout / rate-limit / server-error）时，自动入队
 * 2. **指数退避重试**：使用 `useSmartRetry.execute()` 按 backoff 策略重试，
 *    直到成功 / 取消 / 用尽
 * 3. **触发故障转移**：重试用尽时调用 `useProviderFailover.recordFailure(activeProvider)`，
 *    让 useProviderFailover 决定是否切到备用 Provider
 * 4. **不可重试短路**：client-error / permission 错误不入队，由用户手动处理
 * 5. **用户消息缺失时短路**：没有 `userMessage` 的失败任务无法重发（命令无 payload），
 *    降级为「需手动处理」状态
 *
 * ## 使用方式
 *
 * ```tsx
 * const failedTasksState = useFailedTasks(threadId, !!threadId);
 * const smartRetry = useSmartRetry();
 * const retryProgress = useFailedTaskRetryProgress();
 * const failover = useProviderFailover({ failureThreshold: 3 });
 *
 * const { isAutoRetrying, lastRetryReason } = useAutoRetryFailedTasks({
 *   threadId,
 *   failedTasksState,
 *   smartRetry,
 *   retryProgress,
 *   failover,
 *   activeProvider: selectedProvider,
 *   onResendTurn: async (turnId, userMessage) => {
 *     // 调用 thread.turn.start 重新发送 userMessage
 *     await api.orchestration.dispatchCommand({
 *       type: "thread.turn.start",
 *       ...
 *     });
 *   },
 * });
 * ```
 *
 * ## 关键设计
 *
 * - **避免双重消费**：每个 turn 最多被自动重试一次（按 turnId 跟踪），
 *   防止 `thread.turn-failed` 重复事件导致无限循环
 * - **可中断**：用户手动调用 `failedTasksState.dequeueRetry(turnId)` 时，
 *   会触发 `smartRetry.cancel()` 立即停止当前重试
 * - **退避时机**：实际退避由 `useSmartRetry.execute` 内部 `waitWithCancel` 处理；
 *   本 hook 不自己维护 setTimeout
 *
 * ## 注意事项
 *
 * - 配合 `useSmartRetry` 的 `staleTime: 0` 使用，确保每次失败事件都能触发新重试
 * - `useProviderFailover.recordFailure` 调用是幂等的；多次用尽调用不会重复计数
 * - 没有 `userMessage` 的 turn 会被跳过（failSafe=true），原因会写入
 *   `lastRetryReason` 供 UI 展示
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { OrchestrationEvent, ThreadId, TurnId } from "~/contracts";
import { readNativeApi } from "~/nativeApi";
import { monitor } from "~/lib/monitor";
import type { FailedTask, FailureType } from "./useFailedTasks";
import { inferFailureTypeFromEvent } from "./useFailedTasksHelpers";
import type { UseSmartRetryResult } from "./useSmartRetry";
import type { UseFailedTaskRetryProgressResult } from "./useFailedTaskRetryProgress";
import type { UseProviderFailoverResult } from "./useProviderFailover";
import type { ProviderKind } from "~/contracts";

// ─── 类型定义 ────────────────────────────────────────────────────────────────

/** 自动重试策略 */
export interface AutoRetryPolicy {
  /** 是否启用自动重试（用户可在 settings 关闭） */
  enabled: boolean;
  /** 重试用尽时是否触发 Provider 故障转移（默认 true） */
  failoverOnExhaust: boolean;
  /** 哪些失败类型可重试（默认 network / timeout / rate-limit） */
  retriableTypes: ReadonlySet<FailureType>;
  /** 最大重试次数（透传给 useSmartRetry） */
  maxRetries: number;
  /** 基础退避毫秒（透传给 useSmartRetry） */
  baseDelayMs: number;
}

/** 默认重试策略 */
export const DEFAULT_AUTO_RETRY_POLICY: AutoRetryPolicy = {
  enabled: true,
  failoverOnExhaust: true,
  retriableTypes: new Set<FailureType>(["network", "timeout", "rate-limit"]),
  maxRetries: 5,
  baseDelayMs: 1000,
};

/** Hook 入参 */
export interface UseAutoRetryFailedTasksArgs {
  /** 当前线程 ID */
  threadId: ThreadId | null;
  /** useFailedTasks 返回值 */
  failedTasksState: {
    failedTasks: ReadonlyArray<FailedTask>;
    enqueueRetry: (turnId: TurnId) => void;
    dequeueRetry: (turnId: TurnId) => void;
  };
  /** useSmartRetry 返回值 */
  smartRetry: UseSmartRetryResult;
  /** useFailedTaskRetryProgress 返回值 */
  retryProgress: UseFailedTaskRetryProgressResult;
  /** useProviderFailover 返回值（可为 null 跳过故障转移） */
  failover: UseProviderFailoverResult | null;
  /** 当前活跃 Provider（用于 recordFailure） */
  activeProvider: ProviderKind;
  /** 实际重发 turn 的回调（返回 Promise，成功 resolve / 失败 reject） */
  onResendTurn: (turnId: TurnId, userMessage: string) => Promise<void>;
  /** 策略覆盖 */
  policy?: Partial<AutoRetryPolicy>;
}

/** Hook 返回值 */
export interface UseAutoRetryFailedTasksResult {
  /** 是否正在自动重试中（执行或等待） */
  isAutoRetrying: boolean;
  /** 当前正在重试的 turnIds（实时同步 retryProgress.retryingTurnIds） */
  retryingTurnIds: ReadonlyArray<string>;
  /** 已用尽的 turnIds */
  exhaustedTurnIds: ReadonlyArray<string>;
  /** 最近一次自动重试决策的原因（用于 UI 提示） */
  lastRetryReason: string | null;
  /** 手动重置所有状态（清空已重试集合、smartRetry 状态） */
  reset: () => void;
}

// ─── 内部辅助 ────────────────────────────────────────────────────────────────

/**
 * 从 domain event 中提取 userMessage（用于重发 turn）。
 *
 * userMessage 缺失时返回 null，调用方应放弃自动重试。
 */
function extractUserMessage(event: OrchestrationEvent): string | null {
  if (event.type !== "thread.turn-failed") return null;
  const payload = (event as { payload?: Record<string, unknown> }).payload ?? {};
  const message = payload["userMessage"];
  return typeof message === "string" && message.length > 0 ? message : null;
}

/**
 * 从 event 提取 errorClass（优先 payload.errorClass，否则用消息推断）
 */
function extractErrorClass(event: OrchestrationEvent): FailureType {
  if (event.type !== "thread.turn-failed") return "unknown";
  const payload = (event as { payload?: Record<string, unknown> }).payload ?? {};
  const explicit = payload["errorClass"];
  if (typeof explicit === "string") {
    if (
      explicit === "network" ||
      explicit === "timeout" ||
      explicit === "permission" ||
      explicit === "rate-limit" ||
      explicit === "unknown"
    ) {
      return explicit;
    }
  }
  const message = payload["error"];
  if (typeof message === "string") {
    return inferFailureTypeFromEvent(message);
  }
  return "unknown";
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * 失败任务自动重试 Hook。
 *
 * 监听 thread.turn-failed 事件，对可重试的失败自动入队 + 指数退避重试 +
 * 触发 Provider 故障转移。
 */
export function useAutoRetryFailedTasks(
  args: UseAutoRetryFailedTasksArgs,
): UseAutoRetryFailedTasksResult {
  const {
    threadId,
    failedTasksState,
    smartRetry,
    retryProgress,
    failover,
    activeProvider,
    onResendTurn,
    policy: policyOverride,
  } = args;

  const policy: AutoRetryPolicy = { ...DEFAULT_AUTO_RETRY_POLICY, ...(policyOverride ?? {}) };

  // 已经发起自动重试的 turnIds（按 turn 维度防重入）
  const autoRetriedTurnIdsRef = useRef<Set<string>>(new Set());
  // 正在自动重试中的 turnId（同一时刻只跑一个 turn 的智能重试）
  const runningTurnIdRef = useRef<string | null>(null);
  // 跨渲染保存 onResendTurn（避免 effect 因函数引用变化而反复触发）
  const onResendTurnRef = useRef(onResendTurn);
  onResendTurnRef.current = onResendTurn;

  const [lastRetryReason, setLastRetryReason] = useState<string | null>(null);

  // 订阅 thread.turn-failed
  useEffect(() => {
    if (!policy.enabled || !threadId) return;
    const api = readNativeApi();
    if (!api) return;

    const unsubscribe = api.orchestration.onDomainEvent((event) => {
      if (event.type !== "thread.turn-failed") return;
      if (event.aggregateId !== threadId) return;

      const turnId = ((event as { payload?: { turnId?: TurnId } }).payload?.turnId ??
        null) as TurnId | null;
      if (!turnId) return;

      // 已重试过 / 正在重试 → 跳过
      const turnKey = String(turnId);
      if (autoRetriedTurnIdsRef.current.has(turnKey)) return;
      if (runningTurnIdRef.current !== null) return;

      // 失败类型不在白名单 → 跳过（client-error / permission / unknown）
      const errorType = extractErrorClass(event);
      if (!policy.retriableTypes.has(errorType)) {
        setLastRetryReason(
          `失败类型「${errorType}」不可自动重试（需要手动处理）`,
        );
        return;
      }

      // userMessage 缺失 → 跳过（无 payload 无法重发）
      const userMessage = extractUserMessage(event);
      if (!userMessage) {
        setLastRetryReason(
          `turn ${turnKey} 缺少 userMessage 载荷，无法自动重试`,
        );
        return;
      }

      // 标记为「已发起自动重试」+ 入队
      autoRetriedTurnIdsRef.current.add(turnKey);
      runningTurnIdRef.current = turnKey;
      failedTasksState.enqueueRetry(turnId);
      retryProgress.recordStart(turnId, policy.maxRetries);
      setLastRetryReason(`turn ${turnKey} 触发自动重试（${errorType}）`);

      // 启动指数退避重试
      void runSmartRetry({
        turnId,
        userMessage,
        turnKey,
        onResendTurn: (msg) => onResendTurnRef.current(turnId, msg),
        smartRetry,
        retryProgress,
        failover,
        activeProvider,
        policy,
        onComplete: () => {
          runningTurnIdRef.current = null;
        },
      });
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, policy.enabled]);

  // 用户主动出队 → 取消当前重试
  useEffect(() => {
    if (smartRetry.status !== "retrying" && smartRetry.status !== "waiting-retry-after") {
      return;
    }
    const runningId = runningTurnIdRef.current;
    if (!runningId) return;
    const stillEnqueued = failedTasksState.failedTasks.some(
      (t) => String(t.turnId) === runningId,
    );
    if (!stillEnqueued) {
      smartRetry.cancel();
      runningTurnIdRef.current = null;
    }
  }, [
    failedTasksState.failedTasks,
    smartRetry.status,
    smartRetry.cancel,
  ]);

  const reset = useCallback(() => {
    autoRetriedTurnIdsRef.current.clear();
    runningTurnIdRef.current = null;
    setLastRetryReason(null);
    smartRetry.reset();
    retryProgress.clearAll();
  }, [smartRetry, retryProgress]);

  return {
    isAutoRetrying:
      smartRetry.status === "retrying" || smartRetry.status === "waiting-retry-after",
    retryingTurnIds: retryProgress.retryingTurnIds,
    exhaustedTurnIds: retryProgress.exhaustedTurnIds,
    lastRetryReason,
    reset,
  };
}

// ─── 内部：执行单 turn 的智能重试 ───────────────────────────────────────────

interface RunSmartRetryArgs {
  turnId: TurnId;
  userMessage: string;
  turnKey: string;
  onResendTurn: (userMessage: string) => Promise<void>;
  smartRetry: UseSmartRetryResult;
  retryProgress: UseFailedTaskRetryProgressResult;
  failover: UseProviderFailoverResult | null;
  activeProvider: ProviderKind;
  policy: AutoRetryPolicy;
  onComplete: () => void;
}

async function runSmartRetry(args: RunSmartRetryArgs): Promise<void> {
  const {
    turnId,
    userMessage,
    turnKey,
    onResendTurn,
    smartRetry,
    retryProgress,
    failover,
    activeProvider,
    policy,
    onComplete,
  } = args;

  try {
    await smartRetry.execute(() => onResendTurn(userMessage));
    // 成功
    retryProgress.recordSuccess(turnId);
  } catch (error) {
    // 用尽 / 不可重试 / 取消
    const isCancelled = error instanceof DOMException && error.name === "AbortError";
    if (!isCancelled) {
      retryProgress.recordExhausted(turnId);
    }
    // 用尽 → 触发 Provider 故障转移
    if (
      !isCancelled &&
      smartRetry.status === "exhausted" &&
      policy.failoverOnExhaust &&
      failover !== null
    ) {
      try {
        failover.recordFailure(activeProvider, error instanceof Error ? error : undefined);
        monitor.captureMessage("auto_retry_exhausted_triggered_failover", {
          turnId: turnKey,
          provider: activeProvider,
          errorClass: smartRetry.history.at(-1)?.errorClass ?? "unknown",
        });
      } catch (failoverError) {
        monitor.captureError({
          type: "auto_retry.failover",
          message: "failover.recordFailure threw after auto-retry exhausted",
          stack: failoverError instanceof Error ? failoverError.stack : undefined,
          context: { turnId: turnKey, provider: activeProvider },
          level: "warning",
        });
      }
    }
  } finally {
    onComplete();
  }
}
