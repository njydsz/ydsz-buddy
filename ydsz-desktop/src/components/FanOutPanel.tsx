/**
 * @file FanOutPanel.tsx
 * @description 并行 Worktree Fan-out 对比面板。
 *              展示同一 prompt 在多个并行 Agent 线程中的执行结果，支持横向对比。
 *
 * ## 核心能力
 *
 * 1. **并行展示**：以分栏布局展示所有 fan-out 子线程的最新输出
 * 2. **状态追踪**：实时显示每个子线程的运行状态（running / completed / error）
 * 3. **对比切换**：点击某栏切换到该线程的完整 ChatView
 * 4. **Diff 对比**：在子线程完成后，可选择两个子线程进行代码变更对比
 * 5. **结果采纳**：可将某个子线程的结果标记为"采纳"，自动合并回主线
 * 6. **耗时追踪**：展示每个子线程的执行耗时
 */

import { type ThreadId } from "@ydsz-buddy/contracts";
import { useCallback, useMemo, useState } from "react";

import { cn } from "~/lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import {
  BotIcon,
  CheckIcon,
  Loader2Icon,
  CircleAlertIcon,
  DiffIcon,
  StarIcon,
  ClockIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "~/lib/icons";

export interface FanOutChildThread {
  threadId: ThreadId;
  label: string;
  status: "running" | "completed" | "error" | "idle";
  modelLabel: string;
  latestMessagePreview: string;
  turnStatus?: string;
  /** 执行耗时（毫秒），running 时为已运行时间 */
  elapsedMs?: number;
  /** 变更文件数（completed 时可用） */
  changedFiles?: number;
  /** 变更行数统计（+additions / -deletions） */
  additions?: number;
  deletions?: number;
}

export interface FanOutPanelProps {
  /** 源线程 ID */
  sourceThreadId: ThreadId;
  /** 发送给所有并行 Agent 的 prompt */
  prompt: string;
  /** 子线程列表 */
  children: FanOutChildThread[];
  /** 点击某个子线程时触发（导航到该线程） */
  onSelectChild?: (threadId: ThreadId) => void;
  /** 对比两个子线程的 diff */
  onCompareDiffs?: (threadIdA: ThreadId, threadIdB: ThreadId) => void;
  /** 采纳某个子线程的结果 */
  onPromoteChild?: (threadId: ThreadId) => void;
  className?: string;
}

function formatElapsed(ms?: number): string {
  if (!ms || ms < 0) return "";
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1_000);
  return `${m}m${s}s`;
}

/**
 * 并行 Fan-out 对比面板
 *
 * 以横向分栏布局展示所有子线程的执行状态和最新输出预览。
 * 用户可以快速对比不同模型/配置的 Agent 输出结果。
 */
