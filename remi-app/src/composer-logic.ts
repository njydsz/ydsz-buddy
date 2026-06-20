/**
 * @file composer-logic.ts
 * @description Composer 编辑器的核心逻辑模块，负责触发器检测、光标位置转换和文本替换。
 * 处理 @mention、/slash-command、/model、$skill 等触发器的识别与定位，
 * 以及在"折叠视图"（inline token 视为单字符）和"展开视图"（显示完整文本）之间转换光标位置。
 */

import { splitPromptIntoComposerSegments } from "./composer-editor-mentions";
import {
  BUILT_IN_COMPOSER_SLASH_COMMANDS,
  isBuiltInComposerSlashCommand,
  type ComposerSlashCommand,
} from "./composerSlashCommands";
import { INLINE_TERMINAL_CONTEXT_PLACEHOLDER } from "./lib/terminalContext";

/**
 * Composer 触发器类型
 * - `mention`：@提及触发器
 * - `slash-command`：/斜杠命令触发器
 * - `slash-model`：/model 模型切换触发器
 * - `skill`：$skill 技能触发器
 */
export type ComposerTriggerKind = "mention" | "slash-command" | "slash-model" | "skill";

/**
 * Composer 触发器，表示编辑器中检测到的一个活跃触发器及其文本范围
 */
export interface ComposerTrigger {
  /** 触发器类型 */
  kind: ComposerTriggerKind;
  /** 触发器的查询文本（不含前缀符号） */
  query: string;
  /** 触发器在文本中的起始位置 */
  rangeStart: number;
  /** 触发器在文本中的结束位置 */
  rangeEnd: number;
}

/**
 * 从文本中移除触发器所覆盖的字符范围
 *
 * @param text - 原始文本
 * @param trigger - 要移除的触发器，为 null 时原样返回
 * @returns 移除触发器范围后的文本
 *
 * @example
 * stripComposerTriggerText("hello @world", { kind: "mention", query: "world", rangeStart: 6, rangeEnd: 12 })
 * // => "hello "
 */
export function stripComposerTriggerText(text: string, trigger: ComposerTrigger | null): string {
  if (!trigger) {
    return text;
  }

  return `${text.slice(0, trigger.rangeStart)}${text.slice(trigger.rangeEnd)}`;
}

/**
 * Composer 文本段落的简化类型，用于光标位置计算。
 * 与 ComposerPromptSegment 类似但更精简，仅保留光标转换所需的最小信息。
 */
type ComposerSegmentLike =
  | { type: "text"; text: string }
  | { type: "mention" }
  | { type: "skill" }
  | { type: "terminal-context" }
  | { type: "agent-mention"; alias: string };

/** 判断给定段落是否为内联 token（非纯文本段） */
const isInlineTokenSegment = (segment: ComposerSegmentLike): boolean => segment.type !== "text";

/**
 * 将光标位置限制在文本有效范围内
 *
 * @param text - 目标文本
 * @param cursor - 原始光标位置
 * @returns 限制后的光标位置，确保在 [0, text.length] 范围内
 */
function clampCursor(text: string, cursor: number): number {
  if (!Number.isFinite(cursor)) return text.length;
  return Math.max(0, Math.min(text.length, Math.floor(cursor)));
}

/** 判断字符是否为空白字符（包括终端上下文占位符） */
function isWhitespace(char: string): boolean {
  return (
    char === " " ||
    char === "\n" ||
    char === "\t" ||
    char === "\r" ||
    char === INLINE_TERMINAL_CONTEXT_PLACEHOLDER
  );
}

/**
 * 从光标位置向左查找当前 token 的起始位置（以空白字符为边界）
 *
 * @param text - 目标文本
 * @param cursor - 当前光标位置
 * @returns 当前 token 的起始索引
 */
function tokenStartForCursor(text: string, cursor: number): number {
  let index = cursor - 1;
  while (index >= 0 && !isWhitespace(text[index] ?? "")) {
    index -= 1;
  }
  return index + 1;
}

/**
 * 将折叠视图中的光标位置转换为展开视图中的光标位置。
 *
 * 在折叠视图中，每个内联 token（mention、skill、agent-mention、terminal-context）
 * 被视为单个字符；在展开视图中，它们显示为完整文本。
 * 此函数将折叠光标映射到展开后的实际字符偏移。
 *
 * @param text - 编辑器文本
 * @param cursorInput - 折叠视图中的光标位置
 * @returns 展开视图中的光标位置
 *
 * @example
 * // 假设 "@path" 在折叠视图中占1个字符，展开后占5个字符
 * expandCollapsedComposerCursor("hello @path world", 6) // 光标在折叠的 @ 之后
 */
