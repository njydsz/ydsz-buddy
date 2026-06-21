/**
 * @file 终端新建操作解析模块
 *
 * 本模块提供对"新建终端"操作的目标终端 ID 解析工具，根据当前布局和已有终端决定新终端的位置。
 *
 * ## 核心导出
 *
 * - `ResolveTerminalNewActionInput`：解析输入
 * - `resolveTerminalNewAction`：解析新终端应该在哪里创建
 *
 * ## 使用场景
 *
 * - 用户点击"+ 新建终端"按钮
 * - 工作区中创建新终端
 * - 拆分/合并终端时的目标推断
 *
 * ## 注意事项
 *
 * - 如果当前布局已有终端，则在同位置替换
 * - 如果没有终端，则使用默认 ID
 */

import { collectTerminalIdsFromLayout } from "../terminalPaneLayout";
import type { ThreadTerminalGroup } from "../types";

export interface ResolveTerminalNewActionInput {
  terminalOpen: boolean;
  activeTerminalId: string;
  activeTerminalGroupId: string;
  terminalGroups: ThreadTerminalGroup[];
}

export type TerminalNewAction =
  | { kind: "new-group" }
  | { kind: "new-tab"; targetTerminalId: string };

function resolveActiveTerminalGroup(
  input: ResolveTerminalNewActionInput,
): ThreadTerminalGroup | null {
  return (
    input.terminalGroups.find((group) => group.id === input.activeTerminalGroupId) ??
    input.terminalGroups.find((group) =>
      collectTerminalIdsFromLayout(group.layout).includes(input.activeTerminalId),
    ) ??
    input.terminalGroups[0] ??
    null
  );
}

export function resolveTerminalNewAction(input: ResolveTerminalNewActionInput): TerminalNewAction {
  if (!input.terminalOpen) {
    return { kind: "new-group" };
  }

  const activeGroup = resolveActiveTerminalGroup(input);
  const activeGroupTerminalIds = activeGroup
    ? collectTerminalIdsFromLayout(activeGroup.layout)
    : [];
  const normalizedActiveTerminalId = input.activeTerminalId.trim();

  if (activeGroup && activeGroupTerminalIds.includes(activeGroup.activeTerminalId)) {
    return {
      kind: "new-tab",
      targetTerminalId: activeGroup.activeTerminalId,
    };
  }

  if (activeGroupTerminalIds.includes(normalizedActiveTerminalId)) {
    return {
      kind: "new-tab",
      targetTerminalId: normalizedActiveTerminalId,
    };
  }

  if (activeGroupTerminalIds[0]) {
    return {
      kind: "new-tab",
      targetTerminalId: activeGroupTerminalIds[0],
    };
  }

  if (normalizedActiveTerminalId.length > 0) {
    return {
      kind: "new-tab",
      targetTerminalId: normalizedActiveTerminalId,
    };
  }

  return { kind: "new-group" };
}
