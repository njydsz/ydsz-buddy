/**
 * @file composer-editor-mentions.ts
 * @description Composer 缂栬緫鍣ㄧ殑鏂囨湰鍒嗘瑙ｆ瀽妯″潡銆? * 灏嗙紪杈戝櫒鏂囨湰鎷嗗垎涓虹粨鏋勫寲鐨勬钀藉簭鍒楋紙鏂囨湰銆佹彁鍙娿€佹妧鑳姐€佺粓绔笂涓嬫枃銆丄gent 鎻愬強锛夛紝
 * 鐢ㄤ簬鍦ㄧ紪杈戝櫒涓覆鏌撳唴鑱?chip 浠ュ強杩涜鍏夋爣浣嶇疆璁＄畻銆? */

import { isBuiltInComposerSlashCommand } from "./composerSlashCommands";
import {
  INLINE_TERMINAL_CONTEXT_PLACEHOLDER,
  type TerminalContextDraft,
} from "./lib/terminalContext";
import {
  createComposerMentionTokenRegex,
  extractComposerMentionPath,
} from "./lib/composerMentions";
import { resolveAgentAlias } from "~/contracts";
import type { ProviderMentionReference } from "~/contracts";

/**
 * Composer 鎻愮ず鏂囨湰鐨勬钀界被鍨嬨€? * 姣忎釜娈佃惤浠ｈ〃鏂囨湰涓殑涓€涓涔夊崟鍏冿紝鐢ㄤ簬缂栬緫鍣ㄦ覆鏌撳拰鍏夋爣璁＄畻銆? */
export type ComposerPromptSegment =
  | {
      /** 绾枃鏈钀?*/
      type: "text";
      /** 鏂囨湰鍐呭 */
      text: string;
    }
  | {
      /** 鏂囦欢/璺緞鎻愬強娈佃惤 */
      type: "mention";
      /** 鎻愬強鐨勮矾寰?*/
      path: string;
      /** 鎻愬強绫诲瀷锛歚"path"` 涓鸿矾寰勬彁鍙婏紝`"plugin"` 涓烘彃浠舵彁鍙?*/
      kind?: "path" | "plugin";
    }
  | {
      /** 鎶€鑳芥钀?*/
      type: "skill";
      /** 鎶€鑳藉悕绉?*/
      name: string;
      /** 鎶€鑳藉墠缂€锛坄$` 鎴?`/`锛?*/
      prefix?: string;
    }
  | {
      /** 缁堢涓婁笅鏂囨钀?*/
      type: "terminal-context";
      /** 鍏宠仈鐨勭粓绔笂涓嬫枃鑽夌ǹ */
      context: TerminalContextDraft | null;
    }
  | {
      /** Agent 鎻愬強娈佃惤锛欯alias - 瀛愪唬鐞嗗紩鐢ㄧ殑 chip锛堟嫭鍙蜂负绾枃鏈級 */
      type: "agent-mention";
      /** Agent 鍒悕 */
      alias: string;
      /** Agent 鏍囪瘑棰滆壊 */
      color: string;
    };

/** 鎶€鑳?token 姝ｅ垯锛堜粎鍖归厤鍚庨潰璺熺┖鏍肩殑锛岀敤浜庡唴閮ㄨВ鏋愶級 */
const SKILL_TOKEN_REGEX = /(^|\s)([$/])([a-zA-Z][a-zA-Z0-9_:-]*)(?=\s)/g;
/** 鎶€鑳?token 姝ｅ垯锛堜篃鍖归厤琛屽熬鐨勶紝鐢ㄤ簬鏄剧ず灞傝В鏋愶級 */
const DISPLAY_SKILL_TOKEN_REGEX = /(^|\s)([$/])([a-zA-Z][a-zA-Z0-9_:-]*)(?=\s|$)/g;

/**
 * Agent 鎻愬強 chip 姝ｅ垯锛欯alias(
 * 淇濇寔绾?@alias 鏂囨湰鍦ㄨ緭鍏ユ椂鍙紪杈戯紝浠ヤ究閫夋嫨鍣ㄤ繚鎸佹墦寮€鐘舵€併€? */
