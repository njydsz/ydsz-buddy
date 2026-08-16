/**
 * @file 线程移交处理模块
 *
 * 本模块提供线程移交（Handoff）相关的数据转换和目标 Provider 解析功能，
 * 用于在不同的 AI Provider 之间转移对话上下文。
 *
 * ## 核心导出
 *
 * - `resolveAvailableHandoffTargetProviders`：获取可移交的目标 Provider 列表
 * - `resolveThreadHandoffBadgeLabel`：解析移交徽章标签
 * - `resolveThreadHandoffTitle`：解析移交后的线程标题
 * - `buildThreadHandoffImportedMessages`：构建移交导入消息
 * - `buildThreadHandoffImportedActivities`：构建移交导入活动
 * - `hasTransferableThreadMessages`：检查是否有可移交的消息
 * - `canCreateThreadHandoff`：检查是否可以创建移交
 * - `resolveThreadHandoffModelSelection`：解析移交后的模型选择
 *
 * ## 使用场景
 *
 * - 在不同 Provider 之间切换对话
 * - 保留对话历史和上下文
 * - 跨 Provider 的 AI 协作
 *
 * ## 注意事项
 *
 * - 仅移交非流式的用户/助手消息
 * - 部分 Provider 不支持移交（如 kilo）
 * - 繁忙或有待批准项的线程不可移交
 */

import {
  EventId,
  MessageId,
  type OrchestrationThreadActivity,
  PROVIDER_DISPLAY_NAMES,
  type ModelSelection,
  type ProviderKind,
  type ThreadHandoffImportedMessage,
} from "~/contracts";
import { getDefaultModel } from "~/shared/model";
import { type Thread } from "../types";
import { stripEmbeddedAssistantSelections } from "./assistantSelections";
import { randomUUID } from "./utils";

/** Provider 移交优先级顺序 */
const HANDOFF_PROVIDER_ORDER: ReadonlyArray<ProviderKind> = [
  "codex",
  "claudeAgent",
  "cursor",
  "gemini",
  "grok",
  "kilo",
  "opencode",
  "pi",
];

/** 可导入的线程活动类型集合 */
const IMPORTABLE_THREAD_ACTIVITY_KINDS = new Set([
  "account.rate-limits.updated",
  "account.rate-limited",
  "context-window.updated",
  "context-window.configured",
]);

/**
 * 判断消息是否为可导入的消息（非流式的用户或助手消息）
 */
function isImportableThreadMessage(
  message: Thread["messages"][number],
): message is Thread["messages"][number] & {
  role: "user" | "assistant";
} {
  return (message.role === "user" || message.role === "assistant") && message.streaming === false;
}

/**
 * 判断活动是否为可导入的活动
 */
function isImportableThreadActivity(
  activity: Thread["activities"][number],
): activity is OrchestrationThreadActivity {
  return IMPORTABLE_THREAD_ACTIVITY_KINDS.has(activity.kind);
}

/**
 * 获取可用的移交目标 Provider 列表
 *
 * @param sourceProvider - 当前 Provider
 * @returns 可作为移交目标的其他 Provider 列表
 */
export function resolveAvailableHandoffTargetProviders(
  sourceProvider: ProviderKind,
): ReadonlyArray<ProviderKind> {
  return HANDOFF_PROVIDER_ORDER.filter((provider) => provider !== sourceProvider);
}

/**
 * 解析线程移交徽章标签
 *
 * @param thread - 线程对象（只需 handoff 属性）
 * @returns 徽章标签，如不存在移交则返回 null
 */
export function resolveThreadHandoffBadgeLabel(thread: Pick<Thread, "handoff">): string | null {
  if (!thread.handoff) {
    return null;
  }
  return `Handoff from ${PROVIDER_DISPLAY_NAMES[thread.handoff.sourceProvider]}`;
}

// 保留可见的源线程名称作为目标线程标题
/**
 * 解析线程移交后的标题
 *
 * @param thread - 线程对象（只需 title 属性）
 * @returns 移交后的线程标题，若为空则返回 "Handoff"
 */
export function resolveThreadHandoffTitle(thread: Pick<Thread, "title">): string {
  const title = thread.title.trim().replace(/\s+/g, " ");
  return title.length > 0 ? title : "Handoff";
}

/**
 * 构建移交导入消息列表
 *
 * 从源线程中提取可导入的消息，转换格式后用于目标线程。
 *
 * @param thread - 源线程（只需 messages 属性）
 * @returns 可导入的消息数组
 */
