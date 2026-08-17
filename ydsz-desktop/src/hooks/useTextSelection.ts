/**
 * @file useTextSelection — 文本选区追踪 Hook
 *
 * 追踪编辑器或输入框中的文本选区，返回选中文本和选区位置。
 * 用于驱动 InlineAIToolbar 的显示。
 *
 * ## 核心能力
 *
 * - 实时追踪选区变化
 * - 计算选区在视口中的位置
 * - 支持最小选中长度阈值（避免误触发）
 * - 自动清理选区状态
 *
 * ## 使用方式
 *
 * ```tsx
 * const { selectedText, selectionRect, hasSelection } = useTextSelection({
 *   minLength: 2,
 *   targetRef: editorRef,
 * });
 * ```
 */

import { useCallback, useEffect, useState } from "react";

// ==================== Types ====================

interface UseTextSelectionOptions {
  /** 最小选中字符数，低于此值不触发 */
  minLength?: number;
  /** 目标元素 ref，不传则监听全局选区 */
  targetRef?: React.RefObject<HTMLElement | null>;
  /** 选区变化回调 */
  onSelectionChange?: (text: string, rect: DOMRect | null) => void;
}

interface UseTextSelectionReturn {
  /** 选中的文本 */
  selectedText: string;
  /** 选区在视口中的位置 */
  selectionRect: DOMRect | null;
  /** 是否有有效选区 */
  hasSelection: boolean;
  /** 清除选区 */
  clearSelection: () => void;
}

// ==================== Hook ====================

export function useTextSelection({
  minLength = 2,
  targetRef,
  onSelectionChange,
}: UseTextSelectionOptions = {}): UseTextSelectionReturn {
  const [selectedText, setSelectedText] = useState("");
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);

  // 获取选区信息
  const getSelectionInfo = useCallback((): { text: string; rect: DOMRect | null } => {
    const selection = window.getSelection();

    if (!selection || selection.isCollapsed) {
      return { text: "", rect: null };
    }

    const text = selection.toString().trim();

    // 检查最小长度
    if (text.length < minLength) {
      return { text: "", rect: null };
    }

    // 如果有目标元素，检查选区是否在目标内
    if (targetRef?.current) {
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const element =
        container.nodeType === Node.ELEMENT_NODE
          ? (container as HTMLElement)
          : (container.parentElement as HTMLElement);

      if (!targetRef.current.contains(element)) {
        return { text: "", rect: null };
      }
    }

    // 获取选区位置
    let rect: DOMRect | null = null;
    try {
      const range = selection.getRangeAt(0);
      rect = range.getBoundingClientRect();
    } catch {
      rect = null;
    }

    return { text, rect };
  }, [minLength, targetRef]);

  // 处理选区变化
  const handleSelectionChange = useCallback(() => {
    const { text, rect } = getSelectionInfo();

    setSelectedText(text);
    setSelectionRect(rect);

    if (text && rect) {
      onSelectionChange?.(text, rect);
    }
  }, [getSelectionInfo, onSelectionChange]);

  // 清除选区
  const clearSelection = useCallback(() => {
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
    setSelectedText("");
    setSelectionRect(null);
  }, []);

  // 监听选区变化
  useEffect(() => {
    document.addEventListener("selectionchange", handleSelectionChange);

    // 也监听 mouseup 和 keyup 以及时捕获选区变化
    document.addEventListener("mouseup", handleSelectionChange);
    document.addEventListener("keyup", handleSelectionChange);

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("mouseup", handleSelectionChange);
      document.removeEventListener("keyup", handleSelectionChange);
    };
  }, [handleSelectionChange]);

  const hasSelection = selectedText.length >= minLength && selectionRect !== null;

  return {
    selectedText,
    selectionRect,
    hasSelection,
    clearSelection,
  };
}

export default useTextSelection;
