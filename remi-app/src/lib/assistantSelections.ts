/**
 * @file 閸斺晜澧滈柅澶嬪瀵洜鏁ゆ径鍕倞濡€虫健
 * @description 鐟欏嫯瀵栭崠鏍モ偓浣哥碍閸掓瀵查崪灞藉⒑缁傝崵鏁ら幋閿嬪絹缁€楦跨槤娑擃厾娈戦崝鈺傚瀵洜鏁ら柅澶嬪閸愬懎顔愰妴? *              閻劋绨懕濠傘亯缂傛牞绶崳銊ユ嫲鐎电鐦界拋鏉跨秿鏉堝懎濮崙鑺ユ殶閵? */

import { CHAT_ASSISTANT_SELECTION_TEXT_MAX_CHARS } from "~/contracts";

import type { ChatAssistantSelectionAttachment } from "../types";
import { randomUUID } from "./utils";

/** 鐏忛箖鍎撮崝鈺傚闁瀚ㄥ鏇犳暏閻ㄥ嫭顒滈崚娆忓爱闁板秵膩瀵?*/
const TRAILING_ASSISTANT_SELECTIONS_PATTERN =
  /\n*<assistant_selection>\n([\s\S]*?)\n<\/assistant_selection>\s*$/;
/** 瀹撳苯鍙嗗蹇撳И閹靛鈧瀚ㄥ鏇犳暏閻ㄥ嫭顒滈崚娆忓爱闁板秵膩瀵?*/
const EMBEDDED_ASSISTANT_SELECTIONS_PATTERN =
  /\n*<assistant_selection>\n[\s\S]*?\n<\/assistant_selection>(?=\n*(<terminal_context>\n[\s\S]*?\n<\/terminal_context>\s*)?$)/;
/** 閸斺晜澧滈柅澶嬪妫板嫯顫嶉惃鍕付婢堆冪摟缁楋附鏆?*/
const ASSISTANT_SELECTION_PREVIEW_MAX_CHARS = 44;

/**
 * 閹绘劕褰囬惃鍕И閹靛鈧瀚ㄥ鏇犳暏缂佹挻鐏夐幒銉ュ經
 */
export interface ExtractedAssistantSelections {
  /** 閸撱儳顬囬柅澶嬪瀵洜鏁ら崥搴ｆ畱閹绘劗銇氱拠宥嗘瀮閺?*/
  promptText: string;
  /** 鐟欙絾鐎介崙铏规畱闁瀚ㄥ鏇犳暏閺夛紕娲伴崚妤勩€?*/
  selections: ParsedAssistantSelectionEntry[];
}

/**
 * 鐟欙絾鐎介崥搴ｆ畱閸斺晜澧滈柅澶嬪瀵洜鏁ら弶锛勬窗
 */
export interface ParsedAssistantSelectionEntry {
  /** 閸斺晜澧滃☉鍫熶紖閻ㄥ嫬鏁稉鈧弽鍥槕缁?*/
  assistantMessageId: string;
  /** 闁瀚ㄩ惃鍕瀮閺堫剙鍞寸€?*/
  text: string;
}

/**
 * 閸斺晜澧滈柅澶嬪瀵洜鏁ゆ宀冪槈闁挎瑨顕ょ猾璇茬€? * - "empty": 閸愬懎顔愭稉铏光敄
 * - "too-long": 閸愬懎顔愮搾鍛存毐
 */
export type AssistantSelectionValidationError = "empty" | "too-long";

/**
 * 鐟欏嫯瀵栭崠鏍уИ閹靛鈧瀚ㄥ鏇犳暏閺傚洦婀? * @param text - 閸樼喎顫愰柅澶嬪閺傚洦婀? * @returns 鐟欏嫯瀵栭崠鏍ф倵閻ㄥ嫭鏋冮張顒婄礄缂佺喍绔撮幑銏ｎ攽缁楋负鈧礁骞撻梽銈夘浕鐏忓墽鈹栭惂鏂ょ礆
 */
export function normalizeAssistantSelectionText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/^\n+|\n+$/g, "")
    .trim();
}

