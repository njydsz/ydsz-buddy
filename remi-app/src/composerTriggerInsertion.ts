/**
 * @file composerTriggerInsertion.ts
 * @description Composer 触发器替换的文本规范化辅助函数。
 * 确保连续 chip 之间保持分隔符，且不会产生重复的尾部空格。
 * 纯函数模块，不依赖 DOM 或 React。
 */

/**
 * 如果替换文本以空格结尾且原文本对应位置也是空格，则扩展替换范围以吞掉该空格，
 * 避免 chip 后出现双空格。
 *
 * @param text - 原始文本
 * @param rangeEnd - 替换范围的结束位置
 * @param replacement - 替换文本
 * @returns 可能调整后的替换范围结束位置
 *
 * @example
 * extendReplacementRangeForTrailingSpace("hello  world", 6, "@path ")
 * // => 7（吞掉了原文本中 rangeEnd 处的空格）
 */
export function extendReplacementRangeForTrailingSpace(
  text: string,
  rangeEnd: number,
  replacement: string,
): number {
  if (!replacement.endsWith(" ")) {
    return rangeEnd;
  }
  return text[rangeEnd] === " " ? rangeEnd + 1 : rangeEnd;
}

/**
 * 确保替换文本在非空白字符后有前导空格分隔。
 *
 * 当触发器紧跟在已有 chip 后面（如用户在 `@foo` 后直接输入 `@bar`），
 * 段落解析器要求两侧都有空白才能识别 chip，因此需要自动插入前导空格。
 * 空替换表示纯清除操作，不会添加多余空格。
 *
 * @param text - 原始文本
 * @param rangeStart - 替换范围的起始位置
 * @param replacement - 替换文本
 * @returns 可能添加了前导空格的替换文本
 *
 * @example
 * ensureLeadingSpaceForReplacement("@foo@bar", 4, "@baz ")
 * // => " @baz "（在 @baz 前插入空格，因为前一个字符不是空白）
 */
export function ensureLeadingSpaceForReplacement(
  text: string,
  rangeStart: number,
  replacement: string,
): string {
  if (replacement.length === 0) return replacement;
  if (rangeStart === 0) return replacement;
  const precedingChar = text[rangeStart - 1];
  if (!precedingChar || /\s/.test(precedingChar)) return replacement;
  return ` ${replacement}`;
}
