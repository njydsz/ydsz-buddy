/**
 * @file Review 模式专用 Diff 工具栏
 *
 * 在 `interactionMode === "review"` 激活时，Diff 面板顶部会渲染该工具栏，
 * 突出"代码审查"场景下的关键能力：
 *
 * - **统计概览**：文件数、变更行数（+additions / -deletions）
 * - **批量操作**：
 *   - 全部接受（accept-all）— 把当前所有可见 hunks 标记为 accept
 *   - 全部拒绝（reject-all）— 把当前所有可见 hunks 标记为 reject
 *   - 清空选择 — 取消所有 accept/reject 标记
 * - **应用选区**：复用 DiffPanel 的"应用接受变更"逻辑（带 hash 校验）
 * - **data-testid**：E2E / 单元测试可稳定抓取
 *
 * ## 设计原则
 *
 * - 轻量级 — 不引入额外的网络/状态，只复用父组件已有的 renderableFiles / acceptedHunks
 * - 显式边界 — 全部接受/拒绝只对当前 diff 中**实际渲染**的文件 hunks 生效，
 *   不会意外地影响"未渲染"的虚拟化区间（避免误操作）
 * - 渐进增强 — Review 模式关闭时父组件根本不渲染该工具栏，零运行时开销
 *
 * ## 注意事项
 *
 * - hunkIndex 取自 `fileDiff.hunks[]` 的 index；与 DiffPanel 内 `handleHunkAcceptReject` 一致
 * - "应用" 按钮调用 `api.git.applyPatch` 并用 `buildAcceptedPatch` 构造 patch（与 DiffPanel 同源）
 */

import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { type FileDiffMetadata } from "@pierre/diffs/react";
import { CheckIcon, ChevronRightIcon, EyeIcon, XIcon } from "~/lib/icons";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { toastManager } from "~/components/ui/toast";
import { readNativeApi } from "../../nativeApi";
import { buildAcceptedPatch, summarizePatchStats } from "../../lib/diffRendering";
import {
  computeReviewProgress,
  findNextUndecidedHunk,
  formatReviewProgressLine,
} from "../../lib/reviewProgress";
import { DiffStatLabel, hasNonZeroStat } from "./DiffStatLabel";

/** Hunk 选择状态 */
export type HunkDecision = "accept" | "reject";

/** Hunk 决策 Map：`Map<fileKey, Map<hunkIndex, decision>>` */
export type HunkDecisions = Map<string, Map<number, HunkDecision>>;

export interface ReviewDiffToolbarProps {
  /** 当前 review 目标 patch 文本（可能为空） */
  activeReviewPatch: string | null | undefined;
  /** 解析后的 files 列表（来自父组件的 `renderableFiles`） */
  renderableFiles: FileDiffMetadata[];
  /** fileKey → FileDiffMetadata 反查表（用于 `buildAcceptedPatch`） */
  fileDiffByKey: ReadonlyMap<string, FileDiffMetadata>;
  /** 当前已选 hunks（与父组件共享） */
  acceptedHunks: HunkDecisions;
  /** 更新选区（父组件提供） */
  setAcceptedHunks: React.Dispatch<React.SetStateAction<HunkDecisions>>;
  /** 工作目录（应用 patch 必需） */
  activeCwd: string | null | undefined;
  /** 应用完成后的回调（父组件可刷新 diff / 重置选区） */
  onApplied?: () => void;
  /** 跳转到下一个未决策 hunk（用于在父组件的虚拟列表中 scrollIntoView） */
  onJumpToNextUndecided?: (target: {
    fileKey: string;
    fileIndex: number;
    hunkIndex: number;
  }) => void;
  /** 自定义额外 className */
  className?: string;
}

/** 把单个 file 的所有 hunks 标记为指定 decision */
function markAllHunks(
  fileDiff: FileDiffMetadata,
  fileKey: string,
  decision: HunkDecision,
): [string, Map<number, HunkDecision>] {
  const next = new Map<number, HunkDecision>();
  const hunks = fileDiff.hunks ?? [];
  for (let i = 0; i < hunks.length; i++) {
    next.set(i, decision);
  }
  return [fileKey, next];
}

