/**
 * @file 提议计划操作组件
 *
 * 本组件展示对 AI 提议的计划（Plan）的可执行操作：
 *
 * - **接受计划**：切换为 Build 模式继续执行
 * - **修改计划**：在 Composer 中编辑
 * - **导出计划**：保存为 Markdown 文件（支持 spec.md / plan.md 两种格式）
 * - **拒绝计划**：放弃并说明原因
 *
 * ## 核心导出
 *
 * - `ProposedPlanActions`：操作按钮组
 * - `buildProposedPlanMarkdownFilename`：生成导出文件名
 *
 * ## 使用场景
 *
 * - ProposedPlanCard 卡片底部
 * - Composer 上方的"接受计划"提示
 *
 * ## 注意事项
 *
 * - 接受计划后自动从 Plan 模式切换为 Build 模式
 * - 导出文件名包含线程标题
 * - 拒绝需要用户输入原因
 * - 支持导出为 spec.md（规范文档）和 plan.md（执行计划）两种格式
 */

import { memo, useMemo, useState, type ReactNode } from "react";
import {
  buildProposedPlanMarkdownFilename,
  normalizePlanMarkdownForExport,
} from "../../proposedPlan";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { ArrowDownIcon, ArrowUpIcon, CopyIcon, FileIcon, FileTextIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import { readNativeApi } from "~/nativeApi";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { invoke } from "@tauri-apps/api/core";
import { exportSlidesAsPptx, planMarkdownToSlides } from "~/lib/officePptxExport";

type PlanActionVariant = "outline" | "ghost";

/** 导出格式类型 */
type PlanExportFormat = "spec" | "plan" | "markdown";

interface ProposedPlanActionsProps {
  planMarkdown: string;
  workspaceRoot: string | undefined;
  threadId?: string;
  variant?: PlanActionVariant;
  className?: string;
  buttonClassName?: string;
  iconClassName?: string;
}

export const ProposedPlanActions = memo(function ProposedPlanActions({
  planMarkdown,
  workspaceRoot,
  threadId,
  variant = "outline",
  className,
  buttonClassName,
  iconClassName,
}: ProposedPlanActionsProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingSpec, setIsExportingSpec] = useState(false);
  const [isExportingPlan, setIsExportingPlan] = useState(false);
  const [isExportingPptx, setIsExportingPptx] = useState(false);
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

  /** 构建 spec.md 格式内容 */
  const buildSpecMarkdown = useMemo(() => {
    const title = filename.replace(/\.md$/, "");
    return [
      `# ${title} - Specification`,
      "",
      `> Generated from proposed plan at ${new Date().toISOString()}`,
      "",
      "## Overview",
      "",
      markdown,
      "",
      "## Acceptance Criteria",
      "",
      "- [ ] All tasks completed",
      "- [ ] Tests passing",
      "- [ ] Code reviewed",
      "",
      "## Risks & Mitigations",
      "",
      "- Identify potential risks and mitigation strategies",
      "",
    ].join("\n");
  }, [filename, markdown]);

  /** 构建 plan.md 格式内容 */
  const buildPlanMarkdown = useMemo(() => {
    const title = filename.replace(/\.md$/, "");
    return [
      `# ${title} - Execution Plan`,
      "",
      `> Generated at ${new Date().toISOString()}`,
      "",
      "## Tasks",
      "",
      markdown,
      "",
      "## Timeline",
      "",
      "- Estimated duration: TBD",
      "- Dependencies: None",
      "",
      "## Resources",
      "",
      "- Required skills: Development",
      "- Tools: Standard development environment",
      "",
    ].join("\n");
  }, [filename, markdown]);

  /** 导出为指定格式 */
  const handleExportAs = async (format: PlanExportFormat) => {
    // spec 和 plan 格式走后端命令自动落盘到 .ydsz/plans/
    if ((format === "spec" || format === "plan") && workspaceRoot) {
      const setIsExportingFn = format === "spec" ? setIsExportingSpec : setIsExportingPlan;
      setIsExportingFn(true);

      try {
        const result = await invoke<{ success: boolean; output_path: string; exported_at: string }>(
          "plan_export_to_disk",
          {
            params: {
              workspace_root: workspaceRoot,
              thread_id: threadId ?? "",
              title: filename.replace(/\.md$/, ""),
              content: markdown,
              format: format === "spec" ? "Spec" : "Plan",
            },
          }
        );

        if (result.success) {
          toastManager.add({
            type: "success",
            title: `${format === "spec" ? "Specification" : "Execution Plan"} exported`,
            description: result.output_path,
          });
        }
      } catch (error) {
        toastManager.add({
          type: "error",
          title: `Could not export ${format === "spec" ? "Specification" : "Execution Plan"}`,
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      } finally {
        setIsExportingFn(false);
      }
      return;
    }

    // markdown 格式走对话框保存
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

    let content: string;
    let defaultFilename: string;
    let filterName: string;
    let extension: string;

    switch (format) {
      case "spec":
        content = buildSpecMarkdown;
        defaultFilename = filename.replace(/\.md$/, "-spec.md");
        filterName = "Specification";
        extension = "md";
        setIsExportingSpec(true);
        break;
      case "plan":
        content = buildPlanMarkdown;
        defaultFilename = filename.replace(/\.md$/, "-plan.md");
        filterName = "Execution Plan";
        extension = "md";
        setIsExportingPlan(true);
        break;
      default:
        content = markdown;
        defaultFilename = filename;
        filterName = "Markdown";
        extension = "md";
        setIsExporting(true);
    }

    try {
      const filePath = await api.dialogs.saveFile({
        defaultFilename,
        contents: content,
        filters: [{ name: filterName, extensions: [extension] }],
      });

      if (filePath) {
        toastManager.add({
          type: "success",
          title: `${filterName} exported`,
          description: filePath,
        });
      }
    } catch (error) {
      toastManager.add({
        type: "error",
        title: `Could not export ${filterName}`,
        description: error instanceof Error ? error.message : "An error occurred.",
      });
    } finally {
      setIsExporting(false);
      setIsExportingSpec(false);
      setIsExportingPlan(false);
    }
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
    void handleExportAs("markdown");
  };

  /** 导出为 PPT 演示文稿（.pptx） */
  const handleExportPptx = async () => {
    setIsExportingPptx(true);
    try {
      const slides = planMarkdownToSlides(markdown);
      const baseName = filename.replace(/\.md$/, "");
      await exportSlidesAsPptx(slides, baseName);
    } finally {
      setIsExportingPptx(false);
    }
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <PlanActionButton
        label="Export as spec.md"
        onClick={() => void handleExportAs("spec")}
        variant={variant}
        className={buttonClassName}
        busy={isExportingSpec}
      >
        <FileIcon className={cn("size-3.5", iconClassName)} />
      </PlanActionButton>
      <PlanActionButton
        label="Export as plan.md"
        onClick={() => void handleExportAs("plan")}
        variant={variant}
        className={buttonClassName}
        busy={isExportingPlan}
      >
        <FileIcon className={cn("size-3.5", iconClassName)} />
      </PlanActionButton>
      <PlanActionButton
        label="Export as PowerPoint (.pptx)"
        onClick={() => void handleExportPptx()}
        variant={variant}
        className={buttonClassName}
        busy={isExportingPptx}
      >
        <FileTextIcon className={cn("size-3.5", iconClassName)} />
      </PlanActionButton>
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
