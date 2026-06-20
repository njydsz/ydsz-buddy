/**
 * @file 韫囶偅宓庨柨顔剧拨鐎规氨閮寸紒? *
 * 鐠愮喕鐭楃粻锛勬倞鎼存梻鏁ら崘鍛閺堝鎻╅幑鐑芥暛閻ㄥ嫯袙閺嬫劑鈧礁灏柊宥呮嫲閺嶇厧绱￠崠鏍モ偓鍌氬瘶閹奉剨绱? * - 姒涙顓昏箛顐ｅ祹闁款噣鍘ょ純顕嗙礄娓氀嗙珶閺嶅繈鈧浇浜版径鈹库偓浣虹矒缁旑垬鈧胶鍤庣粙瀣儲鏉烆剛鐡戦敍? * - 闁款喚娲忔禍瀣╂娑撳骸鎻╅幑鐑芥暛鐟欏嫬鍨惃鍕爱闁板秹鈧槒绶? * - 韫囶偅宓庨柨顔界垼缁涘墽娈戦弽鐓庣础閸栨牔绗岄幏鍡楀瀻閿涘牊鏁幐?macOS 閸?Windows/Linux 楠炲啿褰村顔肩磽閿? * - 閸氬嫮琚箛顐ｅ祹闁款喖鍨界€规氨娈戞笟鎸庡祹閸戣姤鏆? */

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
 * 韫囶偅宓庨柨顔荤皑娴犲墎娈戞潪濠氬櫤鐞涖劎銇氶敍灞藉悑鐎圭懓甯悽?KeyboardEvent 閸滃矁鍤滅€规矮绠熸禍瀣╂鐎电钖勯妴? * 閻劋绨崷銊ユ彥閹圭兘鏁崠褰掑帳閺冨墎绮烘稉鈧径鍕倞闁款喚娲忔潏鎾冲弳閵? */
export interface ShortcutEventLike {
  /** 娴滃娆㈢猾璇茬€烽敍灞筋洤 "keydown" */
  type?: string;
  /** 閻椻晝鎮婇幐澶愭暛娴狅絿鐖滈敍灞筋洤 "KeyA"閵?Digit1" */
  code?: string;
  /** 閹稿鏁崐纭风礉婵?"a"閵?1"閵?Escape" */
  key: string;
  /** 閺勵垰鎯侀幐澶夌瑓 Meta 闁款噯绱檓acOS 娑?Command 闁款噯绱?*/
  metaKey: boolean;
  /** 閺勵垰鎯侀幐澶夌瑓 Ctrl 闁?*/
  ctrlKey: boolean;
  /** 閺勵垰鎯侀幐澶夌瑓 Shift 闁?*/
  shiftKey: boolean;
  /** 閺勵垰鎯侀幐澶夌瑓 Alt 闁款噯绱檓acOS 娑?Option 闁款噯绱?*/
  altKey: boolean;
}

/**
 * 韫囶偅宓庨柨顔煎爱闁板秶娈戞稉濠佺瑓閺傚洨骞嗘晶鍐跨礉閻劋绨崚銈嗘焽 when 鐎涙劕褰為惃鍕蒋娴犺翰鈧? * 閹诲繗鍫ぐ鎾冲 UI 閻樿埖鈧椒浜掗崘鍐茬暰閸濐亙绨鸿箛顐ｅ祹闁款喚鏁撻弫鍫涒偓? */
export interface ShortcutMatchContext {
  /** 缂佸牏顏弰顖氭儊閼惧嘲绶遍悞锔惧仯 */
  terminalFocus: boolean;
  /** 缂佸牏顏弰顖氭儊閹垫挸绱?*/
  terminalOpen: boolean;
  /** 閸忔湹绮懛顏勭暰娑斿绗傛稉瀣瀮閺夆€叉 */
  [key: string]: boolean;
}

/** 韫囶偅宓庨柨顔煎爱闁板秵妞傞惃鍕讲闁鍘ょ純?*/
interface ShortcutMatchOptions {
  /** 鏉╂劘顢戦獮鍐插酱閿涘矂绮拋銈勫▏閻?navigator.platform */
  platform?: string;
  /** 閸栧綊鍘ゆ稉濠佺瑓閺傚浄绱濋悽銊ょ艾 when 鐎涙劕褰炲Ч鍌氣偓?*/
  context?: Partial<ShortcutMatchContext>;
}