export function ReviewDiffToolbar({
  activeReviewPatch,
  renderableFiles,
  fileDiffByKey,
  acceptedHunks,
  setAcceptedHunks,
  activeCwd,
  onApplied,
  onJumpToNextUndecided,
  className,
}: ReviewDiffToolbarProps) {
  const queryClient = useQueryClient();
  const [isApplying, setIsApplying] = useState(false);

  // 进度统计：包括 accept/reject/未决策/百分比
  const progress = useMemo(
    () => computeReviewProgress(renderableFiles, acceptedHunks),
    [renderableFiles, acceptedHunks],
  );
  // 兼容旧版 stats 引用（保持向后兼容的字段）
  const stats = {
    accept: progress.acceptCount,
    reject: progress.rejectCount,
    total: progress.decidedHunks,
  };

  // Diff 全局统计（additions / deletions）
  const diffStats = useMemo(() => {
    if (!activeReviewPatch) return null;
    return summarizePatchStats(activeReviewPatch);
  }, [activeReviewPatch]);

  // 文件数（含已变更的文件）
  const fileCount = renderableFiles.length;

  const handleAcceptAll = useCallback(() => {
    setAcceptedHunks((prev) => {
      const next = new Map(prev);
      for (const fileDiff of renderableFiles) {
        const fileKey = fileDiff.cacheKey ?? `${fileDiff.prevName ?? "none"}:${fileDiff.name}`;
        // 仅对实际有 hunks 的文件处理
        if ((fileDiff.hunks ?? []).length === 0) continue;
        const [key, marks] = markAllHunks(fileDiff, fileKey, "accept");
        next.set(key, marks);
      }
      return next;
    });
  }, [renderableFiles, setAcceptedHunks]);

  const handleRejectAll = useCallback(() => {
    setAcceptedHunks((prev) => {
      const next = new Map(prev);
      for (const fileDiff of renderableFiles) {
        const fileKey = fileDiff.cacheKey ?? `${fileDiff.prevName ?? "none"}:${fileDiff.name}`;
        if ((fileDiff.hunks ?? []).length === 0) continue;
        const [key, marks] = markAllHunks(fileDiff, fileKey, "reject");
        next.set(key, marks);
      }
      return next;
    });
  }, [renderableFiles, setAcceptedHunks]);

  const handleClear = useCallback(() => {
    setAcceptedHunks(new Map());
  }, [setAcceptedHunks]);

  // 跳转到下一个未决策 hunk
  const handleJumpToNextUndecided = useCallback(() => {
    if (!onJumpToNextUndecided) return;
    const next = findNextUndecidedHunk(renderableFiles, acceptedHunks);
    if (!next) {
      toastManager.add({
        type: "info",
        title: "所有 hunk 都已决策",
        description: "可以应用接受变更或继续评论。",
        timeout: 2500,
      });
      return;
    }
    const fileDiff = renderableFiles[next.fileIndex];
    const fileKey = fileDiff?.cacheKey ?? `${fileDiff?.prevName ?? "none"}:${fileDiff?.name}`;
    onJumpToNextUndecided({
      fileKey,
      fileIndex: next.fileIndex,
      hunkIndex: next.hunkIndex,
    });
  }, [acceptedHunks, onJumpToNextUndecided, renderableFiles]);

  const handleApply = useCallback(async () => {
    if (!activeReviewPatch || !activeCwd) {
      toastManager.add({
        type: "warning",
        title: "无法应用变更",
        description: "缺少 diff 或工作目录。",
        timeout: 3000,
      });
      return;
    }
    const patch = buildAcceptedPatch(activeReviewPatch, acceptedHunks, fileDiffByKey);
    if (!patch) {
      toastManager.add({
        type: "warning",
        title: "无已接受的变更",
        description: "请先至少接受一个 hunk。",
        timeout: 3000,
      });
      return;
    }
    const api = readNativeApi();
    if (!api) {
      toastManager.add({
        type: "error",
        title: "桥接不可用",
        description: "Native API 未连接。",
        timeout: 3000,
      });
      return;
    }
    setIsApplying(true);
    try {
      await api.git.applyPatch({ cwd: activeCwd, patch });
      toastManager.add({
        type: "success",
        title: "已应用变更",
        description: "已接受的 hunks 已写入工作树。",
        timeout: 3000,
      });
      setAcceptedHunks(new Map());
      void queryClient.invalidateQueries({
        queryKey: ["git", "working-tree-diff", activeCwd] as const,
      });
      onApplied?.();
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "应用失败",
        description: error instanceof Error ? error.message : "Failed to apply patch.",
        timeout: 5000,
      });
    } finally {
      setIsApplying(false);
    }
  }, [
    acceptedHunks,
    activeCwd,
    activeReviewPatch,
    fileDiffByKey,
    onApplied,
    queryClient,
    setAcceptedHunks,
  ]);

  // 即使没有 diff 也要渲染（提示用户"暂无变更"），让工具栏稳定存在
  return (
    <div
      data-testid="review-diff-toolbar"
      data-review-mode="true"
      className={cn(
        "flex items-center gap-2 border-b border-border/60 bg-card/40 px-3 py-1.5 text-[11px]",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1 rounded-md border border-foreground/30 bg-background/80 px-1.5 py-0.5 font-medium text-foreground">
        <EyeIcon className="size-3" />
        <span>代码审查</span>
      </span>

      <span
        className="text-muted-foreground"
        data-testid="review-diff-toolbar-file-count"
      >
        {fileCount} 个文件
      </span>

      {diffStats && hasNonZeroStat(diffStats) ? (
        <DiffStatLabel
          additions={diffStats.additions}
          deletions={diffStats.deletions}
          className="text-[11px]"
        />
      ) : null}

      <span
        className="text-muted-foreground"
        data-testid="review-diff-toolbar-decisions"
      >
        <span className="text-emerald-500">+{stats.accept}</span>
        <span className="mx-1">/</span>
        <span className="text-rose-500">-{stats.reject}</span>
      </span>

      {/* 进度条：显示已决策 / 总 hunk 数 + 百分比 */}
      {progress.totalHunks > 0 ? (
        <div
          className="flex items-center gap-1.5"
          data-testid="review-diff-toolbar-progress"
          data-progress-percent={progress.progressPercent}
          data-is-complete={progress.isComplete ? "true" : "false"}
        >
          <div
            className="h-1.5 w-20 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress.progressPercent)}
            aria-label="审查进度"
          >
            <div
              className={cn(
                "h-full transition-[width] duration-200 ease-linear",
                progress.isComplete ? "bg-emerald-500" : "bg-primary",
              )}
              style={{ width: `${progress.progressPercent}%` }}
            />
          </div>
          <span
            className="tabular-nums text-muted-foreground"
            data-testid="review-diff-toolbar-progress-text"
          >
            {formatReviewProgressLine(progress)}
          </span>
        </div>
      ) : null}

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {onJumpToNextUndecided ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={handleJumpToNextUndecided}
            disabled={progress.totalHunks === 0}
            data-testid="review-diff-toolbar-jump-next"
            title="跳转到下一个未决策 hunk"
            className="h-6 gap-1 px-2 text-[11px]"
          >
            <ChevronRightIcon className="size-3" />
            <span>下一未决策</span>
          </Button>
        ) : null}
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={handleAcceptAll}
          disabled={fileCount === 0}
          data-testid="review-diff-toolbar-accept-all"
          title="把所有 hunks 标记为接受"
          className="h-6 gap-1 px-2 text-[11px]"
        >
          <CheckIcon className="size-3 text-emerald-500" />
          <span>全部接受</span>
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={handleRejectAll}
          disabled={fileCount === 0}
          data-testid="review-diff-toolbar-reject-all"
          title="把所有 hunks 标记为拒绝"
          className="h-6 gap-1 px-2 text-[11px]"
        >
          <XIcon className="size-3 text-rose-500" />
          <span>全部拒绝</span>
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={handleClear}
          disabled={stats.total === 0}
          data-testid="review-diff-toolbar-clear"
          title="清空所有 accept/reject 标记"
          className="h-6 px-2 text-[11px]"
        >
          清空
        </Button>
        <Button
          type="button"
          size="xs"
          variant="default"
          onClick={() => {
            void handleApply();
          }}
          disabled={isApplying || stats.accept === 0 || !activeCwd}
          data-testid="review-diff-toolbar-apply"
          title="应用已接受的 hunks 到工作树"
          className="h-6 gap-1 px-2 text-[11px]"
        >
          <CheckIcon className="size-3" />
          <span>{isApplying ? "应用中..." : "应用接受"}</span>
        </Button>
      </div>
    </div>
  );
}
