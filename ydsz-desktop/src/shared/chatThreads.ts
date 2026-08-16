/**
 * @file 对话线程标题工具模块
 *
 * 本模块定义对话线程（Thread）标题的通用处理工具，被前端 UI 和后端服务共享使用：
 *
 * - **通用标题判断**：判断标题是否为通用占位标题（如 "New thread"）
 * - **标题清洗**：将 AI 生成的标题清洗为合法的展示文本
 * - **标题截断**：限制标题长度（默认最多 50 字符，最多 4 个单词）
 * - **生成标题**：从用户消息构建简短确定性标题
 *
 * ## 核心导出
 *
 * - `GENERIC_CHAT_THREAD_TITLE`：通用占位标题常量（"New thread"）
 * - `truncateChatThreadTitle`：截断过长的标题
 * - `buildPromptThreadTitleFallback`：从消息构建临时标题
 * - `sanitizeGeneratedThreadTitle`：清洗 AI 生成的标题
 * - `isGenericChatThreadTitle`：判断是否为通用占位标题
 *
 * ## 使用场景
 *
 * - 侧边栏线程列表展示
 * - 新建线程时的默认标题
 * - AI 重命名线程标题后的清洗
 *
 * ## 注意事项
 *
 * - 标题单词数限制为 4 个，防止侧边栏渲染过长
 * - 标题长度限制为 50 字符，超出部分用 `...` 截断
 * - 特殊字符（引号、括号等）会被移除
 */

export const GENERIC_CHAT_THREAD_TITLE = "New thread";
const MAX_CHAT_THREAD_TITLE_LENGTH = 50;
const MAX_CHAT_THREAD_TITLE_WORDS = 4;

function normalizeTitleWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function trimTitleToken(token: string): string {
  return token.replace(/^[\s"'`([{]+|[\s"'`)\]}:;,.!?]+$/g, "");
}

function titleWords(value: string): string[] {
  return normalizeTitleWhitespace(value)
    .split(" ")
    .map(trimTitleToken)
    .filter((token) => token.length > 0);
}

/**
 * 截断过长的对话线程标题。
 *
 * 如果标题长度超过 `maxLength`，则在末尾添加 `...` 进行截断。
 * 标题会先进行空白规范化（多空格合并为单空格）。
 *
 * @param text - 原始标题文本
 * @param maxLength - 最大字符长度（默认 50）
 * @returns 截断后的标题，若未超出长度则返回原始标题
 * @example
 * ```ts
 * truncateChatThreadTitle("This is a very long title that should be truncated") // "This is a very long title that should be truncat..."
 * ```
 */
export function truncateChatThreadTitle(
  text: string,
  maxLength = MAX_CHAT_THREAD_TITLE_LENGTH,
): string {
  const trimmed = normalizeTitleWhitespace(text);
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength)}...`;
}

/**
 * 从用户消息构建简短的确定性标题。
 *
 * 用于在模型生成正式标题之前，作为临时占位标题。
 * 取消息的前 4 个单词，总长度不超过 50 字符。
 *
 * @param message - 用户消息内容
 * @returns 简短的标题，若消息为空或无效则返回 `GENERIC_CHAT_THREAD_TITLE`
 * @example
 * ```ts
 * buildPromptThreadTitleFallback("How do I fix a bug in my code?") // "How do I fix..."
 * ```
 */
export function buildPromptThreadTitleFallback(message: string): string {
  const words = titleWords(message).slice(0, MAX_CHAT_THREAD_TITLE_WORDS);
  if (words.length === 0) {
    return GENERIC_CHAT_THREAD_TITLE;
  }
  return truncateChatThreadTitle(words.join(" "));
}

/**
 * 清洗 AI 生成的线程标题。
 *
 * 移除首尾引号、规范化空白、截取前 4 个单词，
 * 确保生成的标题适合在侧边栏展示（简短且无特殊字符）。
 *
 * @param raw - AI 生成的原始标题
 * @returns 清洗后的标题，若清洗后为空则返回 `GENERIC_CHAT_THREAD_TITLE`
 * @example
 * ```ts
 * sanitizeGeneratedThreadTitle('"Fix the login bug"') // "Fix the login bug"
 * ```
 */
export function sanitizeGeneratedThreadTitle(raw: string): string {
  const unquoted = normalizeTitleWhitespace(raw).replace(/^['"`]+|['"`]+$/g, "");
  const words = titleWords(unquoted).slice(0, MAX_CHAT_THREAD_TITLE_WORDS);
  if (words.length === 0) {
    return GENERIC_CHAT_THREAD_TITLE;
  }
  return truncateChatThreadTitle(words.join(" "));
}

/**
 * 判断给定标题是否为通用占位标题。
 *
 * 用于检测用户是否未设置自定义标题（仍使用默认标题）。
 *
 * @param title - 待检测的标题
 * @returns 若为通用占位标题则返回 true
 * @example
 * ```ts
 * isGenericChatThreadTitle("New thread") // true
 * isGenericChatThreadTitle("My custom title") // false
 * ```
 */
export function isGenericChatThreadTitle(title: string | null | undefined): boolean {
  return normalizeTitleWhitespace(title ?? "") === GENERIC_CHAT_THREAD_TITLE;
}
