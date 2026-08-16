/**
 * @file 失败任务队列组件
 *
 * 本组件展示失败的 AI 任务列表，提供重试和查看详情功能。
 *
 * ## 核心功能
 *
 * - **失败列表**：显示最近 10 条失败任务
 * - **类型标签**：按错误类型分类（网络/超时/权限/限流/未知）
 * - **重试按钮**：将失败任务加入重试队列
 * - **清空按钮**：清空所有失败记录
 *
 * ## 使用场景
 *
 * - TaskSidebar 底部区域
 * - Composer 上方失败提示条
 *
 * ## 注意事项
 *
 * - 失败任务按时间倒序排列
 * - 每种类型使用不同颜色标签
 * - 重试后自动从队列中移除
 */

import { memo } from "react";
import { PiWarningCircle, PiTrash, PiArrowClockwise } from "react-icons/pi";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Badge } from "../ui/badge";
import { cn } from "~/lib/utils";
import type { TurnId } from "~/contracts";
import type { FailedTask, FailureStats, FailureType } from "~/hooks/useFailedTasks";

interface FailedTaskQueueProps {
  /** 失败任务列表 */
  failedTasks: FailedTask[];
  /** 统计信息 */
  stats: FailureStats;
  /** 重试队列 */
  retryQueue: TurnId[];
  /** 重试进度映射（turnId → { attempt, maxRetries }） */
  retryAttemptsMap?: Record<string, { attempt: number; maxRetries: number }>;
  /** 加入重试队列回调 */
  onEnqueueRetry: (turnId: TurnId) => void;
  /** 移出重试队列回调 */
  onDequeueRetry: (turnId: TurnId) => void;
  /** 清空回调 */
  onClear: () => void;
  /** 是否紧凑模式 */
  compact?: boolean;
}

/** 失败类型标签配置 */
const FAILURE_TYPE_CONFIG: Record<FailureType, { label: string; className: string }> = {
  network: { label: "网络", className: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  timeout: { label: "超时", className: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
  permission: { label: "权限", className: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
  "rate-limit": { label: "限流", className: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
  unknown: { label: "未知", className: "bg-gray-500/10 text-gray-500 border-gray-500/20" },
};

/**
 * 失败任务项
 */
const FailedTaskItem = memo(function FailedTaskItem({
  task,
  isRetrying,
  onRetry,
  compact,
  retryAttempt,
  maxRetries,
}: {
  task: FailedTask;
  isRetrying: boolean;
  onRetry: () => void;
  compact?: boolean;
  /** 已自动重试次数（0 表示尚未自动重试） */
  retryAttempt?: number;
  /** 最大重试次数 */
  maxRetries?: number;
}) {
  const config = FAILURE_TYPE_CONFIG[task.type];
  const timeStr = new Date(task.timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const hasRetryInfo = retryAttempt !== undefined && retryAttempt > 0 && maxRetries !== undefined;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/30 p-2">
      <PiWarningCircle className="mt-0.5 size-4 shrink-0 text-red-500" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", config.className)}>
            {config.label}
          </Badge>
          <span className="text-[10px] text-muted-foreground">{timeStr}</span>
          {hasRetryInfo && isRetrying && (
            <span className="text-[10px] text-amber-500 font-medium">
              已自动尝试 {retryAttempt}/{maxRetries}
            </span>
          )}
          {hasRetryInfo && !isRetrying && retryAttempt >= maxRetries && (
            <span className="text-[10px] text-destructive font-medium">
              已试 {retryAttempt}/{maxRetries} 次，需手动接管
            </span>
          )}
        </div>
        {!compact && (
          <p className="truncate text-xs text-foreground/80" title={task.message}>
            {task.message}
          </p>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onRetry}
        disabled={isRetrying && hasRetryInfo && retryAttempt >= maxRetries}
        aria-label="重试"
        className="shrink-0"
      >
        <PiArrowClockwise className={cn("size-3", isRetrying && "animate-spin")} />
      </Button>
    </div>
  );
});

/**
 * 失败任务队列组件
 */
export const FailedTaskQueue = memo(function FailedTaskQueue({
  failedTasks,
  stats,
  retryQueue,
  retryAttemptsMap = {},
  onEnqueueRetry,
  onDequeueRetry,
  onClear,
  compact = false,
}: FailedTaskQueueProps) {
  if (failedTasks.length === 0) return null;

  const totalRetrying = retryQueue.filter((id) => retryAttemptsMap[id]?.attempt ?? 0 > 0).length;

  return (
    <div className="space-y-2">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PiWarningCircle className="size-4 text-red-500" />
          <span className="text-xs font-medium">失败任务</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {stats.total}
          </Badge>
          {totalRetrying > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-500 border-amber-500/20">
              重试中 {totalRetrying}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onClear}
          aria-label="清空失败记录"
        >
          <PiTrash className="size-3" />
        </Button>
      </div>

      {/* 统计摘要 */}
      {!compact && (
        <div className="flex flex-wrap gap-1">
          {stats.byType.network > 0 && (
            <Badge variant="outline" className={FAILURE_TYPE_CONFIG.network.className + " text-[10px]"}>
              网络 {stats.byType.network}
            </Badge>
          )}
          {stats.byType.timeout > 0 && (
            <Badge variant="outline" className={FAILURE_TYPE_CONFIG.timeout.className + " text-[10px]"}>
              超时 {stats.byType.timeout}
            </Badge>
          )}
          {stats.byType.permission > 0 && (
            <Badge variant="outline" className={FAILURE_TYPE_CONFIG.permission.className + " text-[10px]"}>
              权限 {stats.byType.permission}
            </Badge>
          )}
          {stats.byType["rate-limit"] > 0 && (
            <Badge variant="outline" className={FAILURE_TYPE_CONFIG["rate-limit"].className + " text-[10px]"}>
              限流 {stats.byType["rate-limit"]}
            </Badge>
          )}
          {stats.byType.unknown > 0 && (
            <Badge variant="outline" className={FAILURE_TYPE_CONFIG.unknown.className + " text-[10px]"}>
              未知 {stats.byType.unknown}
            </Badge>
          )}
        </div>
      )}

      {/* 失败列表 */}
      <ScrollArea className="max-h-48">
        <div className="space-y-1.5">
          {failedTasks.map((task) => {
            const retryInfo = retryAttemptsMap[task.turnId];
            return (
              <FailedTaskItem
                key={task.turnId}
                task={task}
                isRetrying={retryQueue.includes(task.turnId)}
                onRetry={() => {
                  if (retryQueue.includes(task.turnId)) {
                    onDequeueRetry(task.turnId);
                  } else {
                    onEnqueueRetry(task.turnId);
                  }
                }}
                compact={compact}
                retryAttempt={retryInfo?.attempt}
                maxRetries={retryInfo?.maxRetries}
              />
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
});
