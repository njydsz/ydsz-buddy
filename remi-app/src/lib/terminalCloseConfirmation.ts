/**
 * @file terminalCloseConfirmation.ts
 * @description 终端标签页关闭确认的文案和对话框逻辑，
 * 在聊天和工作区界面间共享。
 */

import type { NativeApi } from "~/contracts";

/** 格式化终端关闭确认的主体描述 */
function formatTerminalCloseSubject(terminalTitle: string | null | undefined): string {
  const trimmedTitle = terminalTitle?.trim();
  return trimmedTitle && trimmedTitle.length > 0 ? `terminal "${trimmedTitle}"` : "this terminal";
}

/**
 * 解析终端关闭确认对话框中显示的终端标题
 *
 * @param options - 解析选项
 * @param options.terminalId - 终端 ID
 * @param options.terminalLabelsById - 持久化的终端标签映射
 * @param options.terminalTitleOverridesById - 终端标题覆盖映射
 * @returns 终端标题，优先使用覆盖标题，其次使用持久化标签，最后使用默认值 "Terminal"
 */
export function resolveTerminalCloseTitle(options: {
  terminalId: string;
  terminalLabelsById: Record<string, string>;
  terminalTitleOverridesById: Record<string, string>;
}): string {
  return (
    options.terminalTitleOverridesById[options.terminalId]?.trim() ||
    options.terminalLabelsById[options.terminalId]?.trim() ||
    "Terminal"
  );
}

/**
 * 构建终端关闭确认消息
 *
 * @param options - 消息构建选项
 * @param options.terminalTitle - 终端标题
 * @param options.willDeleteThread - 是否将同时删除关联的空终端线程
 * @returns 确认消息字符串
 */
export function buildTerminalCloseConfirmationMessage(options: {
  terminalTitle: string | null | undefined;
  willDeleteThread: boolean;
}): string {
  return [
    `Close ${formatTerminalCloseSubject(options.terminalTitle)}?`,
    options.willDeleteThread
      ? "This permanently clears the terminal history for this tab and deletes the empty terminal thread."
      : "This permanently clears the terminal history for this tab.",
  ].join("\n");
}

/**
 * 弹出终端标签页关闭确认对话框
 *
 * @param options - 确认选项
 * @param options.api - Native API 实例
 * @param options.enabled - 是否启用关闭确认
 * @param options.terminalTitle - 终端标题
 * @param options.willDeleteThread - 是否将同时删除关联的线程
 * @returns 用户是否确认关闭
 */
export async function confirmTerminalTabClose(options: {
  api: Pick<NativeApi, "dialogs"> | null | undefined;
  enabled: boolean;
  terminalTitle: string | null | undefined;
  willDeleteThread?: boolean;
}): Promise<boolean> {
  if (!options.enabled || !options.api) {
    return true;
  }

  return options.api.dialogs.confirm(
    buildTerminalCloseConfirmationMessage({
      terminalTitle: options.terminalTitle,
      willDeleteThread: options.willDeleteThread ?? false,
    }),
  );
}