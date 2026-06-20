/**
 * @file chatTypography.ts
 * @description 聊天对话排版令牌的集中管理模块，提供行高、字符宽度和文本样式的计算函数。
 */

import type { CSSProperties } from "react";
import { DEFAULT_CHAT_FONT_SIZE_PX, normalizeChatFontSizePx } from "../../appSettings";

/** 用户消息字符宽度与字体大小的比率 */
const CHAT_TRANSCRIPT_USER_CHAR_WIDTH_RATIO = 0.48;
/** 助手消息字符宽度与字体大小的比率 */
const CHAT_TRANSCRIPT_ASSISTANT_CHAR_WIDTH_RATIO = 0.52;

/**
 * 获取聊天对话行高（像素）
 * @param chatFontSizePx - 聊天字体大小（像素），默认使用全局默认值
 * @returns 行高像素值
 */
export function getChatTranscriptLineHeightPx(chatFontSizePx = DEFAULT_CHAT_FONT_SIZE_PX): number {
  return normalizeChatFontSizePx(chatFontSizePx) + 8;
}

/**
 * 获取用户消息字符宽度（像素）
 * @param chatFontSizePx - 聊天字体大小（像素）
 * @returns 字符宽度像素值
 */
export function getChatTranscriptUserCharWidthPx(
  chatFontSizePx = DEFAULT_CHAT_FONT_SIZE_PX,
): number {
  return normalizeChatFontSizePx(chatFontSizePx) * CHAT_TRANSCRIPT_USER_CHAR_WIDTH_RATIO;
}

/**
 * 获取助手消息字符宽度（像素）
 * @param chatFontSizePx - 聊天字体大小（像素）
 * @returns 字符宽度像素值
 */
export function getChatTranscriptAssistantCharWidthPx(
  chatFontSizePx = DEFAULT_CHAT_FONT_SIZE_PX,
): number {
  return normalizeChatFontSizePx(chatFontSizePx) * CHAT_TRANSCRIPT_ASSISTANT_CHAR_WIDTH_RATIO;
}

/**
 * 获取聊天对话文本的内联样式
 * @param chatFontSizePx - 聊天字体大小（像素）
 * @returns 包含 fontSize 和 lineHeight 的 CSSProperties
 */
export function getChatTranscriptTextStyle(
  chatFontSizePx = DEFAULT_CHAT_FONT_SIZE_PX,
): CSSProperties {
  const normalizedChatFontSizePx = normalizeChatFontSizePx(chatFontSizePx);
  return {
    fontSize: `${normalizedChatFontSizePx}px`,
    lineHeight: `${getChatTranscriptLineHeightPx(normalizedChatFontSizePx)}px`,
  };
}
