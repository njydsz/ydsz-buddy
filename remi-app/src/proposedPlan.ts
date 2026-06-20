/**
 * @file 提议计划（Proposed Plan）处理
 *
 * 处理 AI 生成的提议计划的解析、格式化和导出。
 * 包括：提取计划标题、去除显示用 Markdown 头部、构建折叠预览、
 * 生成实现提示词、构建线程标题、导出为文件等功能。
 */

/**
 * 从计划 Markdown 中提取标题文本。
 * 匹配第一个 Markdown 标题行（# 开头）并返回其内容。
 *
 * @param planMarkdown - 计划的 Markdown 内容
 * @returns 标题文本，未找到返回 null
 */
export function proposedPlanTitle(planMarkdown: string): string | null {
  const heading = planMarkdown.match(/^\s{0,3}#{1,6}\s+(.+)$/m)?.[1]?.trim();
  return heading && heading.length > 0 ? heading : null;
}

/**
 * 去除计划 Markdown 中用于显示的冗余头部内容。
 * 移除首行标题和紧随其后的 "Summary" 标题，保留实际计划内容。
 *
 * @param planMarkdown - 原始计划 Markdown
 * @returns 去除头部后的 Markdown 内容
 */
export function stripDisplayedPlanMarkdown(planMarkdown: string): string {
  const lines = planMarkdown.trimEnd().split(/\r?\n/);
  const sourceLines = lines[0] && /^\s{0,3}#{1,6}\s+/.test(lines[0]) ? lines.slice(1) : [...lines];
  while (sourceLines[0]?.trim().length === 0) {
    sourceLines.shift();
  }
  const firstHeadingMatch = sourceLines[0]?.match(/^\s{0,3}#{1,6}\s+(.+)$/);
  if (firstHeadingMatch?.[1]?.trim().toLowerCase() === "summary") {
    sourceLines.shift();
    while (sourceLines[0]?.trim().length === 0) {
      sourceLines.shift();
    }
  }
  return sourceLines.join("\n");
}

/**
 * 构建折叠状态下的计划预览 Markdown。
 * 限制可见行数，超出部分用 "..." 省略。
 *
 * @param planMarkdown - 原始计划 Markdown
 * @param options - 配置选项
 * @param options.maxLines - 最大可见行数，默认 8
 * @returns 折叠预览的 Markdown 内容
 */
export function buildCollapsedProposedPlanPreviewMarkdown(
  planMarkdown: string,
  options?: {
    maxLines?: number;
  },
): string {
  const maxLines = options?.maxLines ?? 8;
  const lines = stripDisplayedPlanMarkdown(planMarkdown)
    .trimEnd()
    .split(/\r?\n/)
    .map((line) => line.trimEnd());
  const previewLines: string[] = [];
  let visibleLineCount = 0;
  let hasMoreContent = false;

  for (const line of lines) {
    const isVisibleLine = line.trim().length > 0;
    if (isVisibleLine && visibleLineCount >= maxLines) {
      hasMoreContent = true;
      break;
    }
    previewLines.push(line);
    if (isVisibleLine) {
      visibleLineCount += 1;
    }
  }

  while (previewLines.length > 0 && previewLines.at(-1)?.trim().length === 0) {
    previewLines.pop();
  }

  if (previewLines.length === 0) {
    return proposedPlanTitle(planMarkdown) ?? "Plan preview unavailable.";
  }

  if (hasMoreContent) {
    previewLines.push("", "...");
  }

  return previewLines.join("\n");
}

/**
 * 将计划文件名片段标准化为安全的文件名。
 * 转小写、去除特殊字符、用连字符替代非字母数字字符。
 *
 * @param input - 原始文件名片段
 * @returns 标准化后的文件名片段，空值回退为 "plan"
 */
function sanitizePlanFileSegment(input: string): string {
  const sanitized = input
    .toLowerCase()
    .replace(/[`'".,!?()[\]{}]+/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized.length > 0 ? sanitized : "plan";
}

/**
 * 构建计划实现的提示词，用于引导 AI 执行计划内容。
 *
 * @param planMarkdown - 计划的 Markdown 内容
 * @returns 实现提示词字符串
 */
export function buildPlanImplementationPrompt(planMarkdown: string): string {
  return `PLEASE IMPLEMENT THIS PLAN:\n${planMarkdown.trim()}`;
}

/**
 * 解析计划后续提交的内容和交互模式。
 * 如果用户输入了自定义文本，使用 plan 模式提交；否则使用默认模式提交实现提示词。
 *
 * @param input - 包含草稿文本和计划 Markdown 的输入对象
 * @returns 提交文本和交互模式
 */
export function resolvePlanFollowUpSubmission(input: { draftText: string; planMarkdown: string }): {
  text: string;
  interactionMode: "default" | "plan";
} {
  const trimmedDraftText = input.draftText.trim();
  if (trimmedDraftText.length > 0) {
    return {
      text: trimmedDraftText,
      interactionMode: "plan",
    };
  }

  return {
    text: buildPlanImplementationPrompt(input.planMarkdown),
    interactionMode: "default",
  };
}

/**
 * 构建计划实现线程的标题。格式为 "Implement {标题}"，无标题时回退为 "Implement plan"。
 *
 * @param planMarkdown - 计划的 Markdown 内容
 * @returns 线程标题字符串
 */
export function buildPlanImplementationThreadTitle(planMarkdown: string): string {
  const title = proposedPlanTitle(planMarkdown);
  if (!title) {
    return "Implement plan";
  }
  return `Implement ${title}`;
}

/**
 * 构建计划导出文件的文件名。基于计划标题生成安全的 Markdown 文件名。
 *
 * @param planMarkdown - 计划的 Markdown 内容
 * @returns 文件名字符串（.md 后缀）
 */
export function buildProposedPlanMarkdownFilename(planMarkdown: string): string {
  const title = proposedPlanTitle(planMarkdown);
  return `${sanitizePlanFileSegment(title ?? "plan")}.md`;
}

/**
 * 标准化计划 Markdown 用于导出，确保末尾有换行符。
 *
 * @param planMarkdown - 原始计划 Markdown
 * @returns 标准化后的 Markdown 内容
 */
export function normalizePlanMarkdownForExport(planMarkdown: string): string {
  return `${planMarkdown.trimEnd()}\n`;
}

/** 匹配 <proposed_plan>...</proposed_plan> 标签块的全局正则 */
const PROPOSED_PLAN_BLOCK_GLOBAL_REGEX = /<proposed_plan>\s*[\s\S]*?\s*<\/proposed_plan>/gi;

/**
 * 从文本中移除所有 <proposed_plan> 标签块。
 * 用于在显示或转发消息时清除计划标记。
 *
 * @param text - 原始文本
 * @returns 去除计划标签块后的文本
 */
export function stripProposedPlanBlocksFromText(text: string): string {
  return text.replace(PROPOSED_PLAN_BLOCK_GLOBAL_REGEX, "").trim();
}

/**
 * 将计划内容作为 Markdown 文件下载到本地。
 * 创建临时 Blob URL 并触发浏览器下载，下载后自动释放 URL。
 *
 * @param filename - 下载文件名
 * @param contents - 文件内容
 */
export function downloadPlanAsTextFile(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
