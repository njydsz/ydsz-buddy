/**
 * @file composer-editor-mentions.ts
 * @description Composer 编辑器的文本分段解析模块。
 * 将编辑器文本拆分为结构化的段落序列（文本、提及、技能、终端上下文、Agent 提及），
 * 用于在编辑器中渲染内联 chip 以及进行光标位置计算。
 */

import { isBuiltInComposerSlashCommand } from "./composerSlashCommands";
import {
  INLINE_TERMINAL_CONTEXT_PLACEHOLDER,
  type TerminalContextDraft,
} from "./lib/terminalContext";
import {
  createComposerMentionTokenRegex,
  extractComposerMentionPath,
} from "./lib/composerMentions";
import { resolveAgentAlias } from "@remi-code/contracts";
import type { ProviderMentionReference } from "@remi-code/contracts";

/**
 * Composer 提示文本的段落类型。
 * 每个段落代表文本中的一个语义单元，用于编辑器渲染和光标计算。
 */
export type ComposerPromptSegment =
  | {
      /** 纯文本段落 */
      type: "text";
      /** 文本内容 */
      text: string;
    }
  | {
      /** 文件/路径提及段落 */
      type: "mention";
      /** 提及的路径 */
      path: string;
      /** 提及类型：`"path"` 为路径提及，`"plugin"` 为插件提及 */
      kind?: "path" | "plugin";
    }
  | {
      /** 技能段落 */
      type: "skill";
      /** 技能名称 */
      name: string;
      /** 技能前缀（`$` 或 `/`） */
      prefix?: string;
    }
  | {
      /** 终端上下文段落 */
      type: "terminal-context";
      /** 关联的终端上下文草稿 */
      context: TerminalContextDraft | null;
    }
  | {
      /** Agent 提及段落：@alias - 子代理引用的 chip（括号为纯文本） */
      type: "agent-mention";
      /** Agent 别名 */
      alias: string;
      /** Agent 标识颜色 */
      color: string;
    };

/** 技能 token 正则（仅匹配后面跟空格的，用于内部解析） */
const SKILL_TOKEN_REGEX = /(^|\s)([$/])([a-zA-Z][a-zA-Z0-9_:-]*)(?=\s)/g;
/** 技能 token 正则（也匹配行尾的，用于显示层解析） */
const DISPLAY_SKILL_TOKEN_REGEX = /(^|\s)([$/])([a-zA-Z][a-zA-Z0-9_:-]*)(?=\s|$)/g;

/**
 * Agent 提及 chip 正则：@alias(
 * 保持纯 @alias 文本在输入时可编辑，以便选择器保持打开状态。
 */