export function buildThreadHandoffImportedMessages(
  thread: Pick<Thread, "messages">,
): ReadonlyArray<ThreadHandoffImportedMessage> {
  return thread.messages.filter(isImportableThreadMessage).map((message) => {
    const importedText =
      message.role === "user" ? stripEmbeddedAssistantSelections(message.text) : message.text;
    const importedMessage: ThreadHandoffImportedMessage = {
      messageId: MessageId.makeUnsafe(randomUUID()),
      role: message.role,
      text: importedText,
      createdAt: message.createdAt,
      updatedAt: message.completedAt ?? message.createdAt,
    };
    const attachments =
      message.attachments && message.attachments.length > 0
        ? message.attachments.map((attachment) =>
            attachment.type === "assistant-selection"
              ? {
                  type: attachment.type,
                  id: attachment.id,
                  assistantMessageId: attachment.assistantMessageId,
                  text: attachment.text,
                }
              : {
                  type: attachment.type,
                  id: attachment.id,
                  name: attachment.name,
                  mimeType: attachment.mimeType,
                  sizeBytes: attachment.sizeBytes,
                },
          )
        : null;
    return attachments ? Object.assign(importedMessage, { attachments }) : importedMessage;
  });
}

/**
 * 构建移交导入活动列表
 *
 * 从源线程中提取可导入的活动，转换格式后用于目标线程。
 *
 * @param thread - 源线程（只需 activities 属性）
 * @returns 可导入的活动数组
 */
export function buildThreadHandoffImportedActivities(
  thread: Pick<Thread, "activities">,
): ReadonlyArray<OrchestrationThreadActivity> {
  return thread.activities.filter(isImportableThreadActivity).map((activity) => {
    const { sequence: _sequence, ...rest } = activity;
    return {
      ...rest,
      id: EventId.makeUnsafe(randomUUID()),
    };
  });
}

// Used by: ChatView fork command gating.
/**
 * 检查是否有可移交的线程消息
 *
 * @param thread - 线程对象（只需 messages 属性）
 * @returns 是否有可移交的消息
 */
export function hasTransferableThreadMessages(thread: Pick<Thread, "messages">): boolean {
  return thread.messages.some(isImportableThreadMessage);
}

/**
 * 检查是否有原生线程移交消息
 *
 * @param thread - 线程对象（只需 messages 属性）
 * @returns 是否有来自原生端的消息
 */
export function hasNativeThreadHandoffMessages(thread: Pick<Thread, "messages">): boolean {
  return thread.messages.some(
    (message) => isImportableThreadMessage(message) && message.source === "native",
  );
}

/**
 * 检查是否可以创建线程移交
 *
 * 线程必须满足以下条件才能移交：
 * - 不繁忙（无运行中的操作）
 * - 无待批准项
 * - 无待处理的用户输入
 * - 会话状态不是 starting 或 running
 * - 有可导入的消息
 *
 * @param input - 检查输入参数
 * @returns 是否可以创建移交
 */
export function canCreateThreadHandoff(input: {
  readonly thread: Pick<Thread, "handoff" | "messages" | "session">;
  readonly isBusy?: boolean;
  readonly hasPendingApprovals?: boolean;
  readonly hasPendingUserInput?: boolean;
}): boolean {
  if (input.isBusy || input.hasPendingApprovals || input.hasPendingUserInput) {
    return false;
  }
  const sessionStatus = input.thread.session?.orchestrationStatus;
  if (sessionStatus === "starting" || sessionStatus === "running") {
    return false;
  }
  const importedMessages = buildThreadHandoffImportedMessages(input.thread);
  if (importedMessages.length === 0) {
    return false;
  }
  if (input.thread.handoff !== null) {
    return hasNativeThreadHandoffMessages(input.thread);
  }
  return true;
}

/**
 * 解析线程移交后的模型选择
 *
 * 根据源线程的模型选择、项目默认配置和 Provider 粘性配置，
 * 确定移交后应使用的模型。
 *
 * @param input - 解析输入参数
 * @returns 目标 Provider 的模型选择
 */
export function resolveThreadHandoffModelSelection(input: {
  readonly sourceThread: Pick<Thread, "modelSelection">;
  readonly targetProvider: ProviderKind;
  readonly projectDefaultModelSelection: ModelSelection | null | undefined;
  readonly stickyModelSelectionByProvider: Partial<Record<ProviderKind, ModelSelection>>;
}): ModelSelection {
  const isCompatibleSelection = (
    selection: ModelSelection | null | undefined,
  ): selection is ModelSelection => {
    if (!selection || selection.provider !== input.targetProvider) {
      return false;
    }
    return input.targetProvider !== "kilo" || selection.model.startsWith("kilo/");
  };

  const stickySelection = input.stickyModelSelectionByProvider[input.targetProvider];
  if (isCompatibleSelection(stickySelection)) {
    return stickySelection;
  }
  if (isCompatibleSelection(input.projectDefaultModelSelection)) {
    return input.projectDefaultModelSelection;
  }
  const defaultModel = getDefaultModel(input.targetProvider);
  if (!defaultModel) {
    throw new Error("Select a Pi model before handing off to Pi.");
  }
  return {
    provider: input.targetProvider,
    model: defaultModel,
  };
}