/**
 * 閼惧嘲褰囬崝鈺傚闁瀚ㄥ鏇犳暏閻ㄥ嫰鐛欑拠渚€鏁婄拠? * @param selection - 閸栧懎鎯堥崝鈺傚濞戝牊浼匢D閸滃本鏋冮張顒傛畱闁瀚ㄧ€电钖? * @returns 妤犲矁鐦夐柨娆掝嚖缁鐎烽敍灞筋洤閺嬫粓鐛欑拠渚€鈧俺绻冮崚娆掔箲閸?null
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
 * 鐟欏嫯瀵栭崠鏍уИ閹靛鈧瀚ㄥ鏇犳暏闂勫嫪娆? * @param selection - 閸栧懎鎯堥崝鈺傚濞戝牊浼匢D閸滃本鏋冮張顒傛畱闁瀚ㄧ€电钖? * @returns 鐟欏嫯瀵栭崠鏍ф倵閻ㄥ嫰鈧瀚ㄧ€电钖勯敍灞筋洤閺嬫粓鐛欑拠浣搞亼鐠愩儱鍨潻鏂挎礀 null
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
 * 閸掓稑缂撻崝鈺傚闁瀚ㄥ鏇犳暏闂勫嫪娆? * @param input - 閸栧懎鎯堥崝鈺傚濞戝牊浼匢D閸滃本鏋冮張顒傛畱鏉堟挸鍙嗙€电钖? * @returns 鐎瑰本鏆ｉ惃鍕娴犺泛顕挒鈽呯礉婵″倹鐏夋宀冪槈婢惰精瑙﹂崚娆掔箲閸?null
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
 * 閺嶇厧绱￠崠鏍уИ閹靛鈧瀚ㄥ鏇犳暏閻ㄥ嫰顣╃憴鍫熸瀮閺? * @param text - 闁瀚ㄩ弬鍥ㄦ拱
 * @returns 妫板嫯顫嶉弬鍥ㄦ拱閿涘牓顩荤悰灞藉敶鐎圭櫢绱濈搾鍛存毐閺冭埖鍩呴弬顓ㄧ礆
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
 * 閺嶇厧绱￠崠鏍уИ閹靛鈧瀚ㄥ鏇犳暏闂冪喎鍨惃鍕暕鐟欏牊鏋冮張? * @param selectionCount - 闁瀚ㄥ鏇犳暏閺佷即鍣? * @returns 闂冪喎鍨０鍕潔閺傚洦婀? */
export function formatAssistantSelectionQueuePreview(selectionCount: number): string {
  return selectionCount === 1 ? "1 referenced selection" : "Referenced selections";
}

/**
 * 閺嶇厧绱￠崠鏍уИ閹靛鈧瀚ㄥ鏇犳暏閻ㄥ嫭鐖ｆ０妯碱潚鐎涙劖鏋冮張? * @param selectionCount - 闁瀚ㄥ鏇犳暏閺佷即鍣? * @returns 閺嶅洭顣界粔宥呯摍閺傚洦婀? */
export function formatAssistantSelectionTitleSeed(selectionCount: number): string {
  return selectionCount === 1
    ? "Referenced assistant selection"
    : "Referenced assistant selections";
}

/**
 * 閺嬪嫬缂撻崝鈺傚闁瀚ㄥ鏇犳暏閻ㄥ嫭褰佺粈楦跨槤閸? * @param selections - 闁瀚ㄥ鏇犳暏閸掓銆? * @returns 閺嶇厧绱￠崠鏍ф倵閻?XML 閹绘劗銇氱拠宥呮健閿涘苯顩ч弸婊勭梾閺堝婀侀弫鍫モ偓澶嬪閸掓瑨绻戦崶鐐碘敄鐎涙顑佹稉? */
