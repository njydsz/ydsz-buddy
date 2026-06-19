/**
 * @file 聊天线程标题处理工具模块
 *
 * @description
 * 提供聊天线程标题的生成、截断、清理和检测功能。用于在模型生成标题期间
 * 创建临时的确定性标题，以及确保生成的标题符合 UI 展示要求。
 *
 * 核心功能：
 * - 通用标题检测（`isGenericChatThreadTitle`）
 * - 标题截断（`truncateChatThreadTitle`）
 * - 基于用户消息生成临时标题（`buildPromptThreadTitleFallback`）
 * - 清理模型生成的标题（`sanitizeGeneratedThreadTitle`）
 *
 * 标题规范：
 * - 最大长度：50 个字符
 * - 最大词数：4 个词
 * - 自动移除引号和标点符号
 * - 标准化空白字符（多个空格合并为一个）
 *
 * 使用场景：
 * - 新线程创建时生成临时标题
 * - 模型生成标题期间的回退标题
 * - 清理和规范化模型生成的标题
 * - 检测是否为通用默认标题
 *
 * @module chatThreads
 * @layer 共享工具层
 *
 * @example
 * ```ts
 * import {
 *   buildPromptThreadTitleFallback,
 *   sanitizeGeneratedThreadTitle,
 *   isGenericChatThreadTitle
 * } from './chatThreads';
 *
 * // 从用户消息生成临时标题
 * const title = buildPromptThreadTitleFallback('请帮我实现一个登录功能，需要支持邮箱验证');
 * console.log(title); // '请帮我实现一个'
 *
 * // 清理模型生成的标题
 * const cleaned = sanitizeGeneratedThreadTitle('"用户认证模块开发"');
 * console.log(cleaned); // '用户认证模块开发'
 *
 * // 检测通用标题
 * isGenericChatThreadTitle('New thread'); // true
 * isGenericChatThreadTitle('登录功能');   // false
 * ```
 */

/**
 * 通用聊天线程标题常量
 *
 * 新创建的线程在模型生成标题之前使用的默认标题。
 * 用于标识尚未生成自定义标题的新线程。
 *
 * @constant {string}
 * @default "New thread"
 */
export const GENERIC_CHAT_THREAD_TITLE = "New thread";

/** 聊天线程标题的最大字符长度 */
const MAX_CHAT_THREAD_TITLE_LENGTH = 50;

/** 聊天线程标题的最大词数 */
const MAX_CHAT_THREAD_TITLE_WORDS = 4;

/**
 * 标准化标题中的空白字符
 *
 * 将多个连续的空白字符（空格、制表符、换行等）合并为单个空格，
 * 并去除首尾空白。
 *
 * @param value - 待标准化的标题字符串
 * @returns 标准化后的标题字符串
 *
 * @private 此函数为内部实现细节，不应直接调用
 */
function normalizeTitleWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * 修剪标题词元中的标点和引号
 *
 * 移除词元开头和结尾的空白、引号、括号和标点符号。
 * 保留词元中间的标点符号。
 *
 * 修剪的字符包括：
 * - 开头：空白、引号（`'` `"` `` ` ``）、左括号（`(` `[` `{`）
 * - 结尾：空白、引号、右括号（`)` `]` `}`）、冒号、逗号、句号、感叹号、问号
 *
 * @param token - 待修剪的词元字符串
 * @returns 修剪后的词元字符串
 *
 * @private 此函数为内部实现细节，不应直接调用
 */
function trimTitleToken(token: string): string {
  return token.replace(/^[\s"'`([{]+|[\s"'`)\]}:;,.!?]+$/g, "");
}

/**
 * 将标题字符串拆分为词元数组
 *
 * 处理流程：
 * 1. 标准化空白字符
 * 2. 按空格分割
 * 3. 修剪每个词元的标点和引号
 * 4. 过滤空词元
 *
 * @param value - 待拆分的标题字符串
 * @returns 词元数组
 *
 * @private 此函数为内部实现细节，不应直接调用
 */
function titleWords(value: string): string[] {
  return normalizeTitleWhitespace(value)
    .split(" ")
    .map(trimTitleToken)
    .filter((token) => token.length > 0);
}

/**
 * 截断聊天线程标题至指定长度
 *
 * 如果标题超过最大长度，在指定位置截断并添加省略号（`...`）。
 * 截断前会标准化空白字符。
 *
 * @param text - 待截断的标题字符串
 * @param maxLength - 最大长度，默认为 `MAX_CHAT_THREAD_TITLE_LENGTH`（50）
 * @returns 截断后的标题字符串
 *
 * @throws 此函数不会抛出异常
 *
 * @example
 * ```ts
 * truncateChatThreadTitle('这是一个很短的标题');
 * // 返回: '这是一个很短的标题'
 *
 * truncateChatThreadTitle('这是一个非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常长的标题');
 * // 返回: '这是一个非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非...'
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
 * 从用户消息构建临时的线程标题回退值
 *
 * 在模型生成标题期间，使用用户消息的前几个词作为临时标题。
 * 生成的标题是确定性的，确保相同的消息总是生成相同的标题。
 *
 * 处理流程：
 * 1. 将消息拆分为词元数组
 * 2. 取前 `MAX_CHAT_THREAD_TITLE_WORDS`（4）个词
 * 3. 如果没有有效词，返回通用标题
 * 4. 否则拼接并截断
 *
 * @param message - 用户消息字符串
 * @returns 生成的临时标题字符串
 *
 * @throws 此函数不会抛出异常
 *
 * @example
 * ```ts
 * buildPromptThreadTitleFallback('请帮我实现一个登录功能');
 * // 返回: '请帮我实现'
 *
 * buildPromptThreadTitleFallback('');
 * // 返回: 'New thread'
 *
 * buildPromptThreadTitleFallback('   ');
 * // 返回: 'New thread'
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
 * 清理模型生成的线程标题
 *
 * 对模型生成的标题进行清理和规范化，确保符合 UI 展示要求：
 * 1. 标准化空白字符
 * 2. 移除首尾引号
 * 3. 拆分为词元并取前 4 个词
 * 4. 截断至最大长度
 *
 * 如果清理后没有有效内容，返回通用标题。
 *
 * @param raw - 模型生成的原始标题字符串
 * @returns 清理后的标题字符串
 *
 * @throws 此函数不会抛出异常
 *
 * @example
 * ```ts
 * sanitizeGeneratedThreadTitle('"用户认证模块"');
 * // 返回: '用户认证模块'
 *
 * sanitizeGeneratedThreadTitle('  登录   功能   开发   完成  ');
 * // 返回: '登录 功能 开发 完成'
 *
 * sanitizeGeneratedThreadTitle('');
 * // 返回: 'New thread'
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
 * 判断给定标题是否为通用聊天线程标题
 *
 * 通过标准化空白字符后与 `GENERIC_CHAT_THREAD_TITLE` 比较，
 * 判断标题是否为默认的 "New thread"。
 *
 * @param title - 待检查的标题字符串
 * @returns 如果是通用标题返回 true，否则返回 false
 *
 * @throws 此函数不会抛出异常
 *
 * @example
 * ```ts
 * isGenericChatThreadTitle('New thread');        // true
 * isGenericChatThreadTitle('  New   thread  ');  // true（标准化后匹配）
 * isGenericChatThreadTitle('登录功能');          // false
 * isGenericChatThreadTitle(null);                // false
 * ```
 */
export function isGenericChatThreadTitle(title: string | null | undefined): boolean {
  return normalizeTitleWhitespace(title ?? "") === GENERIC_CHAT_THREAD_TITLE;
}