export function expandCollapsedComposerCursor(text: string, cursorInput: number): number {
  const collapsedCursor = clampCursor(text, cursorInput);
  const segments = splitPromptIntoComposerSegments(text);
  if (segments.length === 0) {
    return collapsedCursor;
  }

  let remaining = collapsedCursor;
  let expandedCursor = 0;

  for (const segment of segments) {
    if (segment.type === "mention") {
      const expandedLength = segment.path.length + 1;
      if (remaining <= 1) {
        return expandedCursor + (remaining === 0 ? 0 : expandedLength);
      }
      remaining -= 1;
      expandedCursor += expandedLength;
      continue;
    }
    if (segment.type === "skill") {
      const expandedLength = segment.name.length + 1;
      if (remaining <= 1) {
        return expandedCursor + (remaining === 0 ? 0 : expandedLength);
      }
      remaining -= 1;
      expandedCursor += expandedLength;
      continue;
    }
    if (segment.type === "agent-mention") {
      // @alias = 1 + alias.length
      const expandedLength = segment.alias.length + 1;
      if (remaining <= 1) {
        return expandedCursor + (remaining === 0 ? 0 : expandedLength);
      }
      remaining -= 1;
      expandedCursor += expandedLength;
      continue;
    }
    if (segment.type === "terminal-context") {
      if (remaining <= 1) {
        return expandedCursor + remaining;
      }
      remaining -= 1;
      expandedCursor += 1;
      continue;
    }

    const segmentLength = segment.text.length;
    if (remaining <= segmentLength) {
      return expandedCursor + remaining;
    }
    remaining -= segmentLength;
    expandedCursor += segmentLength;
  }

  return expandedCursor;
}

/**
 * 计算一个段落在折叠视图中的长度。
 * 纯文本段返回实际字符数，内联 token 段统一返回 1。
 */
function collapsedSegmentLength(segment: ComposerSegmentLike): number {
  if (segment.type === "text") {
    return segment.text.length;
  }
  return 1;
}

/**
 * 将光标位置限制在段落序列的折叠长度范围内
 *
 * @param segments - 段落序列
 * @param cursorInput - 原始光标位置
 * @returns 限制后的光标位置
 */
function clampCollapsedComposerCursorForSegments(
  segments: ReadonlyArray<ComposerSegmentLike>,
  cursorInput: number,
): number {
  const collapsedLength = segments.reduce(
    (total, segment) => total + collapsedSegmentLength(segment),
    0,
  );
  if (!Number.isFinite(cursorInput)) {
    return collapsedLength;
  }
  return Math.max(0, Math.min(collapsedLength, Math.floor(cursorInput)));
}

/**
 * 将光标位置限制在文本的折叠长度范围内
 *
 * @param text - 编辑器文本
 * @param cursorInput - 原始光标位置
 * @returns 限制后的光标位置
 */
export function clampCollapsedComposerCursor(text: string, cursorInput: number): number {
  return clampCollapsedComposerCursorForSegments(
    splitPromptIntoComposerSegments(text),
    cursorInput,
  );
}

/**
 * 将展开视图中的光标位置转换为折叠视图中的光标位置。
 *
 * 与 expandCollapsedComposerCursor 互为逆操作。
 * 在展开视图中内联 token 显示为完整文本，在折叠视图中它们被视为单字符。
 *
 * @param text - 编辑器文本
 * @param cursorInput - 展开视图中的光标位置
 * @returns 折叠视图中的光标位置
 */