export function buildAssistantSelectionsPromptBlock(
  selections: ReadonlyArray<Pick<ChatAssistantSelectionAttachment, "assistantMessageId" | "text">>,
): string {
  // 鐟欏嫯瀵栭崠鏍ц嫙鏉╁洦鎶ら弮鐘虫櫏閻ㄥ嫰鈧瀚ㄥ鏇犳暏
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

  // 閺嬪嫬缂?XML 閺嶇厧绱￠惃鍕偓澶嬪瀵洜鏁ら崸?  const lines: string[] = [];
  for (const selection of normalizedSelections) {
    lines.push(`- assistant message ${selection.assistantMessageId}:`);
    for (const line of selection.text.split("\n")) {
      lines.push(`  ${line}`);
    }
  }
  return ["<assistant_selection>", ...lines, "</assistant_selection>"].join("\n");
}

/**
 * 鐏忓棗濮幍瀣偓澶嬪瀵洜鏁ゆ潻钘夊閸掔増褰佺粈楦跨槤閺堫偄鐔? * @param prompt - 閸樼喎顫愰幓鎰仛鐠? * @param selections - 闁瀚ㄥ鏇犳暏閸掓銆? * @returns 鏉╄棄濮為柅澶嬪瀵洜鏁ら崥搴ｆ畱閹绘劗銇氱拠? */
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
 * 娴犲孩褰佺粈楦跨槤鐏忛箖鍎撮幓鎰絿閸斺晜澧滈柅澶嬪瀵洜鏁? * @param prompt - 閸樼喎顫愰幓鎰仛鐠? * @returns 閹绘劕褰囩紒鎾寸亯閿涘苯瀵橀崥顐㈠⒑缁傝鎮楅惃鍕絹缁€楦跨槤閸滃矁袙閺嬫劕鍤惃鍕偓澶嬪瀵洜鏁ら崚妤勩€? */
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
 * 娴犲孩褰佺粈楦跨槤鐏忛箖鍎撮崜銉ь瀲閸斺晜澧滈柅澶嬪瀵洜鏁? * @param prompt - 閸樼喎顫愰幓鎰仛鐠? * @returns 閸撱儳顬囬柅澶嬪瀵洜鏁ら崥搴ｆ畱閹绘劗銇氱拠? */
export function stripTrailingAssistantSelections(prompt: string): string {
  return extractTrailingAssistantSelections(prompt).promptText;
}

/**
 * 娴犲孩褰佺粈楦跨槤娑擃厼澧虹粋璇茬サ閸忋儳娈戦崝鈺傚闁瀚ㄥ鏇犳暏
 * @param prompt - 閸樼喎顫愰幓鎰仛鐠? * @returns 閸撱儳顬囧畵灞藉弳闁瀚ㄥ鏇犳暏閸氬海娈戦幓鎰仛鐠? */
export function stripEmbeddedAssistantSelections(prompt: string): string {
  return prompt.replace(EMBEDDED_ASSISTANT_SELECTIONS_PATTERN, "");
}

/**
 * 鐟欙絾鐎介崝鈺傚闁瀚ㄥ鏇犳暏閺夛紕娲伴敍鍫濆敶闁劌鍤遍弫甯礆
 * @param block - 闁瀚ㄥ鏇犳暏閸ф娈戦弬鍥ㄦ拱閸愬懎顔? * @returns 鐟欙絾鐎介崥搴ｆ畱闁瀚ㄥ鏇犳暏閺夛紕娲伴崚妤勩€? */
function parseAssistantSelectionEntries(block: string): ParsedAssistantSelectionEntry[] {
  const entries: ParsedAssistantSelectionEntry[] = [];
  let current: { assistantMessageId: string; lines: string[] } | null = null;

  // 閹绘劒姘﹁ぐ鎾冲鐟欙絾鐎介弶锛勬窗閻ㄥ嫯绶熼崝鈺佸毐閺?  const commitCurrent = () => {
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

  // 闁劘顢戠憴锝嗙€介柅澶嬪瀵洜鏁ら崸?  for (const rawLine of block.split("\n")) {
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
    // 婢跺嫮鎮婄紓鈺勭箻閻ㄥ嫬鍞寸€圭顢?    if (rawLine.startsWith("  ")) {
      current.lines.push(rawLine.slice(2));
      continue;
    }
    // 婢跺嫮鎮婄粚楦款攽
    if (rawLine.length === 0) {
      current.lines.push("");
    }
  }

  commitCurrent();
  return entries;
}