const AGENT_MENTION_TOKEN_REGEX = /(^|\s)@([a-zA-Z0-9._-]+)(?=\()/g;

/**
 * 鍚戞钀藉垪琛ㄤ腑杩藉姞绾枃鏈钀姐€? * 濡傛灉鏈€鍚庝竴涓钀戒篃鏄函鏂囨湰锛屽垯鍚堝苟鍒拌娈佃惤涓紝閬垮厤浜х敓杩囧纰庣墖銆? */
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
 * 鍐呰仈 token 鍖归厤缁撴灉绫诲瀷銆? * 鐢ㄤ簬鍦ㄦ枃鏈В鏋愯繃绋嬩腑璁板綍 mention銆乻kill 鍜?agent-mention 鐨勪綅缃俊鎭€? */
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
 * 鏀堕泦鏂囨湰涓墍鏈夊唴鑱?token 鐨勫尮閰嶇粨鏋溿€? *
 * 鎸変紭鍏堢骇渚濇鍖归厤锛歛gent-mention 鈫?mention 鈫?skill銆? * agent-mention 鐨勮寖鍥翠細琚褰曪紝鍚庣画鍖归厤鏃惰烦杩囬噸鍙犲尯鍩熶互閬垮厤鍙岄噸鍖归厤銆? * 鍐呯疆鏂滄潬鍛戒护锛堝 /clear銆?plan锛変笉浼氳璇嗗埆涓?skill銆? *
 * @param text - 寰呰В鏋愮殑鏂囨湰
 * @param options.includeTrailingTokenAtEnd - 鏄惁鍖归厤琛屽熬鐨?token锛堟樉绀烘ā寮忛渶瑕侊紝鍐呴儴瑙ｆ瀽涓嶉渶瑕侊級
 * @returns 鎸変綅缃帓搴忕殑鍖归厤缁撴灉鏁扮粍
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
 * 灏嗘枃鏈媶鍒嗕负 Composer 鎻愮ず娈佃惤搴忓垪銆? *
 * @param text - 寰呮媶鍒嗙殑鏂囨湰
 * @param options.includeTrailingTokenAtEnd - 鏄惁鍖归厤琛屽熬鐨?token
 * @param options.mentionReferences - 鍙敤鐨勬彁鍙婂紩鐢ㄥ垪琛紝鐢ㄤ簬鍖哄垎鎻掍欢鎻愬強
 * @returns 娈佃惤搴忓垪
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
 * 灏嗘彁绀烘枃鏈媶鍒嗕负鏄剧ず鐢ㄧ殑娈佃惤搴忓垪銆? * 涓?splitPromptIntoComposerSegments 涓嶅悓锛屾鍑芥暟浼氬尮閰嶈灏剧殑 token锛? * 閫傜敤浜庣紪杈戝櫒鏄剧ず灞傜殑娓叉煋銆? *
 * @param prompt - 鎻愮ず鏂囨湰
 * @returns 娈佃惤搴忓垪
 */
export function splitPromptIntoDisplaySegments(prompt: string): ComposerPromptSegment[] {
  return splitTextIntoPromptSegments(prompt, {
    includeTrailingTokenAtEnd: true,
  });
}

/**
 * 灏嗘彁绀烘枃鏈媶鍒嗕负 Composer 閫昏緫鐢ㄧ殑娈佃惤搴忓垪銆? *
 * 澶勭悊缁堢涓婁笅鏂囧崰浣嶇锛屽皢鍏朵粠鏂囨湰涓垎绂诲苟鏄犲皠鍒板搴旂殑缁堢涓婁笅鏂囪崏绋裤€? * 涓嶅尮閰嶈灏剧殑 token锛堥伩鍏嶅皢姝ｅ湪杈撳叆鐨?token 璇瘑鍒负宸插畬鎴愶級銆? *
 * @param prompt - 鎻愮ず鏂囨湰
 * @param terminalContexts - 缁堢涓婁笅鏂囪崏绋垮垪琛紝涓庢枃鏈腑鐨勫崰浣嶇涓€涓€瀵瑰簲
 * @param mentionReferences - 鍙敤鐨勬彁鍙婂紩鐢ㄥ垪琛紝鐢ㄤ簬鍖哄垎鎻掍欢鎻愬強
 * @returns 娈佃惤搴忓垪
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
