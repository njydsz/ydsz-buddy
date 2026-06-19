/**
 * @file 编辑器提及解析模块
 * @description 提供 `@...` 编辑器提及的解析和格式化工具，支持带引号的路径。
 *              用于 Web 编辑器辅助函数，包括提及标记格式化器和正则表达式辅助工具。
 */

/**
 * 创建编辑器提及标记的正则表达式
 * @param options - 配置选项
 * @param options.includeTrailingTokenAtEnd - 是否在字符串末尾也匹配提及标记
 * @param options.global - 是否使用全局匹配模式，默认为 true
 * @returns 匹配 `@path` 或 `@"path with spaces"` 格式的正则表达式
 */
export function createComposerMentionTokenRegex(options: {
  includeTrailingTokenAtEnd: boolean;
  global?: boolean;
}): RegExp {
  const suffix = options.includeTrailingTokenAtEnd ? "(?=\\s|$)" : "(?=\\s)";
  return new RegExp(
    `(^|\\s)@(?:"([^"]+)"|([^\\s@]+))${suffix}`,
    options.global === false ? "" : "g",
  );
}

/**
 * 从正则匹配结果中提取提及路径
 * @param match - 正则表达式匹配结果
 * @returns 提取的路径字符串（去除引号和空白）
 */
export function extractComposerMentionPath(match: RegExpExecArray | RegExpMatchArray): string {
  return (match[2] ?? match[3] ?? "").trim();
}

/**
 * 格式化提及标记为字符串
 * @param path - 路径字符串（可带或不带 `@` 前缀）
 * @returns 格式化后的提及标记，如 `@path` 或 `@"path with spaces"`
 */
export function formatComposerMentionToken(path: string): string {
  const normalizedPath = path.startsWith("@") ? path.slice(1) : path;
  return /\s/.test(normalizedPath) ? `@"${normalizedPath}"` : `@${normalizedPath}`;
}
