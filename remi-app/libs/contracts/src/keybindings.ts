/**
 * 快捷键绑定相关的共享契约。
 * 定义了快捷键命令、快捷键规则、快捷键配置以及 when 条件表达式的类型。
 * 支持静态命令（如侧边栏切换、终端操作、聊天操作等）和动态脚本命令（script.{id}.run 模式）。
 * 客户端和服务端共享使用，用于统一快捷键相关的类型定义。
 */

import type { TrimmedString } from "./baseSchemas";

/** 快捷键值的最大字符长度 */
export const MAX_KEYBINDING_VALUE_LENGTH = 64;
/** when 条件表达式的最大字符长度 */
const MAX_KEYBINDING_WHEN_LENGTH = 256;
/** when 条件表达式 AST 的最大深度 */
export const MAX_WHEN_EXPRESSION_DEPTH = 64;
/** 脚本 ID 的最大字符长度 */
export const MAX_SCRIPT_ID_LENGTH = 24;
/** 快捷键配置中允许的最大规则数量 */
export const MAX_KEYBINDINGS_COUNT = 256;

/**
 * 静态快捷键命令列表（只读常量）。
 * 包含侧边栏、终端、浏览器、差异对比、聊天、会话跳转等内置命令。
 */
const STATIC_KEYBINDING_COMMANDS = [
  "sidebar.toggle",
  "sidebar.search",
  "sidebar.addProject",
  "sidebar.importThread",
  "terminal.toggle",
  "terminal.split",
  "terminal.splitRight",
  "terminal.splitLeft",
  "terminal.splitDown",
  "terminal.splitUp",
  "terminal.new",
  "terminal.close",
  "terminal.workspace.newFullWidth",
  "terminal.workspace.closeActive",
  "terminal.workspace.terminal",
  "terminal.workspace.chat",
  "browser.toggle",
  "diff.toggle",
  "chat.new",
  "chat.newLatestProject",
  "chat.newChat",
  "chat.newLocal",
  "chat.newTerminal",
  "chat.newClaude",
  "chat.newCodex",
  "chat.newCursor",
  "chat.newGemini",
  "chat.split",
  "thread.jump.1",
  "thread.jump.2",
  "thread.jump.3",
  "thread.jump.4",
  "thread.jump.5",
  "thread.jump.6",
  "thread.jump.7",
  "thread.jump.8",
  "thread.jump.9",
  "chat.visible.next",
  "chat.visible.previous",
  "editor.openFavorite",
] as const;

/** 会话跳转命令列表，供 Web 端快捷键 UI 使用，支持跳转到第 1~9 个会话 */
export const THREAD_JUMP_KEYBINDING_COMMANDS = [
  "thread.jump.1",
  "thread.jump.2",
  "thread.jump.3",
  "thread.jump.4",
  "thread.jump.5",
  "thread.jump.6",
  "thread.jump.7",
  "thread.jump.8",
  "thread.jump.9",
] as const;
/** 会话跳转命令的类型 */
export type ThreadJumpKeybindingCommand = (typeof THREAD_JUMP_KEYBINDING_COMMANDS)[number];

/** 脚本运行命令的类型，格式为 script.{scriptId}.run，scriptId 需符合小写字母数字和连字符的命名规则 */
type ScriptRunCommand = `script.${string}.run`;

/** 脚本运行命令模式校验器（兼容 Effect Schema 的轻量替代） */
export const SCRIPT_RUN_COMMAND_PATTERN = {
  pattern: /^script\.([a-z0-9-]+)\.run$/,
  parts: [
    { literal: "script." },
    { type: "scriptId" as const },
    { literal: ".run" },
  ] as const,
  makeUnsafe(value: string): ScriptRunCommand {
    return value as ScriptRunCommand;
  },
  is(value: unknown): value is ScriptRunCommand {
    return typeof value === "string" && this.pattern.test(value);
  },
};

/** 快捷键命令类型，可以是静态命令或动态脚本运行命令 */
export type KeybindingCommand =
  | (typeof STATIC_KEYBINDING_COMMANDS)[number]
  | ScriptRunCommand;

/** 快捷键按键值类型，非空且长度受限 */
type KeybindingValue = TrimmedString;

/** when 条件表达式字符串类型，非空且长度受限 */
type KeybindingWhen = TrimmedString;

/** 单条快捷键规则，包含按键、命令和可选的 when 条件 */
export interface KeybindingRule {
  /** 快捷键按键值（如 "ctrl+shift+p"） */
  key: KeybindingValue;
  /** 快捷键对应的命令 */
  command: KeybindingCommand;
  /** 可选的 when 条件表达式，满足条件时快捷键才生效 */
  when?: KeybindingWhen;
}

/** 快捷键配置类型，为快捷键规则数组，数量有上限限制 */
export type KeybindingsConfig = KeybindingRule[];

/** 快捷键快捷键详情类型，描述按键组合的各个修饰键状态 */
export interface KeybindingShortcut {
  /** 按键值 */
  key: KeybindingValue;
  /** 是否按下 Meta 键（Mac 上的 Command 键） */
  metaKey: boolean;
  /** 是否按下 Ctrl 键 */
  ctrlKey: boolean;
  /** 是否按下 Shift 键 */
  shiftKey: boolean;
  /** 是否按下 Alt 键 */
  altKey: boolean;
  /** 是否按下 Mod 键（跨平台修饰键，Mac 上为 Meta，其他平台为 Ctrl） */
  modKey: boolean;
}

/**
 * when 条件表达式 AST 节点类型，支持递归定义。
 * 包含四种节点类型：identifier（标识符）、not（取反）、and（与）、or（或）。
 */
export type KeybindingWhenNode =
  | { type: "identifier"; name: string }
  | { type: "not"; node: KeybindingWhenNode }
  | { type: "and"; left: KeybindingWhenNode; right: KeybindingWhenNode }
  | { type: "or"; left: KeybindingWhenNode; right: KeybindingWhenNode };

/** 解析后的快捷键规则类型，包含命令、快捷键详情和可选的 when 条件 AST */
export interface ResolvedKeybindingRule {
  /** 快捷键对应的命令 */
  command: KeybindingCommand;
  /** 快捷键详情（按键组合） */
  shortcut: KeybindingShortcut;
  /** 可选的 when 条件 AST，解析后的结构化条件表达式 */
  whenAst?: KeybindingWhenNode;
}

/** 解析后的快捷键配置类型，为解析后的快捷键规则数组，数量有上限限制 */
export type ResolvedKeybindingsConfig = ResolvedKeybindingRule[];
