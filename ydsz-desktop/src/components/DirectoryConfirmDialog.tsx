/**
 * @file 目录拖入确认对话框
 *
 * C-6 文件夹拖入支持:当用户拖入目录时,弹出"包含 Y 个文件,是否全部提及?"
 * 确认框,提供三个选项:
 *
 * - **全部提及**:展开目录并把子文件注入 composer(默认行为)
 * - **仅提及目录**:只把目录名作为 mention,不展开子文件
 * - **取消**:丢弃所有条目
 *
 * ## 核心功能
 *
 * - **目录预览**:显示拖入的目录名(最多 N 个 + "等 X 个")
 * - **文件总数估算**:基于 maxDepth=1 估算将展开的文件数
 * - **深度控制**:支持"仅顶层 / 递归"切换
 *
 * ## 使用场景
 *
 * - 用户拖入文件夹到 composer
 * - `useEnhancedDragDrop.onDirectoriesDetected` 回调触发上层应用弹出此对话框
 *
 * ## 注意事项
 *
 * - 对话框触发条件:`dragState.directorySummary.count > 0`
 * - 真正的目录展开由上层应用调用 `expandDirectories(originalFiles, paths)` 完成
 */

import { memo, useState } from "react";
import { PiFolder, PiCheck, PiX, PiArrowsClockwise } from "react-icons/pi";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import type { DirectorySummary } from "~/lib/fileUtils";

/**
 * 展开深度选项
 */
export type DirectoryExpandDepth = "top" | "recursive";

interface DirectoryConfirmDialogProps {
  /** 是否打开 */
  isOpen: boolean;
  /** 目录汇总信息(来自 dragState.directorySummary) */
  directories: DirectorySummary;
  /** 全部提及 - 触发上层应用展开目录并把结果通过 onFilesDrop 投递 */
  onExpandAll: (depth: DirectoryExpandDepth) => void | Promise<void>;
  /** 仅提及目录名 - 把目录名作为 mention,展开空操作 */
  onMentionFolderOnly: () => void;
  /** 取消 */
  onCancel: () => void;
}

const MAX_VISIBLE_DIRECTORIES = 3;

/**
 * 目录拖入确认对话框
 */
export const DirectoryConfirmDialog = memo(function DirectoryConfirmDialog({
  isOpen,
  directories,
  onExpandAll,
  onMentionFolderOnly,
  onCancel,
}: DirectoryConfirmDialogProps) {
  const [depth, setDepth] = useState<DirectoryExpandDepth>("top");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || directories.count === 0) return null;

  const visibleNames = directories.names.slice(0, MAX_VISIBLE_DIRECTORIES);
  const hiddenCount = directories.names.length - visibleNames.length;

  const handleExpandAll = async () => {
    setIsSubmitting(true);
    try {
      await onExpandAll(depth);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      data-testid="directory-confirm-dialog"
      data-directory-count={directories.count}
    >
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        {/* 头部 */}
        <div className="mb-5 flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-sky-500/10">
            <PiFolder className="size-6 text-sky-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">检测到 {directories.count} 个文件夹</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              是否把它们的内容全部作为提及发送给 AI？
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onCancel}
            aria-label="关闭"
            disabled={isSubmitting}
          >
            <PiX className="size-4" />
          </Button>
        </div>

        {/* 目录列表 */}
        <div className="mb-5 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">拖入的目录</p>
          <div className="flex flex-wrap gap-1.5" data-testid="directory-confirm-list">
            {visibleNames.map((name) => (
              <Badge key={name} variant="secondary" className="gap-1 px-2 py-1">
                <PiFolder className="size-3" />
                {name}
              </Badge>
            ))}
            {hiddenCount > 0 && (
              <Badge variant="outline" className="px-2 py-1 text-xs">
                等 {hiddenCount} 个
              </Badge>
            )}
          </div>
        </div>

        {/* 展开深度选择 */}
        <div className="mb-5 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">展开范围</p>
          <div
            className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1"
            data-testid="directory-confirm-depth"
            data-depth={depth}
          >
            <button
              type="button"
              onClick={() => setDepth("top")}
              disabled={isSubmitting}
              className={
                "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors " +
                (depth === "top"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              仅顶层
            </button>
            <button
              type="button"
              onClick={() => setDepth("recursive")}
              disabled={isSubmitting}
              className={
                "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors " +
                (depth === "recursive"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              递归
            </button>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex flex-col gap-2">
          <Button
            onClick={() => void handleExpandAll()}
            disabled={isSubmitting}
            data-testid="directory-confirm-expand"
            className="w-full"
          >
            <PiCheck className="mr-1 size-4" />
            全部展开并提及
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={onMentionFolderOnly}
              disabled={isSubmitting}
              data-testid="directory-confirm-folder-only"
            >
              <PiArrowsClockwise className="mr-1 size-3" />
              仅目录名
            </Button>
            <Button
              variant="ghost"
              onClick={onCancel}
              disabled={isSubmitting}
              data-testid="directory-confirm-cancel"
            >
              <PiX className="mr-1 size-3" />
              取消
            </Button>
          </div>
        </div>

        <p className="mt-4 text-[11px] text-muted-foreground">
          提示:超过 1000 个文件的目录可能影响 AI 响应速度,建议先压缩范围。
        </p>
      </div>
    </div>
  );
});
