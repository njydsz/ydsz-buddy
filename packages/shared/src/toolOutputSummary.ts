/**
 * 文件: toolOutputSummary.ts
 * 用途: 从提供者工具的 rawOutput 负载中生成紧凑的显示摘要。
 * 层级: 共享运行时工具
 * 主要导出: summarizeToolRawOutput, countTextLines
 */

/** 类型守卫：判断值是否为普通对象 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 简单的英文复数化工具。
 * @param count - 数量。
 * @param singular - 单数形式。
 * @param plural - 复数形式，默认在单数形式后加 `s`。
 * @returns 根据数量返回对应的形式。
 */
function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

/**
 * 统计文本内容的行数。
 * @param content - 待统计的文本内容。
 * @returns 行数（空字符串返回 0）。
 */
export function countTextLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }
  return content.replace(/\r?\n$/, "").split(/\r?\n/).length;
}

/**
 * 将工具原始输出（rawOutput）转换为紧凑的显示摘要。
 *
 * 摘要生成规则（按优先级）：
 * 1. 若存在 `totalFiles` 字段（非负整数），显示找到的文件数；
 * 2. 若存在 `content` 字符串字段，显示读取的行数；
 * 3. 若存在 `stdout` 字符串字段，取第一行内容。
 *
 * @param rawOutput - 工具执行产生的原始输出对象。
 * @returns 摘要字符串，无法识别时返回 undefined。
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
