/**
 * @file 蹇嵎閿粦瀹氱郴缁? *
 * 璐熻矗绠＄悊搴旂敤鍐呮墍鏈夊揩鎹烽敭鐨勮В鏋愩€佸尮閰嶅拰鏍煎紡鍖栥€傚寘鎷細
 * - 榛樿蹇嵎閿厤缃紙渚ц竟鏍忋€佽亰澶┿€佺粓绔€佺嚎绋嬭烦杞瓑锛? * - 閿洏浜嬩欢涓庡揩鎹烽敭瑙勫垯鐨勫尮閰嶉€昏緫
 * - 蹇嵎閿爣绛剧殑鏍煎紡鍖栦笌鎷嗗垎锛堟敮鎸?macOS 鍜?Windows/Linux 骞冲彴宸紓锛? * - 鍚勭被蹇嵎閿垽瀹氱殑渚挎嵎鍑芥暟
 */

import {
  type KeybindingCommand,
  type ResolvedKeybindingRule,
  type KeybindingShortcut,
  type KeybindingWhenNode,
  type ResolvedKeybindingsConfig,
  THREAD_JUMP_KEYBINDING_COMMANDS,
  type ThreadJumpKeybindingCommand,
} from "~/contracts";
import { isMacPlatform } from "./lib/utils";

/**
 * 蹇嵎閿簨浠剁殑杞婚噺琛ㄧず锛屽吋瀹瑰師鐢?KeyboardEvent 鍜岃嚜瀹氫箟浜嬩欢瀵硅薄銆? * 鐢ㄤ簬鍦ㄥ揩鎹烽敭鍖归厤鏃剁粺涓€澶勭悊閿洏杈撳叆銆? */
export interface ShortcutEventLike {
  /** 浜嬩欢绫诲瀷锛屽 "keydown" */
  type?: string;
  /** 鐗╃悊鎸夐敭浠ｇ爜锛屽 "KeyA"銆?Digit1" */
  code?: string;
  /** 鎸夐敭鍊硷紝濡?"a"銆?1"銆?Escape" */
  key: string;
  /** 鏄惁鎸変笅 Meta 閿紙macOS 涓?Command 閿級 */
  metaKey: boolean;
  /** 鏄惁鎸変笅 Ctrl 閿?*/
  ctrlKey: boolean;
  /** 鏄惁鎸変笅 Shift 閿?*/
  shiftKey: boolean;
  /** 鏄惁鎸変笅 Alt 閿紙macOS 涓?Option 閿級 */
  altKey: boolean;
}

/**
 * 蹇嵎閿尮閰嶇殑涓婁笅鏂囩幆澧冿紝鐢ㄤ簬鍒ゆ柇 when 瀛愬彞鐨勬潯浠躲€? * 鎻忚堪褰撳墠 UI 鐘舵€佷互鍐冲畾鍝簺蹇嵎閿敓鏁堛€? */
export interface ShortcutMatchContext {
  /** 缁堢鏄惁鑾峰緱鐒︾偣 */
  terminalFocus: boolean;
  /** 缁堢鏄惁鎵撳紑 */
  terminalOpen: boolean;
  /** 鍏朵粬鑷畾涔変笂涓嬫枃鏉′欢 */
  [key: string]: boolean;
}

/** 蹇嵎閿尮閰嶆椂鐨勫彲閫夐厤缃?*/
interface ShortcutMatchOptions {
  /** 杩愯骞冲彴锛岄粯璁や娇鐢?navigator.platform */
  platform?: string;
  /** 鍖归厤涓婁笅鏂囷紝鐢ㄤ簬 when 瀛愬彞姹傚€?*/
  context?: Partial<ShortcutMatchContext>;
}

/** 蹇嵎閿爣绛捐В鏋愮殑閰嶇疆閫夐」 */
interface ResolvedShortcutLabelOptions extends ShortcutMatchOptions {
  /** 杩愯骞冲彴锛岄粯璁や娇鐢?navigator.platform */
  platform?: string;
}

/**
 * 鍒涘缓涓€涓揩鎹烽敭瀵硅薄锛岄粯璁ゅ惎鐢?modKey锛坢acOS 涓?Command锛屽叾浠栦负 Ctrl锛夈€? *
 * @param key - 鎸夐敭鍊? * @param overrides - 鍙€夌殑淇グ閿鐩? * @returns 瀹屾暣鐨勫揩鎹烽敭瀵硅薄
 *
 * @example
 * ```ts
 * commandShortcut("n", { shiftKey: true }) // Mod+Shift+N
 * ```
 */
function commandShortcut(
  key: string,
  overrides: Partial<Omit<KeybindingShortcut, "key">> = {},
): KeybindingShortcut {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    modKey: true,
    ...overrides,
  };
}

/**
 * 鍒涘缓 when 瀛愬彞鐨勬爣璇嗙鑺傜偣锛岃〃绀轰竴涓笂涓嬫枃鏉′欢鍙橀噺銆? *
 * @param name - 鏉′欢鍙橀噺鍚嶇О
 * @returns 鏍囪瘑绗︾被鍨嬬殑 when 瀛愬彞鑺傜偣
 */
function whenIdentifier(name: string): KeybindingWhenNode {
  return { type: "identifier", name };
}

