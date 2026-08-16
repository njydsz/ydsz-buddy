/**
 * @file useTurnDiffSummaries.ts
 * @description 轮次差异摘要 Hook - 提供线程轮次的差异摘要和检查点计数
 * @module hooks/useTurnDiffSummaries
 */

import { useMemo } from "react";
import { inferCheckpointTurnCountByTurnId } from "../session-logic";
import type { Thread } from "../types";

/**
 * 轮次差异摘要 Hook
 * 
 * @description
 * 从活动线程中提取轮次差异摘要，并推导每个轮次的检查点计数。
 * 
 * 数据包括：
 * - turnDiffSummaries: 每个轮次的差异摘要列表
 * - inferredCheckpointTurnCountByTurnId: 每个轮次 ID 对应的检查点计数映射
 * 
 * @param activeThread - 活动线程对象（undefined 表示无线程）
 * @returns 包含差异摘要和检查点计数的对象
 * 
 * @example
 * ```tsx
 * const { turnDiffSummaries, inferredCheckpointTurnCountByTurnId } = useTurnDiffSummaries(thread);
 * 
 * // 显示每个轮次的差异
 * turnDiffSummaries.forEach(summary => {
 *   const checkpointCount = inferredCheckpointTurnCountByTurnId[summary.turnId] ?? 0;
 *   console.log(`轮次 ${summary.turnId}: ${checkpointCount} 个检查点`);
 * });
 * ```
 */
export function useTurnDiffSummaries(activeThread: Thread | undefined) {
  // 提取轮次差异摘要
  const turnDiffSummaries = useMemo(() => {
    if (!activeThread) {
      return [];
    }
    return activeThread.turnDiffSummaries;
  }, [activeThread]);

  // 推导每个轮次的检查点计数
  const inferredCheckpointTurnCountByTurnId = useMemo(
    () => inferCheckpointTurnCountByTurnId(turnDiffSummaries),
    [turnDiffSummaries],
  );

  return { turnDiffSummaries, inferredCheckpointTurnCountByTurnId };
}
