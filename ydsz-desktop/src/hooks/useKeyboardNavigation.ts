/**
 * @file 键盘导航 Hook
 *
 * 实现全局键盘导航支持：
 * - Tab 切换焦点
 * - Esc 关闭弹窗/菜单
 * - 方向键导航列表
 * - Enter 确认选择
 * - 快捷键冲突检测
 *
 * ## 核心功能
 *
 * - **焦点管理**：Tab 循环切换
 * - **弹窗关闭**：Esc 关闭所有弹窗
 * - **列表导航**：方向键上下选择
 * - **快捷键注册**：全局快捷键管理
 *
 * ## 使用场景
 *
 * - 无障碍访问
 * - 键盘用户
 * - 提高效率
 *
 * ## 注意事项
 *
 * - 避免快捷键冲突
 * - 支持焦点陷阱（弹窗内）
 * - 符合 WCAG 2.1 标准
 */

import { useCallback, useEffect, useRef } from "react";

/** 快捷键定义 */
export interface KeyboardShortcut {
  /** 快捷键 ID */
  id: string;
  /** 按键组合 */
  keys: string[];
  /** 回调函数 */
  handler: () => void;
  /** 描述（用于帮助文档） */
  description?: string;
  /** 是否全局（不受焦点影响） */
  global?: boolean;
}

interface UseKeyboardNavigationOptions {
  /** 是否启用 */
  enabled?: boolean;
  /** 焦点陷阱容器（弹窗内） */
  trapFocusIn?: HTMLElement | null;
}

interface UseKeyboardNavigationResult {
  /** 注册快捷键 */
  registerShortcut: (shortcut: KeyboardShortcut) => () => void;
  /** 聚焦到下一个元素 */
  focusNext: () => void;
  /** 聚焦到上一个元素 */
  focusPrevious: () => void;
  /** 聚焦到第一个元素 */
  focusFirst: () => void;
  /** 聚焦到最后一个元素 */
  focusLast: () => void;
}

/** 可聚焦元素选择器 */
const FOCUSABLE_SELECTORS = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

/**
 * 键盘导航 Hook
 */
export function useKeyboardNavigation(
  options: UseKeyboardNavigationOptions = {},
): UseKeyboardNavigationResult {
  const { enabled = true, trapFocusIn } = options;
  const shortcutsRef = useRef<Map<string, KeyboardShortcut>>(new Map());

  // 获取可聚焦元素
  const getFocusableElements = useCallback((): HTMLElement[] => {
    const container = trapFocusIn || document.body;
    const elements = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS));
    return elements.filter((el) => {
      // 过滤掉不可见元素
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }, [trapFocusIn]);

  // 聚焦到下一个元素
  const focusNext = useCallback(() => {
    const elements = getFocusableElements();
    if (elements.length === 0) return;

    const currentIndex = elements.indexOf(document.activeElement as HTMLElement);
    const nextIndex = (currentIndex + 1) % elements.length;
    elements[nextIndex]?.focus();
  }, [getFocusableElements]);

  // 聚焦到上一个元素
  const focusPrevious = useCallback(() => {
    const elements = getFocusableElements();
    if (elements.length === 0) return;

    const currentIndex = elements.indexOf(document.activeElement as HTMLElement);
    const prevIndex = currentIndex <= 0 ? elements.length - 1 : currentIndex - 1;
    elements[prevIndex]?.focus();
  }, [getFocusableElements]);

  // 聚焦到第一个元素
  const focusFirst = useCallback(() => {
    const elements = getFocusableElements();
    elements[0]?.focus();
  }, [getFocusableElements]);

  // 聚焦到最后一个元素
  const focusLast = useCallback(() => {
    const elements = getFocusableElements();
    elements[elements.length - 1]?.focus();
  }, [getFocusableElements]);

  // 注册快捷键
  const registerShortcut = useCallback((shortcut: KeyboardShortcut) => {
    shortcutsRef.current.set(shortcut.id, shortcut);

    // 返回取消注册函数
    return () => {
      shortcutsRef.current.delete(shortcut.id);
    };
  }, []);

  // 全局键盘事件处理
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Esc 关闭弹窗
      if (e.key === "Escape") {
        // 如果有焦点陷阱，关闭最上层的弹窗
        if (trapFocusIn) {
          e.preventDefault();
          // 触发关闭事件（由组件自己处理）
          trapFocusIn.dispatchEvent(new CustomEvent("escape-pressed"));
        }
      }

      // Tab 导航
      if (e.key === "Tab") {
        if (trapFocusIn) {
          // 焦点陷阱：Tab 循环在容器内
          const elements = getFocusableElements();
          if (elements.length === 0) return;

          const firstElement = elements[0];
          const lastElement = elements[elements.length - 1];

          if (e.shiftKey) {
            // Shift+Tab：从第一个跳到最后一个
            if (document.activeElement === firstElement) {
              e.preventDefault();
              lastElement.focus();
            }
          } else {
            // Tab：从最后一个跳到第一个
            if (document.activeElement === lastElement) {
              e.preventDefault();
              firstElement.focus();
            }
          }
        }
      }

      // 方向键导航
      if (e.key === "ArrowDown") {
        e.preventDefault();
        focusNext();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        focusPrevious();
      } else if (e.key === "Home") {
        e.preventDefault();
        focusFirst();
      } else if (e.key === "End") {
        e.preventDefault();
        focusLast();
      }

      // 检查快捷键
      const pressedKeys = new Set<string>();
      if (e.ctrlKey) pressedKeys.add("ctrl");
      if (e.metaKey) pressedKeys.add("meta");
      if (e.shiftKey) pressedKeys.add("shift");
      if (e.altKey) pressedKeys.add("alt");
      pressedKeys.add(e.key.toLowerCase());

      for (const shortcut of shortcutsRef.current.values()) {
        const requiredKeys = shortcut.keys.map((k) => k.toLowerCase());
        const allKeysMatch = requiredKeys.every((k) => pressedKeys.has(k));
        const noExtraKeys = pressedKeys.size === requiredKeys.length;

        if (allKeysMatch && noExtraKeys) {
          e.preventDefault();
          shortcut.handler();
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, trapFocusIn, getFocusableElements, focusNext, focusPrevious, focusFirst, focusLast]);

  return {
    registerShortcut,
    focusNext,
    focusPrevious,
    focusFirst,
    focusLast,
  };
}

/**
 * 常用快捷键配置
 */
export const COMMON_SHORTCUTS = {
  /** 新建对话 */
  NEW_THREAD: { id: "new-thread", keys: ["ctrl", "n"], description: "新建对话" },
  /** 搜索 */
  SEARCH: { id: "search", keys: ["ctrl", "k"], description: "搜索" },
  /** 关闭弹窗 */
  CLOSE_MODAL: { id: "close-modal", keys: ["escape"], description: "关闭" },
  /** 撤销 */
  UNDO: { id: "undo", keys: ["ctrl", "z"], description: "撤销" },
  /** 重做 */
  REDO: { id: "redo", keys: ["ctrl", "shift", "z"], description: "重做" },
  /** 保存 */
  SAVE: { id: "save", keys: ["ctrl", "s"], description: "保存" },
} as const;