/**
 * 鍒涘缓 when 瀛愬彞鐨勫彇鍙嶈妭鐐癸紝琛ㄧず瀵瑰瓙鏉′欢鐨勯€昏緫闈炪€? *
 * @param node - 闇€瑕佸彇鍙嶇殑瀛愯妭鐐? * @returns 鍙栧弽绫诲瀷鐨?when 瀛愬彞鑺傜偣
 */
function whenNot(node: KeybindingWhenNode): KeybindingWhenNode {
  return { type: "not", node };
}

/**
 * 鍒涘缓 when 瀛愬彞鐨勯€昏緫涓庤妭鐐癸紝琛ㄧず涓や釜瀛愭潯浠跺悓鏃舵弧瓒炽€? *
 * @param left - 宸﹀瓙鑺傜偣
 * @param right - 鍙冲瓙鑺傜偣
 * @returns 閫昏緫涓庣被鍨嬬殑 when 瀛愬彞鑺傜偣
 */
function whenAnd(left: KeybindingWhenNode, right: KeybindingWhenNode): KeybindingWhenNode {
  return { type: "and", left, right };
}

/** when 瀛愬彞锛氱粓绔湭鑾峰緱鐒︾偣 */
const whenNotTerminalFocus = whenNot(whenIdentifier("terminalFocus"));
/** when 瀛愬彞锛氱粓绔湭鑾峰緱鐒︾偣涓旂粓绔伐浣滃尯鏈墦寮€锛堢敤浜庣嚎绋嬭烦杞揩鎹烽敭锛?*/
const whenThreadJumpAvailable = whenAnd(
  whenNotTerminalFocus,
  whenNot(whenIdentifier("terminalWorkspaceOpen")),
);

/**
 * 榛樿蹇嵎閿洖閫€閰嶇疆銆傚綋鐢ㄦ埛鏈嚜瀹氫箟鏌愬懡浠ょ殑蹇嵎閿椂锛屼娇鐢ㄦ鍒楄〃涓殑缁戝畾銆? * 閰嶇疆椤规寜浼樺厛绾т粠浣庡埌楂樻帓鍒楋紝鍚庡嚭鐜扮殑瑙勫垯浼樺厛绾ф洿楂樸€? */
export const DEFAULT_SHORTCUT_FALLBACKS: ResolvedKeybindingsConfig = [
  {
    command: "sidebar.addProject",
    shortcut: commandShortcut("o", { shiftKey: true }),
    whenAst: whenNotTerminalFocus,
  },
  {
    command: "sidebar.importThread",
    shortcut: commandShortcut("i"),
    whenAst: whenNotTerminalFocus,
  },
  {
    command: "chat.newLatestProject",
    shortcut: commandShortcut("n", { shiftKey: true }),
    whenAst: whenNotTerminalFocus,
  },
  {
    command: "chat.newClaude",
    shortcut: commandShortcut("c", { altKey: true }),
    whenAst: whenNotTerminalFocus,
  },
  {
    command: "chat.newChat",
    shortcut: commandShortcut("n", { altKey: true }),
    whenAst: whenNotTerminalFocus,
  },
  {
    command: "chat.newCodex",
    shortcut: commandShortcut("x", { altKey: true }),
    whenAst: whenNotTerminalFocus,
  },
  {
    command: "chat.newCursor",
    shortcut: commandShortcut("r", { altKey: true }),
    whenAst: whenNotTerminalFocus,
  },
  {
    command: "chat.newGemini",
    shortcut: commandShortcut("g", { altKey: true }),
    whenAst: whenNotTerminalFocus,
  },
  {
    command: "chat.split",
    shortcut: commandShortcut("\\"),
    whenAst: whenNotTerminalFocus,
  },
  {
    command: "thread.jump.1",
    shortcut: commandShortcut("1"),
    whenAst: whenThreadJumpAvailable,
  },
  {
    command: "thread.jump.2",
    shortcut: commandShortcut("2"),
    whenAst: whenThreadJumpAvailable,
  },
  {
    command: "thread.jump.3",
    shortcut: commandShortcut("3"),
    whenAst: whenThreadJumpAvailable,
  },
  {
    command: "thread.jump.4",
    shortcut: commandShortcut("4"),
    whenAst: whenThreadJumpAvailable,
  },
  {
    command: "thread.jump.5",
    shortcut: commandShortcut("5"),
    whenAst: whenThreadJumpAvailable,
  },
  {
    command: "thread.jump.6",
    shortcut: commandShortcut("6"),
    whenAst: whenThreadJumpAvailable,
  },
  {
    command: "thread.jump.7",
    shortcut: commandShortcut("7"),
    whenAst: whenThreadJumpAvailable,
  },
  {
    command: "thread.jump.8",
    shortcut: commandShortcut("8"),
    whenAst: whenThreadJumpAvailable,
  },
  {
    command: "thread.jump.9",
    shortcut: commandShortcut("9"),
    whenAst: whenThreadJumpAvailable,
  },
  {
    command: "terminal.workspace.newFullWidth",
    shortcut: commandShortcut("j", { shiftKey: true }),
  },
  {
    command: "terminal.workspace.closeActive",
    shortcut: commandShortcut("w"),
    whenAst: whenIdentifier("terminalWorkspaceOpen"),
  },
  {
    command: "terminal.workspace.terminal",
    shortcut: commandShortcut("1"),
    whenAst: whenIdentifier("terminalWorkspaceOpen"),
  },
  {
    command: "terminal.workspace.chat",
    shortcut: commandShortcut("2"),
    whenAst: whenIdentifier("terminalWorkspaceOpen"),
  },
];

