/**
 * @file 任务活动侧栏
 *
 * 本组件展示 AI 当前任务的 3 级树形结构：
 *
 * - **根任务（Turn）**：一次完整的对话轮次
 *   - **子任务（工具调用）**：Bash/Read/Write 等
 *     - **子子任务（文件操作）**：具体的文件读写
 *
 * ## 核心导出
 *
 * - `TaskSidebar`：侧栏组件
 *
 * ## 使用场景
 *
 * - ChatView 右侧抽屉
 * - 实时显示 AI 执行进度
 *
 * ## 注意事项
 *
 * - 默认折叠，运行时自动展开
 * - 宽度 320px
 * - 复用 ActiveTaskListCard 作为顶部摘要
 */

import { memo, useMemo } from "react";
import { PiSidebarSimple, PiX } from "react-icons/pi";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { cn } from "~/lib/utils";
import { useTurnTaskTree, type TaskNode } from "~/hooks/useTurnTaskTree";
import type { ActiveTaskListState } from "~/session-logic";
import { ActiveTaskListCard } from "./ActiveTaskListCard";
import { LoaderIcon, CheckIcon, XIcon } from "~/lib/icons";
import type { ThreadId } from "~/contracts";

interface TaskSidebarProps {
  /** 线程 ID */
  threadId: string;
  /** 是否打开 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 活跃任务列表 */
  activeTaskList: ActiveTaskListState;
  /** 后台任务数 */
  backgroundTaskCount?: number;
  /** 是否紧凑模式 */
  compact?: boolean;
  /** 紧凑模式切换回调 */
  onCompactChange?: (compact: boolean) => void;
}

/**
 * 任务节点渲染器
 */
function TaskNodeView({ node, depth = 0 }: { node: TaskNode; depth?: number }) {
  const statusIcon = useMemo(() => {
    if (node.status === "running") {
      return <LoaderIcon className="size-3 animate-spin text-blue-500" />;
    }
    if (node.status === "completed") {
      return <CheckIcon className="size-3 text-green-500" />;
    }
    if (node.status === "failed") {
      return <XIcon className="size-3 text-red-500" />;
    }
    return null;
  }, [node.status]);

  const elapsed = useMemo(() => {
    if (!node.endTime) return null;
    const duration = node.endTime - node.startTime;
    if (duration < 1000) return `${duration}ms`;
    return `${(duration / 1000).toFixed(1)}s`;
  }, [node.startTime, node.endTime]);

  return (
    <div className={cn("space-y-1", depth > 0 && "ml-4 border-l border-border pl-2")}>
      <div className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/50">
        {statusIcon}
        <span className="flex-1 truncate">{node.label}</span>
        {elapsed && <span className="text-muted-foreground text-[10px]">{elapsed}</span>}
      </div>
      {node.children.length > 0 && (
        <div className="space-y-1">
          {node.children.map((child) => (
            <TaskNodeView key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 任务活动侧栏
 */
export const TaskSidebar = memo(function TaskSidebar({
  threadId,
  isOpen,
  onClose,
  activeTaskList,
  backgroundTaskCount = 0,
  compact = false,
  onCompactChange,
}: TaskSidebarProps) {
  const taskTree = useTurnTaskTree(threadId as ThreadId, isOpen);

  if (!isOpen) return null;

  const hasActiveTasks = activeTaskList.tasks.length > 0;
  const hasTaskTree = taskTree.length > 0;

  return (
    <div className="flex h-full w-80 flex-col border-l border-border bg-background">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <PiSidebarSimple className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">任务进度</span>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="关闭侧栏">
          <PiX className="size-4" />
        </Button>
      </div>

      {/* 内容 */}
      <ScrollArea className="flex-1">
        <div className="space-y-3 p-3">
          {/* 活跃任务摘要 */}
          {hasActiveTasks && (
            <ActiveTaskListCard
              activeTaskList={activeTaskList}
              backgroundTaskCount={backgroundTaskCount}
              compact={compact}
              onCompactChange={onCompactChange ?? (() => {})}
              onOpenSidebar={() => {}}
            />
          )}

          {/* 任务树 */}
          {hasTaskTree && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground">执行详情</h3>
              {taskTree.map((node) => (
                <TaskNodeView key={node.id} node={node} />
              ))}
            </div>
          )}

          {/* 空状态 */}
          {!hasActiveTasks && !hasTaskTree && (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
              <PiSidebarSimple className="size-8 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">暂无活跃任务</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
});