/** 韫囶偅宓庨柨顔界垼缁涙崘袙閺嬫劗娈戦柊宥囩枂闁銆?*/
interface ResolvedShortcutLabelOptions extends ShortcutMatchOptions {
  /** 鏉╂劘顢戦獮鍐插酱閿涘矂绮拋銈勫▏閻?navigator.platform */
  platform?: string;
}

/**
 * 閸掓稑缂撴稉鈧稉顏勬彥閹圭兘鏁€电钖勯敍宀勭帛鐠併倕鎯庨悽?modKey閿涘潰acOS 娑?Command閿涘苯鍙炬禒鏍﹁礋 Ctrl閿涘鈧? *
 * @param key - 閹稿鏁崐? * @param overrides - 閸欘垶鈧娈戞穱顕€銈伴柨顔款洬閻? * @returns 鐎瑰本鏆ｉ惃鍕彥閹圭兘鏁€电钖? *
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
 * 閸掓稑缂?when 鐎涙劕褰為惃鍕垼鐠囧棛顑侀懞鍌滃仯閿涘矁銆冪粈杞扮娑擃亙绗傛稉瀣瀮閺夆€叉閸欐﹢鍣洪妴? *
 * @param name - 閺夆€叉閸欐﹢鍣洪崥宥囆? * @returns 閺嶅洩鐦戠粭锔捐閸ㄥ娈?when 鐎涙劕褰為懞鍌滃仯
 */
function whenIdentifier(name: string): KeybindingWhenNode {
  return { type: "identifier", name };
}

/**
 * 閸掓稑缂?when 鐎涙劕褰為惃鍕絿閸欏秷濡悙鐧哥礉鐞涖劎銇氱€电懓鐡欓弶鈥叉閻ㄥ嫰鈧槒绶棃鐐偓? *
 * @param node - 闂団偓鐟曚礁褰囬崣宥囨畱鐎涙劘濡悙? * @returns 閸欐牕寮界猾璇茬€烽惃?when 鐎涙劕褰為懞鍌滃仯
 */
function whenNot(node: KeybindingWhenNode): KeybindingWhenNode {
  return { type: "not", node };
}

/**
 * 閸掓稑缂?when 鐎涙劕褰為惃鍕偓鏄忕帆娑撳氦濡悙鐧哥礉鐞涖劎銇氭稉銈勯嚋鐎涙劖娼禒璺烘倱閺冭埖寮х搾鐐解偓? *
 * @param left - 瀹革箑鐡欓懞鍌滃仯
 * @param right - 閸欏啿鐡欓懞鍌滃仯
 * @returns 闁槒绶稉搴ｈ閸ㄥ娈?when 鐎涙劕褰為懞鍌滃仯
 */
function whenAnd(left: KeybindingWhenNode, right: KeybindingWhenNode): KeybindingWhenNode {
  return { type: "and", left, right };
}

/** when 鐎涙劕褰為敍姘辩矒缁旑垱婀懢宄扮繁閻掞妇鍋?*/
const whenNotTerminalFocus = whenNot(whenIdentifier("terminalFocus"));
/** when 鐎涙劕褰為敍姘辩矒缁旑垱婀懢宄扮繁閻掞妇鍋ｆ稉鏃傜矒缁旑垰浼愭担婊冨隘閺堫亝澧﹀鈧敍鍫㈡暏娴滃海鍤庣粙瀣儲鏉烆剙鎻╅幑鐑芥暛閿?*/
const whenThreadJumpAvailable = whenAnd(
  whenNotTerminalFocus,
  whenNot(whenIdentifier("terminalWorkspaceOpen")),
);

/**
 * 姒涙顓昏箛顐ｅ祹闁款喖娲栭柅鈧柊宥囩枂閵嗗倸缍嬮悽銊﹀煕閺堫亣鍤滅€规矮绠熼弻鎰嚒娴犮倗娈戣箛顐ｅ祹闁款喗妞傞敍灞煎▏閻劍顒濋崚妤勩€冩稉顓犳畱缂佹垵鐣鹃妴? * 闁板秶鐤嗘い瑙勫瘻娴兼ê鍘涚痪褌绮犳担搴″煂妤傛ɑ甯撻崚妤嬬礉閸氬骸鍤悳鎵畱鐟欏嫬鍨导妯哄帥缁狙勬纯妤傛ǜ鈧? */
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

