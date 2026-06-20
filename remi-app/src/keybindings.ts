/**
 * @file 快捷键绑定系统
 *
 * 负责管理应用内所有快捷键的解析、匹配和格式化。包括：
 * - 默认快捷键配置（侧边栏、聊天、终端、线程跳转等）
 * - 键盘事件与快捷键规则的匹配逻辑
 * - 快捷键标签的格式化与拆分（支持 macOS 和 Windows/Linux 平台差异）
 * - 各类快捷键判定的便捷函数
 */

import {
  type KeybindingCommand,
  type ResolvedKeybindingRule,
  type KeybindingShortcut,
  type KeybindingWhenNode,
  type ResolvedKeybindingsConfig,
  THREAD_JUMP_KEYBINDING_COMMANDS,
  type ThreadJumpKeybindingCommand,
} from "@remi-code/contracts";
import { isMacPlatform } from "./lib/utils";

/**
 * 快捷键事件的轻量表示，兼容原生 KeyboardEvent 和自定义事件对象。
 * 用于在快捷键匹配时统一处理键盘输入。
 */
export interface ShortcutEventLike {
  /** 事件类型，如 "keydown" */
  type?: string;
  /** 物理按键代码，如 "KeyA"、"Digit1" */
  code?: string;
  /** 按键值，如 "a"、"1"、"Escape" */
  key: string;
  /** 是否按下 Meta 键（macOS 为 Command 键） */
  metaKey: boolean;
  /** 是否按下 Ctrl 键 */
  ctrlKey: boolean;
  /** 是否按下 Shift 键 */
  shiftKey: boolean;
  /** 是否按下 Alt 键（macOS 为 Option 键） */
  altKey: boolean;
}

/**
 * 快捷键匹配的上下文环境，用于判断 when 子句的条件。
 * 描述当前 UI 状态以决定哪些快捷键生效。
 */
export interface ShortcutMatchContext {
  /** 终端是否获得焦点 */
  terminalFocus: boolean;
  /** 终端是否打开 */
  terminalOpen: boolean;
  /** 其他自定义上下文条件 */
  [key: string]: boolean;
}

/** 快捷键匹配时的可选配置 */
interface ShortcutMatchOptions {
  /** 运行平台，默认使用 navigator.platform */
  platform?: string;
  /** 匹配上下文，用于 when 子句求值 */
  context?: Partial<ShortcutMatchContext>;
}

/** 快捷键标签解析的配置选项 */
interface ResolvedShortcutLabelOptions extends ShortcutMatchOptions {
  /** 运行平台，默认使用 navigator.platform */
  platform?: string;
}

/**
 * 创建一个快捷键对象，默认启用 modKey（macOS 为 Command，其他为 Ctrl）。
 *
 * @param key - 按键值
 * @param overrides - 可选的修饰键覆盖
 * @returns 完整的快捷键对象
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
 * 创建 when 子句的标识符节点，表示一个上下文条件变量。
 *
 * @param name - 条件变量名称
 * @returns 标识符类型的 when 子句节点
 */
function whenIdentifier(name: string): KeybindingWhenNode {
  return { type: "identifier", name };
}

/**
 * 创建 when 子句的取反节点，表示对子条件的逻辑非。
 *
 * @param node - 需要取反的子节点
 * @returns 取反类型的 when 子句节点
 */
function whenNot(node: KeybindingWhenNode): KeybindingWhenNode {
  return { type: "not", node };
}

/**
 * 创建 when 子句的逻辑与节点，表示两个子条件同时满足。
 *
 * @param left - 左子节点
 * @param right - 右子节点
 * @returns 逻辑与类型的 when 子句节点
 */
function whenAnd(left: KeybindingWhenNode, right: KeybindingWhenNode): KeybindingWhenNode {
  return { type: "and", left, right };
}

/** when 子句：终端未获得焦点 */
const whenNotTerminalFocus = whenNot(whenIdentifier("terminalFocus"));
/** when 子句：终端未获得焦点且终端工作区未打开（用于线程跳转快捷键） */
const whenThreadJumpAvailable = whenAnd(
  whenNotTerminalFocus,
  whenNot(whenIdentifier("terminalWorkspaceOpen")),
);

