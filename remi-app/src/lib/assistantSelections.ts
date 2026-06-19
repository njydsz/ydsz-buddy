/**
 * @file 助手选择引用处理模块
 * @description 规范化、序列化和剥离用户提示词中的助手引用选择内容。
 *              用于聊天编辑器和对话记录辅助函数。
 */

import { CHAT_ASSISTANT_SELECTION_TEXT_MAX_CHARS } from "@remi-code/contracts";

import type { ChatAssistantSelectionAttachment } from "../types";
import { randomUUID } from "./utils";

/** 尾部助手选择引用的正则匹配模式 */
const TRAILING_ASSISTANT_SELECTIONS_PATTERN =
  /\n*<assistant_selection>\n([\s\S]*?)\n<\/assistant_selection>\s*$/;
/** 嵌入式助手选择引用的正则匹配模式 */
const EMBEDDED_ASSISTANT_SELECTIONS_PATTERN =
  /\n*<assistant_selection>\n[\s\S]*?\n<\/assistant_selection>(?=\n*(<terminal_context>\n[\s\S]*?\n<\/terminal_context>\s*)?$)/;
/** 助手选择预览的最大字符数 */
const ASSISTANT_SELECTION_PREVIEW_MAX_CHARS = 44;

/**
 * 提取的助手选择引用结果接口
 */
export interface ExtractedAssistantSelections {
  /** 剥离选择引用后的提示词文本 */
  promptText: string;
  /** 解析出的选择引用条目列表 */
  selections: ParsedAssistantSelectionEntry[];
}

/**
 * 解析后的助手选择引用条目
 */
export interface ParsedAssistantSelectionEntry {
  /** 助手消息的唯一标识符 */
  assistantMessageId: string;
  /** 选择的文本内容 */
  text: string;
}

/**
 * 助手选择引用验证错误类型
 * - "empty": 内容为空
 * - "too-long": 内容超长
 */
export type AssistantSelectionValidationError = "empty" | "too-long";

/**
 * 规范化助手选择引用文本
 * @param text - 原始选择文本
 * @returns 规范化后的文本（统一换行符、去除首尾空白）
 */
export function normalizeAssistantSelectionText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/^\n+|\n+$/g, "")
    .trim();
}

/**
 * 获取助手选择引用的验证错误
 * @param selection - 包含助手消息ID和文本的选择对象
 * @returns 验证错误类型，如果验证通过则返回 null
 */
export function getAssistantSelectionValidationError(
  selection: Pick<ChatAssistantSelectionAttachment, "assistantMessageId" | "text">,
): AssistantSelectionValidationError | null {
  const assistantMessageId = selection.assistantMessageId.trim();
  const text = normalizeAssistantSelectionText(selection.text);
  if (assistantMessageId.length === 0 || text.length === 0) {
    return "empty";
  }
  if (text.length > CHAT_ASSISTANT_SELECTION_TEXT_MAX_CHARS) {
    return "too-long";
  }
  return null;
}

/**
 * 规范化助手选择引用附件
 * @param selection - 包含助手消息ID和文本的选择对象
 * @returns 规范化后的选择对象，如果验证失败则返回 null
 */
export function normalizeAssistantSelectionAttachment(
  selection: Pick<ChatAssistantSelectionAttachment, "assistantMessageId" | "text">,
): Pick<ChatAssistantSelectionAttachment, "assistantMessageId" | "text"> | null {
  const validationError = getAssistantSelectionValidationError(selection);
  if (validationError) {
    return null;
  }
  const assistantMessageId = selection.assistantMessageId.trim();
  const text = normalizeAssistantSelectionText(selection.text);
  return {
    assistantMessageId,
    text,
  };
}

/**
 * 创建助手选择引用附件
 * @param input - 包含助手消息ID和文本的输入对象
 * @returns 完整的附件对象，如果验证失败则返回 null
 */
export function createAssistantSelectionAttachment(input: {
  assistantMessageId: string;
  text: string;
}): ChatAssistantSelectionAttachment | null {
  const normalized = normalizeAssistantSelectionAttachment(input);
  if (!normalized) {
    return null;
  }

  return {
    type: "assistant-selection",
    id: randomUUID(),
    assistantMessageId: normalized.assistantMessageId,
    text: normalized.text,
  };
}

/**
 * 格式化助手选择引用的预览文本
 * @param text - 选择文本
 * @returns 预览文本（首行内容，超长时截断）
 */
export function formatAssistantSelectionPreview(text: string): string {
  const normalized = normalizeAssistantSelectionText(text);
  if (normalized.length === 0) {
    return "Selection";
  }
  const firstLine = normalized.split("\n")[0] ?? normalized;
  return firstLine.length > ASSISTANT_SELECTION_PREVIEW_MAX_CHARS
    ? `${firstLine.slice(0, ASSISTANT_SELECTION_PREVIEW_MAX_CHARS - 1)}…`
    : firstLine;
}

/**
 * 格式化助手选择引用队列的预览文本
 * @param selectionCount - 选择引用数量
 * @returns 队列预览文本
 */
