/**
 * @file ProposedPlanActions.tsx
 * @description 提议计划的操作按钮组，提供下载到 .plan 目录、导出为 Markdown 文件和复制到剪贴板三种操作。
 */

import { memo, useMemo, useState, type ReactNode } from "react";
import {
  buildProposedPlanMarkdownFilename,
  normalizePlanMarkdownForExport,
} from "../../proposedPlan";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { ArrowDownIcon, ArrowUpIcon, CopyIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import { readNativeApi } from "~/nativeApi";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/** 计划操作按钮的视觉变体 */
type PlanActionVariant = "outline" | "ghost";

/**
 * ProposedPlanActions 组件的属性接口
 */
interface ProposedPlanActionsProps {
  /** 计划的 Markdown 文本 */
  planMarkdown: string;
  /** 工作区根路径 */
  workspaceRoot: string | undefined;
  /** 按钮变体样式 */
  variant?: PlanActionVariant;
  /** 容器类名 */
  className?: string;
  /** 按钮类名 */
  buttonClassName?: string;
  /** 图标类名 */
  iconClassName?: string;
}

/**
 * ProposedPlanActions 组件
 * @description 提议计划的操作按钮组，提供下载、导出和复制三种操作
 * @param props.planMarkdown - 计划的 Markdown 文本
 * @param props.workspaceRoot - 工作区根路径
 * @param props.variant - 按钮变体样式
 * @param props.className - 容器类名
 * @param props.buttonClassName - 按钮类名
 * @param props.iconClassName - 图标类名
 */
export const ProposedPlanActions = memo(function ProposedPlanActions({
  planMarkdown,
  workspaceRoot,
  variant = "outline",
  className,
  buttonClassName,
  iconClassName,
}: ProposedPlanActionsProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const filename = useMemo(() => buildProposedPlanMarkdownFilename(planMarkdown), [planMarkdown]);
  const markdown = useMemo(() => normalizePlanMarkdownForExport(planMarkdown), [planMarkdown]);
  const { copyToClipboard, isCopied } = useCopyToClipboard<void>({
    onCopy: () => {
      toastManager.add({ type: "success", title: "Plan copied as markdown" });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Could not copy plan",
        description: error.message,
      });
    },
  });

  const handleCopy = () => {
    copyToClipboard(markdown, undefined);
  };

  const handleDownload = () => {
    const api = readNativeApi();
    if (!api || !workspaceRoot) {
      toastManager.add({
        type: "error",
        title: "Workspace path is unavailable",
        description: "This thread does not have a workspace path to download into.",
      });
      return;
    }

    setIsDownloading(true);
    void api.projects
      .writeFile({
        cwd: workspaceRoot,
        relativePath: `.plan/${filename}`,
        contents: markdown,
      })
      .then((result) => {
        toastManager.add({
          type: "success",
          title: "Plan downloaded",
          description: result.relativePath,
        });
      })
      .catch((error) => {
        toastManager.add({
          type: "error",
          title: "Could not download plan",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      })
      .finally(() => setIsDownloading(false));
  };

  const handleExport = () => {
    const api = readNativeApi();
    if (!api) return;

    if (!api.dialogs.saveFile) {
      toastManager.add({
        type: "error",
        title: "Export is unavailable",
        description: "Exporting plans requires the desktop app.",
      });
      return;
    }

    setIsExporting(true);
    void api.dialogs
      .saveFile({
        defaultFilename: filename,
        contents: markdown,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      })
      .then((filePath) => {
        if (!filePath) return;
        toastManager.add({
          type: "success",
          title: "Plan exported",
          description: filePath,
        });
      })
      .catch((error) => {
        toastManager.add({
          type: "error",
          title: "Could not export plan",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      })
      .finally(() => setIsExporting(false));
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <PlanActionButton
        label="Download to .plan folder"
        onClick={handleDownload}
        variant={variant}
        className={buttonClassName}
        busy={isDownloading}
      >
        <ArrowDownIcon className={cn("size-3.5", iconClassName)} />
      </PlanActionButton>
      <PlanActionButton
        label="Export markdown file"
        onClick={handleExport}
        variant={variant}
        className={buttonClassName}
        busy={isExporting}
      >
        <ArrowUpIcon className={cn("size-3.5", iconClassName)} />
      </PlanActionButton>
      <PlanActionButton
        label={isCopied ? "Copied" : "Copy as markdown"}
        onClick={handleCopy}
        variant={variant}
        className={buttonClassName}
      >
        <CopyIcon className={cn("size-3.5", iconClassName)} />
      </PlanActionButton>
    </div>
  );
});

/** 计划操作按钮子组件，封装工具提示和加载状态 */
function PlanActionButton({
  label,
  onClick,
  variant,
  className,
  busy = false,
  children,
}: {
  label: string;
  onClick: () => void;
  variant: PlanActionVariant;
  className: string | undefined;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className={cn("shrink-0", className)}
            disabled={busy}
            size="icon-xs"
            variant={variant}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup>{label}</TooltipPopup>
    </Tooltip>
  );
}
