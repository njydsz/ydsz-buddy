/**
 * @file 行级引用可点击链接（Review 模式专用）
 *
 * 在 ChatMarkdown 的 text/code 节点中识别 `path:line` 引用并渲染为可点击按钮：
 *
 * - 单击：在用户偏好的编辑器中打开文件并跳转到对应行号
 * - 视觉：反引号包裹 → 浅紫底色；普通文本引用 → 主色下划线 hover
 * - 键盘：可 Tab 聚焦，Enter / Space 触发
 *
 * ## 设计取舍
 *
 * - **不破坏 markdown 渲染**：本组件仅作为 text/code 子节点替换，不修改 AST
 * - **不解析绝对路径**：相对路径走 cwd 解析，绝对路径直接透传
 * - **不发送事件**：直接走 native API（与 ChatMarkdown 中"本地文件链接"行为一致）
 */

import { memo, useCallback } from "react";
import { ExternalLinkIcon, FileIcon } from "~/lib/icons";
import { openInPreferredEditor } from "../../editorPreferences";
import { readNativeApi } from "../../nativeApi";
import { cn } from "../../lib/utils";
import { buildEditorTargetPath, type ParsedReviewReference } from "../../lib/reviewFileReferences";

interface ReviewFileReferenceLinkProps {
  reference: ParsedReviewReference;
  /** 是否在反引号上下文（code 元素）中渲染 */
  inCodeContext?: boolean;
}

function ReviewFileReferenceLinkImpl({ reference, inCodeContext }: ReviewFileReferenceLinkProps) {
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const api = readNativeApi();
      if (!api) {
        // 没有 native API 时降级为 console.warn，与 ChatMarkdown a 标签行为一致
        console.warn("Native API not found. Unable to open file in editor.");
        return;
      }
      const target = buildEditorTargetPath(reference);
      void openInPreferredEditor(api, target).catch((error: unknown) => {
        console.error("Failed to open file in editor:", error);
      });
    },
    [reference],
  );

  const display = reference.backticked || inCodeContext
    ? `${basename(reference.path)}:${reference.line}${reference.column !== undefined ? `:${reference.column}` : ""}`
    : `${basename(reference.path)}:${reference.line}`;

  const title =
    `${reference.path}` +
    `:${reference.line}` +
    (reference.endLine !== undefined ? `-${reference.endLine}` : "") +
    (reference.column !== undefined ? `:${reference.column}` : "") +
    "（点击在编辑器中打开）";

  return (
    <button
      type="button"
      onClick={handleClick}
      title={title}
      data-testid="review-file-reference-link"
      data-file-path={reference.path}
      data-file-line={reference.line}
      className={cn(
        "inline-flex items-baseline gap-0.5 rounded-sm font-mono text-[0.92em] leading-tight",
        "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-review-accent,var(--color-ring))",
        reference.backticked || inCodeContext
          ? // 反引号上下文：保持与 code 元素底色一致，仅做强调
            "bg-(--color-review-accent-soft,color-mix(in srgb, var(--color-text-foreground-secondary) 12%, transparent)) px-1 py-0.5 text-foreground hover:bg-(--color-review-accent,color-mix(in srgb, var(--color-text-foreground-secondary) 22%, transparent))"
          : // 普通文本：主色下划线
            "text-(--color-review-accent,var(--color-text-link,currentColor)) underline decoration-dotted underline-offset-2 hover:decoration-solid",
      )}
    >
      <FileIcon
        className={cn(
          "size-3 shrink-0",
          reference.backticked || inCodeContext ? "" : "self-center",
        )}
        aria-hidden="true"
      />
      <span className="truncate">{display}</span>
      <ExternalLinkIcon className="size-2.5 shrink-0 opacity-60" aria-hidden="true" />
    </button>
  );
}

/** 从完整路径中提取 basename（含扩展名） */
function basename(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx >= 0 ? path.slice(idx + 1) : path;
}

export const ReviewFileReferenceLink = memo(ReviewFileReferenceLinkImpl);
