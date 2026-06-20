/**
 * @file composer-editor-mentions.ts
 * @description Composer 缂傛牞绶崳銊ф畱閺傚洦婀伴崚鍡橆唽鐟欙絾鐎藉Ο鈥虫健閵? * 鐏忓棛绱潏鎴濇珤閺傚洦婀伴幏鍡楀瀻娑撹櫣绮ㄩ弸鍕閻ㄥ嫭顔岄拃钘夌碍閸掓绱欓弬鍥ㄦ拱閵嗕焦褰侀崣濞库偓浣瑰Η閼冲鈧胶绮撶粩顖欑瑐娑撳鏋冮妴涓刧ent 閹绘劕寮烽敍澶涚礉
 * 閻劋绨崷銊х椽鏉堟垵娅掓稉顓熻閺屾挸鍞撮懕?chip 娴犮儱寮锋潻娑滎攽閸忓鐖ｆ担宥囩枂鐠侊紕鐣婚妴? */

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
 * Composer 閹绘劗銇氶弬鍥ㄦ拱閻ㄥ嫭顔岄拃鐣岃閸ㄥ鈧? * 濮ｅ繋閲滃▓浣冩儰娴狅綀銆冮弬鍥ㄦ拱娑擃厾娈戞稉鈧稉顏囶嚔娑斿宕熼崗鍐跨礉閻劋绨紓鏍帆閸ｃ劍瑕嗛弻鎾虫嫲閸忓鐖ｇ拋锛勭暬閵? */
export type ComposerPromptSegment =
  | {
      /** 缁绢垱鏋冮張顒侇唽閽€?*/
      type: "text";
      /** 閺傚洦婀伴崘鍛啇 */
      text: string;
    }
  | {
      /** 閺傚洣娆?鐠侯垰绶為幓鎰挤濞堜絻鎯?*/
      type: "mention";
      /** 閹绘劕寮烽惃鍕熅瀵?*/
      path: string;
      /** 閹绘劕寮风猾璇茬€烽敍姝?path"` 娑撻缚鐭惧鍕絹閸欏绱漙"plugin"` 娑撶儤褰冩禒鑸靛絹閸?*/
      kind?: "path" | "plugin";
    }
  | {
      /** 閹垛偓閼宠姤顔岄拃?*/
      type: "skill";
      /** 閹垛偓閼宠棄鎮曠粔?*/
      name: string;
      /** 閹垛偓閼宠棄澧犵紓鈧敍鍧?` 閹?`/`閿?*/
      prefix?: string;
    }
  | {
      /** 缂佸牏顏稉濠佺瑓閺傚洦顔岄拃?*/
      type: "terminal-context";
      /** 閸忓疇浠堥惃鍕矒缁旑垯绗傛稉瀣瀮閼藉枪 */
      context: TerminalContextDraft | null;
    }
  | {
      /** Agent 閹绘劕寮峰▓浣冩儰閿涙alias - 鐎涙劒鍞悶鍡楃穿閻劎娈?chip閿涘牊瀚崣铚傝礋缁绢垱鏋冮張顒婄礆 */
      type: "agent-mention";
      /** Agent 閸掝偄鎮?*/
      alias: string;
      /** Agent 閺嶅洩鐦戞０婊嗗 */
      color: string;
    };

/** 閹垛偓閼?token 濮濓絽鍨敍鍫滅矌閸栧綊鍘ら崥搴ㄦ桨鐠虹喓鈹栭弽鑲╂畱閿涘瞼鏁ゆ禍搴″敶闁劏袙閺嬫劧绱?*/
const SKILL_TOKEN_REGEX = /(^|\s)([$/])([a-zA-Z][a-zA-Z0-9_:-]*)(?=\s)/g;
/** 閹垛偓閼?token 濮濓絽鍨敍鍫滅瘍閸栧綊鍘ょ悰灞界啲閻ㄥ嫸绱濋悽銊ょ艾閺勫墽銇氱仦鍌澬掗弸鎰剁礆 */
const DISPLAY_SKILL_TOKEN_REGEX = /(^|\s)([$/])([a-zA-Z][a-zA-Z0-9_:-]*)(?=\s|$)/g;

/**
 * Agent 閹绘劕寮?chip 濮濓絽鍨敍娆痑lias(
 * 娣囨繃瀵旂痪?@alias 閺傚洦婀伴崷銊ㄧ翻閸忋儲妞傞崣顖滅椽鏉堟埊绱濇禒銉ょ┒闁瀚ㄩ崳銊ょ箽閹镐焦澧﹀鈧悩鑸碘偓浣碘偓? */
