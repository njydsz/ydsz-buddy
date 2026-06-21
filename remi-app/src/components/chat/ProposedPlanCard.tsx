/**
 * @file 提议计划卡片组件
 *
 * 本组件以卡片形式展示 AI 提议的执行计划（Plan），包含：
 *
 * - **计划标题**
 * - **计划步骤列表**（可折叠/展开）
 * - **可操作状态**：未决/已接受/已拒绝
 * - **操作按钮**：接受、修改、拒绝、导出
 *
 * ## 核心导出
 *
 * - `ProposedPlanCard`：卡片组件
 * - `buildCollapsedProposedPlanPreviewMarkdown`：折叠预览
 *
 * ## 使用场景
 *
 * - Plan 模式下 AI 提交计划后的展示
 * - 历史计划查看
 *
 * ## 注意事项
 *
 * - 步骤支持 Markdown（标题、列表、代码块）
 * - 折叠时显示摘要 + 前 3 个步骤
 * - 接受后步骤不可修改
 */

import { memo, useState, type CSSProperties } from "react";
import {
  buildCollapsedProposedPlanPreviewMarkdown,
  proposedPlanTitle,
  stripDisplayedPlanMarkdown,
} from "../../proposedPlan";
import ChatMarkdown from "../ChatMarkdown";
import { Button } from "../ui/button";
import { cn } from "~/lib/utils";
import { Badge } from "../ui/badge";
import { ProposedPlanActions } from "./ProposedPlanActions";

export const ProposedPlanCard = memo(function ProposedPlanCard({
  planMarkdown,
  cwd,
  workspaceRoot,
  chatTypographyStyle,
}: {
  planMarkdown: string;
  cwd: string | undefined;
  workspaceRoot: string | undefined;
  chatTypographyStyle?: CSSProperties;
}) {
  const [expanded, setExpanded] = useState(false);
  const title = proposedPlanTitle(planMarkdown) ?? "Proposed plan";
  const lineCount = planMarkdown.split("\n").length;
  const canCollapse = planMarkdown.length > 900 || lineCount > 20;
  const displayedPlanMarkdown = stripDisplayedPlanMarkdown(planMarkdown);
  const collapsedPreview = canCollapse
    ? buildCollapsedProposedPlanPreviewMarkdown(planMarkdown, { maxLines: 10 })
    : null;
  return (
    <div className="rounded-[24px] border border-border/80 bg-card/70 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant="secondary">Plan</Badge>
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
        </div>
        <ProposedPlanActions planMarkdown={planMarkdown} workspaceRoot={workspaceRoot} />
      </div>
      <div className="mt-4">
        <div className={cn("relative", canCollapse && !expanded && "max-h-104 overflow-hidden")}>
          {canCollapse && !expanded ? (
            <ChatMarkdown
              text={collapsedPreview ?? ""}
              cwd={cwd}
              isStreaming={false}
              style={chatTypographyStyle}
            />
          ) : (
            <ChatMarkdown
              text={displayedPlanMarkdown}
              cwd={cwd}
              isStreaming={false}
              style={chatTypographyStyle}
            />
          )}
          {canCollapse && !expanded ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-card/95 via-card/80 to-transparent" />
          ) : null}
        </div>
        {canCollapse ? (
          <div className="mt-4 flex justify-center">
            <Button
              size="sm"
              variant="outline"
              data-scroll-anchor-ignore
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "Collapse plan" : "Expand plan"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
});
