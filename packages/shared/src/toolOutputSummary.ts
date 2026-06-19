/**
 * @file 工具输出摘要工具
 * @description 将 Provider 工具的原始输出（rawOutput）转换为紧凑的显示摘要
 * @module shared/toolOutputSummary
 * @layer 共享运行时工具层
 */

/**
 * 类型守卫：判断值是否为普通对象（Record 类型）
 * @param value - 待检查的值
 * @returns 如果值是普通对象返回 true，否则返回 false
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 根据数量返回名词的单数或复数形式
 * @param count - 数量
 * @param singular - 单数形式
 * @param plural - 复数形式，默认为单数形式加 's'
 * @returns 根据数量返回相应的名词形式
 */
function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

/**
 * 计算文本内容的行数
 * @param content - 文本内容
 * @returns 行数，空字符串返回 0
 * @description 通过移除末尾的换行符后按换行符分割来计算行数
 */
export function countTextLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }
  // 移除末尾的换行符，然后按换行符分割计算行数
  return content.replace(/\r?\n$/, "").split(/\r?\n/).length;
}

/**
 * 将工具的原始输出转换为紧凑的摘要字符串
 * @param rawOutput - 工具的原始输出，通常是 Provider 返回的结果
 * @returns 摘要字符串，如果无法生成摘要则返回 undefined
 * @description
 * 处理三种类型的输出：
 * 1. 文件搜索结果：包含 totalFiles 字段，显示找到的文件数量
 * 2. 文件读取结果：包含 content 字段，显示读取的行数
 * 3. 命令执行结果：包含 stdout 字段，显示第一行输出
 */
export function summarizeToolRawOutput(rawOutput: unknown): string | undefined {
  // 检查是否为有效的对象类型
  if (!isRecord(rawOutput)) {
    return undefined;
  }

  // 情况1：文件搜索结果（包含 totalFiles 字段）
  const totalFiles = rawOutput.totalFiles;
  if (typeof totalFiles === "number" && Number.isInteger(totalFiles) && totalFiles >= 0) {
    // 检查是否被截断
    const suffix = rawOutput.truncated === true ? " (truncated)" : "";
    return `${totalFiles} ${pluralize(totalFiles, "file")} found${suffix}`;
  }

  // 情况2：文件读取结果（包含 content 字段）
  if (typeof rawOutput.content === "string") {
    const lineCount = countTextLines(rawOutput.content);
    return `Read ${lineCount} ${pluralize(lineCount, "line")}`;
  }

  // 情况3：命令执行结果（包含 stdout 字段）
  const stdout = typeof rawOutput.stdout === "string" ? rawOutput.stdout.trim() : "";
  // 返回 stdout 的第一行作为摘要
  return stdout ? (stdout.split(/\r?\n/, 1)[0]?.trim() ?? undefined) : undefined;
}
