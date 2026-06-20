/**
 * @file 鍔╂墜閫夋嫨寮曠敤澶勭悊妯″潡
 * @description 瑙勮寖鍖栥€佸簭鍒楀寲鍜屽墺绂荤敤鎴锋彁绀鸿瘝涓殑鍔╂墜寮曠敤閫夋嫨鍐呭銆? *              鐢ㄤ簬鑱婂ぉ缂栬緫鍣ㄥ拰瀵硅瘽璁板綍杈呭姪鍑芥暟銆? */

import { CHAT_ASSISTANT_SELECTION_TEXT_MAX_CHARS } from "~/contracts";

import type { ChatAssistantSelectionAttachment } from "../types";
import { randomUUID } from "./utils";

/** 灏鹃儴鍔╂墜閫夋嫨寮曠敤鐨勬鍒欏尮閰嶆ā寮?*/
const TRAILING_ASSISTANT_SELECTIONS_PATTERN =
  /\n*<assistant_selection>\n([\s\S]*?)\n<\/assistant_selection>\s*$/;
/** 宓屽叆寮忓姪鎵嬮€夋嫨寮曠敤鐨勬鍒欏尮閰嶆ā寮?*/
const EMBEDDED_ASSISTANT_SELECTIONS_PATTERN =
  /\n*<assistant_selection>\n[\s\S]*?\n<\/assistant_selection>(?=\n*(<terminal_context>\n[\s\S]*?\n<\/terminal_context>\s*)?$)/;
/** 鍔╂墜閫夋嫨棰勮鐨勬渶澶у瓧绗︽暟 */
const ASSISTANT_SELECTION_PREVIEW_MAX_CHARS = 44;

/**
 * 鎻愬彇鐨勫姪鎵嬮€夋嫨寮曠敤缁撴灉鎺ュ彛
 */
export interface ExtractedAssistantSelections {
  /** 鍓ョ閫夋嫨寮曠敤鍚庣殑鎻愮ず璇嶆枃鏈?*/
  promptText: string;
  /** 瑙ｆ瀽鍑虹殑閫夋嫨寮曠敤鏉＄洰鍒楄〃 */
  selections: ParsedAssistantSelectionEntry[];
}

/**
 * 瑙ｆ瀽鍚庣殑鍔╂墜閫夋嫨寮曠敤鏉＄洰
 */
export interface ParsedAssistantSelectionEntry {
  /** 鍔╂墜娑堟伅鐨勫敮涓€鏍囪瘑绗?*/
  assistantMessageId: string;
  /** 閫夋嫨鐨勬枃鏈唴瀹?*/
  text: string;
}

/**
 * 鍔╂墜閫夋嫨寮曠敤楠岃瘉閿欒绫诲瀷
 * - "empty": 鍐呭涓虹┖
 * - "too-long": 鍐呭瓒呴暱
 */
export type AssistantSelectionValidationError = "empty" | "too-long";

/**
 * 瑙勮寖鍖栧姪鎵嬮€夋嫨寮曠敤鏂囨湰
 * @param text - 鍘熷閫夋嫨鏂囨湰
 * @returns 瑙勮寖鍖栧悗鐨勬枃鏈紙缁熶竴鎹㈣绗︺€佸幓闄ら灏剧┖鐧斤級
 */
export function normalizeAssistantSelectionText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/^\n+|\n+$/g, "")
    .trim();
}

/**
 * 鑾峰彇鍔╂墜閫夋嫨寮曠敤鐨勯獙璇侀敊璇? * @param selection - 鍖呭惈鍔╂墜娑堟伅ID鍜屾枃鏈殑閫夋嫨瀵硅薄
 * @returns 楠岃瘉閿欒绫诲瀷锛屽鏋滈獙璇侀€氳繃鍒欒繑鍥?null
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
 * 瑙勮寖鍖栧姪鎵嬮€夋嫨寮曠敤闄勪欢
 * @param selection - 鍖呭惈鍔╂墜娑堟伅ID鍜屾枃鏈殑閫夋嫨瀵硅薄
 * @returns 瑙勮寖鍖栧悗鐨勯€夋嫨瀵硅薄锛屽鏋滈獙璇佸け璐ュ垯杩斿洖 null
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
 * 鍒涘缓鍔╂墜閫夋嫨寮曠敤闄勪欢
 * @param input - 鍖呭惈鍔╂墜娑堟伅ID鍜屾枃鏈殑杈撳叆瀵硅薄
 * @returns 瀹屾暣鐨勯檮浠跺璞★紝濡傛灉楠岃瘉澶辫触鍒欒繑鍥?null
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
 * 鏍煎紡鍖栧姪鎵嬮€夋嫨寮曠敤鐨勯瑙堟枃鏈? * @param text - 閫夋嫨鏂囨湰
 * @returns 棰勮鏂囨湰锛堥琛屽唴瀹癸紝瓒呴暱鏃舵埅鏂級
 */
