const fs = require('fs');
const path = 'd:\\Code\\open\\ydsz-buddy\\org\\modules\\ydsz-code\\ydsz-desktop\\src\\lib\\terminalContext.ts';
const content = `/**
 * @file 终端上下文管理
 * @description 管理终端选区上下文的提取、格式化、内联占位符操作及用户消息展示状态推导，
 *              支持将终端选区内容以 XML 块或内联标签形式嵌入到对话提示词中。
 */

import { type ThreadId } from "~/contracts";
import {
  extractTrailingAssistantSelections,
  type ParsedAssistantSelectionEntry,
} from "./assistantSelections";

/**
 * 终端上下文选区
 */
export interface TerminalContextSelection {
  /** 终端实例 ID */
  terminalId: string;
  /** 终端标签名称 */
  terminalLabel: string;
  /** 选区起始行号 */
  lineStart: number;
  /** 选区结束行号 */
  lineEnd: number;
  /** 选区文本内容 */
  text: string;
}

/**
 * 终端上下文草稿（含元数据）
 */
export interface TerminalContextDraft extends TerminalContextSelection {
  /** 草稿唯一标识 */
  id: string;
  /** 所属线程 ID */
  threadId: ThreadId;
  /** 创建时间 */
  createdAt: string;
}

/**
 * 提取的终端上下文集合
 */
export interface ExtractedTerminalContexts {
  /** 去除终端上下文块后的提示词文本 */
  promptText: string;
  /** 上下文条目数量 */
  contextCount: number;
  /** 上下文预览标题，无上下文时为 \`null\` */
  previewTitle: string | null;
  /** 解析后的终端上下文条目列表 */
  contexts: ParsedTerminalContextEntry[];
}

/**
 * 用户消息展示状态
 */
export interface DisplayedUserMessageState {
  /** 可见文本 */
  visibleText: string;
  /** 复制用文本 */
  copyText: string;
  /** 终端上下文数量 */
  contextCount: number;
  /** 终端上下文预览标题 */
  previewTitle: string | null;
  /** 终端上下文条目列表 */
  contexts: ParsedTerminalContextEntry[];
  /** 助手选区条目列表 */
  assistantSelections: ParsedAssistantSelectionEntry[];
}

/**
 * 解析后的终端上下文条目
 */
export interface ParsedTerminalContextEntry {
  /** 条目标题行 */
  header: string;
  /** 条目正文内容 */
  body: string;
}

/** 内联终端上下文占位符（Unicode U+FFFC 对象替换字符） */
export const INLINE_TERMINAL_CONTEXT_PLACEHOLDER = "\uFFFC";
/** 仅图片引导提示词（无用户文本时的内部占位） */
export const IMAGE_ONLY_BOOTSTRAP_PROMPT =
  "[User attached one or more images without additional text. Respond using the conversation context and the attached image(s).]";
/** 仅图片时的可见占位文本 */
export const IMAGE_ONLY_VISIBLE_PLACEHOLDER = "(No Content)";

const TRAILING_TERMINAL_CONTEXT_BLOCK_PATTERN =
  new RegExp("\\n*<terminal_context>\\n([^]*?)\\n</terminal_context>[ \\t]*$");

interface DisplayedUserMessageOptions {
  hideImageOnlyBootstrapPrompt?: boolean;
}

/**
 * 规范化终端上下文文本
 *
 * 将 CRLF 转换为 LF，并去除首尾空行。
 *
 * @param text - 原始文本
 * @returns 规范化后的文本
 */
export function normalizeTerminalContextText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/^\n+|\n+$/g, "");
}

/**
 * 判断终端上下文是否包含有效文本
 *
 * @param context - 包含 text 字段的对象
 * @returns 若规范化后文本长度大于 0 则返回 \`true\`
 */
export function hasTerminalContextText(context: { text: string }): boolean {
  return normalizeTerminalContextText(context.text).length > 0;
}

/**
 * 判断终端上下文是否已过期（无有效文本）
 *
 * @param context - 包含 text 字段的对象
 * @returns 若文本为空则返回 \`true\`
 */
export function isTerminalContextExpired(context: { text: string }): boolean {
  return !hasTerminalContextText(context);
}

/**
 * 过滤出包含有效文本的终端上下文
 *
 * @param contexts - 终端上下文数组
 * @returns 仅包含有效文本的上下文数组
 */
export function filterTerminalContextsWithText<T extends { text: string }>(
  contexts: ReadonlyArray<T>,
): T[] {
  return contexts.filter((context) => hasTerminalContextText(context));
}

function previewTerminalContextText(text: string): string {
  const normalized = normalizeTerminalContextText(text);
  if (normalized.length === 0) {
    return "";
  }
  const lines = normalized.split("\n");
  const visibleLines = lines.slice(0, 3);
  if (lines.length > 3) {
    visibleLines.push("...");
  }
  const preview = visibleLines.join("\n");
  return preview.length > 180 ? \`\${preview.slice(0, 177)}...\` : preview;
}

/**
 * 规范化终端上下文选区
 *
 * 验证并修正选区字段：去除空白字符、确保行号有效。
 * 若关键字段为空则返回 \`null\`。
 *
 * @param selection - 原始终端上下文选区
 * @returns 规范化后的选区，或 \`null\`（若选区无效）
 */
export function normalizeTerminalContextSelection(
  selection: TerminalContextSelection,
): TerminalContextSelection | null {
  const text = normalizeTerminalContextText(selection.text);
  const terminalId = selection.terminalId.trim();
  const terminalLabel = selection.terminalLabel.trim();
  if (text.length === 0 || terminalId.length === 0 || terminalLabel.length === 0) {
    return null;
  }
  const lineStart = Math.max(1, Math.floor(selection.lineStart));
  const lineEnd = Math.max(lineStart, Math.floor(selection.lineEnd));
  return {
    terminalId,
    terminalLabel,
    lineStart,
    lineEnd,
    text,
  };
}

/**
 * 格式化终端上下文行范围
 *
 * @param selection - 包含行号范围的对象
 * @returns 格式化的行范围字符串，如 "line 5" 或 "lines 5-10"
 */
export function formatTerminalContextRange(selection: {
  lineStart: number;
  lineEnd: number;
}): string {
  return selection.lineStart === selection.lineEnd
    ? \`line \${selection.lineStart}\`
    : \`lines \${selection.lineStart}-\${selection.lineEnd}\`;
}

/**
 * 格式化终端上下文标签（含终端名称和行范围）
 *
 * @param selection - 包含终端标签和行号范围的对象
 * @returns 格式化的标签字符串，如 "Terminal 1 lines 5-10"
 */
export function formatTerminalContextLabel(selection: {
  terminalLabel: string;
  lineStart: number;
  lineEnd: number;
}): string {
  return \`\${selection.terminalLabel} \${formatTerminalContextRange(selection)}\`;
}

/**
 * 格式化内联终端上下文标签
 *
 * 生成紧凑的内联引用格式，如 \`@terminal-1:5-10\`。
 *
 * @param selection - 包含终端标签和行号范围的对象
 * @returns 内联格式的终端上下文标签
 */
export function formatInlineTerminalContextLabel(selection: {
  terminalLabel: string;
  lineStart: number;
  lineEnd: number;
}): string {
  const terminalLabel = selection.terminalLabel.trim().toLowerCase().replace(/[ \t\n\r\f\v]+/g, "-");
  const range =
    selection.lineStart === selection.lineEnd
      ? \`\${selection.lineStart}\`
      : \`\${selection.lineStart}-\${selection.lineEnd}\`;
  return \`@\${terminalLabel}:\${range}\`;
}

/**
 * 构建终端上下文预览标题
 *
 * 将多个终端上下文选区格式化为预览文本，包含终端标签和内容摘要。
 *
 * @param contexts - 终端上下文选区数组
 * @returns 预览标题字符串，无有效上下文时返回 \`null\`
 */
export function buildTerminalContextPreviewTitle(
  contexts: ReadonlyArray<TerminalContextSelection>,
): string | null {
  if (contexts.length === 0) {
    return null;
  }
  const previews = contexts
    .map((context) => {
      const normalized = normalizeTerminalContextSelection(context);
      if (!normalized) {
        return null;
      }
      const preview = previewTerminalContextText(normalized.text);
      return preview.length > 0
        ? \`\${formatTerminalContextLabel(normalized)}\n\${preview}\`
        : formatTerminalContextLabel(normalized);
    })
    .filter((value): value is string => value !== null)
    .join("\n\n");
  return previews.length > 0 ? previews : null;
}

function buildTerminalContextBodyLines(selection: TerminalContextSelection): string[] {
  return normalizeTerminalContextText(selection.text)
    .split("\n")
    .map((line, index) => \`  \${selection.lineStart + index} | \${line}\`);
}

/**
 * 构建终端上下文 XML 块
 *
 * 将终端上下文选区格式化为 \`<terminal_context>\` XML 块，
 * 包含终端标签、行号和内容，用于嵌入到对话提示词中。
 *
 * @param contexts - 终端上下文选区数组
 * @returns 格式化的 XML 块字符串，无有效上下文时返回空字符串
 */
export function buildTerminalContextBlock(
  contexts: ReadonlyArray<TerminalContextSelection>,
): string {
  const normalizedContexts = contexts
    .map((context) => normalizeTerminalContextSelection(context))
    .filter((context): context is TerminalContextSelection => context !== null);
  if (normalizedContexts.length === 0) {
    return "";
  }
  const lines: string[] = [];
  for (let index = 0; index < normalizedContexts.length; index += 1) {
    const context = normalizedContexts[index]!;
    lines.push(\`- \${formatTerminalContextLabel(context)}:\`);
    lines.push(...buildTerminalContextBodyLines(context));
    if (index < normalizedContexts.length - 1) {
      lines.push("");
    }
  }
  return ["<terminal_context>", ...lines, "</terminal_context>"].join("\n");
}

/**
 * 将内联终端上下文占位符替换为实际标签
 *
 * 按顺序将提示词中的占位符替换为对应的内联终端上下文标签。
 *
 * @param prompt - 包含占位符的提示词文本
 * @param contexts - 终端上下文对象数组
 * @returns 替换后的提示词文本
 */
export function materializeInlineTerminalContextPrompt(
  prompt: string,
  contexts: ReadonlyArray<{
    terminalLabel: string;
    lineStart: number;
    lineEnd: number;
  }>,
): string {
  let nextContextIndex = 0;
  let result = "";

  for (const char of prompt) {
    if (char !== INLINE_TERMINAL_CONTEXT_PLACEHOLDER) {
      result += char;
      continue;
    }
    const context = contexts[nextContextIndex] ?? null;
    nextContextIndex += 1;
    if (!context) {
      continue;
    }
    result += formatInlineTerminalContextLabel(context);
  }

  return result;
}

/**
 * 将终端上下文追加到提示词末尾
 *
 * 先替换内联占位符，再将完整的终端上下文 XML 块追加到提示词末尾。
 *
 * @param prompt - 原始提示词文本
 * @param contexts - 终端上下文选区数组
 * @returns 追加上下文后的完整提示词
 */
export function appendTerminalContextsToPrompt(
  prompt: string,
  contexts: ReadonlyArray<TerminalContextSelection>,
): string {
  const trimmedPrompt = materializeInlineTerminalContextPrompt(prompt, contexts).trim();
  const contextBlock = buildTerminalContextBlock(contexts);
  if (contextBlock.length === 0) {
    return trimmedPrompt;
  }
  return trimmedPrompt.length > 0 ? \`\${trimmedPrompt}\n\n\${contextBlock}\` : contextBlock;
}

/**
 * 将原始提示词中的终端上下文块追加到编辑后的提示词
 *
 * 当用户编辑提示词时，保留原始提示词尾部的终端上下文块。
 *
 * @param input - 包含编辑后提示词和原始提示词的对象
 * @returns 追加原始上下文块后的提示词
 */
export function appendOriginalTerminalContextBlock(input: {
  editedPrompt: string;
  originalPrompt: string;
}): string {
  const match = TRAILING_TERMINAL_CONTEXT_BLOCK_PATTERN.exec(input.originalPrompt);
  if (!match) {
    return input.editedPrompt.trim();
  }
  const contextBlock = input.originalPrompt.slice(match.index).trim();
  const editedPrompt = input.editedPrompt.trim();
  return editedPrompt.length > 0 ? \`\${editedPrompt}\n\n\${contextBlock}\` : contextBlock;
}

/**
 * 提取提示词尾部的终端上下文块
 *
 * 解析提示词末尾的 \`<terminal_context>\` XML 块，返回分离后的提示词文本和解析的上下文条目。
 *
 * @param prompt - 包含终端上下文块的提示词
 * @returns 提取结果，包含纯提示词文本、上下文数量、预览标题和解析条目
 */
export function extractTrailingTerminalContexts(prompt: string): ExtractedTerminalContexts {
  const match = TRAILING_TERMINAL_CONTEXT_BLOCK_PATTERN.exec(prompt);
  if (!match) {
    return {
      promptText: prompt,
      contextCount: 0,
      previewTitle: null,
      contexts: [],
    };
  }
  const promptText = prompt.slice(0, match.index).replace(/\n+$/, "");
  const parsedContexts = parseTerminalContextEntries(match[1] ?? "");
  return {
    promptText,
    contextCount: parsedContexts.length,
    previewTitle:
      parsedContexts.length > 0
        ? parsedContexts
            .map(({ header, body }) => (body.length > 0 ? \`\${header}\n\${body}\` : header))
            .join("\n\n")
        : null,
    contexts: parsedContexts,
  };
}

/**
 * 推导用户消息的展示状态
 *
 * 从原始提示词中提取终端上下文和助手选区，计算可见文本、复制文本和上下文统计。
 * 支持隐藏仅图片引导提示词，同时保留消息气泡可见性。
 *
 * @param prompt - 原始提示词文本
 * @param options - 展示选项，如隐藏仅图片引导提示词
 * @returns 用户消息展示状态对象
 */
export function deriveDisplayedUserMessageState(
  prompt: string,
  options?: DisplayedUserMessageOptions,
): DisplayedUserMessageState {
  const extractedContexts = extractTrailingTerminalContexts(prompt);
  const extractedAssistantSelections = extractTrailingAssistantSelections(
    extractedContexts.promptText,
  );
  const hidePrompt =
    options?.hideImageOnlyBootstrapPrompt === true &&
    extractedAssistantSelections.promptText.trim() === IMAGE_ONLY_BOOTSTRAP_PROMPT;
  return {
    // Keep the internal bootstrap prompt hidden while still giving image-only
    // user messages a visible bubble in the transcript.
    visibleText: hidePrompt
      ? IMAGE_ONLY_VISIBLE_PLACEHOLDER
      : extractedAssistantSelections.promptText,
    copyText: hidePrompt ? "" : extractedAssistantSelections.promptText,
    contextCount: extractedContexts.contextCount,
    previewTitle: extractedContexts.previewTitle,
    contexts: extractedContexts.contexts,
    assistantSelections: extractedAssistantSelections.selections,
  };
}

function parseTerminalContextEntries(block: string): ParsedTerminalContextEntry[] {
  const entries: ParsedTerminalContextEntry[] = [];
  let current: { header: string; bodyLines: string[] } | null = null;

  const commitCurrent = () => {
    if (!current) {
      return;
    }
    entries.push({
      header: current.header,
      body: current.bodyLines.join("\n").trimEnd(),
    });
    current = null;
  };

  for (const rawLine of block.split("\n")) {
    const headerMatch = /^- (.+):$/.exec(rawLine);
    if (headerMatch) {
      commitCurrent();
      current = {
        header: headerMatch[1]!,
        bodyLines: [],
      };
      continue;
    }
    if (!current) {
      continue;
    }
    if (rawLine.startsWith("  ")) {
      current.bodyLines.push(rawLine.slice(2));
      continue;
    }
    if (rawLine.length === 0) {
      current.bodyLines.push("");
    }
  }

  commitCurrent();
  return entries;
}

/**
 * 统计提示词中内联终端上下文占位符的数量
 *
 * @param prompt - 提示词文本
 * @returns 占位符数量
 */
export function countInlineTerminalContextPlaceholders(prompt: string): number {
  let count = 0;
  for (const char of prompt) {
    if (char === INLINE_TERMINAL_CONTEXT_PLACEHOLDER) {
      count += 1;
    }
  }
  return count;
}

/**
 * 确保提示词中包含足够数量的内联终端上下文占位符
 *
 * 若占位符不足，则在提示词开头补齐缺失的占位符。
 *
 * @param prompt - 提示词文本
 * @param terminalContextCount - 所需的终端上下文数量
 * @returns 补齐占位符后的提示词
 */
export function ensureInlineTerminalContextPlaceholders(
  prompt: string,
  terminalContextCount: number,
): string {
  const missingCount = terminalContextCount - countInlineTerminalContextPlaceholders(prompt);
  if (missingCount <= 0) {
    return prompt;
  }
  return \`\${INLINE_TERMINAL_CONTEXT_PLACEHOLDER.repeat(missingCount)}\${prompt}\`;
}

function isInlineTerminalContextBoundaryWhitespace(char: string | undefined): boolean {
  return char === undefined || char === " " || char === "\n" || char === "\t" || char === "\r";
}

/**
 * 在提示词指定位置插入内联终端上下文占位符
 *
 * 自动处理占位符前后的空格，确保与相邻文本正确分隔。
 *
 * @param prompt - 提示词文本
 * @param cursorInput - 光标位置
 * @returns 包含更新后提示词、光标位置和上下文索引的对象
 */
export function insertInlineTerminalContextPlaceholder(
  prompt: string,
  cursorInput: number,
): { prompt: string; cursor: number; contextIndex: number } {
  const cursor = Math.max(0, Math.min(prompt.length, Math.floor(cursorInput)));
  const needsLeadingSpace = !isInlineTerminalContextBoundaryWhitespace(prompt[cursor - 1]);
  const replacement = \`\${needsLeadingSpace ? " " : ""}\${INLINE_TERMINAL_CONTEXT_PLACEHOLDER} \`;
  const rangeEnd = prompt[cursor] === " " ? cursor + 1 : cursor;
  return {
    prompt: \`\${prompt.slice(0, cursor)}\${replacement}\${prompt.slice(rangeEnd)}\`,
    cursor: cursor + replacement.length,
    contextIndex: countInlineTerminalContextPlaceholders(prompt.slice(0, cursor)),
  };
}

/**
 * 去除提示词中所有内联终端上下文占位符
 *
 * @param prompt - 提示词文本
 * @returns 去除占位符后的提示词
 */
export function stripInlineTerminalContextPlaceholders(prompt: string): string {
  return prompt.replaceAll(INLINE_TERMINAL_CONTEXT_PLACEHOLDER, "");
}

/**
 * 移除提示词中指定索引的内联终端上下文占位符
 *
 * @param prompt - 提示词文本
 * @param contextIndex - 要移除的占位符索引
 * @returns 包含更新后提示词和光标位置的对象
 */
export function removeInlineTerminalContextPlaceholder(
  prompt: string,
  contextIndex: number,
): { prompt: string; cursor: number } {
  if (contextIndex < 0) {
    return { prompt, cursor: prompt.length };
  }

  let placeholderIndex = 0;
  for (let index = 0; index < prompt.length; index += 1) {
    if (prompt[index] !== INLINE_TERMINAL_CONTEXT_PLACEHOLDER) {
      continue;
    }
    if (placeholderIndex === contextIndex) {
      return {
        prompt: prompt.slice(0, index) + prompt.slice(index + 1),
        cursor: index,
      };
    }
    placeholderIndex += 1;
  }

  return { prompt, cursor: prompt.length };
}
`;
fs.writeFileSync(path, content, 'utf8');
console.log('Done: terminalContext.ts');