/** 缂佸牏顏稉顓熷瘻 Alt+B 閸氭垵鎮楃捄鍏呯娑擃亜宕熺拠宥囨畱鏉烆兛绠熸惔蹇撳灙 */
const TERMINAL_WORD_BACKWARD = "\u001bb";
/** 缂佸牏顏稉顓熷瘻 Alt+F 閸氭垵澧犵捄鍏呯娑擃亜宕熺拠宥囨畱鏉烆兛绠熸惔蹇撳灙 */
const TERMINAL_WORD_FORWARD = "\u001bf";
/** 缂佸牏顏稉顓熷瘻 Ctrl+A 鐠哄啿鍩岀悰宀勵浕閻ㄥ嫯娴嗘稊澶婄碍閸?*/
const TERMINAL_LINE_START = "\u0001";
/** 缂佸牏顏稉顓熷瘻 Ctrl+E 鐠哄啿鍩岀悰灞界啲閻ㄥ嫯娴嗘稊澶婄碍閸?*/
const TERMINAL_LINE_END = "\u0005";

/**
 * 闁款喚娲忔禍瀣╂ code 閸?key 閻ㄥ嫬鍩嗛崥宥嗘Ё鐏忓嫯銆冮妴? * 閻劋绨亸鍡欏⒖閻炲棙瀵滈柨顔诲敩閻緤绱欐俊?"KeyA"閿涘妲х亸鍕礋闁槒绶幐澶愭暛閸婄》绱欐俊?"a"閿涘绱? * 娴犮儰绌堕崷銊ユ彥閹圭兘鏁崠褰掑帳閺冭泛鍚嬬€归€涚瑝閸氬矂鏁惄妯虹鐏炩偓閵? */
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
 * 鐏忓棝鏁惄妯圭皑娴犲墎娈?key 閸婂吋鐖ｉ崙鍡楀娑撳搫鐨崘娆欑礉楠炶泛顦╅悶鍡欏濞堝﹪鏁惃鍕焼閸氬秲鈧? *
 * @param key - 閸樼喎顫?key 閸? * @returns 閺嶅洤鍣崠鏍ф倵閻?key 閸? */
function normalizeEventKey(key: string): string {
  const normalized = key.toLowerCase();
  if (normalized === "esc") return "escape";
  if (normalized === "{") return "[";
  if (normalized === "}") return "]";
  return normalized;
}

/**
 * 鐟欙絾鐎介柨顔炬磸娴滃娆㈡稉顓熷閺堝褰查懗鐣屾畱閹稿鏁崐濂告肠閸氬牄鈧? * 閸栧懏瀚禍瀣╂閺堫剝闊╅惃?key 閸婄厧鎷伴柅姘崇箖 code 閺勭姴鐨犻崙铏规畱閸掝偄鎮曢妴? *
 * @param event - 闁款喚娲忔禍瀣╂
 * @returns 閹碘偓閺堝褰查懗鐣屾畱閹稿鏁崐濂告肠閸? */
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
 * 閸掋倖鏌囬柨顔炬磸娴滃娆㈤惃鍕叏妤椾即鏁弰顖氭儊娑撳骸鎻╅幑鐑芥暛鐟欏嫬鍨崠褰掑帳閵? * modKey 閸?macOS 娑撳﹥妲х亸鍕礋 Meta閿涘湑ommand閿涘绱濋崷銊ュ従娴犳牕閽╅崣鐗堟Ё鐏忓嫪璐?Ctrl閵? *
 * @param event - 闁款喚娲忔禍瀣╂
 * @param shortcut - 韫囶偅宓庨柨顔款潐閸? * @param platform - 鏉╂劘顢戦獮鍐插酱閿涘矂绮拋銈勫▏閻?navigator.platform
 * @returns 娣囶噣銈伴柨顔芥Ц閸氾箑灏柊? */
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
 * 閸掋倖鏌囬柨顔炬磸娴滃娆㈤弰顖氭儊鐎瑰苯鍙忛崠褰掑帳閺屾劒閲滆箛顐ｅ祹闁款喛顫夐崚娆欑礄娣囶噣銈伴柨?+ 閹稿鏁崐纭风礆閵? *
 * @param event - 闁款喚娲忔禍瀣╂
 * @param shortcut - 韫囶偅宓庨柨顔款潐閸? * @param platform - 鏉╂劘顢戦獮鍐插酱閿涘矂绮拋銈勫▏閻?navigator.platform
 * @returns 閺勵垰鎯侀崠褰掑帳
 */
