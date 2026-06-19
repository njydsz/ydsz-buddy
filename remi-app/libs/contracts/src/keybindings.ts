/**
 * @file keybindings.ts
 * @description 快捷键绑定相关的共享契约。定义了快捷键命令、快捷键规则、快捷键配置以及 when 条件表达式的 Schema 和类型。
 * 支持静态命令（如侧边栏切换、终端操作、聊天操作等）和动态脚本命令（script.{id}.run 模式）。
 * 客户端和服务端共享使用，用于统一快捷键相关的类型定义和校验规则。
 */

import { Schema } from "effect";
import { TrimmedString } from "./baseSchemas";

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

/** 脚本运行命令的 Schema，格式为 script.{scriptId}.run，scriptId 需符合小写字母数字和连字符的命名规则 */
export const SCRIPT_RUN_COMMAND_PATTERN = Schema.TemplateLiteral([
  Schema.Literal("script."),
  Schema.NonEmptyString.check(
    Schema.isMaxLength(MAX_SCRIPT_ID_LENGTH),
    Schema.isPattern(/^[a-z0-9][a-z0-9-]*$/),
  ),
  Schema.Literal(".run"),
]);

/** 快捷键命令的 Schema，可以是静态命令或动态脚本运行命令 */
export const KeybindingCommand = Schema.Union([
  Schema.Literals(STATIC_KEYBINDING_COMMANDS),
  SCRIPT_RUN_COMMAND_PATTERN,
]);
export type KeybindingCommand = typeof KeybindingCommand.Type;

/** 快捷键按键值的 Schema，非空且长度受限 */
const KeybindingValue = TrimmedString.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(MAX_KEYBINDING_VALUE_LENGTH),
);

/** when 条件表达式字符串的 Schema，非空且长度受限 */
const KeybindingWhen = TrimmedString.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(MAX_KEYBINDING_WHEN_LENGTH),
);

/** 单条快捷键规则的 Schema，包含按键、命令和可选的 when 条件 */
export const KeybindingRule = Schema.Struct({
  /** 快捷键按键值（如 "ctrl+shift+p"） */
  key: KeybindingValue,
  /** 快捷键对应的命令 */
  command: KeybindingCommand,
  /** 可选的 when 条件表达式，满足条件时快捷键才生效 */
  when: Schema.optional(KeybindingWhen),
});
export type KeybindingRule = typeof KeybindingRule.Type;

/** 快捷键配置 Schema，为快捷键规则数组，数量有上限限制 */
export const KeybindingsConfig = Schema.Array(KeybindingRule).check(
  Schema.isMaxLength(MAX_KEYBINDINGS_COUNT),
);
export type KeybindingsConfig = typeof KeybindingsConfig.Type;

/** 快捷键快捷键详情 Schema，描述按键组合的各个修饰键状态 */
export const KeybindingShortcut = Schema.Struct({
  /** 按键值 */
  key: KeybindingValue,
  /** 是否按下 Meta 键（Mac 上的 Command 键） */
  metaKey: Schema.Boolean,
  /** 是否按下 Ctrl 键 */
  ctrlKey: Schema.Boolean,
  /** 是否按下 Shift 键 */
  shiftKey: Schema.Boolean,
  /** 是否按下 Alt 键 */
  altKey: Schema.Boolean,
  /** 是否按下 Mod 键（跨平台修饰键，Mac 上为 Meta，其他平台为 Ctrl） */
  modKey: Schema.Boolean,
});
export type KeybindingShortcut = typeof KeybindingShortcut.Type;

/**
 * when 条件表达式 AST 节点的 Schema，支持递归定义。
 * 包含四种节点类型：identifier（标识符）、not（取反）、and（与）、or（或）。
 */
export const KeybindingWhenNode: Schema.Schema<KeybindingWhenNode> = Schema.Union([
  /** 标识符节点，表示一个条件变量名 */
  Schema.Struct({
    type: Schema.Literal("identifier"),
    name: Schema.NonEmptyString,
  }),
  /** 取反节点，对子节点结果取反 */
  Schema.Struct({
    type: Schema.Literal("not"),
    node: Schema.suspend((): Schema.Schema<KeybindingWhenNode> => KeybindingWhenNode),
  }),
  /** 与节点，左右子节点同时为真时结果为真 */
  Schema.Struct({
    type: Schema.Literal("and"),
    left: Schema.suspend((): Schema.Schema<KeybindingWhenNode> => KeybindingWhenNode),
    right: Schema.suspend((): Schema.Schema<KeybindingWhenNode> => KeybindingWhenNode),
  }),
  /** 或节点，左右子节点任一为真时结果为真 */
  Schema.Struct({
    type: Schema.Literal("or"),
    left: Schema.suspend((): Schema.Schema<KeybindingWhenNode> => KeybindingWhenNode),
    right: Schema.suspend((): Schema.Schema<KeybindingWhenNode> => KeybindingWhenNode),
  }),
]);
/** when 条件表达式 AST 节点类型 */
export type KeybindingWhenNode =
  | { type: "identifier"; name: string }
  | { type: "not"; node: KeybindingWhenNode }
  | { type: "and"; left: KeybindingWhenNode; right: KeybindingWhenNode }
  | { type: "or"; left: KeybindingWhenNode; right: KeybindingWhenNode };

/** 解析后的快捷键规则 Schema，包含命令、快捷键详情和可选的 when 条件 AST */
export const ResolvedKeybindingRule = Schema.Struct({
  /** 快捷键对应的命令 */
  command: KeybindingCommand,
  /** 快捷键详情（按键组合） */
  shortcut: KeybindingShortcut,
  /** 可选的 when 条件 AST，解析后的结构化条件表达式 */
  whenAst: Schema.optional(KeybindingWhenNode),
}).annotate({ parseOptions: { onExcessProperty: "ignore" } });
export type ResolvedKeybindingRule = typeof ResolvedKeybindingRule.Type;

/** 解析后的快捷键配置 Schema，为解析后的快捷键规则数组，数量有上限限制 */
export const ResolvedKeybindingsConfig = Schema.Array(ResolvedKeybindingRule).check(
  Schema.isMaxLength(MAX_KEYBINDINGS_COUNT),
);
export type ResolvedKeybindingsConfig = typeof ResolvedKeybindingsConfig.Type;