/**
 * 默认快捷键回退配置。当用户未自定义某命令的快捷键时，使用此列表中的绑定。
 * 配置项按优先级从低到高排列，后出现的规则优先级更高。
 */
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

/** 终端中按 Alt+B 向后跳一个单词的转义序列 */
const TERMINAL_WORD_BACKWARD = "\u001bb";
/** 终端中按 Alt+F 向前跳一个单词的转义序列 */
const TERMINAL_WORD_FORWARD = "\u001bf";
/** 终端中按 Ctrl+A 跳到行首的转义序列 */
const TERMINAL_LINE_START = "\u0001";
/** 终端中按 Ctrl+E 跳到行尾的转义序列 */
const TERMINAL_LINE_END = "\u0005";

/**
 * 键盘事件 code 到 key 的别名映射表。
 * 用于将物理按键代码（如 "KeyA"）映射为逻辑按键值（如 "a"），
 * 以便在快捷键匹配时兼容不同键盘布局。
 */
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
 * 将键盘事件的 key 值标准化为小写，并处理特殊键的别名。
 *
 * @param key - 原始 key 值
 * @returns 标准化后的 key 值
 */
function normalizeEventKey(key: string): string {
  const normalized = key.toLowerCase();
  if (normalized === "esc") return "escape";
  if (normalized === "{") return "[";
  if (normalized === "}") return "]";
  return normalized;
}

/**
 * 解析键盘事件中所有可能的按键值集合。
 * 包括事件本身的 key 值和通过 code 映射出的别名。
 *
 * @param event - 键盘事件
 * @returns 所有可能的按键值集合
 */
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
 * 判断键盘事件的修饰键是否与快捷键规则匹配。
 * modKey 在 macOS 上映射为 Meta（Command），在其他平台映射为 Ctrl。
 *
 * @param event - 键盘事件
 * @param shortcut - 快捷键规则
 * @param platform - 运行平台，默认使用 navigator.platform
 * @returns 修饰键是否匹配
 */
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
 * 判断键盘事件是否完全匹配某个快捷键规则（修饰键 + 按键值）。
 *
 * @param event - 键盘事件
 * @param shortcut - 快捷键规则
 * @param platform - 运行平台，默认使用 navigator.platform
 * @returns 是否匹配
 */
function matchesShortcut(
  event: ShortcutEventLike,
  shortcut: KeybindingShortcut,
  platform = navigator.platform,
): boolean {
  if (!matchesShortcutModifiers(event, shortcut, platform)) return false;
  return resolveEventKeys(event).has(shortcut.key);
}

/** 从选项中解析平台标识，未指定时使用 navigator.platform */
function resolvePlatform(options: ShortcutMatchOptions | undefined): string {
  return options?.platform ?? navigator.platform;
}

/**
 * 从选项中解析快捷键匹配上下文，未指定的条件默认为 false。
 *
 * @param options - 匹配选项
 * @returns 完整的匹配上下文
 */
function resolveContext(options: ShortcutMatchOptions | undefined): ShortcutMatchContext {
  return {
    terminalFocus: false,
    terminalOpen: false,
    ...options?.context,
  };
}

/**
 * 递归求值 when 子句的 AST 节点。
 * 支持标识符（identifier）、取反（not）、逻辑与（and）、逻辑或（or）四种节点类型。
 *
 * @param node - when 子句 AST 节点
 * @param context - 上下文条件变量
 * @returns 子句求值结果
 */
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
 * 判断 when 子句是否在给定上下文中成立。无 when 子句时默认返回 true。
 *
 * @param whenAst - when 子句 AST 根节点
 * @param context - 上下文条件变量
 * @returns 子句是否成立
 */
function matchesWhenClause(
  whenAst: KeybindingWhenNode | undefined,
  context: ShortcutMatchContext,
): boolean {
  if (!whenAst) return true;
  return evaluateWhenNode(whenAst, context);
}

