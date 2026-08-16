/**
 * @file useProviderFailoverBridge
 * @description 把 useSmartRetry 的失败/成功事件桥接到 useAutoProviderFailover
 *
 * 实际发送 turn 时，`useSmartRetry.execute` 会以指数退避自动重试。
 * 但重试 hook 本身不会告诉 `useAutoProviderFailover` 当前 Provider 失败/成功了。
 * 也就是说，**自动故障转移的「失败计数」永远不会被触发**。
 *
 * 本 Hook 包裹一个 `execute` 函数，在每次重试失败后调用
 * `useAutoProviderFailover().recordFailure(activeProvider, error)`，在成功后
 * 调用 `recordSuccess(activeProvider)`，让熔断器和故障转移能够真正工作。
 *
 * ## 核心导出
 *
 * - `useProviderFailoverBridge`：Hook
 *
 * ## 使用场景
 *
 * - 替换 ChatView 里 `useSmartRetry().execute` 的直接调用
 *
 * ## 注意事项
 *
 * - 必须在 `AutoProviderFailoverProvider` 子树内使用
 * - 失败只在「exhausted / 全部重试用完」后记录一次，避免噪声
 *   （中途重试的失败由重试 hook 自己处理）
 */

import { useCallback } from "react";
import type { ProviderKind } from "~/contracts";
import { useAutoProviderFailover } from "./useAutoProviderFailover";
import type { UseSmartRetryResult } from "./useSmartRetry";

export interface UseProviderFailoverBridgeOptions {
  /** 当前活跃 Provider（可来自 settings / 模型选择器） */
  activeProvider: ProviderKind | null;
  /** 是否启用桥接（默认 true） */
  enabled?: boolean;
}

export type WrappedExecute = UseSmartRetryResult["execute"];

/**
 * 把 useSmartRetry.execute 包成自动桥接 recordFailure / recordSuccess 的版本。
 */
export function useProviderFailoverBridge(
  smartRetry: UseSmartRetryResult,
  options: UseProviderFailoverBridgeOptions,
): WrappedExecute {
  const { activeProvider, enabled = true } = options;
  const { recordFailure, recordSuccess } = useAutoProviderFailover();

  return useCallback(
    async <T,>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> => {
      try {
        const result = await smartRetry.execute(fn, signal);
        if (enabled && activeProvider) {
          recordSuccess(activeProvider);
        }
        return result;
      } catch (error) {
        if (enabled && activeProvider) {
          // AbortError 不计入 provider 失败（用户主动取消）
          const isAbort =
            (error instanceof DOMException && error.name === "AbortError") ||
            (error instanceof Error && error.name === "AbortError");
          if (!isAbort) {
            recordFailure(
              activeProvider,
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }
        throw error;
      }
    },
    [activeProvider, enabled, recordFailure, recordSuccess, smartRetry],
  );
}