/** 缁堢涓寜 Alt+B 鍚戝悗璺充竴涓崟璇嶇殑杞箟搴忓垪 */
const TERMINAL_WORD_BACKWARD = "\u001bb";
/** 缁堢涓寜 Alt+F 鍚戝墠璺充竴涓崟璇嶇殑杞箟搴忓垪 */
const TERMINAL_WORD_FORWARD = "\u001bf";
/** 缁堢涓寜 Ctrl+A 璺冲埌琛岄鐨勮浆涔夊簭鍒?*/
const TERMINAL_LINE_START = "\u0001";
/** 缁堢涓寜 Ctrl+E 璺冲埌琛屽熬鐨勮浆涔夊簭鍒?*/
const TERMINAL_LINE_END = "\u0005";

/**
 * 閿洏浜嬩欢 code 鍒?key 鐨勫埆鍚嶆槧灏勮〃銆? * 鐢ㄤ簬灏嗙墿鐞嗘寜閿唬鐮侊紙濡?"KeyA"锛夋槧灏勪负閫昏緫鎸夐敭鍊硷紙濡?"a"锛夛紝
 * 浠ヤ究鍦ㄥ揩鎹烽敭鍖归厤鏃跺吋瀹逛笉鍚岄敭鐩樺竷灞€銆? */
const EVENT_CODE_KEY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  BracketLeft: ["["],
  BracketRight: ["]"],
  Digit0: ["0"],
  Digit1: ["1"],
  Digit2: ["2"],
  Digit3: ["3"],
  Digit4: ["4"],
  Digit5: ["5"],
  Digit6: ["6"],
  Digit7: ["7"],
  Digit8: ["8"],
  Digit9: ["9"],
  KeyA: ["a"],
  KeyB: ["b"],
  KeyC: ["c"],
  KeyD: ["d"],
  KeyE: ["e"],
  KeyF: ["f"],
  KeyG: ["g"],
  KeyH: ["h"],
  KeyI: ["i"],
  KeyJ: ["j"],
  KeyK: ["k"],
  KeyL: ["l"],
  KeyM: ["m"],
  KeyN: ["n"],
  KeyO: ["o"],
  KeyP: ["p"],
  KeyQ: ["q"],
  KeyR: ["r"],
  KeyS: ["s"],
  KeyT: ["t"],
  KeyU: ["u"],
  KeyV: ["v"],
  KeyW: ["w"],
  KeyX: ["x"],
  KeyY: ["y"],
  KeyZ: ["z"],
};

/**
 * 灏嗛敭鐩樹簨浠剁殑 key 鍊兼爣鍑嗗寲涓哄皬鍐欙紝骞跺鐞嗙壒娈婇敭鐨勫埆鍚嶃€? *
 * @param key - 鍘熷 key 鍊? * @returns 鏍囧噯鍖栧悗鐨?key 鍊? */
function normalizeEventKey(key: string): string {
  const normalized = key.toLowerCase();
  if (normalized === "esc") return "escape";
  if (normalized === "{") return "[";
  if (normalized === "}") return "]";
  return normalized;
}

/**
 * 瑙ｆ瀽閿洏浜嬩欢涓墍鏈夊彲鑳界殑鎸夐敭鍊奸泦鍚堛€? * 鍖呮嫭浜嬩欢鏈韩鐨?key 鍊煎拰閫氳繃 code 鏄犲皠鍑虹殑鍒悕銆? *
 * @param event - 閿洏浜嬩欢
 * @returns 鎵€鏈夊彲鑳界殑鎸夐敭鍊奸泦鍚? */
function resolveEventKeys(event: ShortcutEventLike): Set<string> {
  const keys = new Set([normalizeEventKey(event.key)]);
  const aliases = event.code ? EVENT_CODE_KEY_ALIASES[event.code] : undefined;
  if (!aliases) return keys;

  for (const alias of aliases) {
    keys.add(alias);
  }
  return keys;
}

/**
 * 鍒ゆ柇閿洏浜嬩欢鐨勪慨楗伴敭鏄惁涓庡揩鎹烽敭瑙勫垯鍖归厤銆? * modKey 鍦?macOS 涓婃槧灏勪负 Meta锛圕ommand锛夛紝鍦ㄥ叾浠栧钩鍙版槧灏勪负 Ctrl銆? *
 * @param event - 閿洏浜嬩欢
 * @param shortcut - 蹇嵎閿鍒? * @param platform - 杩愯骞冲彴锛岄粯璁や娇鐢?navigator.platform
 * @returns 淇グ閿槸鍚﹀尮閰? */
function matchesShortcutModifiers(
  event: ShortcutEventLike,
  shortcut: KeybindingShortcut,
  platform = navigator.platform,
): boolean {
  const useMetaForMod = isMacPlatform(platform);
  const expectedMeta = shortcut.metaKey || (shortcut.modKey && useMetaForMod);
  const expectedCtrl = shortcut.ctrlKey || (shortcut.modKey && !useMetaForMod);
  return (
    event.metaKey === expectedMeta &&
    event.ctrlKey === expectedCtrl &&
    event.shiftKey === shortcut.shiftKey &&
    event.altKey === shortcut.altKey
  );
}