function matchesShortcut(
  event: ShortcutEventLike,
  shortcut: KeybindingShortcut,
  platform = navigator.platform,
): boolean {
  if (!matchesShortcutModifiers(event, shortcut, platform)) return false;
  return resolveEventKeys(event).has(shortcut.key);
}

/** 娴犲酣鈧銆嶆稉顓⌒掗弸鎰挬閸欑増鐖ｇ拠鍡礉閺堫亝瀵氱€规碍妞傛担璺ㄦ暏 navigator.platform */
function resolvePlatform(options: ShortcutMatchOptions | undefined): string {
  return options?.platform ?? navigator.platform;
}

/**
 * 娴犲酣鈧銆嶆稉顓⌒掗弸鎰彥閹圭兘鏁崠褰掑帳娑撳﹣绗呴弬鍥风礉閺堫亝瀵氱€规氨娈戦弶鈥叉姒涙顓绘稉?false閵? *
 * @param options - 閸栧綊鍘ら柅澶愩€? * @returns 鐎瑰本鏆ｉ惃鍕爱闁板秳绗傛稉瀣瀮
 */
function resolveContext(options: ShortcutMatchOptions | undefined): ShortcutMatchContext {
  return {
    terminalFocus: false,
    terminalOpen: false,
    ...options?.context,
  };
}

/**
 * 闁帒缍婂Ч鍌氣偓?when 鐎涙劕褰為惃?AST 閼哄倻鍋ｉ妴? * 閺€顖涘瘮閺嶅洩鐦戠粭锔肩礄identifier閿涘鈧礁褰囬崣宥忕礄not閿涘鈧線鈧槒绶稉搴礄and閿涘鈧線鈧槒绶幋鏍电礄or閿涘娲撶粔宥堝Ν閻愬湱琚崹瀣ㄢ偓? *
 * @param node - when 鐎涙劕褰?AST 閼哄倻鍋? * @param context - 娑撳﹣绗呴弬鍥ㄦ蒋娴犺泛褰夐柌? * @returns 鐎涙劕褰炲Ч鍌氣偓鑲╃波閺? */
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
 * 閸掋倖鏌?when 鐎涙劕褰為弰顖氭儊閸︺劎绮扮€规矮绗傛稉瀣瀮娑擃厽鍨氱粩瀣ㄢ偓鍌涙￥ when 鐎涙劕褰為弮鍫曠帛鐠併倛绻戦崶?true閵? *
 * @param whenAst - when 鐎涙劕褰?AST 閺嶇濡悙? * @param context - 娑撳﹣绗呴弬鍥ㄦ蒋娴犺泛褰夐柌? * @returns 鐎涙劕褰為弰顖氭儊閹存劗鐝? */
function matchesWhenClause(
  whenAst: KeybindingWhenNode | undefined,
  context: ShortcutMatchContext,
): boolean {
  if (!whenAst) return true;
  return evaluateWhenNode(whenAst, context);
}

