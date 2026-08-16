/**
 * @file 历史消息引导构建模块
 * @description 将聊天历史消息构建为引导输入文本，用于在新的对话中延续上下文。
 *              支持字符预算限制，自动截断较早的消息以适应输入长度约束。
 */

import type { ChatMessage } from "./types";
import { stripEmbeddedAssistantSelections } from "./lib/assistantSelections";

/**
 * 引导输入构建结果
 * @property text - 构建后的完整引导文本
 * @property includedCount - 包含的历史消息数量
 * @property omittedCount - 省略的历史消息数量
 * @property truncated - 是否因字符限制进行了截断
 */
export interface BootstrapInputResult {
  text: string;
  includedCount: number;
  omittedCount: number;
  truncated: boolean;
}

/** 引导文本前缀，指示模型使用下方上下文继续对话 */
const BOOTSTRAP_PREAMBLE =
  "Continue this conversation using the transcript context below. The final section is the latest user request to answer now.";
/** 历史记录段落标题 */
const TRANSCRIPT_HEADER = "Transcript context:";
/** 最新用户请求段落标题 */
const LATEST_PROMPT_HEADER = "Latest user request (answer this now):";
/** 省略消息的摘要模板 */
const OMITTED_SUMMARY = (count: number) =>
  `[${count} earlier message(s) omitted to stay within input limits.]`;

/** 获取消息的角色标签 */
function messageRoleLabel(message: ChatMessage): "USER" | "ASSISTANT" {
  return message.role === "assistant" ? "ASSISTANT" : "USER";
}

/**
 * 生成消息附件的文本摘要（图片和助手选择）
 * @param message - 聊天消息
 * @returns 附件摘要文本，无附件时返回 null
 */
function attachmentSummary(message: ChatMessage): string | null {
  const imageAttachments = message.attachments?.filter((attachment) => attachment.type === "image");
  const assistantSelections = message.attachments?.filter(
    (attachment) => attachment.type === "assistant-selection",
  );
  const summaries: string[] = [];

  const count = imageAttachments?.length ?? 0;
  if (count > 0) {
    const names = imageAttachments?.slice(0, 3).map((image) => image.name) ?? [];
    const namesSummary = names.join(", ");
    const extraCount = count - names.length;
    const extraSummary = extraCount > 0 ? ` (+${extraCount} more)` : "";
    summaries.push(`[Attached image${count === 1 ? "" : "s"}: ${namesSummary}${extraSummary}]`);
  }

  const selectionCount = assistantSelections?.length ?? 0;
  if (selectionCount > 0) {
    const previews =
      assistantSelections
        ?.slice(0, 2)
        .map((selection) => `"${selection.text.split("\n")[0] ?? ""}"`) ?? [];
    const extraCount = selectionCount - previews.length;
    const extraSummary = extraCount > 0 ? ` (+${extraCount} more)` : "";
    summaries.push(
      `[Referenced assistant selection${selectionCount === 1 ? "" : "s"}: ${previews.join(", ")}${extraSummary}]`,
    );
  }

  return summaries.length > 0 ? summaries.join("\n") : null;
}

/**
 * 构建单条消息的文本块，包含角色标签、正文和附件摘要
 * @param message - 聊天消息
 * @returns 格式化的消息文本块
 */
function buildMessageBlock(message: ChatMessage): string {
  const text =
    message.role === "user" ? stripEmbeddedAssistantSelections(message.text) : message.text;
  const attachments = attachmentSummary(message);

  if (text && attachments) {
    return `${messageRoleLabel(message)}:\n${text}\n${attachments}`;
  }
  if (text) {
    return `${messageRoleLabel(message)}:\n${text}`;
  }
  if (attachments) {
    return `${messageRoleLabel(message)}:\n${attachments}`;
  }
  return `${messageRoleLabel(message)}:\n(empty message)`;
}

/**
 * 将历史记录正文和最新提示组装为最终引导文本
 * @param transcriptBody - 历史消息正文
 * @param latestPrompt - 最新用户提示
 * @param maxChars - 最大字符数限制
 * @returns 组装后的完整文本，超出限制时返回 null
 */
function finalizeWithPrompt(
  transcriptBody: string,
  latestPrompt: string,
  maxChars: number,
): string | null {
  const text = `${BOOTSTRAP_PREAMBLE}\n\n${TRANSCRIPT_HEADER}\n${transcriptBody}\n\n${LATEST_PROMPT_HEADER}\n${latestPrompt}`;
  return text.length <= maxChars ? text : null;
}

/**
 * 构建引导输入文本
 * 从最新的历史消息开始，逐步包含更早的消息，直到达到字符预算限制。
 * 优先保留最新消息，较早的消息在超出限制时被省略
 * @param previousMessages - 历史聊天消息列表
 * @param latestPrompt - 最新用户提示
 * @param maxChars - 最大字符数限制
 * @returns 引导输入构建结果
 */
export function buildBootstrapInput(
  previousMessages: ChatMessage[],
  latestPrompt: string,
  maxChars: number,
): BootstrapInputResult {
  const budget = Number.isFinite(maxChars) ? Math.max(1, Math.floor(maxChars)) : 1;
  const promptOnly = latestPrompt.length <= budget ? latestPrompt : latestPrompt.slice(0, budget);

  if (previousMessages.length === 0) {
    return {
      text: promptOnly,
      includedCount: 0,
      omittedCount: 0,
      truncated: promptOnly.length !== latestPrompt.length,
    };
  }

  const newestFirstBlocks: string[] = [];
  for (let index = previousMessages.length - 1; index >= 0; index -= 1) {
    const message = previousMessages[index];
    if (!message) continue;
    newestFirstBlocks.push(buildMessageBlock(message));
  }

  if (newestFirstBlocks.length === 0) {
    return {
      text: promptOnly,
      includedCount: 0,
      omittedCount: previousMessages.length,
      truncated: true,
    };
  }

  // 从最新到最旧逐步包含消息，然后反转为时间顺序
  let includedNewestFirst: string[] = [];
  for (const block of newestFirstBlocks) {
    const nextNewestFirst = [...includedNewestFirst, block];
    const nextChronological = nextNewestFirst.toReversed();
    const omittedCount = newestFirstBlocks.length - nextChronological.length;
    const transcriptBody =
      omittedCount > 0
        ? `${OMITTED_SUMMARY(omittedCount)}\n\n${nextChronological.join("\n\n")}`
        : nextChronological.join("\n\n");
    if (!finalizeWithPrompt(transcriptBody, latestPrompt, budget)) {
      break;
    }
    includedNewestFirst = nextNewestFirst;
  }

  let includedChronological = includedNewestFirst.toReversed();
  while (true) {
    const omittedCount = newestFirstBlocks.length - includedChronological.length;
    const transcriptBody =
      omittedCount > 0
        ? includedChronological.length > 0
          ? `${OMITTED_SUMMARY(omittedCount)}\n\n${includedChronological.join("\n\n")}`
          : OMITTED_SUMMARY(omittedCount)
        : includedChronological.join("\n\n");
    const finalized = finalizeWithPrompt(transcriptBody, latestPrompt, budget);
    if (finalized) {
      return {
        text: finalized,
        includedCount: includedChronological.length,
        omittedCount,
        truncated: omittedCount > 0 || latestPrompt.length !== promptOnly.length,
      };
    }

    if (includedChronological.length === 0) {
      return {
        text: promptOnly,
        includedCount: 0,
        omittedCount: previousMessages.length,
        truncated: true,
      };
    }

    includedChronological = includedChronological.slice(1);
  }
}