/**
 * 鍒ゆ柇閿洏浜嬩欢鏄惁瀹屽叏鍖归厤鏌愪釜蹇嵎閿鍒欙紙淇グ閿?+ 鎸夐敭鍊硷級銆? *
 * @param event - 閿洏浜嬩欢
 * @param shortcut - 蹇嵎閿鍒? * @param platform - 杩愯骞冲彴锛岄粯璁や娇鐢?navigator.platform
 * @returns 鏄惁鍖归厤
 */
function matchesShortcut(
  event: ShortcutEventLike,
  shortcut: KeybindingShortcut,
  platform = navigator.platform,
): boolean {
  if (!matchesShortcutModifiers(event, shortcut, platform)) return false;
  return resolveEventKeys(event).has(shortcut.key);
}

/** 浠庨€夐」涓В鏋愬钩鍙版爣璇嗭紝鏈寚瀹氭椂浣跨敤 navigator.platform */
function resolvePlatform(options: ShortcutMatchOptions | undefined): string {
  return options?.platform ?? navigator.platform;
}

/**
 * 浠庨€夐」涓В鏋愬揩鎹烽敭鍖归厤涓婁笅鏂囷紝鏈寚瀹氱殑鏉′欢榛樿涓?false銆? *
 * @param options - 鍖归厤閫夐」
 * @returns 瀹屾暣鐨勫尮閰嶄笂涓嬫枃
 */
function resolveContext(options: ShortcutMatchOptions | undefined): ShortcutMatchContext {
  return {
    terminalFocus: false,
    terminalOpen: false,
    ...options?.context,
  };
}

/**
 * 閫掑綊姹傚€?when 瀛愬彞鐨?AST 鑺傜偣銆? * 鏀寔鏍囪瘑绗︼紙identifier锛夈€佸彇鍙嶏紙not锛夈€侀€昏緫涓庯紙and锛夈€侀€昏緫鎴栵紙or锛夊洓绉嶈妭鐐圭被鍨嬨€? *
 * @param node - when 瀛愬彞 AST 鑺傜偣
 * @param context - 涓婁笅鏂囨潯浠跺彉閲? * @returns 瀛愬彞姹傚€肩粨鏋? */
function evaluateWhenNode(node: KeybindingWhenNode, context: ShortcutMatchContext): boolean {
  switch (node.type) {
    case "identifier":
      if (node.name === "true") return true;
      if (node.name === "false") return false;
      return Boolean(context[node.name]);
    case "not":
      return !evaluateWhenNode(node.node, context);
    case "and":
      return evaluateWhenNode(node.left, context) && evaluateWhenNode(node.right, context);
    case "or":
      return evaluateWhenNode(node.left, context) || evaluateWhenNode(node.right, context);
  }
}

/**
 * 鍒ゆ柇 when 瀛愬彞鏄惁鍦ㄧ粰瀹氫笂涓嬫枃涓垚绔嬨€傛棤 when 瀛愬彞鏃堕粯璁よ繑鍥?true銆? *
 * @param whenAst - when 瀛愬彞 AST 鏍硅妭鐐? * @param context - 涓婁笅鏂囨潯浠跺彉閲? * @returns 瀛愬彞鏄惁鎴愮珛
 */
function matchesWhenClause(
  whenAst: KeybindingWhenNode | undefined,
  context: ShortcutMatchContext,
): boolean {
  if (!whenAst) return true;
  return evaluateWhenNode(whenAst, context);
}

/**
 * 鐢熸垚蹇嵎閿殑鍐茬獊妫€娴嬮敭锛岀敤浜庡垽鏂袱涓揩鎹烽敭鏄惁浼氫骇鐢熷啿绐併€? * 灏嗘寜閿€煎拰淇グ閿粍鍚堜负鍞竴鏍囪瘑瀛楃涓层€? *
 * @param shortcut - 蹇嵎閿鍒? * @param platform - 杩愯骞冲彴
 * @returns 鍐茬獊妫€娴嬮敭瀛楃涓? */
function shortcutConflictKey(shortcut: KeybindingShortcut, platform = navigator.platform): string {
  const useMetaForMod = isMacPlatform(platform);
  const metaKey = shortcut.metaKey || (shortcut.modKey && useMetaForMod);
  const ctrlKey = shortcut.ctrlKey || (shortcut.modKey && !useMetaForMod);

  return [
    shortcut.key,
    metaKey ? "meta" : "",
    ctrlKey ? "ctrl" : "",
    shortcut.shiftKey ? "shift" : "",
    shortcut.altKey ? "alt" : "",
  ].join("|");
}

/**
 * 鍦ㄥ揩鎹烽敭閰嶇疆鍒楄〃涓煡鎵炬寚瀹氬懡浠ょ殑鏈夋晥蹇嵎閿€? * 浠庡垪琛ㄦ湯灏惧悜鍓嶉亶鍘嗭紙鍚庡嚭鐜扮殑瑙勫垯浼樺厛绾ф洿楂橈級锛岃烦杩囧凡琚洿楂樹紭鍏堢骇瑙勫垯鍗犵敤鐨勫揩鎹烽敭銆? *
 * @param keybindings - 蹇嵎閿厤缃垪琛? * @param command - 鐩爣鍛戒护
 * @param options - 鍖归厤閫夐」
 * @returns 鍖归厤鍒扮殑蹇嵎閿紝鏈壘鍒拌繑鍥?null
 */
