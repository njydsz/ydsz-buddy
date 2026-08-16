/**
 * @file 崩溃恢复对话框
 *
 * 检测到未完成的任务时弹出恢复对话框，提供三个选项：
 * - 继续：恢复中断的任务
 * - 取消：放弃中断的任务
 * - 查看断点：查看中断时的状态
 *
 * ## 核心功能
 *
 * - **任务列表**：显示所有未完成的任务
 * - **恢复选项**：继续/取消/查看断点
 * - **任务详情**：显示任务摘要、中断时间
 * - **批量操作**：可批量取消所有任务
 *
 * ## 使用场景
 *
 * - 应用启动时检测到中断任务
 * - 用户强制关闭后重启
 * - 断电/崩溃后恢复
 *
 * ## 注意事项
 *
 * - 对话框只在有未完成任务时显示
 * - 恢复前需要用户确认
 * - 取消操作不可撤销
 */

import { memo, useState } from "react";
import { PiWarning, PiPlay, PiX, PiEye } from "react-icons/pi";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Badge } from "./ui/badge";
import { cn } from "~/lib/utils";
import type { TurnCheckpoint } from "~/hooks/useCrashRecovery";

interface CrashRecoveryDialogProps {
  /** 是否打开 */
  isOpen: boolean;
  /** 未完成的任务列表 */
  checkpoints: TurnCheckpoint[];
  /** 恢复回调 */
  onResume: (checkpoint: TurnCheckpoint) => Promise<void>;
  /** 取消回调 */
  onCancel: (checkpoint: TurnCheckpoint) => Promise<void>;
  /** 查看断点回调 */
  onInspect: (checkpoint: TurnCheckpoint) => Promise<void>;
  /** 关闭回调 */
  onClose: () => void;
}

/**
 * 格式化时间
 */
function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "刚刚";
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  return `${diffDays} 天前`;
}

/**
 * 崩溃恢复对话框
 */
export const CrashRecoveryDialog = memo(function CrashRecoveryDialog({
  isOpen,
  checkpoints,
  onResume,
  onCancel,
  onInspect,
  onClose,
}: CrashRecoveryDialogProps) {
  const [loadingTurnId, setLoadingTurnId] = useState<string | null>(null);

  if (!isOpen || checkpoints.length === 0) return null;

  const handleResume = async (checkpoint: TurnCheckpoint) => {
    setLoadingTurnId(checkpoint.turnId);
    try {
      await onResume(checkpoint);
    } finally {
      setLoadingTurnId(null);
    }
  };

  const handleCancel = async (checkpoint: TurnCheckpoint) => {
    setLoadingTurnId(checkpoint.turnId);
    try {
      await onCancel(checkpoint);
    } finally {
      setLoadingTurnId(null);
    }
  };

  const handleInspect = async (checkpoint: TurnCheckpoint) => {
    setLoadingTurnId(checkpoint.turnId);
    try {
      await onInspect(checkpoint);
    } finally {
      setLoadingTurnId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      data-testid="crash-recovery-dialog"
    >
      <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl">
        {/* 头部 */}
        <div className="mb-6 flex items-start gap-4">
          <div className="flex size-12 items-center justify-center rounded-full bg-warning/10">
            <PiWarning className="size-6 text-warning" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-semibold">检测到未完成的任务</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              上次使用时有 {checkpoints.length} 个任务中断，是否恢复？
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="关闭">
            <PiX className="size-4" />
          </Button>
        </div>

        {/* 任务列表 */}
        <ScrollArea className="max-h-96">
          <div className="space-y-3">
            {checkpoints.map((checkpoint) => {
              const isLoading = loadingTurnId === checkpoint.turnId;
              return (
                <div
                  key={checkpoint.turnId}
                  className="rounded-lg border border-border bg-muted/30 p-4"
                >
                  <div className="mb-2 flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {checkpoint.summary || `任务 ${checkpoint.turnId.slice(0, 8)}`}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            checkpoint.status === "running" && "border-blue-500/50 text-blue-600",
                            checkpoint.status === "paused" && "border-yellow-500/50 text-yellow-600",
                            checkpoint.status === "failed" && "border-red-500/50 text-red-600",
                            checkpoint.status === "completed" && "border-green-500/50 text-green-600",
                            checkpoint.status === "cancelled" && "border-gray-500/50 text-gray-600",
                            checkpoint.status === "resuming" && "border-purple-500/50 text-purple-600",
                          )}
                        >
                          {checkpoint.status === "running" && "运行中"}
                          {checkpoint.status === "paused" && "已暂停"}
                          {checkpoint.status === "failed" && "已失败"}
                          {checkpoint.status === "completed" && "已完成"}
                          {checkpoint.status === "cancelled" && "已取消"}
                          {checkpoint.status === "resuming" && "恢复中"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        中断于 {formatTimeAgo(checkpoint.updatedAt)}
                      </p>
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => void handleResume(checkpoint)}
                      disabled={isLoading}
                    >
                      <PiPlay className="mr-1 size-3" />
                      继续
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleInspect(checkpoint)}
                      disabled={isLoading}
                    >
                      <PiEye className="mr-1 size-3" />
                      查看断点
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleCancel(checkpoint)}
                      disabled={isLoading}
                      className="text-destructive hover:bg-destructive/10"
                    >
                      <PiX className="mr-1 size-3" />
                      取消
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* 底部操作 */}
        <div className="mt-6 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            超过 7 天的任务将自动清理
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>
              稍后处理
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});