const AGENT_MENTION_TOKEN_REGEX = /(^|\s)@([a-zA-Z0-9._-]+)(?=\()/g;

/**
 * 閸氭垶顔岄拃钘夊灙鐞涖劋鑵戞潻钘夊缁绢垱鏋冮張顒侇唽閽€濮愨偓? * 婵″倹鐏夐張鈧崥搴濈娑擃亝顔岄拃鎴掔瘍閺勵垳鍑介弬鍥ㄦ拱閿涘苯鍨崥鍫濊嫙閸掓媽顕氬▓浣冩儰娑擃叏绱濋柆鍨帳娴溠呮晸鏉╁洤顦跨喊搴ｅ閵? */
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
 * 閸愬懓浠?token 閸栧綊鍘ょ紒鎾寸亯缁鐎烽妴? * 閻劋绨崷銊︽瀮閺堫剝袙閺嬫劘绻冪粙瀣╄厬鐠佹澘缍?mention閵嗕够kill 閸?agent-mention 閻ㄥ嫪缍呯純顔讳繆閹垬鈧? */
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
 * 閺€鍫曟肠閺傚洦婀版稉顓熷閺堝鍞撮懕?token 閻ㄥ嫬灏柊宥囩波閺嬫嚎鈧? *
 * 閹稿绱崗鍫㈤獓娓氭繃顐奸崠褰掑帳閿涙瓫gent-mention 閳?mention 閳?skill閵? * agent-mention 閻ㄥ嫯瀵栭崶缈犵窗鐞氼偉顔囪ぐ鏇礉閸氬海鐢婚崠褰掑帳閺冩儼鐑︽潻鍥櫢閸欑姴灏崺鐔朵簰闁灝鍘ら崣宀勫櫢閸栧綊鍘ら妴? * 閸愬懐鐤嗛弬婊勬浆閸涙垝鎶ら敍鍫濐洤 /clear閵?plan閿涘绗夋导姘愁潶鐠囧棗鍩嗘稉?skill閵? *
 * @param text - 瀵板懓袙閺嬫劗娈戦弬鍥ㄦ拱
 * @param options.includeTrailingTokenAtEnd - 閺勵垰鎯侀崠褰掑帳鐞涘苯鐔惃?token閿涘牊妯夌粈鐑樐佸蹇涙付鐟曚緤绱濋崘鍛村劥鐟欙絾鐎芥稉宥夋付鐟曚緤绱? * @returns 閹稿缍呯純顔藉笓鎼村繒娈戦崠褰掑帳缂佹挻鐏夐弫鎵矋
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
 * 鐏忓棙鏋冮張顒佸閸掑棔璐?Composer 閹绘劗銇氬▓浣冩儰鎼村繐鍨妴? *
 * @param text - 瀵板懏濯堕崚鍡欐畱閺傚洦婀? * @param options.includeTrailingTokenAtEnd - 閺勵垰鎯侀崠褰掑帳鐞涘苯鐔惃?token
 * @param options.mentionReferences - 閸欘垳鏁ら惃鍕絹閸欏﹤绱╅悽銊ュ灙鐞涱煉绱濋悽銊ょ艾閸栧搫鍨庨幓鎺嶆閹绘劕寮? * @returns 濞堜絻鎯ゆ惔蹇撳灙
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
 * 鐏忓棙褰佺粈鐑樻瀮閺堫剚濯堕崚鍡曡礋閺勫墽銇氶悽銊ф畱濞堜絻鎯ゆ惔蹇撳灙閵? * 娑?splitPromptIntoComposerSegments 娑撳秴鎮撻敍灞绢劃閸戣姤鏆熸导姘爱闁板秷顢戠亸鍓ф畱 token閿? * 闁倻鏁ゆ禍搴ｇ椽鏉堟垵娅掗弰鍓с仛鐏炲倻娈戝〒鍙夌厠閵? *
 * @param prompt - 閹绘劗銇氶弬鍥ㄦ拱
 * @returns 濞堜絻鎯ゆ惔蹇撳灙
 */
export function splitPromptIntoDisplaySegments(prompt: string): ComposerPromptSegment[] {
  return splitTextIntoPromptSegments(prompt, {
    includeTrailingTokenAtEnd: true,
  });
}

/**
 * 鐏忓棙褰佺粈鐑樻瀮閺堫剚濯堕崚鍡曡礋 Composer 闁槒绶悽銊ф畱濞堜絻鎯ゆ惔蹇撳灙閵? *
 * 婢跺嫮鎮婄紒鍫㈩伂娑撳﹣绗呴弬鍥у窗娴ｅ秶顑侀敍灞界殺閸忔湹绮犻弬鍥ㄦ拱娑擃厼鍨庣粋璇茶嫙閺勭姴鐨犻崚鏉款嚠鎼存梻娈戠紒鍫㈩伂娑撳﹣绗呴弬鍥磸缁嬭￥鈧? * 娑撳秴灏柊宥堫攽鐏忓墽娈?token閿涘牓浼╅崗宥呯殺濮濓絽婀潏鎾冲弳閻?token 鐠囶垵鐦戦崚顐¤礋瀹告彃鐣幋鎰剁礆閵? *
 * @param prompt - 閹绘劗銇氶弬鍥ㄦ拱
 * @param terminalContexts - 缂佸牏顏稉濠佺瑓閺傚洩宕忕粙鍨灙鐞涱煉绱濇稉搴㈡瀮閺堫兛鑵戦惃鍕窗娴ｅ秶顑佹稉鈧稉鈧€电懓绨? * @param mentionReferences - 閸欘垳鏁ら惃鍕絹閸欏﹤绱╅悽銊ュ灙鐞涱煉绱濋悽銊ょ艾閸栧搫鍨庨幓鎺嶆閹绘劕寮? * @returns 濞堜絻鎯ゆ惔蹇撳灙
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
