/**
 * 键盘快捷键合约定义
 *
 * 用途：定义键盘快捷键的配置、规则、解析等结构，供客户端与服务端共享使用。
 * 所属模块：共享契约层（Shared Contracts）
 * 主要导出：
 *   - KeybindingCommand —— 快捷键命令类型
 *   - KeybindingRule —— 快捷键规则
 *   - KeybindingShortcut —— 快捷键组合
 *   - KeybindingWhenNode —— When 条件表达式 AST 节点
 *   - KeybindingsConfig —— 快捷键配置
 *   - ResolvedKeybindingRule / ResolvedKeybindingsConfig —— 已解析的快捷键配置
 *   - THREAD_JUMP_KEYBINDING_COMMANDS —— 线程跳转命令列表
 *   - 各种常量：MAX_KEYBINDING_VALUE_LENGTH / MAX_SCRIPT_ID_LENGTH / MAX_KEYBINDINGS_COUNT 等
 */

import { Schema } from "effect";
import { TrimmedString } from "./baseSchemas";

/** 快捷键值最大长度 */
export const MAX_KEYBINDING_VALUE_LENGTH = 64;
/** When 条件最大长度 */
const MAX_KEYBINDING_WHEN_LENGTH = 256;
/** When 表达式 AST 最大深度 */
export const MAX_WHEN_EXPRESSION_DEPTH = 64;
/** 脚本 ID 最大长度 */
export const MAX_SCRIPT_ID_LENGTH = 24;
/** 快捷键最大数量 */
export const MAX_KEYBINDINGS_COUNT = 256;

/** 静态快捷键命令列表 */
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

/** 线程跳转快捷键命令列表，供 Web 快捷键 UI 使用 */
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
export type ThreadJumpKeybindingCommand = (typeof THREAD_JUMP_KEYBINDING_COMMANDS)[number];

/** 脚本运行命令模式：script.<id>.run */
export const SCRIPT_RUN_COMMAND_PATTERN = Schema.TemplateLiteral([
  Schema.Literal("script."),
  Schema.NonEmptyString.check(
    Schema.isMaxLength(MAX_SCRIPT_ID_LENGTH),
    Schema.isPattern(/^[a-z0-9][a-z0-9-]*$/),
  ),
  Schema.Literal(".run"),
]);

/** 快捷键命令（静态命令 + 脚本运行命令） */
export const KeybindingCommand = Schema.Union([
  Schema.Literals(STATIC_KEYBINDING_COMMANDS),
  SCRIPT_RUN_COMMAND_PATTERN,
]);
export type KeybindingCommand = typeof KeybindingCommand.Type;

/** 快捷键键值约束 */
const KeybindingValue = TrimmedString.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(MAX_KEYBINDING_VALUE_LENGTH),
);

/** When 条件约束 */
const KeybindingWhen = TrimmedString.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(MAX_KEYBINDING_WHEN_LENGTH),
);

/** 快捷键规则 */
export const KeybindingRule = Schema.Struct({
  key: KeybindingValue,
  command: KeybindingCommand,
  when: Schema.optional(KeybindingWhen),
});
export type KeybindingRule = typeof KeybindingRule.Type;

/** 快捷键配置列表 */
export const KeybindingsConfig = Schema.Array(KeybindingRule).check(
  Schema.isMaxLength(MAX_KEYBINDINGS_COUNT),
);
export type KeybindingsConfig = typeof KeybindingsConfig.Type;

/** 快捷键组合（含修饰键信息） */
export const KeybindingShortcut = Schema.Struct({
  key: KeybindingValue,
  metaKey: Schema.Boolean,
  ctrlKey: Schema.Boolean,
  shiftKey: Schema.Boolean,
  altKey: Schema.Boolean,
  modKey: Schema.Boolean,
});
export type KeybindingShortcut = typeof KeybindingShortcut.Type;

/** When 条件表达式 AST 节点（支持 identifier / not / and / or） */
export const KeybindingWhenNode: Schema.Schema<KeybindingWhenNode> = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("identifier"),
    name: Schema.NonEmptyString,
  }),
  Schema.Struct({
    type: Schema.Literal("not"),
    node: Schema.suspend((): Schema.Schema<KeybindingWhenNode> => KeybindingWhenNode),
  }),
  Schema.Struct({
    type: Schema.Literal("and"),
    left: Schema.suspend((): Schema.Schema<KeybindingWhenNode> => KeybindingWhenNode),
    right: Schema.suspend((): Schema.Schema<KeybindingWhenNode> => KeybindingWhenNode),
  }),
  Schema.Struct({
    type: Schema.Literal("or"),
    left: Schema.suspend((): Schema.Schema<KeybindingWhenNode> => KeybindingWhenNode),
    right: Schema.suspend((): Schema.Schema<KeybindingWhenNode> => KeybindingWhenNode),
  }),
]);
export type KeybindingWhenNode =
  | { type: "identifier"; name: string }
  | { type: "not"; node: KeybindingWhenNode }
  | { type: "and"; left: KeybindingWhenNode; right: KeybindingWhenNode }
  | { type: "or"; left: KeybindingWhenNode; right: KeybindingWhenNode };

/** 已解析的快捷键规则 */
export const ResolvedKeybindingRule = Schema.Struct({
  command: KeybindingCommand,
  shortcut: KeybindingShortcut,
  whenAst: Schema.optional(KeybindingWhenNode),
}).annotate({ parseOptions: { onExcessProperty: "ignore" } });
export type ResolvedKeybindingRule = typeof ResolvedKeybindingRule.Type;

/** 已解析的快捷键配置列表 */
export const ResolvedKeybindingsConfig = Schema.Array(ResolvedKeybindingRule).check(
  Schema.isMaxLength(MAX_KEYBINDINGS_COUNT),
);
export type ResolvedKeybindingsConfig = typeof ResolvedKeybindingsConfig.Type;