/**
 * 生成快捷键的冲突检测键，用于判断两个快捷键是否会产生冲突。
 * 将按键值和修饰键组合为唯一标识字符串。
 *
 * @param shortcut - 快捷键规则
 * @param platform - 运行平台
 * @returns 冲突检测键字符串
 */
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
 * 在快捷键配置列表中查找指定命令的有效快捷键。
 * 从列表末尾向前遍历（后出现的规则优先级更高），跳过已被更高优先级规则占用的快捷键。
 *
 * @param keybindings - 快捷键配置列表
 * @param command - 目标命令
 * @param options - 匹配选项
 * @returns 匹配到的快捷键，未找到返回 null
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
 * 判断键盘事件是否匹配指定命令的快捷键。
 *
 * @param event - 键盘事件
 * @param keybindings - 快捷键配置列表
 * @param command - 目标命令
 * @param options - 匹配选项
 * @returns 是否匹配
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
 * 从快捷键配置列表中解析键盘事件对应的命令。
 * 从列表末尾向前遍历，返回第一个匹配的命令。
 *
 * @param event - 键盘事件
 * @param keybindings - 快捷键配置列表
 * @param options - 匹配选项
 * @returns 匹配到的命令，未找到返回 null
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
 * 从用户自定义配置中提取未被覆盖的默认快捷键回退项。
 *
 * @param keybindings - 用户自定义的快捷键配置
 * @returns 未被用户覆盖的默认快捷键列表
 */
function getFallbackBindings(
  keybindings: ResolvedKeybindingsConfig,
): ReadonlyArray<ResolvedKeybindingRule> {
  const configuredCommands = new Set(keybindings.map((binding) => binding.command));
  return DEFAULT_SHORTCUT_FALLBACKS.filter((binding) => !configuredCommands.has(binding.command));
}

/**
 * 解析键盘事件对应的命令。优先在用户自定义配置中查找，
 * 未找到时回退到默认快捷键配置。
 *
 * @param event - 键盘事件
 * @param keybindings - 用户自定义的快捷键配置
 * @param options - 匹配选项
 * @returns 匹配到的命令标识符，未找到返回 null
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
 * 将按键值格式化为可读的标签文本。
 * 处理特殊键如空格、方向键、Escape 等。
 *
 * @param key - 按键值
 * @returns 格式化后的标签
 */
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
 * 将快捷键规则格式化为可读的标签字符串。
 * macOS 使用符号（⌘⌥⇧⌃），其他平台使用文字（Ctrl+Alt+Shift+Meta）。
 *
 * @param shortcut - 快捷键规则
 * @param platform - 运行平台，默认使用 navigator.platform
 * @returns 格式化后的快捷键标签
 *
 * @example
 * ```ts
 * formatShortcutLabel(shortcut, "MacIntel") // "⌘⇧N"
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

/** macOS 修饰键符号集合，用于拆分快捷键标签 */
const MODIFIER_SYMBOLS = new Set(["⌘", "⌥", "⌃", "⇧"]);

/**
 * 将快捷键标签字符串拆分为独立的修饰键和按键部分。
 * 支持两种格式：Windows 风格的 "+" 分隔和 macOS 风格的符号拼接。
 *
 * @param shortcutLabel - 快捷键标签字符串
 * @returns 拆分后的各部分数组
 *
 * @example
 * ```ts
 * splitShortcutLabel("Ctrl+Shift+N") // ["Ctrl", "Shift", "N"]
 * splitShortcutLabel("⌘⇧N")          // ["⌘", "⇧", "N"]
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
 * 获取指定命令的快捷键标签字符串。
 * 优先在用户自定义配置中查找，未找到时回退到默认配置。
 * 当未提供上下文时，直接按命令匹配（不评估 when 子句）以提高性能。
 *
 * @param keybindings - 快捷键配置列表
 * @param command - 目标命令
 * @param options - 平台和上下文选项，也可以直接传入平台字符串
 * @returns 快捷键标签字符串，未找到返回 null
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
 * 根据索引获取线程跳转命令。索引范围 0-8 对应 thread.jump.1 到 thread.jump.9。
 *
 * @param index - 线程索引（0 起始）
 * @returns 线程跳转命令，索引越界返回 null
 */
export function threadJumpCommandForIndex(index: number): ThreadJumpKeybindingCommand | null {
  return THREAD_JUMP_KEYBINDING_COMMANDS[index] ?? null;
}