function findEffectiveShortcutForCommand(
  keybindings: ResolvedKeybindingsConfig,
  command: KeybindingCommand,
  options?: ShortcutMatchOptions,
): KeybindingShortcut | null {
  const platform = resolvePlatform(options);
  const context = resolveContext(options);
  const claimedShortcuts = new Set<string>();

  for (let index = keybindings.length - 1; index >= 0; index -= 1) {
    const binding = keybindings[index];
    if (!binding) continue;
    if (!matchesWhenClause(binding.whenAst, context)) continue;

    const conflictKey = shortcutConflictKey(binding.shortcut, platform);
    if (claimedShortcuts.has(conflictKey)) {
      continue;
    }

    claimedShortcuts.add(conflictKey);
    if (binding.command === command) {
      return binding.shortcut;
    }
  }

  return null;
}

/**
 * 鍒ゆ柇閿洏浜嬩欢鏄惁鍖归厤鎸囧畾鍛戒护鐨勫揩鎹烽敭銆? *
 * @param event - 閿洏浜嬩欢
 * @param keybindings - 蹇嵎閿厤缃垪琛? * @param command - 鐩爣鍛戒护
 * @param options - 鍖归厤閫夐」
 * @returns 鏄惁鍖归厤
 */
function matchesCommandShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  command: KeybindingCommand,
  options?: ShortcutMatchOptions,
): boolean {
  return resolveShortcutCommand(event, keybindings, options) === command;
}

/**
 * 浠庡揩鎹烽敭閰嶇疆鍒楄〃涓В鏋愰敭鐩樹簨浠跺搴旂殑鍛戒护銆? * 浠庡垪琛ㄦ湯灏惧悜鍓嶉亶鍘嗭紝杩斿洖绗竴涓尮閰嶇殑鍛戒护銆? *
 * @param event - 閿洏浜嬩欢
 * @param keybindings - 蹇嵎閿厤缃垪琛? * @param options - 鍖归厤閫夐」
 * @returns 鍖归厤鍒扮殑鍛戒护锛屾湭鎵惧埌杩斿洖 null
 */
function resolveShortcutCommandFromBindings(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): KeybindingCommand | null {
  const platform = resolvePlatform(options);
  const context = resolveContext(options);

  for (let index = keybindings.length - 1; index >= 0; index -= 1) {
    const binding = keybindings[index];
    if (!binding) continue;
    if (!matchesWhenClause(binding.whenAst, context)) continue;
    if (!matchesShortcut(event, binding.shortcut, platform)) continue;
    return binding.command;
  }

  return null;
}

/**
 * 浠庣敤鎴疯嚜瀹氫箟閰嶇疆涓彁鍙栨湭琚鐩栫殑榛樿蹇嵎閿洖閫€椤广€? *
 * @param keybindings - 鐢ㄦ埛鑷畾涔夌殑蹇嵎閿厤缃? * @returns 鏈鐢ㄦ埛瑕嗙洊鐨勯粯璁ゅ揩鎹烽敭鍒楄〃
 */
function getFallbackBindings(
  keybindings: ResolvedKeybindingsConfig,
): ReadonlyArray<ResolvedKeybindingRule> {
  const configuredCommands = new Set(keybindings.map((binding) => binding.command));
  return DEFAULT_SHORTCUT_FALLBACKS.filter((binding) => !configuredCommands.has(binding.command));
}

/**
 * 瑙ｆ瀽閿洏浜嬩欢瀵瑰簲鐨勫懡浠ゃ€備紭鍏堝湪鐢ㄦ埛鑷畾涔夐厤缃腑鏌ユ壘锛? * 鏈壘鍒版椂鍥為€€鍒伴粯璁ゅ揩鎹烽敭閰嶇疆銆? *
 * @param event - 閿洏浜嬩欢
 * @param keybindings - 鐢ㄦ埛鑷畾涔夌殑蹇嵎閿厤缃? * @param options - 鍖归厤閫夐」
 * @returns 鍖归厤鍒扮殑鍛戒护鏍囪瘑绗︼紝鏈壘鍒拌繑鍥?null
 *
 * @example
 * ```ts
 * const command = resolveShortcutCommand(event, keybindings);
 * if (command === "chat.new") { ... }
 * ```
 */
export function resolveShortcutCommand(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): string | null {
  const explicitCommand = resolveShortcutCommandFromBindings(event, keybindings, options);
  if (explicitCommand !== null) {
    return explicitCommand;
  }

  const fallbackBindings = getFallbackBindings(keybindings);
  if (fallbackBindings.length === 0) {
    return null;
  }

  return resolveShortcutCommandFromBindings(event, fallbackBindings, options);
}

/**
 * 灏嗘寜閿€兼牸寮忓寲涓哄彲璇荤殑鏍囩鏂囨湰銆? * 澶勭悊鐗规畩閿绌烘牸銆佹柟鍚戦敭銆丒scape 绛夈€? *
 * @param key - 鎸夐敭鍊? * @returns 鏍煎紡鍖栧悗鐨勬爣绛? */