const AGENT_MENTION_TOKEN_REGEX = /(^|\s)@([a-zA-Z0-9._-]+)(?=\()/g;

/**
 * 向段落列表中追加纯文本段落。
 * 如果最后一个段落也是纯文本，则合并到该段落中，避免产生过多碎片。
 */
function pushTextSegment(segments: ComposerPromptSegment[], text: string): void {
  if (!text) return;
  const last = segments[segments.length - 1];
  if (last && last.type === "text") {
    last.text += text;
    return;
  }
  segments.push({ type: "text", text });
}

/**
 * 内联 token 匹配结果类型。
 * 用于在文本解析过程中记录 mention、skill 和 agent-mention 的位置信息。
 */
type InlineTokenMatch =
  | {
      kind: "mention" | "skill";
      value: string;
      skillPrefix?: string;
      start: number;
      end: number;
    }
  | {
      kind: "agent-mention";
      alias: string;
      color: string;
      start: number;
      end: number;
    };

/**
 * 收集文本中所有内联 token 的匹配结果。
 *
 * 按优先级依次匹配：agent-mention → mention → skill。
 * agent-mention 的范围会被记录，后续匹配时跳过重叠区域以避免双重匹配。
 * 内置斜杠命令（如 /clear、/plan）不会被识别为 skill。
 *
 * @param text - 待解析的文本
 * @param options.includeTrailingTokenAtEnd - 是否匹配行尾的 token（显示模式需要，内部解析不需要）
 * @returns 按位置排序的匹配结果数组
 */
function collectInlineTokenMatches(
  text: string,
  options: {
    includeTrailingTokenAtEnd: boolean;
  },
): InlineTokenMatch[] {
  const matches: InlineTokenMatch[] = [];
  const mentionRegex = createComposerMentionTokenRegex({
    includeTrailingTokenAtEnd: options.includeTrailingTokenAtEnd,
  });
  const skillRegex = options.includeTrailingTokenAtEnd
    ? DISPLAY_SKILL_TOKEN_REGEX
    : SKILL_TOKEN_REGEX;

  // Track positions covered by agent mentions to avoid double-matching
  const agentMentionRanges: Array<{ start: number; end: number }> = [];

  // First, match agent mentions: @alias (just the alias, parens are plain text)
  for (const match of text.matchAll(AGENT_MENTION_TOKEN_REGEX)) {
    const whitespace = match[1] ?? "";
    const alias = match[2] ?? "";
    const matchIndex = match.index ?? 0;
    const start = matchIndex + whitespace.length;
    const end = start + 1 + alias.length; // @alias

    // Try to resolve the alias
    const resolved = resolveAgentAlias(alias);
    if (!resolved) {
      // Not a valid agent alias, skip - will be handled as regular mention
      continue;
    }

    agentMentionRanges.push({ start, end });

    matches.push({
      kind: "agent-mention",
      alias,
      color: resolved.color,
      start,
      end,
    });
  }

  // Helper to check if a position is inside an agent mention
  const isInsideAgentMention = (pos: number): boolean =>
    agentMentionRanges.some((range) => pos >= range.start && pos < range.end);

  for (const match of text.matchAll(mentionRegex)) {
    const fullMatch = match[0];
    const prefix = match[1] ?? "";
    const path = extractComposerMentionPath(match);
    const matchIndex = match.index ?? 0;
    const start = matchIndex + prefix.length;
    const end = start + fullMatch.length - prefix.length;

    // Skip if this overlaps with an agent mention
    if (isInsideAgentMention(start)) continue;

    if (path.length > 0) {
      matches.push({ kind: "mention", value: path, start, end });
    }
  }

  for (const match of text.matchAll(skillRegex)) {
    const fullMatch = match[0];
    const whitespace = match[1] ?? "";
    const skillPrefix = match[2] ?? "$";
    const name = match[3] ?? "";
    const matchIndex = match.index ?? 0;
    const start = matchIndex + whitespace.length;
    const end = start + fullMatch.length - whitespace.length;

    // Skip if this overlaps with an agent mention
    if (isInsideAgentMention(start)) continue;

    // Skip built-in slash commands so `/clear`, `/plan` etc. stay as plain text.
    if (name.length > 0 && !(skillPrefix === "/" && isBuiltInComposerSlashCommand(name))) {
      matches.push({ kind: "skill", value: name, skillPrefix, start, end });
    }
  }

  matches.sort((a, b) => a.start - b.start);
  return matches;
}

/**
 * 将文本拆分为 Composer 提示段落序列。
 *
 * @param text - 待拆分的文本
 * @param options.includeTrailingTokenAtEnd - 是否匹配行尾的 token
 * @param options.mentionReferences - 可用的提及引用列表，用于区分插件提及
 * @returns 段落序列
 */
function splitTextIntoPromptSegments(
  text: string,
  options: {
    includeTrailingTokenAtEnd: boolean;
    mentionReferences?: ReadonlyArray<ProviderMentionReference>;
  },
): ComposerPromptSegment[] {
  const segments: ComposerPromptSegment[] = [];
  if (!text) {
    return segments;
  }

  const matches = collectInlineTokenMatches(text, options);
  let cursor = 0;

  for (const match of matches) {
    if (match.start < cursor) continue;

    if (match.start > cursor) {
      pushTextSegment(segments, text.slice(cursor, match.start));
    }

    if (match.kind === "agent-mention") {
      segments.push({
        type: "agent-mention",
        alias: match.alias,
        color: match.color,
      });
    } else if (match.kind === "mention") {
      const isPluginMention =
        options.mentionReferences?.some(
          (mention) =>
            mention.name.toLowerCase() === match.value.toLowerCase() ||
            mention.path.toLowerCase() === match.value.toLowerCase(),
        ) ?? false;
      segments.push(
        isPluginMention
          ? { type: "mention", path: match.value, kind: "plugin" }
          : { type: "mention", path: match.value },
      );
    } else {
      const skillSegment: ComposerPromptSegment = match.skillPrefix
        ? { type: "skill", name: match.value, prefix: match.skillPrefix }
        : { type: "skill", name: match.value };
      segments.push(skillSegment);
    }

    cursor = match.end;
  }

  if (cursor < text.length) {
    pushTextSegment(segments, text.slice(cursor));
  }

  return segments;
}

/**
 * 将提示文本拆分为显示用的段落序列。
 * 与 splitPromptIntoComposerSegments 不同，此函数会匹配行尾的 token，
 * 适用于编辑器显示层的渲染。
 *
 * @param prompt - 提示文本
 * @returns 段落序列
 */
export function splitPromptIntoDisplaySegments(prompt: string): ComposerPromptSegment[] {
  return splitTextIntoPromptSegments(prompt, {
    includeTrailingTokenAtEnd: true,
  });
}

/**
 * 将提示文本拆分为 Composer 逻辑用的段落序列。
 *
 * 处理终端上下文占位符，将其从文本中分离并映射到对应的终端上下文草稿。
 * 不匹配行尾的 token（避免将正在输入的 token 误识别为已完成）。
 *
 * @param prompt - 提示文本
 * @param terminalContexts - 终端上下文草稿列表，与文本中的占位符一一对应
 * @param mentionReferences - 可用的提及引用列表，用于区分插件提及
 * @returns 段落序列
 */
export function splitPromptIntoComposerSegments(
  prompt: string,
  terminalContexts: ReadonlyArray<TerminalContextDraft> = [],
  mentionReferences: ReadonlyArray<ProviderMentionReference> = [],
): ComposerPromptSegment[] {
  if (!prompt) {
    return [];
  }

  const segments: ComposerPromptSegment[] = [];
  let textCursor = 0;
  let terminalContextIndex = 0;

  for (let index = 0; index < prompt.length; index += 1) {
    if (prompt[index] !== INLINE_TERMINAL_CONTEXT_PLACEHOLDER) {
      continue;
    }

    if (index > textCursor) {
      segments.push(
        ...splitTextIntoPromptSegments(prompt.slice(textCursor, index), {
          includeTrailingTokenAtEnd: false,
          mentionReferences,
        }),
      );
    }
    segments.push({
      type: "terminal-context",
      context: terminalContexts[terminalContextIndex] ?? null,
    });
    terminalContextIndex += 1;
    textCursor = index + 1;
  }

  if (textCursor < prompt.length) {
    segments.push(
      ...splitTextIntoPromptSegments(prompt.slice(textCursor), {
        includeTrailingTokenAtEnd: false,
        mentionReferences,
      }),
    );
  }

  return segments;
}
