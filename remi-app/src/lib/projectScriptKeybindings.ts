/**
 * @file projectScriptKeybindings.ts
 * @description 项目脚本快捷键绑定处理，提供快捷键规则解码和
 * 已解析快捷键配置的命令值查询功能。
 */

import {
  type KeybindingCommand,
  type KeybindingRule,
  type ResolvedKeybindingsConfig,
} from "~/contracts";

/** 无效快捷键绑定错误提示 */
export const PROJECT_SCRIPT_KEYBINDING_INVALID_MESSAGE = "Invalid keybinding.";

/** 规范化快捷键输入，去除首尾空白后返回非空字符串或 null */
function normalizeProjectScriptKeybindingInput(
  keybinding: string | null | undefined,
): string | null {
  const trimmed = keybinding?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 将原始快捷键输入解码为 KeybindingRule 对象
 *
 * @param input - 解码输入
 * @param input.keybinding - 原始快捷键字符串
 * @param input.command - 绑定的命令
 * @returns 解码后的 KeybindingRule，若快捷键为空则返回 null
 *
 * @remarks 迁移期间仅做基础非空校验；后续可接入 zod/effect schema 校验
 */
export function decodeProjectScriptKeybindingRule(input: {
  keybinding: string | null | undefined;
  command: KeybindingCommand;
}): KeybindingRule | null {
  const normalizedKey = normalizeProjectScriptKeybindingInput(input.keybinding);
  if (!normalizedKey) return null;

  if (typeof input.command !== "string" || input.command.length === 0) {
    throw new Error(PROJECT_SCRIPT_KEYBINDING_INVALID_MESSAGE);
  }

  return {
    key: normalizedKey,
    command: input.command,
  };
}

/**
 * 从已解析的快捷键配置中查找指定命令的快捷键值
 *
 * @param keybindings - 已解析的快捷键配置列表
 * @param command - 目标命令
 * @returns 快捷键字符串（如 "mod+shift+p"），若未找到则返回 null
 */
export function keybindingValueForCommand(
  keybindings: ResolvedKeybindingsConfig,
  command: KeybindingCommand,
): string | null {
  for (let index = keybindings.length - 1; index >= 0; index -= 1) {
    const binding = keybindings[index];
    if (!binding || binding.command !== command) continue;

    const parts: string[] = [];
    if (binding.shortcut.modKey) parts.push("mod");
    if (binding.shortcut.ctrlKey) parts.push("ctrl");
    if (binding.shortcut.metaKey) parts.push("meta");
    if (binding.shortcut.altKey) parts.push("alt");
    if (binding.shortcut.shiftKey) parts.push("shift");
    const keyToken =
      binding.shortcut.key === " "
        ? "space"
        : binding.shortcut.key === "escape"
          ? "esc"
          : binding.shortcut.key;
    parts.push(keyToken);
    return parts.join("+");
  }
  return null;
}