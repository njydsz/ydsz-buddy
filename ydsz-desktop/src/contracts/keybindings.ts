/**
 * @file 快捷键绑定契约模块
 *
 * 本模块定义了 ydsz 工作区中可自定义的快捷键（Keybinding）绑定与解析契约。
 *
 * ## 核心契约
 *
 * - `KeybindingChord`：单个按键组合（如 `Ctrl+Shift+P`）
 * - `KeybindingSequence`：按键序列（如 `Ctrl+K Ctrl+C`）
 * - `KeybindingConfig`：单个快捷键的完整配置
 * - `KeybindingsConfig`：完整的快捷键配置文件
 * - `KeybindingConflictReport`：快捷键冲突报告
 * - `KEYBINDING_LABELS`：按键到展示标签的映射
 *
 * ## 协议设计
 *
 * - **键名标准化**：使用 `Ctrl`、`Shift`、`Alt`、`Meta` 等通用修饰符
 * - **平台差异**：Mac 上 `Meta` 映射为 `Cmd`，其他平台为 `Win`
 * - **冲突检测**：保存前会调用 `keybindingsValidate` 检测冲突
 * - **When 表达式**：使用类 VSCode 的 `when` 上下文表达式
 *
 * ## 使用场景
 *
 * - 偏好设置中编辑快捷键
 * - 全局快捷键监听器
 * - 快捷键冲突检测与提示
 *
 * ## 注意事项
 *
 * - `value` 字符串最大长度 64 字符
 * - `when` 表达式最大长度 256 字符
 */

import { Schema } from "effect";
import { TrimmedString } from "./baseSchemas";

export const MAX_KEYBINDING_VALUE_LENGTH = 64;
const MAX_KEYBINDING_WHEN_LENGTH = 256;
export const MAX_WHEN_EXPRESSION_DEPTH = 64;
export const MAX_SCRIPT_ID_LENGTH = 24;
export const MAX_KEYBINDINGS_COUNT = 256;

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

// Shared list of numbered thread-jump commands used by the web shortcut UI.
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

export const SCRIPT_RUN_COMMAND_PATTERN = Schema.String.pipe(
  Schema.maxLength(24 + 13), // "script." + ".run" = 13 chars
  Schema.pattern(/^script\.[a-z0-9][a-z0-9-]*\.run$/),
);

export const KeybindingCommand = Schema.Union(
  Schema.Literal(...STATIC_KEYBINDING_COMMANDS),
  SCRIPT_RUN_COMMAND_PATTERN,
);
export type KeybindingCommand = typeof KeybindingCommand.Type;

const KeybindingValue = TrimmedString.pipe(
  Schema.minLength(1),
  Schema.maxLength(MAX_KEYBINDING_VALUE_LENGTH),
);

const KeybindingWhen = TrimmedString.pipe(
  Schema.minLength(1),
  Schema.maxLength(MAX_KEYBINDING_WHEN_LENGTH),
);
export const KeybindingRule = Schema.Struct({
  key: KeybindingValue,
  command: KeybindingCommand,
  when: Schema.optional(KeybindingWhen),
});
export type KeybindingRule = typeof KeybindingRule.Type;

export const KeybindingsConfig = Schema.Array(KeybindingRule).pipe(
  Schema.filter((arr) => arr.length <= MAX_KEYBINDINGS_COUNT),
);
export type KeybindingsConfig = typeof KeybindingsConfig.Type;

export const KeybindingShortcut = Schema.Struct({
  key: KeybindingValue,
  metaKey: Schema.Boolean,
  ctrlKey: Schema.Boolean,
  shiftKey: Schema.Boolean,
  altKey: Schema.Boolean,
  modKey: Schema.Boolean,
});
export type KeybindingShortcut = typeof KeybindingShortcut.Type;

export const KeybindingWhenNode: Schema.Schema<KeybindingWhenNode> = Schema.Union(
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
);
export type KeybindingWhenNode =
  | { type: "identifier"; name: string }
  | { type: "not"; node: KeybindingWhenNode }
  | { type: "and"; left: KeybindingWhenNode; right: KeybindingWhenNode }
  | { type: "or"; left: KeybindingWhenNode; right: KeybindingWhenNode };

export const ResolvedKeybindingRule = Schema.Struct({
  command: KeybindingCommand,
  shortcut: KeybindingShortcut,
  whenAst: Schema.optional(KeybindingWhenNode),
}).annotations({ parseOptions: { onExcessProperty: "ignore" } });
export type ResolvedKeybindingRule = typeof ResolvedKeybindingRule.Type;

export const ResolvedKeybindingsConfig = Schema.Array(ResolvedKeybindingRule).pipe(
  Schema.filter((arr) => arr.length <= MAX_KEYBINDINGS_COUNT),
);
export type ResolvedKeybindingsConfig = typeof ResolvedKeybindingsConfig.Type;
