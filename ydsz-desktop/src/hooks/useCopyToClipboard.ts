/**
 * @file useCopyToClipboard.ts
 * @description 复制到剪贴板 Hook - 提供跨浏览器兼容的剪贴板复制功能
 * @module hooks/useCopyToClipboard
 */

import * as React from "react";

/**
 * 降级复制文本到剪贴板（使用 document.execCommand）
 *
 * @description
 * 当 Clipboard API 不可用时的降级方案。
 * 通过创建隐藏的 textarea 元素，选中文本后执行 copy 命令。
 * 会保存和恢复原有的选区状态，避免影响用户的当前操作。
 *
 * @param value - 要复制到剪贴板的文本
 * @returns 是否复制成功
 */
function fallbackCopyTextToClipboard(value: string): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") {
    return false;
  }

  // 保存当前焦点元素，以便复制后恢复
  const activeElement =
    typeof HTMLElement !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  // 保存当前选区状态
  const selection = document.getSelection();
  const savedRanges =
    selection == null
      ? []
      : Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index));

  // 创建隐藏的 textarea 元素用于复制
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";

  document.body.appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    return document.execCommand("copy");
  } finally {
    // 清理：移除临时元素并恢复原始选区
    textarea.remove();

    if (selection) {
      selection.removeAllRanges();
      for (const range of savedRanges) {
        selection.addRange(range);
      }
    }

    activeElement?.focus();
  }
}

/**
 * 复制文本到剪贴板（异步）
 *
 * @description
 * 优先使用现代 Clipboard API，不支持时降级到 execCommand。
 *
 * @param value - 要复制的文本内容
 * @throws 当剪贴板 API 不可用时抛出错误
 */
export async function copyTextToClipboard(value: string): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("Clipboard API unavailable.");
  }

  if (!value) {
    return;
  }

  // 优先使用现代 Clipboard API
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch (error) {
      // Clipboard API 失败时尝试降级方案
      if (fallbackCopyTextToClipboard(value)) {
        return;
      }
      throw error;
    }
  }

  // 降级到 execCommand 方案
  if (fallbackCopyTextToClipboard(value)) {
    return;
  }

  throw new Error("Clipboard API unavailable.");
}

/**
 * 复制到剪贴板 Hook
 *
 * @description
 * 提供响应式的剪贴板复制功能，支持：
 * - 复制成功状态跟踪（isCopied）
 * - 自动重置复制状态（超时后恢复为 false）
 * - 复制成功/失败回调
 * - 泛型上下文参数传递
 *
 * @typeParam TContext - 回调上下文类型，默认为 void
 *
 * @param options - 配置选项
 * @param options.timeout - 复制状态重置超时时间（毫秒），默认 2000ms，设为 0 则不自动重置
 * @param options.onCopy - 复制成功时的回调函数
 * @param options.onError - 复制失败时的回调函数
 *
 * @returns 包含复制方法和状态的对象
 * @returns.copyToClipboard - 执行复制操作的方法
 * @returns.isCopied - 当前是否处于已复制状态
 *
 * @example
 * ```tsx
 * const { copyToClipboard, isCopied } = useCopyToClipboard({
 *   timeout: 3000,
 *   onCopy: () => console.log('复制成功'),
 * });
 *
 * return (
 *   <button onClick={() => copyToClipboard('Hello!')}>
 *     {isCopied ? '已复制!' : '复制'}
 *   </button>
 * );
 * ```
 */
export function useCopyToClipboard<TContext = void>({
  timeout = 2000,
  onCopy,
  onError,
}: {
  timeout?: number;
  onCopy?: (ctx: TContext) => void;
  onError?: (error: Error, ctx: TContext) => void;
} = {}): { copyToClipboard: (value: string, ctx: TContext) => void; isCopied: boolean } {
  const [isCopied, setIsCopied] = React.useState(false);
  const timeoutIdRef = React.useRef<NodeJS.Timeout | null>(null);
  // 使用 ref 保存最新的回调引用，避免闭包问题
  const onCopyRef = React.useRef(onCopy);
  const onErrorRef = React.useRef(onError);
  const timeoutRef = React.useRef(timeout);

  onCopyRef.current = onCopy;
  onErrorRef.current = onError;
  timeoutRef.current = timeout;

  const copyToClipboard = React.useCallback((value: string, ctx: TContext): void => {
    void copyTextToClipboard(value).then(
      () => {
        // 清除之前的定时器，避免多个定时器冲突
        if (timeoutIdRef.current) {
          clearTimeout(timeoutIdRef.current);
        }
        setIsCopied(true);

        onCopyRef.current?.(ctx);

        // 设置超时后自动重置复制状态
        if (timeoutRef.current !== 0) {
          timeoutIdRef.current = setTimeout(() => {
            setIsCopied(false);
            timeoutIdRef.current = null;
          }, timeoutRef.current);
        }
      },
      (error) => {
        if (onErrorRef.current) {
          onErrorRef.current(error, ctx);
        } else {
          console.error(error);
        }
      },
    );
  }, []);

  // 组件卸载时清理定时器
  React.useEffect(() => {
    return (): void => {
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
      }
    };
  }, []);

  return { copyToClipboard, isCopied };
}