/**
 * 根据线程跳转命令获取其索引位置。
 *
 * @param command - 线程跳转命令字符串
 * @returns 索引位置（0 起始），未找到返回 null
 */
export function threadJumpIndexFromCommand(command: string): number | null {
  const index = THREAD_JUMP_KEYBINDING_COMMANDS.indexOf(command as ThreadJumpKeybindingCommand);
  return index === -1 ? null : index;
}

/**
 * 判断当前键盘事件是否应显示线程跳转提示。
 * 当按下了线程跳转快捷键的修饰键组合时返回 true。
 *
 * @param event - 键盘事件
 * @param keybindings - 快捷键配置列表
 * @param options - 匹配选项
 * @returns 是否应显示线程跳转提示
 */
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

/** 判断键盘事件是否匹配终端切换快捷键 */
export function isTerminalToggleShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "terminal.toggle", options);
}

/** 判断键盘事件是否匹配终端分屏快捷键 */
export function isTerminalSplitShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "terminal.split", options);
}

/** 判断键盘事件是否匹配新建终端快捷键 */
export function isTerminalNewShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "terminal.new", options);
}

/** 判断键盘事件是否匹配关闭终端快捷键 */
export function isTerminalCloseShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "terminal.close", options);
}

/** 判断键盘事件是否匹配侧边栏切换快捷键 */
export function isSidebarToggleShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "sidebar.toggle", options);
}

/** 判断键盘事件是否匹配 Diff 面板切换快捷键 */
export function isDiffToggleShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "diff.toggle", options);
}

/** 判断键盘事件是否匹配浏览器面板切换快捷键 */
export function isBrowserToggleShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "browser.toggle", options);
}

/** 判断键盘事件是否匹配新建线程快捷键 */
export function isChatNewShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "chat.new", options);
}

/** 判断键盘事件是否匹配在最新项目中新建线程快捷键 */
export function isChatNewLatestProjectShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "chat.newLatestProject", options);
}

/**
 * 判断键盘事件是否匹配新建聊天快捷键。
 * 同时匹配 chat.newChat 和 chat.newLocal 两个命令。
 */
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

/** isChatNewLocalShortcut 的别名，与 isChatNewChatShortcut 行为一致 */
export const isChatNewLocalShortcut = isChatNewChatShortcut;

/** 判断键盘事件是否匹配新建 Claude 线程快捷键 */
export function isChatNewClaudeShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "chat.newClaude", options);
}

/** 判断键盘事件是否匹配新建 Codex 线程快捷键 */
export function isChatNewCodexShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "chat.newCodex", options);
}

/** 判断键盘事件是否匹配新建 Cursor 线程快捷键 */
export function isChatNewCursorShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "chat.newCursor", options);
}

/** 判断键盘事件是否匹配新建 Gemini 线程快捷键 */
export function isChatNewGeminiShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "chat.newGemini", options);
}

/** 判断键盘事件是否匹配打开收藏编辑器快捷键 */
export function isOpenFavoriteEditorShortcut(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  options?: ShortcutMatchOptions,
): boolean {
  return matchesCommandShortcut(event, keybindings, "editor.openFavorite", options);
}

/**
 * 判断键盘事件是否匹配终端清屏快捷键（Ctrl+L）。
 * 此快捷键不通过快捷键配置系统，而是硬编码判定。
 *
 * @param event - 键盘事件
 * @param platform - 运行平台，默认使用 navigator.platform
 * @returns 是否匹配终端清屏快捷键
 */
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
 * 解析终端中的导航快捷键（按单词/行首/行尾跳转）。
 * 返回对应的终端转义序列，供终端模拟器直接发送。
 *
 * - macOS: Alt+Arrow 按单词跳转，Cmd+Arrow 跳到行首/行尾
 * - Windows/Linux: Ctrl+Arrow 或 Alt+Arrow 按单词跳转
 *
 * @param event - 键盘事件
 * @param platform - 运行平台，默认使用 navigator.platform
 * @returns 终端转义序列字符串，不匹配返回 null
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
