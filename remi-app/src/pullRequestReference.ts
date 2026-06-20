/**
 * @file Pull Request 引用解析模块
 * @description 解析 GitHub Pull Request 引用，支持完整 URL 和数字编号两种格式。
 */

/** GitHub Pull Request URL 正则，如 https://github.com/owner/repo/pull/123 */
const GITHUB_PULL_REQUEST_URL_PATTERN =
  /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/(\d+)(?:[/?#].*)?$/i;
/** PR 编号正则，如 #123 或 123 */
const PULL_REQUEST_NUMBER_PATTERN = /^#?(\d+)$/;

/**
 * 解析 Pull Request 引用
 * 支持 GitHub PR URL（返回原始 URL）和数字编号（返回带 # 前缀的编号）
 * @param input - 用户输入的 PR 引用
 * @returns 解析后的 PR 引用字符串，无效输入返回 null
 */
export function parsePullRequestReference(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const urlMatch = GITHUB_PULL_REQUEST_URL_PATTERN.exec(trimmed);
  if (urlMatch?.[1]) {
    return trimmed;
  }

  const numberMatch = PULL_REQUEST_NUMBER_PATTERN.exec(trimmed);
  if (numberMatch?.[1]) {
    return trimmed.startsWith("#") ? trimmed : numberMatch[1];
  }

  return null;
}
