/**
 * @file 线程交接处理
 * @description 构建客户端线程交接命令和导入的对话记录载荷，
 *              提供目标 Provider 解析、标题保留、对话记录导入和模型选择等功能。
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

/** 交接 Provider 优先级顺序 */
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
 * 判断线程消息是否可导入
 *
 * 仅导入已完成（非流式）的用户消息和助手消息。
 *
 * @param message - 线程消息
 * @returns 是否为可导入的消息
 */
function isImportableThreadMessage(
  message: Thread["messages"][number],
): message is Thread["messages"][number] & {
  role: "user" | "assistant";
} {
  return (message.role === "user" || message.role === "assistant") && message.streaming === false;
}

/**
 * 判断线程活动是否可导入
 *
 * @param activity - 线程活动
 * @returns 是否为可导入的活动
 */
function isImportableThreadActivity(
  activity: Thread["activities"][number],
): activity is OrchestrationThreadActivity {
  return IMPORTABLE_THREAD_ACTIVITY_KINDS.has(activity.kind);
}

/**
 * 解析可用的交接目标 Provider 列表
 *
 * 返回除源 Provider 外的所有 Provider，按优先级排序。
 *
 * @param sourceProvider - 源 Provider 类型
 * @returns 可用的目标 Provider 列表
 */
export function resolveAvailableHandoffTargetProviders(
  sourceProvider: ProviderKind,
): ReadonlyArray<ProviderKind> {
  return HANDOFF_PROVIDER_ORDER.filter((provider) => provider !== sourceProvider);
}

/**
 * 解析线程交接徽章标签
 *
 * @param thread - 包含交接信息的线程对象
 * @returns 交接徽章标签（如 "Handoff from Claude"），无交接信息时返回 null
 */
export function resolveThreadHandoffBadgeLabel(thread: Pick<Thread, "handoff">): string | null {
  if (!thread.handoff) {
    return null;
  }
  return `Handoff from ${PROVIDER_DISPLAY_NAMES[thread.handoff.sourceProvider]}`;
}

/**
 * 解析线程交接标题
 *
 * 保留源线程的可见名称作为目标线程标题，空标题时使用 "Handoff"。
 *
 * @param thread - 包含标题的线程对象
 * @returns 交接标题
 */
export function resolveThreadHandoffTitle(thread: Pick<Thread, "title">): string {
  const title = thread.title.trim().replace(/\s+/g, " ");
  return title.length > 0 ? title : "Handoff";
}

/**
 * 构建线程交接导入的消息列表
 *
 * 过滤并转换源线程中的用户和助手消息为交接格式，
 * 去除用户消息中嵌入的助手选区引用。
 *
 * @param thread - 包含消息列表的线程对象
 * @returns 可导入的消息列表
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
 * 构建线程交接导入的活动列表
 *
 * 过滤并转换源线程中的可导入活动，为每个活动分配新的 ID。
 *
 * @param thread - 包含活动列表的线程对象
 * @returns 可导入的活动列表
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

/**
 * 判断线程是否包含可转移的消息
 *
 * 用于 ChatView 分支命令门控。
 *
 * @param thread - 包含消息列表的线程对象
 * @returns 是否存在可转移的消息
 */
export function hasTransferableThreadMessages(thread: Pick<Thread, "messages">): boolean {
  return thread.messages.some(isImportableThreadMessage);
}

/**
 * 判断线程是否包含原生交接消息
 *
 * @param thread - 包含消息列表的线程对象
 * @returns 是否存在原生来源的可导入消息
 */
export function hasNativeThreadHandoffMessages(thread: Pick<Thread, "messages">): boolean {
  return thread.messages.some(
    (message) => isImportableThreadMessage(message) && message.source === "native",
  );
}

/**
 * 判断是否可以创建线程交接
 *
 * 检查线程是否处于可交接状态：非忙碌、无待审批项、有可导入消息，
 * 且已交接的线程需要包含原生来源消息。
 *
 * @param input - 包含线程状态和忙碌/审批信息的输入对象
 * @returns 是否可以创建交接
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
 * 解析线程交接的模型选择
 *
 * 按优先级选择目标 Provider 的模型：粘性模型选择 → 项目默认模型 → Provider 默认模型。
 *
 * @param input - 包含源线程、目标 Provider 和模型选择偏好的输入对象
 * @returns 目标 Provider 的模型选择
 * @throws 当目标 Provider 为 "kilo" 且无可用模型时抛出错误
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