export function collapseExpandedComposerCursor(text: string, cursorInput: number): number {
  const expandedCursor = clampCursor(text, cursorInput);
  const segments = splitPromptIntoComposerSegments(text);
  if (segments.length === 0) {
    return expandedCursor;
  }

  let remaining = expandedCursor;
  let collapsedCursor = 0;

  for (const segment of segments) {
    if (segment.type === "mention") {
      const expandedLength = segment.path.length + 1;
      if (remaining === 0) {
        return collapsedCursor;
      }
      if (remaining <= expandedLength) {
        return collapsedCursor + 1;
      }
      remaining -= expandedLength;
      collapsedCursor += 1;
      continue;
    }
    if (segment.type === "skill") {
      const expandedLength = segment.name.length + 1;
      if (remaining === 0) {
        return collapsedCursor;
      }
      if (remaining <= expandedLength) {
        return collapsedCursor + 1;
      }
      remaining -= expandedLength;
      collapsedCursor += 1;
      continue;
    }
    if (segment.type === "agent-mention") {
      // @alias = 1 + alias.length
      const expandedLength = segment.alias.length + 1;
      if (remaining === 0) {
        return collapsedCursor;
      }
      if (remaining <= expandedLength) {
        return collapsedCursor + 1;
      }
      remaining -= expandedLength;
      collapsedCursor += 1;
      continue;
    }
    if (segment.type === "terminal-context") {
      if (remaining <= 1) {
        return collapsedCursor + remaining;
      }
      remaining -= 1;
      collapsedCursor += 1;
      continue;
    }

    const segmentLength = segment.text.length;
    if (remaining <= segmentLength) {
      return collapsedCursor + remaining;
    }
    remaining -= segmentLength;
    collapsedCursor += segmentLength;
  }

  return collapsedCursor;
}

/**
 * 判断折叠视图中的光标是否紧邻某个内联 token。
 *
 * 用于实现"跳过 chip"的键盘导航行为：当光标紧贴 token 边界时，
 * 按方向键应跳过整个 token 而非逐字符移动。
 *
 * @param text - 编辑器文本
 * @param cursorInput - 折叠视图中的光标位置
 * @param direction - 方向：`"left"` 表示光标在 token 右侧，`"right"` 表示光标在 token 左侧
 * @returns 光标是否紧邻内联 token
 */
export function isCollapsedCursorAdjacentToInlineToken(
  text: string,
  cursorInput: number,
  direction: "left" | "right",
): boolean {
  const segments = splitPromptIntoComposerSegments(text);
  if (!segments.some(isInlineTokenSegment)) {
    return false;
  }

  const cursor = clampCollapsedComposerCursorForSegments(segments, cursorInput);
  let collapsedOffset = 0;

  for (const segment of segments) {
    if (isInlineTokenSegment(segment)) {
      if (direction === "left" && cursor === collapsedOffset + 1) {
        return true;
      }
      if (direction === "right" && cursor === collapsedOffset) {
        return true;
      }
    }
    collapsedOffset += collapsedSegmentLength(segment);
  }

  return false;
}

/** isCollapsedCursorAdjacentToInlineToken 的别名，保持向后兼容 */
export const isCollapsedCursorAdjacentToMention = isCollapsedCursorAdjacentToInlineToken;

/**
 * 检测编辑器中当前光标位置处的 Composer 触发器。
 *
 * 按优先级依次检测：
 * 1. `/command` - 斜杠命令（行首以 / 开头）
 * 2. `/model` - 模型切换命令
 * 3. `$skill` - 技能触发器
 * 4. `@"..."` - 带引号的提及
 * 5. `@alias` - 普通提及
 *
 * @param text - 编辑器文本
 * @param cursorInput - 当前光标位置
 * @returns 检测到的触发器，无触发器时返回 null
 *
 * @example
 * detectComposerTrigger("hello @wo", 9) // => { kind: "mention", query: "wo", ... }
 * detectComposerTrigger("/clear", 6)     // => { kind: "slash-command", query: "clear", ... }
 */
