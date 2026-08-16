/**
 * @file language.ts
 * @description 定义应用支持的 UI 语言列表，并提供从浏览器/导航器设置中检测最佳初始语言的方法。
 *              使用字符串字面量联合类型，确保类型可以流入应用设置 schema 而无需运行时依赖。
 * @module language
 */

/**
 * 应用支持的语言列表（只读常量）。
 * 当前支持英文（en）和中文（zh）。
 * 使用 `as const` 断言确保数组元素类型为字面量类型而非宽泛的 string 类型。
 */
export const SUPPORTED_LANGUAGES = ["en", "zh"] as const;

/**
 * 语言类型定义。
 * 从 SUPPORTED_LANGUAGES 数组的元素类型推导而来，
 * 当前等价于 "en" | "zh"。
 */
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * 默认语言配置。
 * 当无法检测到有效语言或语言值无效时，将回退到此默认值（英文）。
 */
export const DEFAULT_LANGUAGE: Language = "en";

/**
 * 类型守卫函数：判断给定值是否为受支持的语言。
 * 用于在运行时安全地验证一个值是否为有效的语言代码。
 *
 * @param {unknown} value - 待验证的值
 * @returns {boolean} 如果 value 是受支持的语言则返回 true，否则返回 false
 * @example
 * ```ts
 * isLanguage("en"); // true
 * isLanguage("fr"); // false
 * isLanguage(123);  // false
 * ```
 */
export function isLanguage(value: unknown): value is Language {
  // 先检查是否为字符串类型，再检查是否在支持的语言列表中
  return typeof value === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/**
 * 将未知值标准化为受支持的语言。
 * 如果传入的值是有效的语言代码，则直接返回；
 * 否则回退到默认语言（DEFAULT_LANGUAGE）。
 *
 * @param {unknown} value - 待标准化的值
 * @returns {Language} 标准化后的语言代码
 * @example
 * ```ts
 * normalizeLanguage("zh"); // "zh"
 * normalizeLanguage("fr"); // "en" (回退到默认)
 * normalizeLanguage(null); // "en" (回退到默认)
 * ```
 */
export function normalizeLanguage(value: unknown): Language {
  return isLanguage(value) ? value : DEFAULT_LANGUAGE;
}

/**
 * 检测浏览器语言偏好，返回最匹配的支持语言。
 * 优先检查 navigator.language，然后遍历 navigator.languages 数组。
 * 对于中文（以 "zh" 开头）返回 "zh"，对于英文（以 "en" 开头）返回 "en"。
 * 如果无法匹配或环境不支持（如 SSR），则返回默认语言。
 *
 * @returns {Language} 检测到的最佳匹配语言，或默认语言
 * @example
 * ```ts
 * // 假设浏览器语言为 "zh-CN"
 * detectBrowserLanguage(); // "zh"
 *
 * // 假设浏览器语言为 "en-US"
 * detectBrowserLanguage(); // "en"
 *
 * // 假设浏览器语言为 "fr-FR"（不支持）
 * detectBrowserLanguage(); // "en" (默认)
 * ```
 */
export function detectBrowserLanguage(): Language {
  // 检查是否在浏览器环境中（SSR 环境下 navigator 未定义）
  if (typeof navigator === "undefined") {
    return DEFAULT_LANGUAGE;
  }

  // 构建候选语言列表：优先使用 navigator.language，然后追加 navigator.languages 数组
  const candidates = [
    navigator.language,
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
  ];

  // 遍历候选语言列表，寻找第一个匹配的支持语言
  for (const candidate of candidates) {
    if (!candidate) continue;
    const lower = candidate.toLowerCase();
    // 中文优先匹配（以 "zh" 开头）
    if (lower.startsWith("zh")) {
      return "zh";
    }
    // 英文匹配（以 "en" 开头）
    if (lower.startsWith("en")) {
      return "en";
    }
  }

  // 所有候选语言都不匹配，返回默认语言
  return DEFAULT_LANGUAGE;
}