export function formatAssistantSelectionQueuePreview(selectionCount: number): string {
  return selectionCount === 1 ? "1 referenced selection" : "Referenced selections";
}

/**
 * 格式化助手选择引用的标题种子文本
 * @param selectionCount - 选择引用数量
 * @returns 标题种子文本
 */
export function formatAssistantSelectionTitleSeed(selectionCount: number): string {
  return selectionCount === 1
    ? "Referenced assistant selection"
    : "Referenced assistant selections";
}

/**
 * 构建助手选择引用的提示词块
 * @param selections - 选择引用列表
 * @returns 格式化后的 XML 提示词块，如果没有有效选择则返回空字符串
 */
export function buildAssistantSelectionsPromptBlock(
  selections: ReadonlyArray<Pick<ChatAssistantSelectionAttachment, "assistantMessageId" | "text">>,
): string {
  // 规范化并过滤无效的选择引用
  const normalizedSelections = selections
    .map((selection) => normalizeAssistantSelectionAttachment(selection))
    .filter(
      (
        selection,
      ): selection is Pick<ChatAssistantSelectionAttachment, "assistantMessageId" | "text"> =>
        selection !== null,
    );
  if (normalizedSelections.length === 0) {
    return "";
  }

  // 构建 XML 格式的选择引用块
  const lines: string[] = [];
  for (const selection of normalizedSelections) {
    lines.push(`- assistant message ${selection.assistantMessageId}:`);
    for (const line of selection.text.split("\n")) {
      lines.push(`  ${line}`);
    }
  }
  return ["<assistant_selection>", ...lines, "</assistant_selection>"].join("\n");
}

/**
 * 将助手选择引用追加到提示词末尾
 * @param prompt - 原始提示词
 * @param selections - 选择引用列表
 * @returns 追加选择引用后的提示词
 */
export function appendAssistantSelectionsToPrompt(
  prompt: string,
  selections: ReadonlyArray<Pick<ChatAssistantSelectionAttachment, "assistantMessageId" | "text">>,
): string {
  const trimmedPrompt = prompt.trim();
  const block = buildAssistantSelectionsPromptBlock(selections);
  if (block.length === 0) {
    return trimmedPrompt;
  }
  return trimmedPrompt.length > 0 ? `${trimmedPrompt}\n\n${block}` : block;
}

/**
 * 从提示词尾部提取助手选择引用
 * @param prompt - 原始提示词
 * @returns 提取结果，包含剥离后的提示词和解析出的选择引用列表
 */
export function extractTrailingAssistantSelections(prompt: string): ExtractedAssistantSelections {
  const match = TRAILING_ASSISTANT_SELECTIONS_PATTERN.exec(prompt);
  if (!match) {
    return {
      promptText: prompt,
      selections: [],
    };
  }

  return {
    promptText: prompt.slice(0, match.index).replace(/\n+$/, ""),
    selections: parseAssistantSelectionEntries(match[1] ?? ""),
  };
}

/**
 * 从提示词尾部剥离助手选择引用
 * @param prompt - 原始提示词
 * @returns 剥离选择引用后的提示词
 */
export function stripTrailingAssistantSelections(prompt: string): string {
  return extractTrailingAssistantSelections(prompt).promptText;
}

/**
 * 从提示词中剥离嵌入的助手选择引用
 * @param prompt - 原始提示词
 * @returns 剥离嵌入选择引用后的提示词
 */
export function stripEmbeddedAssistantSelections(prompt: string): string {
  return prompt.replace(EMBEDDED_ASSISTANT_SELECTIONS_PATTERN, "");
}

/**
 * 解析助手选择引用条目（内部函数）
 * @param block - 选择引用块的文本内容
 * @returns 解析后的选择引用条目列表
 */
function parseAssistantSelectionEntries(block: string): ParsedAssistantSelectionEntry[] {
  const entries: ParsedAssistantSelectionEntry[] = [];
  let current: { assistantMessageId: string; lines: string[] } | null = null;

  // 提交当前解析条目的辅助函数
  const commitCurrent = () => {
    if (!current) return;
    const text = current.lines.join("\n").trimEnd();
    if (text.length > 0) {
      entries.push({
        assistantMessageId: current.assistantMessageId,
        text,
      });
    }
    current = null;
  };

  // 逐行解析选择引用块
  for (const rawLine of block.split("\n")) {
    const headerMatch = /^- assistant message (.+):$/.exec(rawLine);
    if (headerMatch) {
      commitCurrent();
      current = {
        assistantMessageId: headerMatch[1]!.trim(),
        lines: [],
      };
      continue;
    }
    if (!current) {
      continue;
    }
    // 处理缩进的内容行
    if (rawLine.startsWith("  ")) {
      current.lines.push(rawLine.slice(2));
      continue;
    }
    // 处理空行
    if (rawLine.length === 0) {
      current.lines.push("");
    }
  }

  commitCurrent();
  return entries;
}
