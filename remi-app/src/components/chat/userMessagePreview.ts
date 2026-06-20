/**
 * @file userMessagePreview.ts
 * @description 用户消息预览状态管理，提供消息截断和折叠/展开的逻辑。
 */

/** 折叠状态下用户消息的最大字符数 */
export const COLLAPSED_USER_MESSAGE_MAX_CHARS = 600;

/** 用户消息预览状态 */
export interface UserMessagePreviewState {
  /** 预览文本（可能已截断） */
  text: string;
  /** 是否可折叠（原始文本超过最大字符数） */
  collapsible: boolean;
  /** 是否已截断 */
  truncated: boolean;
}

/**
 * 根据展开状态和最大字符数计算用户消息预览状态
 * @param text - 原始消息文本
 * @param options - 配置选项
 * @param options.expanded - 是否展开（默认 false）
 * @param options.maxChars - 最大字符数（默认 COLLAPSED_USER_MESSAGE_MAX_CHARS）
 * @returns 预览状态
 */
export function deriveUserMessagePreviewState(
  text: string,
  options?: {
    expanded?: boolean;
    maxChars?: number;
  },
): UserMessagePreviewState {
  const expanded = options?.expanded ?? false;
  const requestedMaxChars = options?.maxChars;
  const safeMaxChars =
    typeof requestedMaxChars === "number" && Number.isFinite(requestedMaxChars)
      ? Math.floor(requestedMaxChars)
      : COLLAPSED_USER_MESSAGE_MAX_CHARS;
  const maxChars = Math.max(0, safeMaxChars);

  if (expanded || text.length <= maxChars) {
    return {
      text,
      collapsible: text.length > maxChars,
      truncated: false,
    };
  }

  return {
    text: text.slice(0, maxChars) + "…",
    collapsible: true,
    truncated: true,
  };
}