/**
 * 閻㈢喐鍨氳箛顐ｅ祹闁款喚娈戦崘鑼崐濡偓濞村鏁敍宀€鏁ゆ禍搴″灲閺傤厺琚辨稉顏勬彥閹圭兘鏁弰顖氭儊娴兼矮楠囬悽鐔峰暱缁愪降鈧? * 鐏忓棙瀵滈柨顔尖偓鐓庢嫲娣囶噣銈伴柨顔剧矋閸氬牅璐熼崬顖欑閺嶅洩鐦戠€涙顑佹稉灞傗偓? *
 * @param shortcut - 韫囶偅宓庨柨顔款潐閸? * @param platform - 鏉╂劘顢戦獮鍐插酱
 * @returns 閸愯尙鐛婂Λ鈧ù瀣暛鐎涙顑佹稉? */
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
 * 閸︺劌鎻╅幑鐑芥暛闁板秶鐤嗛崚妤勩€冩稉顓熺叀閹电偓瀵氱€规艾鎳℃禒銈囨畱閺堝鏅ヨ箛顐ｅ祹闁款喓鈧? * 娴犲骸鍨悰銊︽汞鐏忔儳鎮滈崜宥変憾閸樺棴绱欓崥搴″毉閻滄壆娈戠憴鍕灟娴兼ê鍘涚痪褎娲挎姗堢礆閿涘矁鐑︽潻鍥у嚒鐞氼偅娲挎妯圭喘閸忓牏楠囩憴鍕灟閸楃姷鏁ら惃鍕彥閹圭兘鏁妴? *
 * @param keybindings - 韫囶偅宓庨柨顕€鍘ょ純顔煎灙鐞? * @param command - 閻╊喗鐖ｉ崨鎴掓姢
 * @param options - 閸栧綊鍘ら柅澶愩€? * @returns 閸栧綊鍘ら崚鎵畱韫囶偅宓庨柨顕嗙礉閺堫亝澹橀崚鎷岀箲閸?null
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
 * 閸掋倖鏌囬柨顔炬磸娴滃娆㈤弰顖氭儊閸栧綊鍘ら幐鍥х暰閸涙垝鎶ら惃鍕彥閹圭兘鏁妴? *
 * @param event - 闁款喚娲忔禍瀣╂
 * @param keybindings - 韫囶偅宓庨柨顕€鍘ょ純顔煎灙鐞? * @param command - 閻╊喗鐖ｉ崨鎴掓姢
 * @param options - 閸栧綊鍘ら柅澶愩€? * @returns 閺勵垰鎯侀崠褰掑帳
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
 * 娴犲骸鎻╅幑鐑芥暛闁板秶鐤嗛崚妤勩€冩稉顓⌒掗弸鎰版暛閻╂ü绨ㄦ禒璺侯嚠鎼存梻娈戦崨鎴掓姢閵? * 娴犲骸鍨悰銊︽汞鐏忔儳鎮滈崜宥変憾閸樺棴绱濇潻鏂挎礀缁楊兛绔存稉顏勫爱闁板秶娈戦崨鎴掓姢閵? *
 * @param event - 闁款喚娲忔禍瀣╂
 * @param keybindings - 韫囶偅宓庨柨顕€鍘ょ純顔煎灙鐞? * @param options - 閸栧綊鍘ら柅澶愩€? * @returns 閸栧綊鍘ら崚鎵畱閸涙垝鎶ら敍灞炬弓閹垫儳鍩屾潻鏂挎礀 null
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
 * 娴犲海鏁ら幋鐤殰鐎规矮绠熼柊宥囩枂娑擃厽褰侀崣鏍ㄦ弓鐞氼偉顩惄鏍畱姒涙顓昏箛顐ｅ祹闁款喖娲栭柅鈧い骞库偓? *
 * @param keybindings - 閻劍鍩涢懛顏勭暰娑斿娈戣箛顐ｅ祹闁款噣鍘ょ純? * @returns 閺堫亣顫﹂悽銊﹀煕鐟曞棛娲婇惃鍕帛鐠併倕鎻╅幑鐑芥暛閸掓銆? */
function getFallbackBindings(
  keybindings: ResolvedKeybindingsConfig,
): ReadonlyArray<ResolvedKeybindingRule> {
  const configuredCommands = new Set(keybindings.map((binding) => binding.command));
  return DEFAULT_SHORTCUT_FALLBACKS.filter((binding) => !configuredCommands.has(binding.command));
}