export function FanOutPanel({
  sourceThreadId: _sourceThreadId,
  prompt,
  children,
  onSelectChild,
  onCompareDiffs,
  onPromoteChild,
  className,
}: FanOutPanelProps) {
  const runningCount = useMemo(
    () => children.filter((c) => c.status === "running").length,
    [children],
  );
  const completedCount = useMemo(
    () => children.filter((c) => c.status === "completed").length,
    [children],
  );
  const errorCount = useMemo(
    () => children.filter((c) => c.status === "error").length,
    [children],
  );

  // Diff 对比选择
  const [compareSelected, setCompareSelected] = useState<Set<ThreadId>>(new Set());
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [promotedId, setPromotedId] = useState<ThreadId | null>(null);

  const handleToggleCompare = useCallback((threadId: ThreadId) => {
    setCompareSelected((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) {
        next.delete(threadId);
      } else {
        if (next.size >= 2) {
          const first = next.values().next().value;
          if (first) next.delete(first);
        }
        next.add(threadId);
      }
      return next;
    });
  }, []);

  const handleCompare = useCallback(() => {
    if (compareSelected.size !== 2 || !onCompareDiffs) return;
    const [a, b] = Array.from(compareSelected);
    onCompareDiffs(a, b);
  }, [compareSelected, onCompareDiffs]);

  const handlePromote = useCallback(
    (threadId: ThreadId) => {
      setPromotedId(threadId);
      onPromoteChild?.(threadId);
    },
    [onPromoteChild],
  );

  return (
    <div
      className={cn("flex h-full flex-col bg-background", className)}
      data-testid="fanout-panel"
    >
      {/* 顶部：Fan-out 概览 */}
      <div
        className="flex items-center justify-between border-b border-border/60 px-4 py-2.5"
        data-testid="fanout-panel-header"
      >
        <div className="flex items-center gap-2">
          <BotIcon className="size-4 text-primary" />
          <span className="text-sm font-medium">Parallel Fan-out</span>
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            {children.length} agents
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {runningCount > 0 && (
            <Badge variant="default" className="gap-1 px-1.5 py-0 text-[10px]">
              <Loader2Icon className="size-2.5 animate-spin" />
              {runningCount} running
            </Badge>
          )}
          {completedCount > 0 && (
            <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-[10px]">
              <CheckIcon className="size-2.5" />
              {completedCount} done
            </Badge>
          )}
          {errorCount > 0 && (
            <Badge variant="destructive" className="gap-1 px-1.5 py-0 text-[10px]">
              <CircleAlertIcon className="size-2.5" />
              {errorCount} error
            </Badge>
          )}
          {onCompareDiffs && compareSelected.size === 2 && (
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={handleCompare}
              className="h-5 gap-1 px-1.5 text-[10px]"
              data-testid="fanout-panel-compare"
            >
              <DiffIcon className="size-3" />
              对比 Diff
            </Button>
          )}
        </div>
      </div>

      {/* Prompt 预览（可折叠） */}
      <div className="border-b border-border/40 bg-muted/20 px-4 py-2">
        <button
          type="button"
          onClick={() => setPromptExpanded((v) => !v)}
          className="flex w-full items-start gap-1 text-left"
        >
          <span className="text-[11px] text-muted-foreground break-all">
            <span className="font-medium">Prompt:</span>{" "}
            {promptExpanded
              ? prompt
              : `${prompt.slice(0, 200)}${prompt.length > 200 ? "…" : ""}`}
          </span>
          <span className="ml-auto shrink-0 pt-0.5 text-muted-foreground/60">
            {promptExpanded ? (
              <ChevronUpIcon className="size-3" />
            ) : (
              <ChevronDownIcon className="size-3" />
            )}
          </span>
        </button>
      </div>

      {/* 并行子线程分栏 */}
      <ScrollArea className="flex-1">
        <div
          className="flex gap-px overflow-x-auto bg-border/40"
          data-testid="fanout-panel-columns"
        >
          {children.map((child) => (
            <FanOutColumn
              key={child.threadId}
              child={child}
              onSelect={() => onSelectChild?.(child.threadId)}
              onToggleCompare={
                onCompareDiffs && child.status === "completed"
                  ? () => handleToggleCompare(child.threadId)
                  : undefined
              }
              isCompareSelected={compareSelected.has(child.threadId)}
              onPromote={
                onPromoteChild && child.status === "completed" && promotedId !== child.threadId
                  ? () => handlePromote(child.threadId)
                  : undefined
              }
              isPromoted={promotedId === child.threadId}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function FanOutColumn({
  child,
  onSelect,
  onToggleCompare,
  isCompareSelected,
  onPromote,
  isPromoted,
}: {
  child: FanOutChildThread;
  onSelect: () => void;
  onToggleCompare?: () => void;
  isCompareSelected: boolean;
  onPromote?: () => void;
  isPromoted: boolean;
}) {
  const statusIcon = {
    running: <Loader2Icon className="size-3 animate-spin text-primary" />,
    completed: <CheckIcon className="size-3 text-green-500" />,
    error: <CircleAlertIcon className="size-3 text-destructive" />,
    idle: <div className="size-3 rounded-full border border-muted-foreground/30" />,
  }[child.status];

  const statusLabel = {
    running: "Running",
    completed: "Completed",
    error: "Error",
    idle: "Idle",
  }[child.status];

  const borderClass = isCompareSelected
    ? "ring-2 ring-primary ring-inset"
    : isPromoted
      ? "ring-2 ring-amber-400 ring-inset"
      : "";

  return (
    <div
      className={cn("flex w-80 min-w-80 flex-col bg-background", borderClass)}
      data-testid={`fanout-column-${child.threadId}`}
    >
      {/* 子线程头部 */}
      <div className="flex items-center gap-1.5 border-b border-border/40 px-3 py-2">
        {statusIcon}
        <span className="truncate text-[12px] font-medium">{child.label}</span>
        <Badge variant="outline" className="ml-auto px-1.5 py-0 text-[10px]">
          {child.modelLabel}
        </Badge>
      </div>

      {/* 状态标签 + 耗时 + 变更统计 */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-1">
        <Badge
          variant={
            child.status === "completed"
              ? "secondary"
              : child.status === "error"
                ? "destructive"
                : "default"
          }
          className="px-1.5 py-0 text-[10px]"
        >
          {statusLabel}
        </Badge>
        {child.elapsedMs != null && child.elapsedMs > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <ClockIcon className="size-2.5" />
            {formatElapsed(child.elapsedMs)}
          </span>
        )}
        {child.changedFiles != null && child.changedFiles > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {child.changedFiles} 文件
          </span>
        )}
        {child.additions != null && child.deletions != null && (child.additions > 0 || child.deletions > 0) && (
          <span className="text-[10px]">
            <span className="text-green-500">+{child.additions}</span>
            <span className="mx-0.5 text-muted-foreground/50">/</span>
            <span className="text-red-500">-{child.deletions}</span>
          </span>
        )}
        {child.turnStatus && (
          <span className="text-[10px] text-muted-foreground/70 italic">
            {child.turnStatus}
          </span>
        )}
        {isPromoted && (
          <Badge className="gap-1 px-1.5 py-0 text-[10px] bg-amber-500/15 text-amber-600 border-amber-500/30">
            <StarIcon className="size-2.5" />
            已采纳
          </Badge>
        )}
      </div>

      {/* 最新消息预览 */}
      <div className="flex-1 px-3 py-2">
        <p className="line-clamp-6 text-[11px] leading-relaxed text-muted-foreground">
          {child.latestMessagePreview || "(waiting for output…)"}
        </p>
      </div>

      {/* 操作按钮 */}
      <div className="flex flex-col gap-1 border-t border-border/40 px-3 py-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onSelect}
          className="w-full text-[11px]"
          data-testid={`fanout-column-open-${child.threadId}`}
        >
          打开线程
        </Button>
        <div className="flex gap-1">
          {onToggleCompare && (
            <Button
              type="button"
              size="sm"
              variant={isCompareSelected ? "outline" : "ghost"}
              onClick={onToggleCompare}
              className="flex-1 text-[10px] h-6"
              data-testid={`fanout-column-compare-${child.threadId}`}
              title="选择此线程进行 Diff 对比"
            >
              <DiffIcon className="size-3" />
              {isCompareSelected ? "已选对比" : "对比"}
            </Button>
          )}
          {onPromote && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onPromote}
              className="flex-1 text-[10px] h-6 text-amber-600 hover:text-amber-700"
              data-testid={`fanout-column-promote-${child.threadId}`}
              title="采纳此线程的结果"
            >
              <StarIcon className="size-3" />
              采纳
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
