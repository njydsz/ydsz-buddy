/**
 * @file 标题截断工具
 *
 * 提供标题文本的截断功能，超出最大长度时添加省略号。
 */

/**
 * 截断标题文本，超出最大长度时在末尾添加 "..."。
 * 先去除首尾空格，再判断是否需要截断。
 *
 * @param text - 原始标题文本
 * @param maxLength - 最大长度，默认 50
 * @returns 截断后的标题文本
 *
 * @example
 * ```ts
 * truncateTitle("This is a very long title that exceeds the limit", 20)
 * // "This is a very long ..."
 * truncateTitle("Short title", 50) // "Short title"
 * ```
 */
export function truncateTitle(text: string, maxLength = 50): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength)}...`;
}