/**
 * 鐟欙絾鐎介柨顔炬磸娴滃娆㈢€电懓绨查惃鍕嚒娴犮們鈧倷绱崗鍫濇躬閻劍鍩涢懛顏勭暰娑斿鍘ょ純顔昏厬閺屻儲澹橀敍? * 閺堫亝澹橀崚鐗堟閸ョ偤鈧偓閸掍即绮拋銈呮彥閹圭兘鏁柊宥囩枂閵? *
 * @param event - 闁款喚娲忔禍瀣╂
 * @param keybindings - 閻劍鍩涢懛顏勭暰娑斿娈戣箛顐ｅ祹闁款噣鍘ょ純? * @param options - 閸栧綊鍘ら柅澶愩€? * @returns 閸栧綊鍘ら崚鎵畱閸涙垝鎶ら弽鍥槕缁楋讣绱濋張顏呭閸掓媽绻戦崶?null
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
 * 鐏忓棙瀵滈柨顔尖偓鍏肩壐瀵繐瀵叉稉鍝勫讲鐠囪崵娈戦弽鍥╊劮閺傚洦婀伴妴? * 婢跺嫮鎮婇悧瑙勭暕闁款喖顩х粚鐑樼壐閵嗕焦鏌熼崥鎴︽暛閵嗕笒scape 缁涘鈧? *
 * @param key - 閹稿鏁崐? * @returns 閺嶇厧绱￠崠鏍ф倵閻ㄥ嫭鐖ｇ粵? */
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
 * 鐏忓棗鎻╅幑鐑芥暛鐟欏嫬鍨弽鐓庣础閸栨牔璐熼崣顖濐嚢閻ㄥ嫭鐖ｇ粵鎯х摟缁楋缚瑕嗛妴? * macOS 娴ｈ法鏁ょ粭锕€褰块敍鍫氬閳便儮鍤欓埍鍐跨礆閿涘苯鍙炬禒鏍ч挬閸欓濞囬悽銊︽瀮鐎涙绱機trl+Alt+Shift+Meta閿涘鈧? *
 * @param shortcut - 韫囶偅宓庨柨顔款潐閸? * @param platform - 鏉╂劘顢戦獮鍐插酱閿涘矂绮拋銈勫▏閻?navigator.platform
 * @returns 閺嶇厧绱￠崠鏍ф倵閻ㄥ嫬鎻╅幑鐑芥暛閺嶅洨顒? *
 * @example
 * ```ts
 * formatShortcutLabel(shortcut, "MacIntel") // "閳辨ǚ鍤橬"
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

/** macOS 娣囶噣銈伴柨顔绢儊閸欑兘娉﹂崥鍫礉閻劋绨幏鍡楀瀻韫囶偅宓庨柨顔界垼缁?*/
const MODIFIER_SYMBOLS = new Set(["閳?, "閳?, "閳?, "閳?]);

/**
 * 鐏忓棗鎻╅幑鐑芥暛閺嶅洨顒风€涙顑佹稉鍙夊閸掑棔璐熼悪顒傜彌閻ㄥ嫪鎱ㄦ浼存暛閸滃本瀵滈柨顕€鍎撮崚鍡愨偓? * 閺€顖涘瘮娑撱倗顫掗弽鐓庣础閿涙瓙indows 妞嬪孩鐗搁惃?"+" 閸掑棝娈ч崪?macOS 妞嬪孩鐗搁惃鍕儊閸欓攱瀚鹃幒銉ｂ偓? *
 * @param shortcutLabel - 韫囶偅宓庨柨顔界垼缁涙儳鐡х粭锔胯
 * @returns 閹峰棗鍨庨崥搴ｆ畱閸氬嫰鍎撮崚鍡樻殶缂? *
 * @example
 * ```ts
 * splitShortcutLabel("Ctrl+Shift+N") // ["Ctrl", "Shift", "N"]
 * splitShortcutLabel("閳辨ǚ鍤橬")          // ["閳?, "閳?, "N"]
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
 * 閼惧嘲褰囬幐鍥х暰閸涙垝鎶ら惃鍕彥閹圭兘鏁弽鍥╊劮鐎涙顑佹稉灞傗偓? * 娴兼ê鍘涢崷銊ф暏閹寸柉鍤滅€规矮绠熼柊宥囩枂娑擃厽鐓￠幍鎾呯礉閺堫亝澹橀崚鐗堟閸ョ偤鈧偓閸掍即绮拋銈夊帳缂冾喓鈧? * 瑜版挻婀幓鎰返娑撳﹣绗呴弬鍥ㄦ閿涘瞼娲块幒銉﹀瘻閸涙垝鎶ら崠褰掑帳閿涘牅绗夌拠鍕強 when 鐎涙劕褰為敍澶変簰閹绘劙鐝幀褑鍏橀妴? *
 * @param keybindings - 韫囶偅宓庨柨顕€鍘ょ純顔煎灙鐞? * @param command - 閻╊喗鐖ｉ崨鎴掓姢
 * @param options - 楠炲啿褰撮崪灞肩瑐娑撳鏋冮柅澶愩€嶉敍灞肩瘍閸欘垯浜掗惄瀛樺复娴肩姴鍙嗛獮鍐插酱鐎涙顑佹稉? * @returns 韫囶偅宓庨柨顔界垼缁涙儳鐡х粭锔胯閿涘本婀幍鎯у煂鏉╂柨娲?null
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
 * 閺嶈宓佺槐銏犵穿閼惧嘲褰囩痪璺ㄢ柤鐠哄疇娴嗛崨鎴掓姢閵嗗倻鍌ㄥ鏇″瘱閸?0-8 鐎电懓绨?thread.jump.1 閸?thread.jump.9閵? *
 * @param index - 缁捐法鈻肩槐銏犵穿閿? 鐠у嘲顫愰敍? * @returns 缁捐法鈻肩捄瀹犳祮閸涙垝鎶ら敍宀€鍌ㄥ鏇＄Ш閻ｅ矁绻戦崶?null
 */