export function formatAssistantSelectionPreview(text: string): string {
  const normalized = normalizeAssistantSelectionText(text);
  if (normalized.length === 0) {
    return "Selection";
  }
  const firstLine = normalized.split("\n")[0] ?? normalized;
  return firstLine.length > ASSISTANT_SELECTION_PREVIEW_MAX_CHARS
    ? `${firstLine.slice(0, ASSISTANT_SELECTION_PREVIEW_MAX_CHARS - 1)}鈥
    : firstLine;
}

/**
 * 鏍煎紡鍖栧姪鎵嬮€夋嫨寮曠敤闃熷垪鐨勯瑙堟枃鏈? * @param selectionCount - 閫夋嫨寮曠敤鏁伴噺
 * @returns 闃熷垪棰勮鏂囨湰
 */
export function formatAssistantSelectionQueuePreview(selectionCount: number): string {
  return selectionCount === 1 ? "1 referenced selection" : "Referenced selections";
}

/**
 * 鏍煎紡鍖栧姪鎵嬮€夋嫨寮曠敤鐨勬爣棰樼瀛愭枃鏈? * @param selectionCount - 閫夋嫨寮曠敤鏁伴噺
 * @returns 鏍囬绉嶅瓙鏂囨湰
 */
export function formatAssistantSelectionTitleSeed(selectionCount: number): string {
  return selectionCount === 1
    ? "Referenced assistant selection"
    : "Referenced assistant selections";
}

/**
 * 鏋勫缓鍔╂墜閫夋嫨寮曠敤鐨勬彁绀鸿瘝鍧? * @param selections - 閫夋嫨寮曠敤鍒楄〃
 * @returns 鏍煎紡鍖栧悗鐨?XML 鎻愮ず璇嶅潡锛屽鏋滄病鏈夋湁鏁堥€夋嫨鍒欒繑鍥炵┖瀛楃涓? */
export function buildAssistantSelectionsPromptBlock(
  selections: ReadonlyArray<Pick<ChatAssistantSelectionAttachment, "assistantMessageId" | "text">>,
): string {
  // 瑙勮寖鍖栧苟杩囨护鏃犳晥鐨勯€夋嫨寮曠敤
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

  // 鏋勫缓 XML 鏍煎紡鐨勯€夋嫨寮曠敤鍧?  const lines: string[] = [];
  for (const selection of normalizedSelections) {
    lines.push(`- assistant message ${selection.assistantMessageId}:`);
    for (const line of selection.text.split("\n")) {
      lines.push(`  ${line}`);
    }
  }
  return ["<assistant_selection>", ...lines, "</assistant_selection>"].join("\n");
}

/**
 * 灏嗗姪鎵嬮€夋嫨寮曠敤杩藉姞鍒版彁绀鸿瘝鏈熬
 * @param prompt - 鍘熷鎻愮ず璇? * @param selections - 閫夋嫨寮曠敤鍒楄〃
 * @returns 杩藉姞閫夋嫨寮曠敤鍚庣殑鎻愮ず璇? */
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
 * 浠庢彁绀鸿瘝灏鹃儴鎻愬彇鍔╂墜閫夋嫨寮曠敤
 * @param prompt - 鍘熷鎻愮ず璇? * @returns 鎻愬彇缁撴灉锛屽寘鍚墺绂诲悗鐨勬彁绀鸿瘝鍜岃В鏋愬嚭鐨勯€夋嫨寮曠敤鍒楄〃
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
 * 浠庢彁绀鸿瘝灏鹃儴鍓ョ鍔╂墜閫夋嫨寮曠敤
 * @param prompt - 鍘熷鎻愮ず璇? * @returns 鍓ョ閫夋嫨寮曠敤鍚庣殑鎻愮ず璇? */
export function stripTrailingAssistantSelections(prompt: string): string {
  return extractTrailingAssistantSelections(prompt).promptText;
}

/**
 * 浠庢彁绀鸿瘝涓墺绂诲祵鍏ョ殑鍔╂墜閫夋嫨寮曠敤
 * @param prompt - 鍘熷鎻愮ず璇? * @returns 鍓ョ宓屽叆閫夋嫨寮曠敤鍚庣殑鎻愮ず璇? */
export function stripEmbeddedAssistantSelections(prompt: string): string {
  return prompt.replace(EMBEDDED_ASSISTANT_SELECTIONS_PATTERN, "");
}

/**
 * 瑙ｆ瀽鍔╂墜閫夋嫨寮曠敤鏉＄洰锛堝唴閮ㄥ嚱鏁帮級
 * @param block - 閫夋嫨寮曠敤鍧楃殑鏂囨湰鍐呭
 * @returns 瑙ｆ瀽鍚庣殑閫夋嫨寮曠敤鏉＄洰鍒楄〃
 */
function parseAssistantSelectionEntries(block: string): ParsedAssistantSelectionEntry[] {
  const entries: ParsedAssistantSelectionEntry[] = [];
  let current: { assistantMessageId: string; lines: string[] } | null = null;

  // 鎻愪氦褰撳墠瑙ｆ瀽鏉＄洰鐨勮緟鍔╁嚱鏁?  const commitCurrent = () => {
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

  // 閫愯瑙ｆ瀽閫夋嫨寮曠敤鍧?  for (const rawLine of block.split("\n")) {
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
    // 澶勭悊缂╄繘鐨勫唴瀹硅
    if (rawLine.startsWith("  ")) {
      current.lines.push(rawLine.slice(2));
      continue;
    }
    // 澶勭悊绌鸿
    if (rawLine.length === 0) {
      current.lines.push("");
    }
  }

  commitCurrent();
  return entries;
}
