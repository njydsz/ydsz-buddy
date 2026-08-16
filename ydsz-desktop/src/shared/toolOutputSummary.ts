/**
 * @file 工具输出摘要工具模块
 *
 * 本模块从 Provider 工具的 `rawOutput` payload 中生成紧凑的展示摘要：
 *
 * - **文件搜索摘要**：如 "5 files found"、"3 files found (truncated)"
 * - **内容读取摘要**：如 "Read 42 lines"
 * - **命令输出摘要**：提取 stdout 第一行
 *
 * ## 核心导出
 *
 * - `countTextLines`：计算文本内容的行数
 * - `summarizeToolRawOutput`：从 rawOutput 生成人类可读的摘要
 *
 * ## 使用场景
 *
 * - 工具调用结果的 UI 展示
 * - 日志中的工具输出摘要
 * - 通知消息中的工具结果简述
 *
 * ## 注意事项
 *
 * - 仅处理特定格式的 rawOutput，不符合格式时返回 undefined
 * - 文件搜索结果优先于内容读取结果
 * - 行数计算自动去除尾部换行符
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 工具输出摘要工具模块
 *
 * @example
 * ```ts
 * countTextLines("hello\nworld\n") // 2
 * ```
 */
function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

/**
 * 计算文本内容的行数。
 *
 * 自动去除尾部换行符后计算行数。
 *
 * @param content - 文本内容
 * @returns 行数，空字符串返回 0
 * @example
 * ```ts
 * countTextLines("hello\nworld\n") // 2
 * countTextLines("") // 0
 * ```
 */
export function countTextLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }
  return content.replace(/\r?\n$/, "").split(/\r?\n/).length;
}

/**
 * 从工具的 rawOutput 生成人类可读的摘要。
 *
 * 支持三种格式的 rawOutput：
 * - `{ totalFiles: number, truncated?: boolean }` → "X files found"
 * - `{ content: string }` → "Read X lines"
 * - `{ stdout: string }` → stdout 第一行
 *
 * @param rawOutput - 工具原始输出对象
 * @returns 摘要字符串，若无法解析则返回 undefined
 */
export function summarizeToolRawOutput(rawOutput: unknown): string | undefined {
  if (!isRecord(rawOutput)) {
    return undefined;
  }
  const totalFiles = rawOutput.totalFiles;
  if (typeof totalFiles === "number" && Number.isInteger(totalFiles) && totalFiles >= 0) {
    const suffix = rawOutput.truncated === true ? " (truncated)" : "";
    return `${totalFiles} ${pluralize(totalFiles, "file")} found${suffix}`;
  }
  if (typeof rawOutput.content === "string") {
    const lineCount = countTextLines(rawOutput.content);
    return `Read ${lineCount} ${pluralize(lineCount, "line")}`;
  }
  const stdout = typeof rawOutput.stdout === "string" ? rawOutput.stdout.trim() : "";
  return stdout ? (stdout.split(/\r?\n/, 1)[0]?.trim() ?? undefined) : undefined;
}