export function threadJumpCommandForIndex(index: number): ThreadJumpKeybindingCommand | null {
  return THREAD_JUMP_KEYBINDING_COMMANDS[index] ?? null;
}

/**
 * 閺嶈宓佺痪璺ㄢ柤鐠哄疇娴嗛崨鎴掓姢閼惧嘲褰囬崗鍓佸偍瀵洑缍呯純顔衡偓? *
 * @param command - 缁捐法鈻肩捄瀹犳祮閸涙垝鎶ょ€涙顑佹稉? * @returns 缁便垹绱╂担宥囩枂閿? 鐠у嘲顫愰敍澶涚礉閺堫亝澹橀崚鎷岀箲閸?null
 */
export function threadJumpIndexFromCommand(command: string): number | null {
  const index = THREAD_JUMP_KEYBINDING_COMMANDS.indexOf(command as ThreadJumpKeybindingCommand);
  return index === -1 ? null : index;
}

/**
 * 閸掋倖鏌囪ぐ鎾冲闁款喚娲忔禍瀣╂閺勵垰鎯佹惔鏃€妯夌粈铏瑰殠缁嬪鐑︽潪顒佸絹缁€鎭掆偓? * 瑜版挻瀵滄稉瀣╃啊缁捐法鈻肩捄瀹犳祮韫囶偅宓庨柨顔炬畱娣囶噣銈伴柨顔剧矋閸氬牊妞傛潻鏂挎礀 true閵? *
 * @param event - 闁款喚娲忔禍瀣╂
 * @param keybindings - 韫囶偅宓庨柨顕€鍘ょ純顔煎灙鐞? * @param options - 閸栧綊鍘ら柅澶愩€? * @returns 閺勵垰鎯佹惔鏃€妯夌粈铏瑰殠缁嬪鐑︽潪顒佸絹缁€? */
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

/** 閸掋倖鏌囬柨顔炬磸娴滃娆㈤弰顖氭儊閸栧綊鍘ょ紒鍫㈩伂閸掑洦宕茶箛顐ｅ祹闁?*/
export function isTerminalToggleShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "terminal.toggle", options);
}

/** 閸掋倖鏌囬柨顔炬磸娴滃娆㈤弰顖氭儊閸栧綊鍘ょ紒鍫㈩伂閸掑棗鐫嗚箛顐ｅ祹闁?*/
export function isTerminalSplitShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "terminal.split", options);
}

/** 閸掋倖鏌囬柨顔炬磸娴滃娆㈤弰顖氭儊閸栧綊鍘ら弬鏉跨紦缂佸牏顏箛顐ｅ祹闁?*/
export function isTerminalNewShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "terminal.new", options);
}

/** 閸掋倖鏌囬柨顔炬磸娴滃娆㈤弰顖氭儊閸栧綊鍘ら崗鎶芥４缂佸牏顏箛顐ｅ祹闁?*/
export function isTerminalCloseShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "terminal.close", options);
}

/** 閸掋倖鏌囬柨顔炬磸娴滃娆㈤弰顖氭儊閸栧綊鍘ゆ笟褑绔熼弽蹇撳瀼閹广垹鎻╅幑鐑芥暛 */
export function isSidebarToggleShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "sidebar.toggle", options);
}

/** 閸掋倖鏌囬柨顔炬磸娴滃娆㈤弰顖氭儊閸栧綊鍘?Diff 闂堛垺婢橀崚鍥ㄥ床韫囶偅宓庨柨?*/
export function isDiffToggleShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "diff.toggle", options);
}

/** 閸掋倖鏌囬柨顔炬磸娴滃娆㈤弰顖氭儊閸栧綊鍘ゅù蹇氼潔閸ｃ劑娼伴弶鍨瀼閹广垹鎻╅幑鐑芥暛 */
export function isBrowserToggleShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "browser.toggle", options);
}

/** 閸掋倖鏌囬柨顔炬磸娴滃娆㈤弰顖氭儊閸栧綊鍘ら弬鏉跨紦缁捐法鈻艰箛顐ｅ祹闁?*/
export function isChatNewShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "chat.new", options);
}

/** 閸掋倖鏌囬柨顔炬磸娴滃娆㈤弰顖氭儊閸栧綊鍘ら崷銊︽付閺備即銆嶉惄顔昏厬閺傛澘缂撶痪璺ㄢ柤韫囶偅宓庨柨?*/
export function isChatNewLatestProjectShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "chat.newLatestProject", options);
}