export function detectComposerTrigger(text: string, cursorInput: number): ComposerTrigger | null {
  const cursor = clampCursor(text, cursorInput);
  const lineStart = text.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
  const linePrefix = text.slice(lineStart, cursor);

  if (linePrefix.startsWith("/")) {
    const commandMatch = /^\/(\S*)$/.exec(linePrefix);
    if (commandMatch) {
      const commandQuery = commandMatch[1] ?? "";
      if (commandQuery.toLowerCase() === "model") {
        return {
          kind: "slash-model",
          query: "",
          rangeStart: lineStart,
          rangeEnd: cursor,
        };
      }
      if (
        BUILT_IN_COMPOSER_SLASH_COMMANDS.some((command) =>
          command.startsWith(commandQuery.toLowerCase()),
        )
      ) {
        return {
          kind: "slash-command",
          query: commandQuery,
          rangeStart: lineStart,
          rangeEnd: cursor,
        };
      }
      // Unknown `/query` stays in the slash-command lane so provider-native
      // commands can be suggested without borrowing the `$skill` flow.
      return {
        kind: "slash-command",
        query: commandQuery,
        rangeStart: lineStart,
        rangeEnd: cursor,
      };
    }

    const modelMatch = /^\/model(?:\s+(.*))?$/.exec(linePrefix);
    if (modelMatch) {
      return {
        kind: "slash-model",
        query: (modelMatch[1] ?? "").trim(),
        rangeStart: lineStart,
        rangeEnd: cursor,
      };
    }
  }

  const tokenStart = tokenStartForCursor(text, cursor);
  const token = text.slice(tokenStart, cursor);
  if (token.startsWith("$")) {
    return {
      kind: "skill",
      query: token.slice(1),
      rangeStart: tokenStart,
      rangeEnd: cursor,
    };
  }

  // An unclosed `@"..."` mention spans whitespace, so a pure whitespace-bounded
  // token won't catch it. Look back on the line for the last `@"` that hasn't
  // been closed yet and treat everything after it as the active mention query.
  const quotedMentionStart = linePrefix.lastIndexOf('@"');
  if (quotedMentionStart !== -1) {
    const afterOpen = linePrefix.slice(quotedMentionStart + 2);
    if (!afterOpen.includes("@") && !afterOpen.includes('"')) {
      return {
        kind: "mention",
        query: afterOpen,
        rangeStart: lineStart + quotedMentionStart,
        rangeEnd: cursor,
      };
    }
  }

  if (!token.startsWith("@")) {
    return null;
  }

  // Support adjacent mentions like `@foo@bar` by anchoring the active trigger
  // to the last `@` within the whitespace-bounded word. Without this, a chain
  // like `@foo@b` would expose the whole chain as the replacement range, so
  // picking an item would clobber the earlier chip. Emails like `user@host`
  // stay unaffected because the enclosing word doesn't start with `@`.
  const lastAtInToken = token.lastIndexOf("@");
  const mentionStart = tokenStart + lastAtInToken;
  const mentionToken = token.slice(lastAtInToken);
  if (!/^@[^()\s@]*$/.test(mentionToken)) {
    return null;
  }

  return {
    kind: "mention",
    query: mentionToken.slice(1),
    rangeStart: mentionStart,
    rangeEnd: cursor,
  };
}

/**
 * 解析文本是否为独立的斜杠命令（不含参数）。
 * 仅匹配内置命令，排除 `/model`（由专门的模型选择器处理）。
 *
 * @param text - 待解析的文本
 * @returns 匹配到的命令名，不匹配时返回 null
 *
 * @example
 * parseStandaloneComposerSlashCommand("/clear") // => "clear"
 * parseStandaloneComposerSlashCommand("/model")  // => null
 * parseStandaloneComposerSlashCommand("hello")   // => null
 */
export function parseStandaloneComposerSlashCommand(
  text: string,
): Exclude<ComposerSlashCommand, "model"> | null {
  const match = /^\/([a-z-]+)\s*$/i.exec(text.trim());
  if (!match) {
    return null;
  }
  const command = match[1]?.toLowerCase();
  if (!command || !isBuiltInComposerSlashCommand(command) || command === "model") {
    return null;
  }
  return command;
}

/**
 * 替换文本中指定范围的内容，并返回替换后的文本和新光标位置。
 *
 * 光标位置设置为替换文本的末尾，便于用户在替换后继续输入。
 *
 * @param text - 原始文本
 * @param rangeStart - 替换范围的起始位置
 * @param rangeEnd - 替换范围的结束位置
 * @param replacement - 替换文本
 * @returns 包含替换后文本和新光标位置的对象
 *
 * @example
 * replaceTextRange("hello world", 6, 11, "there")
 * // => { text: "hello there", cursor: 11 }
 */
export function replaceTextRange(
  text: string,
  rangeStart: number,
  rangeEnd: number,
  replacement: string,
): { text: string; cursor: number } {
  const safeStart = Math.max(0, Math.min(text.length, rangeStart));
  const safeEnd = Math.max(safeStart, Math.min(text.length, rangeEnd));
  const nextText = `${text.slice(0, safeStart)}${replacement}${text.slice(safeEnd)}`;
  return { text: nextText, cursor: safeStart + replacement.length };
}
