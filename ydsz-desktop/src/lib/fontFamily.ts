/**
 * @file 字体族处理模块
 * @description 将用户输入的字体族名称转换为有效的 CSS font-family 值。
 *              用于 Web 外观工具。
 */

/** CSS 宽关键字集合（这些关键字不需要引号） */
const CSS_WIDE_KEYWORDS = new Set(["inherit", "initial", "revert", "revert-layer", "unset"]);

/** 通用字体族名称集合（这些是 CSS 规范定义的通用族） */
const GENERIC_FONT_FAMILIES = new Set([
  "cursive",
  "emoji",
  "fangsong",
  "fantasy",
  "math",
  "monospace",
  "sans-serif",
  "serif",
  "system-ui",
  "ui-monospace",
  "ui-rounded",
  "ui-sans-serif",
  "ui-serif",
]);

/**
 * 拆分字体族列表（内部函数）
 * 正确处理引号和括号内的逗号
 * @param value - 字体族列表字符串
 * @returns 拆分后的字体族数组
 */
function splitFontFamilyList(value: string): string[] {
  const families: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let parenDepth = 0;

  for (const character of value) {
    // 处理引号内的字符
    if (quote) {
      current += character;
      if (character === quote) {
        quote = null;
      }
      continue;
    }

    // 处理引号开始
    if (character === '"' || character === "'") {
      quote = character;
      current += character;
      continue;
    }

    // 处理括号
    if (character === "(") {
      parenDepth += 1;
      current += character;
      continue;
    }

    if (character === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      current += character;
      continue;
    }

    // 处理逗号分隔符（仅在括号外）
    if (character === "," && parenDepth === 0) {
      families.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  families.push(current.trim());
  return families.filter((family) => family.length > 0);
}

/**
 * 为字体族添加引号（内部函数）
 * @param family - 字体族名称
 * @returns 带引号的字体族字符串
 */
function quoteFontFamily(family: string): string {
  return `"${family.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

/**
 * 规范化单个字体族（内部函数）
 * @param family - 字体族名称
 * @returns 规范化后的字体族字符串
 */
function normalizeSingleFontFamily(family: string): string {
  const trimmedFamily = family.trim();
  const lowerFamily = trimmedFamily.toLowerCase();

  // 如果已经带引号、包含括号、是 CSS 宽关键字或通用字体族，则直接返回
  if (
    trimmedFamily.startsWith('"') ||
    trimmedFamily.startsWith("'") ||
    trimmedFamily.includes("(") ||
    CSS_WIDE_KEYWORDS.has(lowerFamily) ||
    GENERIC_FONT_FAMILIES.has(lowerFamily)
  ) {
    return trimmedFamily;
  }

  // 如果包含空格，需要添加引号
  return /\s/.test(trimmedFamily) ? quoteFontFamily(trimmedFamily) : trimmedFamily;
}

/**
 * 规范化字体族 CSS 值
 * @param value - 原始字体族值
 * @returns 规范化后的 CSS font-family 值，如果输入为空则返回 null
 */
export function normalizeFontFamilyCssValue(value: string | null | undefined): string | null {
  const trimmedValue = value?.trim() ?? "";
  if (trimmedValue.length === 0) {
    return null;
  }

  return splitFontFamilyList(trimmedValue).map(normalizeSingleFontFamily).join(", ");
}