/**
 * 閸掋倖鏌囬柨顔炬磸娴滃娆㈤弰顖氭儊閸栧綊鍘ら弬鏉跨紦閼卞﹤銇夎箛顐ｅ祹闁款喓鈧? * 閸氬本妞傞崠褰掑帳 chat.newChat 閸?chat.newLocal 娑撱倓閲滈崨鎴掓姢閵? */
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

/** isChatNewLocalShortcut 閻ㄥ嫬鍩嗛崥宥忕礉娑?isChatNewChatShortcut 鐞涘奔璐熸稉鈧懛?*/
export const isChatNewLocalShortcut = isChatNewChatShortcut;

/** 閸掋倖鏌囬柨顔炬磸娴滃娆㈤弰顖氭儊閸栧綊鍘ら弬鏉跨紦 Claude 缁捐法鈻艰箛顐ｅ祹闁?*/
export function isChatNewClaudeShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "chat.newClaude", options);
}

/** 閸掋倖鏌囬柨顔炬磸娴滃娆㈤弰顖氭儊閸栧綊鍘ら弬鏉跨紦 Codex 缁捐法鈻艰箛顐ｅ祹闁?*/
export function isChatNewCodexShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "chat.newCodex", options);
}

/** 閸掋倖鏌囬柨顔炬磸娴滃娆㈤弰顖氭儊閸栧綊鍘ら弬鏉跨紦 Cursor 缁捐法鈻艰箛顐ｅ祹闁?*/
export function isChatNewCursorShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "chat.newCursor", options);
}

/** 閸掋倖鏌囬柨顔炬磸娴滃娆㈤弰顖氭儊閸栧綊鍘ら弬鏉跨紦 Gemini 缁捐法鈻艰箛顐ｅ祹闁?*/
export function isChatNewGeminiShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "chat.newGemini", options);
}

/** 閸掋倖鏌囬柨顔炬磸娴滃娆㈤弰顖氭儊閸栧綊鍘ら幍鎾崇磻閺€鎯版缂傛牞绶崳銊ユ彥閹圭兘鏁?*/
export function isOpenFavoriteEditorShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "editor.openFavorite", options);
}

/**
 * 閸掋倖鏌囬柨顔炬磸娴滃娆㈤弰顖氭儊閸栧綊鍘ょ紒鍫㈩伂濞撳懎鐫嗚箛顐ｅ祹闁款噯绱機trl+L閿涘鈧? * 濮濄倕鎻╅幑鐑芥暛娑撳秹鈧俺绻冭箛顐ｅ祹闁款噣鍘ょ純顔鹃兇缂佺噦绱濋懓灞炬Ц绾剛绱惍浣稿灲鐎规哎鈧? *
 * @param event - 闁款喚娲忔禍瀣╂
 * @param platform - 鏉╂劘顢戦獮鍐插酱閿涘矂绮拋銈勫▏閻?navigator.platform
 * @returns 閺勵垰鎯侀崠褰掑帳缂佸牏顏〒鍛潌韫囶偅宓庨柨? */
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
 * 鐟欙絾鐎界紒鍫㈩伂娑擃厾娈戠€佃壈鍩呰箛顐ｅ祹闁款噯绱欓幐澶婂礋鐠?鐞涘矂顩?鐞涘苯鐔捄瀹犳祮閿涘鈧? * 鏉╂柨娲栫€电懓绨查惃鍕矒缁旑垵娴嗘稊澶婄碍閸掓绱濇笟娑氱矒缁旑垱膩閹风喎娅掗惄瀛樺复閸欐垿鈧降鈧? *
 * - macOS: Alt+Arrow 閹稿宕熺拠宥堢儲鏉烆剨绱滳md+Arrow 鐠哄啿鍩岀悰宀勵浕/鐞涘苯鐔? * - Windows/Linux: Ctrl+Arrow 閹?Alt+Arrow 閹稿宕熺拠宥堢儲鏉? *
 * @param event - 闁款喚娲忔禍瀣╂
 * @param platform - 鏉╂劘顢戦獮鍐插酱閿涘矂绮拋銈勫▏閻?navigator.platform
 * @returns 缂佸牏顏潪顑跨疅鎼村繐鍨€涙顑佹稉璇х礉娑撳秴灏柊宥堢箲閸?null
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
