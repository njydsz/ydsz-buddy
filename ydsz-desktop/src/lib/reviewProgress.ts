/**
 * @file reviewProgress.ts
 * @description Review 模式进度统计纯函数。
 *
 * 提供给定 hunk 决策集合与文件元数据下的进度计算，包括：
 * - 总 hunk 数（去重，每个文件按 hunks 数组长度）
 * - 已决策数（accept / reject 各多少）
 * - 未决策数
 * - 进度百分比（已决策 / 总数）
 * - 下一个未决策 hunk 的定位（fileIndex, hunkIndex）
 *
 * 所有函数均为纯函数，可安全在渲染热路径中使用。
 */

import type { FileDiffMetadata } from "@pierre/diffs/react";
import type { HunkDecisions, HunkDecision } from "../components/chat/ReviewDiffToolbar";

/** 进度统计 */
export interface ReviewProgressStats {
  /** 当前 review 涉及的文件数 */
  fileCount: number;
  /** 总 hunk 数 */
  totalHunks: number;
  /** 已决策 hunk 数（accept + reject） */
  decidedHunks: number;
  /** accept 数 */
  acceptCount: number;
  /** reject 数 */
  rejectCount: number;
  /** 未决策 hunk 数 */
  undecidedHunks: number;
  /** 进度百分比（0-100，保留 1 位小数） */
  progressPercent: number;
  /** 是否所有 hunk 都已决策 */
  isComplete: boolean;
}

/**
 * 计算 review 进度统计
 * @param renderableFiles 当前 review 的文件元数据列表
 * @param decisions 当前 hunk 决策表
 */
export function computeReviewProgress(
  renderableFiles: ReadonlyArray<FileDiffMetadata>,
  decisions: HunkDecisions,
): ReviewProgressStats {
  let totalHunks = 0;
  for (const fileDiff of renderableFiles) {
    const hunks = fileDiff.hunks ?? [];
    totalHunks += hunks.length;
  }

  let acceptCount = 0;
  let rejectCount = 0;
  for (const fileHunks of decisions.values()) {
    for (const decision of fileHunks.values()) {
      if (decision === "accept") acceptCount += 1;
      else if (decision === "reject") rejectCount += 1;
    }
  }
  const decidedHunks = acceptCount + rejectCount;
  const undecidedHunks = Math.max(0, totalHunks - decidedHunks);
  const progressPercent =
    totalHunks > 0
      ? Math.round((decidedHunks / totalHunks) * 1000) / 10
      : 0;
  return {
    fileCount: renderableFiles.length,
    totalHunks,
    decidedHunks,
    acceptCount,
    rejectCount,
    undecidedHunks,
    progressPercent,
    isComplete: totalHunks > 0 && undecidedHunks === 0,
  };
}

/** 下一个未决策 hunk 定位 */
export interface NextUndecidedHunk {
  /** 文件在 renderableFiles 中的索引 */
  fileIndex: number;
  /** hunk 在该文件 hunks 数组中的索引 */
  hunkIndex: number;
  /** 用于在 UI 中标识（`fileKey:hunkIndex`） */
  identifier: string;
}

/**
 * 定位下一个未决策的 hunk
 * @param renderableFiles 当前 review 的文件元数据列表
 * @param decisions 当前 hunk 决策表
 * @param startFileIndex 起始文件索引（默认 0）
 * @returns 找不到时返回 null
 */
export function findNextUndecidedHunk(
  renderableFiles: ReadonlyArray<FileDiffMetadata>,
  decisions: HunkDecisions,
  startFileIndex = 0,
): NextUndecidedHunk | null {
  for (let i = startFileIndex; i < renderableFiles.length; i += 1) {
    const fileDiff = renderableFiles[i];
    if (!fileDiff) continue;
    const fileKey = fileDiff.cacheKey ?? `${fileDiff.prevName ?? "none"}:${fileDiff.name}`;
    const hunks = fileDiff.hunks ?? [];
    const fileDecisions = decisions.get(fileKey) ?? new Map<number, HunkDecision>();
    for (let j = 0; j < hunks.length; j += 1) {
      if (!fileDecisions.has(j)) {
        return {
          fileIndex: i,
          hunkIndex: j,
          identifier: `${fileKey}:${j}`,
        };
      }
    }
  }
  return null;
}

/**
 * 格式化进度文本（中文场景）。
 * @example formatReviewProgressLine({...stats, progressPercent: 33.3, decidedHunks: 1, totalHunks: 3}) => "1/3 hunks · 33.3%"
 */
export function formatReviewProgressLine(stats: ReviewProgressStats): string {
  if (stats.totalHunks === 0) {
    return "无待审查 hunks";
  }
  return `${stats.decidedHunks}/${stats.totalHunks} hunks · ${stats.progressPercent.toFixed(1)}%`;
}