function formatShortcutKeyLabel(key: string): string {
  if (key === " ") return "Space";
  if (key.length === 1) return key.toUpperCase();
  if (key === "escape") return "Esc";
  if (key === "arrowup") return "Up";
  if (key === "arrowdown") return "Down";
  if (key === "arrowleft") return "Left";
  if (key === "arrowright") return "Right";
  return key.slice(0, 1).toUpperCase() + key.slice(1);
}

/**
 * 灏嗗揩鎹烽敭瑙勫垯鏍煎紡鍖栦负鍙鐨勬爣绛惧瓧绗︿覆銆? * macOS 浣跨敤绗﹀彿锛堚寴鈱モ嚙鈱冿級锛屽叾浠栧钩鍙颁娇鐢ㄦ枃瀛楋紙Ctrl+Alt+Shift+Meta锛夈€? *
 * @param shortcut - 蹇嵎閿鍒? * @param platform - 杩愯骞冲彴锛岄粯璁や娇鐢?navigator.platform
 * @returns 鏍煎紡鍖栧悗鐨勫揩鎹烽敭鏍囩
 *
 * @example
 * ```ts
 * formatShortcutLabel(shortcut, "MacIntel") // "鈱樷嚙N"
 * formatShortcutLabel(shortcut, "Win32")    // "Ctrl+Shift+N"
 * ```
 */
export function formatShortcutLabel(
  shortcut: KeybindingShortcut,
  platform = navigator.platform,
): string {
  const keyLabel = formatShortcutKeyLabel(shortcut.key);
  const useMetaForMod = isMacPlatform(platform);
  const showMeta = shortcut.metaKey || (shortcut.modKey && useMetaForMod);
  const showCtrl = shortcut.ctrlKey || (shortcut.modKey && !useMetaForMod);
  const showAlt = shortcut.altKey;
  const showShift = shortcut.shiftKey;

  if (useMetaForMod) {
    return `${showCtrl ? "\u2303" : ""}${showAlt ? "\u2325" : ""}${showShift ? "\u21e7" : ""}${showMeta ? "\u2318" : ""}${keyLabel}`;
  }

  const parts: string[] = [];
  if (showCtrl) parts.push("Ctrl");
  if (showAlt) parts.push("Alt");
  if (showShift) parts.push("Shift");
  if (showMeta) parts.push("Meta");
  parts.push(keyLabel);
  return parts.join("+");
}

/** macOS 淇グ閿鍙烽泦鍚堬紝鐢ㄤ簬鎷嗗垎蹇嵎閿爣绛?*/
const MODIFIER_SYMBOLS = new Set(["⌘", "⌥", "⇧", "⌃"]);

/**
 * 灏嗗揩鎹烽敭鏍囩瀛楃涓叉媶鍒嗕负鐙珛鐨勪慨楗伴敭鍜屾寜閿儴鍒嗐€? * 鏀寔涓ょ鏍煎紡锛歐indows 椋庢牸鐨?"+" 鍒嗛殧鍜?macOS 椋庢牸鐨勭鍙锋嫾鎺ャ€? *
 * @param shortcutLabel - 蹇嵎閿爣绛惧瓧绗︿覆
 * @returns 鎷嗗垎鍚庣殑鍚勯儴鍒嗘暟缁? *
 * @example
 * ```ts
 * splitShortcutLabel("Ctrl+Shift+N") // ["Ctrl", "Shift", "N"]
 * splitShortcutLabel("鈱樷嚙N")          // ["鈱?, "鈬?, "N"]
 * ```
 */
export function splitShortcutLabel(shortcutLabel: string): string[] {
  if (shortcutLabel.includes("+")) {
    return shortcutLabel
      .split("+")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }

  if ([...shortcutLabel].some((char) => MODIFIER_SYMBOLS.has(char))) {
    const parts = [...shortcutLabel];
    const key = parts
      .filter((char) => !MODIFIER_SYMBOLS.has(char))
      .join("")
      .trim();
    const modifiers = parts.filter((char) => MODIFIER_SYMBOLS.has(char));
    return key.length > 0 ? [...modifiers, key] : modifiers;
  }

  return [shortcutLabel];
}

/**
 * 鑾峰彇鎸囧畾鍛戒护鐨勫揩鎹烽敭鏍囩瀛楃涓层€? * 浼樺厛鍦ㄧ敤鎴疯嚜瀹氫箟閰嶇疆涓煡鎵撅紝鏈壘鍒版椂鍥為€€鍒伴粯璁ら厤缃€? * 褰撴湭鎻愪緵涓婁笅鏂囨椂锛岀洿鎺ユ寜鍛戒护鍖归厤锛堜笉璇勪及 when 瀛愬彞锛変互鎻愰珮鎬ц兘銆? *
 * @param keybindings - 蹇嵎閿厤缃垪琛? * @param command - 鐩爣鍛戒护
 * @param options - 骞冲彴鍜屼笂涓嬫枃閫夐」锛屼篃鍙互鐩存帴浼犲叆骞冲彴瀛楃涓? * @returns 蹇嵎閿爣绛惧瓧绗︿覆锛屾湭鎵惧埌杩斿洖 null
 */
