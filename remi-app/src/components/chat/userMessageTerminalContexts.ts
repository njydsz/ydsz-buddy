/**
 * @file userMessageTerminalContexts.ts
 * @description 用户消息中终端上下文的文本处理工具，提供内联终端上下文标签的构建、格式化和检测功能。
 */

import { formatInlineTerminalContextLabel as formatInlineTerminalContextSelectionLabel } from "~/lib/terminalContext";

/** 终端上下文头部匹配正则，提取文件名和行号范围 */
const TERMINAL_CONTEXT_HEADER_PATTERN = /^(.*?)\s+line(?:s)?\s+(\d+)(?:-(\d+))?$/i;

/**
 * 构建内联终端上下文文本，将多个上下文头部格式化为标签拼接
 * @param contexts - 终端上下文数组，每个包含 header 字段
 * @returns 格式化后的内联终端上下文文本
 */
export function buildInlineTerminalContextText(
  contexts: ReadonlyArray<{
    header: string;
  }>,
): string {
  return contexts
    .map((context) => context.header.trim())
    .filter((header) => header.length > 0)
    .map(formatInlineTerminalContextLabel)
    .join(" ");
}

/**
 * 格式化单个内联终端上下文标签
 * @param header - 终端上下文头部文本
 * @returns 格式化后的标签（如 @filename:1-10）
 */
export function formatInlineTerminalContextLabel(header: string): string {
  const trimmedHeader = header.trim();
  const match = TERMINAL_CONTEXT_HEADER_PATTERN.exec(trimmedHeader);
  if (!match) {
    return `@${trimmedHeader.toLowerCase().replace(/\s+/g, "-")}`;
  }

  const lineStart = Number.parseInt(match[2] ?? "", 10);
  const lineEnd = Number.parseInt(match[3] ?? match[2] ?? "", 10);
  if (!Number.isFinite(lineStart) || !Number.isFinite(lineEnd)) {
    return `@${trimmedHeader.toLowerCase().replace(/\s+/g, "-")}`;
  }

  return formatInlineTerminalContextSelectionLabel({
    terminalLabel: match[1]?.trim() || "terminal",
    lineStart,
    lineEnd,
  });
}

/**
 * 检测文本中是否包含所有指定的内联终端上下文标签
 * @param text - 待检测的文本
 * @param contexts - 终端上下文数组
 * @returns 文本是否包含所有标签
 */
export function textContainsInlineTerminalContextLabels(
  text: string,
  contexts: ReadonlyArray<{
    header: string;
  }>,
): boolean {
  let searchStartIndex = 0;

  for (const context of contexts) {
    const label = formatInlineTerminalContextLabel(context.header);
    const matchIndex = text.indexOf(label, searchStartIndex);
    if (matchIndex === -1) {
      return false;
    }
    searchStartIndex = matchIndex + label.length;
  }

  return true;
}
