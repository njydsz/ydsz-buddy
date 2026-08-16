/**
 * @file Composer 运行状态行组件
 *
 * 本组件在 Composer 输入时实时显示 AI 执行状态：
 *
 * - **状态显示**：正在规划/正在调用工具/已读取文件等
 * - **耗时统计**：每个步骤的耗时
 * - **长耗时提示**：步骤 > 3s 时提示"耗时较长，可点击查看"
 * - **可点击**：点击跳转到详细任务侧栏
 *
 * ## 核心导出
 *
 * - `ComposerRunningStatusLine`：状态行组件
 * - `useRunningStatus`：状态订阅 Hook
 *
 * ## 使用场景
 *
 * - Composer 底部状态栏
 * - 实时反馈 AI 执行进度
 *
 * ## 注意事项
 *
 * - 仅在 AI 运行时显示
 * - 订阅 `thread.activity-appended` 事件
 * - 自动隐藏完成的步骤
 */

import { memo, useEffect, useState } from "react";
import { LoaderIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import { readNativeApi } from "~/nativeApi";
import type { OrchestrationEvent, ThreadId } from "~/contracts";

/** 运行状态项 */
interface RunningStatusItem {
  /** 状态标签 */
  label: string;
  /** 开始时间 */
  startTime: number;
  /** 当前耗时（毫秒） */
  elapsed: number;
  /** 是否完成 */
  completed: boolean;
}

interface ComposerRunningStatusLineProps {
  /** 线程 ID */
  threadId: ThreadId;
  /** 是否有活跃 Turn */
  hasLiveTurn: boolean;
  /** 点击回调 */
  onClick?: () => void;
}

/**
 * 从事件中提取状态标签
 */
function extractStatusLabel(event: OrchestrationEvent): string | null {
  const payload = event.payload as Record<string, unknown>;
  const type = event.type;

  switch (type) {
    case "thread.turn-start-requested":
      return "正在规划…";
    case "thread.activity-appended": {
      const activity = payload.activity as { label?: string; kind?: string } | null;
      if (activity?.label) {
        return activity.label;
      }
      return null;
    }
    case "thread.tool-call-started": {
      const toolName = payload.toolName as string | undefined;
      return toolName ? `正在调用 ${toolName}…` : "正在调用工具…";
    }
    case "thread.file-read": {
      const fileCount = payload.fileCount as number | undefined;
      return fileCount ? `已读取 ${fileCount} 个文件` : "正在读取文件…";
    }
    case "thread.diff-generated":
      return "正在生成 diff…";
    case "thread.commit-created":
      return "正在提交…";
    default:
      return null;
  }
}

/**
 * 格式化耗时
 */
function formatElapsed(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Composer 运行状态行
 */
export const ComposerRunningStatusLine = memo(function ComposerRunningStatusLine({
  threadId,
  hasLiveTurn,
  onClick,
}: ComposerRunningStatusLineProps) {
  const [currentStatus, setCurrentStatus] = useState<RunningStatusItem | null>(null);

  useEffect(() => {
    if (!hasLiveTurn) {
      setCurrentStatus(null);
      return;
    }

    const api = readNativeApi();
    if (!api) return;

    // 订阅实时事件
    const unsubscribe = api.orchestration.onDomainEvent((event) => {
      if (event.aggregateId !== threadId) return;

      const label = extractStatusLabel(event);
      if (!label) return;

      const now = Date.now();
      setCurrentStatus((prev) => {
        // 如果上一个状态未完成，标记为完成
        if (prev && !prev.completed) {
          prev.completed = true;
        }

        return {
          label,
          startTime: now,
          elapsed: 0,
          completed: false,
        };
      });
    });

    return unsubscribe;
  }, [threadId, hasLiveTurn]);

  // 更新耗时
  useEffect(() => {
    if (!currentStatus || currentStatus.completed) return;

    const interval = setInterval(() => {
      setCurrentStatus((prev) => {
        if (!prev || prev.completed) return prev;
        return {
          ...prev,
          elapsed: Date.now() - prev.startTime,
        };
      });
    }, 100);

    return () => clearInterval(interval);
  }, [currentStatus]);

  // 不显示的条件
  if (!hasLiveTurn || !currentStatus || currentStatus.completed) {
    return null;
  }

  const isLongRunning = currentStatus.elapsed > 3000;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 border-t border-(--color-border-light) bg-(--color-background-surface-under) px-3 py-1.5 text-left text-[11px] text-(--color-text-foreground-secondary) transition-colors",
        onClick && "hover:bg-(--color-background-button-secondary-hover)",
      )}
    >
      <LoaderIcon className="size-3 shrink-0 animate-spin" />
      <span className="min-w-0 flex-1 truncate">
        {currentStatus.label}
      </span>
      <span className="shrink-0 tabular-nums text-(--color-text-foreground-tertiary)">
        {formatElapsed(currentStatus.elapsed)}
      </span>
      {isLongRunning && (
        <span className="shrink-0 text-(--color-warning-foreground)">
          耗时较长，可点击查看
        </span>
      )}
    </button>
  );
});

/**
 * 运行状态订阅 Hook
 */
export function useRunningStatus(threadId: ThreadId, hasLiveTurn: boolean) {
  const [status, setStatus] = useState<RunningStatusItem | null>(null);

  useEffect(() => {
    if (!hasLiveTurn) {
      setStatus(null);
      return;
    }

    const api = readNativeApi();
    if (!api) return;

    const unsubscribe = api.orchestration.onDomainEvent((event) => {
      if (event.aggregateId !== threadId) return;

      const label = extractStatusLabel(event);
      if (!label) return;

      const now = Date.now();
      setStatus({
        label,
        startTime: now,
        elapsed: 0,
        completed: false,
      });
    });

    return unsubscribe;
  }, [threadId, hasLiveTurn]);

  // 更新耗时
  useEffect(() => {
    if (!status || status.completed) return;

    const interval = setInterval(() => {
      setStatus((prev) => {
        if (!prev || prev.completed) return prev;
        return {
          ...prev,
          elapsed: Date.now() - prev.startTime,
        };
      });
    }, 100);

    return () => clearInterval(interval);
  }, [status]);

  return status;
}