export function shortcutLabelForCommand(
  keybindings: ResolvedKeybindingsConfig,
  command: KeybindingCommand,
  options?: string | ResolvedShortcutLabelOptions,
): string | null {
  const resolvedOptions =
    typeof options === "string"
      ? ({ platform: options } satisfies ResolvedShortcutLabelOptions)
      : options;
  const platform = resolvePlatform(resolvedOptions);
  const contextProvided = resolvedOptions?.context !== undefined;

  if (!contextProvided) {
    for (let index = keybindings.length - 1; index >= 0; index -= 1) {
      const binding = keybindings[index];
      if (!binding || binding.command !== command) continue;
      return formatShortcutLabel(binding.shortcut, platform);
    }
    for (const binding of getFallbackBindings(keybindings)) {
      if (binding.command !== command) continue;
      return formatShortcutLabel(binding.shortcut, platform);
    }
    return null;
  }

  const shortcut = findEffectiveShortcutForCommand(keybindings, command, resolvedOptions);
  if (shortcut) {
    return formatShortcutLabel(shortcut, platform);
  }

  const fallbackShortcut = findEffectiveShortcutForCommand(
    getFallbackBindings(keybindings),
    command,
    resolvedOptions,
  );
  return fallbackShortcut ? formatShortcutLabel(fallbackShortcut, platform) : null;
}

/**
 * 鏍规嵁绱㈠紩鑾峰彇绾跨▼璺宠浆鍛戒护銆傜储寮曡寖鍥?0-8 瀵瑰簲 thread.jump.1 鍒?thread.jump.9銆? *
 * @param index - 绾跨▼绱㈠紩锛? 璧峰锛? * @returns 绾跨▼璺宠浆鍛戒护锛岀储寮曡秺鐣岃繑鍥?null
 */
export function threadJumpCommandForIndex(index: number): ThreadJumpKeybindingCommand | null {
  return THREAD_JUMP_KEYBINDING_COMMANDS[index] ?? null;
}

/**
 * 鏍规嵁绾跨▼璺宠浆鍛戒护鑾峰彇鍏剁储寮曚綅缃€? *
 * @param command - 绾跨▼璺宠浆鍛戒护瀛楃涓? * @returns 绱㈠紩浣嶇疆锛? 璧峰锛夛紝鏈壘鍒拌繑鍥?null
 */
export function threadJumpIndexFromCommand(command: string): number | null {
  const index = THREAD_JUMP_KEYBINDING_COMMANDS.indexOf(command as ThreadJumpKeybindingCommand);
  return index === -1 ? null : index;
}

/**
 * 鍒ゆ柇褰撳墠閿洏浜嬩欢鏄惁搴旀樉绀虹嚎绋嬭烦杞彁绀恒€? * 褰撴寜涓嬩簡绾跨▼璺宠浆蹇嵎閿殑淇グ閿粍鍚堟椂杩斿洖 true銆? *
 * @param event - 閿洏浜嬩欢
 * @param keybindings - 蹇嵎閿厤缃垪琛? * @param options - 鍖归厤閫夐」
 * @returns 鏄惁搴旀樉绀虹嚎绋嬭烦杞彁绀? */
export function shouldShowThreadJumpHints(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  const platform = resolvePlatform(options);
  const fallbackBindings = getFallbackBindings(keybindings);

  for (const command of THREAD_JUMP_KEYBINDING_COMMANDS) {
    const shortcut =
      findEffectiveShortcutForCommand(keybindings, command, options) ??
      findEffectiveShortcutForCommand(fallbackBindings, command, options);
    if (!shortcut) continue;
    if (matchesShortcutModifiers(event, shortcut, platform)) {
      return true;
    }
  }

  return false;
}

/** 鍒ゆ柇閿洏浜嬩欢鏄惁鍖归厤缁堢鍒囨崲蹇嵎閿?*/
export function isTerminalToggleShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "terminal.toggle", options);
}

/** 鍒ゆ柇閿洏浜嬩欢鏄惁鍖归厤缁堢鍒嗗睆蹇嵎閿?*/
export function isTerminalSplitShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "terminal.split", options);
}

/** 鍒ゆ柇閿洏浜嬩欢鏄惁鍖归厤鏂板缓缁堢蹇嵎閿?*/
export function isTerminalNewShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "terminal.new", options);
}

/** 鍒ゆ柇閿洏浜嬩欢鏄惁鍖归厤鍏抽棴缁堢蹇嵎閿?*/
export function isTerminalCloseShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "terminal.close", options);
}

/** 鍒ゆ柇閿洏浜嬩欢鏄惁鍖归厤渚ц竟鏍忓垏鎹㈠揩鎹烽敭 */
export function isSidebarToggleShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "sidebar.toggle", options);
}

/** 鍒ゆ柇閿洏浜嬩欢鏄惁鍖归厤 Diff 闈㈡澘鍒囨崲蹇嵎閿?*/
export function isDiffToggleShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "diff.toggle", options);
}

/** 鍒ゆ柇閿洏浜嬩欢鏄惁鍖归厤娴忚鍣ㄩ潰鏉垮垏鎹㈠揩鎹烽敭 */
export function isBrowserToggleShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "browser.toggle", options);
}

