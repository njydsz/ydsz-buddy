/**
 * @file useFailedTasks 共享辅助
 *
 * 把 `inferFailureType` 拆出为可被 `useAutoRetryFailedTasks` 复用的纯函数。
 * 避免在 `useAutoRetryFailedTasks` 中反向引用 hook 内的非导出函数。
 */

/** 失败类型 */
export type FailureType = "network" | "timeout" | "permission" | "rate-limit" | "unknown";

/**
 * 从错误消息字符串推断失败类型。
 *
 * - 优先级：`network` > `timeout` > `permission` > `rate-limit` > `unknown`
 * - 大小写不敏感
 * - 纯函数，无副作用，可单测
 */
export function inferFailureTypeFromEvent(message: string): FailureType {
  const lower = message.toLowerCase();
  if (lower.includes("network") || lower.includes("fetch") || lower.includes("connection")) {
    return "network";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "timeout";
  }
  if (lower.includes("permission") || lower.includes("denied") || lower.includes("unauthorized")) {
    return "permission";
  }
  if (lower.includes("rate limit") || lower.includes("429")) {
    return "rate-limit";
  }
  return "unknown";
}
