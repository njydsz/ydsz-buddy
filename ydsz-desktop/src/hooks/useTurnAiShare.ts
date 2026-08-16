/**
 * @file useTurnAiShare.ts
 * @description 线程级 AI / 用户代码归属占比的 React Hook。
 *
 * 在 `useTurnDiffSummaries` 之上叠加:
 * - `computeTurnAiShare` 聚合算 AI / User / Mixed 行数与占比
 * - 结果 memo 化,只在线程或 turnDiffSummaries 引用变化时重算
 *
 * 数据流:
 *
 *   thread.turnDiffSummaries
 *     → computeTurnAiShare()
 *     → { aiLines, humanLines, mixedLines, totalAuthoredLines,
 *         aiShare, humanShare, mixedShare, turnCount, fileCount, isEmpty }
 *
 * 用法:
 *
 * ```tsx
 * const aiShare = useTurnAiShare(thread);
 * return <div>AI 占比 {formatAiSharePercent(aiShare.aiShare)}</div>;
 * ```
 */
import { useMemo } from "react";
import { computeTurnAiShare, type TurnAiShareStats } from "../lib/turnAiShare";
import type { Thread } from "../types";

/**
 * 线程级 AI 占比 hook
 *
 * @param activeThread 当前活动线程;undefined 时返回空态
 * @returns 完整的 `TurnAiShareStats` 聚合结果
 */
export function useTurnAiShare(activeThread: Thread | undefined): TurnAiShareStats {
  const stats = useMemo(() => {
    if (!activeThread) {
      return computeTurnAiShare(null);
    }
    return computeTurnAiShare(activeThread.turnDiffSummaries);
  }, [activeThread, activeThread?.turnDiffSummaries]);

  return stats;
}