/** 鍒ゆ柇閿洏浜嬩欢鏄惁鍖归厤鏂板缓绾跨▼蹇嵎閿?*/
export function isChatNewShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "chat.new", options);
}

/** 鍒ゆ柇閿洏浜嬩欢鏄惁鍖归厤鍦ㄦ渶鏂伴」鐩腑鏂板缓绾跨▼蹇嵎閿?*/
export function isChatNewLatestProjectShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "chat.newLatestProject", options);
}

/**
 * 鍒ゆ柇閿洏浜嬩欢鏄惁鍖归厤鏂板缓鑱婂ぉ蹇嵎閿€? * 鍚屾椂鍖归厤 chat.newChat 鍜?chat.newLocal 涓や釜鍛戒护銆? */
export function isChatNewChatShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return (
    matchesCommandShortcut(event, keybindings, "chat.newChat", options) ||
    matchesCommandShortcut(event, keybindings, "chat.newLocal", options)
  );
}

/** isChatNewLocalShortcut 鐨勫埆鍚嶏紝涓?isChatNewChatShortcut 琛屼负涓€鑷?*/
export const isChatNewLocalShortcut = isChatNewChatShortcut;

/** 鍒ゆ柇閿洏浜嬩欢鏄惁鍖归厤鏂板缓 Claude 绾跨▼蹇嵎閿?*/
export function isChatNewClaudeShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "chat.newClaude", options);
}

/** 鍒ゆ柇閿洏浜嬩欢鏄惁鍖归厤鏂板缓 Codex 绾跨▼蹇嵎閿?*/
export function isChatNewCodexShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "chat.newCodex", options);
}

/** 鍒ゆ柇閿洏浜嬩欢鏄惁鍖归厤鏂板缓 Cursor 绾跨▼蹇嵎閿?*/
export function isChatNewCursorShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "chat.newCursor", options);
}

/** 鍒ゆ柇閿洏浜嬩欢鏄惁鍖归厤鏂板缓 Gemini 绾跨▼蹇嵎閿?*/
export function isChatNewGeminiShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "chat.newGemini", options);
}

/** 鍒ゆ柇閿洏浜嬩欢鏄惁鍖归厤鎵撳紑鏀惰棌缂栬緫鍣ㄥ揩鎹烽敭 */
export function isOpenFavoriteEditorShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "editor.openFavorite", options);
}

/**
 * 鍒ゆ柇閿洏浜嬩欢鏄惁鍖归厤缁堢娓呭睆蹇嵎閿紙Ctrl+L锛夈€? * 姝ゅ揩鎹烽敭涓嶉€氳繃蹇嵎閿厤缃郴缁燂紝鑰屾槸纭紪鐮佸垽瀹氥€? *
 * @param event - 閿洏浜嬩欢
 * @param platform - 杩愯骞冲彴锛岄粯璁や娇鐢?navigator.platform
 * @returns 鏄惁鍖归厤缁堢娓呭睆蹇嵎閿? */
export function isTerminalClearShortcut(
  event: ShortcutEventLike,
  platform = navigator.platform,
): boolean {
  if (event.type !== undefined && event.type !== "keydown") {
    return false;
  }

  const key = event.key.toLowerCase();

  return key === "l" && event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
}

/**
 * 瑙ｆ瀽缁堢涓殑瀵艰埅蹇嵎閿紙鎸夊崟璇?琛岄/琛屽熬璺宠浆锛夈€? * 杩斿洖瀵瑰簲鐨勭粓绔浆涔夊簭鍒楋紝渚涚粓绔ā鎷熷櫒鐩存帴鍙戦€併€? *
 * - macOS: Alt+Arrow 鎸夊崟璇嶈烦杞紝Cmd+Arrow 璺冲埌琛岄/琛屽熬
 * - Windows/Linux: Ctrl+Arrow 鎴?Alt+Arrow 鎸夊崟璇嶈烦杞? *
 * @param event - 閿洏浜嬩欢
 * @param platform - 杩愯骞冲彴锛岄粯璁や娇鐢?navigator.platform
 * @returns 缁堢杞箟搴忓垪瀛楃涓诧紝涓嶅尮閰嶈繑鍥?null
 */
export function terminalNavigationShortcutData(
  event: ShortcutEventLike,
  platform = navigator.platform,
): string | null {
  if (event.type !== undefined && event.type !== "keydown") {
    return null;
  }

  if (event.shiftKey) return null;

  const key = normalizeEventKey(event.key);
  if (key !== "arrowleft" && key !== "arrowright") {
    return null;
  }

  const moveWord = key === "arrowleft" ? TERMINAL_WORD_BACKWARD : TERMINAL_WORD_FORWARD;
  const moveLine = key === "arrowleft" ? TERMINAL_LINE_START : TERMINAL_LINE_END;

  if (isMacPlatform(platform)) {
    if (event.altKey && !event.metaKey && !event.ctrlKey) {
      return moveWord;
    }
    if (event.metaKey && !event.altKey && !event.ctrlKey) {
      return moveLine;
    }
    return null;
  }

  if (event.ctrlKey && !event.metaKey && !event.altKey) {
    return moveWord;
  }

  if (event.altKey && !event.metaKey && !event.ctrlKey) {
    return moveWord;
  }

  return null;
}
