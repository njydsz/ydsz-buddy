/**
 * @file 失败任务 Hook
 *
 * 本 Hook 订阅 thread.turn-failed 事件，聚合失败任务并提供重试逻辑。
 *
 * ## 核心功能
 *
 * - **失败聚合**：按错误类型分组（网络错误/超时/权限/其他）
 * - **重试队列**：维护待重试的 turnId 列表
 * - **统计信息**：总失败数、最近失败时间、各类型计数
 *
 * ## 使用场景
 *
 * - TaskSidebar 底部显示失败任务列表
 * - Composer 上方显示失败提示和重试按钮
 *
 * ## 注意事项
 *
 * - 失败任务最多保留 10 条
 * - 重试后自动从队列中移除
 */

import { useEffect, useState, useCallback } from "react";
import { readNativeApi } from "~/nativeApi";
import type { OrchestrationEvent, ThreadId, TurnId } from "~/contracts";
import { inferFailureTypeFromEvent } from "./useFailedTasksHelpers";

/** 失败类型 —— 与 `useFailedTasksHelpers` 保持一致 */
export type FailureType = "network" | "timeout" | "permission" | "rate-limit" | "unknown";

/** 失败任务 */
export interface FailedTask {
  /** 线程 ID */
  threadId: ThreadId;
  /** 轮次 ID */
  turnId: TurnId;
  /** 失败类型 */
  type: FailureType;
  /** 错误消息 */
  message: string;
  /** 失败时间 */
  timestamp: number;
  /** 用户消息（用于重试） */
  userMessage?: string;
}

/** 失败统计 */
export interface FailureStats {
  /** 总失败数 */
  total: number;
  /** 最近失败时间 */
  lastFailureAt: number | null;
  /** 各类型计数 */
  byType: Record<FailureType, number>;
}

/**
 * 从事件中提取失败任务信息
 */
function extractFailedTask(event: OrchestrationEvent): FailedTask | null {
  if ((event as { type: string }).type !== "thread.turn-failed") return null;

  const payload = (event as Record<string, unknown>).payload as Record<string, unknown>;
  const threadId = ((event as Record<string, unknown>).aggregateId as ThreadId) ?? ({} as ThreadId);
  const turnId = payload.turnId as TurnId;
  const errorMessage = (payload.error as string) ?? "Unknown error";

  return {
    threadId,
    turnId,
    type: inferFailureTypeFromEvent(errorMessage),
    message: errorMessage,
    timestamp: Date.now(),
    userMessage: payload.userMessage as string | undefined,
  };
}

/**
 * 失败任务 Hook
 * @param threadId - 线程 ID
 * @param enabled - 是否启用
 */
export function useFailedTasks(threadId: ThreadId | null, enabled: boolean = true) {
  const [failedTasks, setFailedTasks] = useState<FailedTask[]>([]);
  const [retryQueue, setRetryQueue] = useState<TurnId[]>([]);

  useEffect(() => {
    if (!enabled || !threadId) {
      setFailedTasks([]);
      return;
    }

    const api = readNativeApi();
    if (!api) return;

    const unsubscribe = api.orchestration.onDomainEvent((event) => {
      if (event.aggregateId !== threadId) return;

      const task = extractFailedTask(event);
      if (!task) return;

      setFailedTasks((prev) => {
        const next = [task, ...prev].slice(0, 10); // 最多保留 10 条
        return next;
      });
    });

    return unsubscribe;
  }, [threadId, enabled]);

  /** 添加到重试队列 */
  const enqueueRetry = useCallback((turnId: TurnId) => {
    setRetryQueue((prev) => (prev.includes(turnId) ? prev : [...prev, turnId]));
  }, []);

  /** 从重试队列移除 */
  const dequeueRetry = useCallback((turnId: TurnId) => {
    setRetryQueue((prev) => prev.filter((id) => id !== turnId));
  }, []);

  /** 清空失败任务 */
  const clearFailedTasks = useCallback(() => {
    setFailedTasks([]);
    setRetryQueue([]);
  }, []);

  /** 统计信息 */
  const stats: FailureStats = {
    total: failedTasks.length,
    lastFailureAt: failedTasks[0]?.timestamp ?? null,
    byType: {
      network: failedTasks.filter((t) => t.type === "network").length,
      timeout: failedTasks.filter((t) => t.type === "timeout").length,
      permission: failedTasks.filter((t) => t.type === "permission").length,
      "rate-limit": failedTasks.filter((t) => t.type === "rate-limit").length,
      unknown: failedTasks.filter((t) => t.type === "unknown").length,
    },
  };

  return {
    failedTasks,
    retryQueue,
    stats,
    enqueueRetry,
    dequeueRetry,
    clearFailedTasks,
  };
}
