/**
 * @file 智能输入反馈 Hook
 * @description 提供字符计数、@提及补全时延、长文截断警告和草稿自动保存功能
 * @module hooks/useSmartInputFeedback
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "~/hooks/useReducedMotion";
import { getLocalStorageItem, setLocalStorageItem } from "./useLocalStorage";

/** 字符限制建议值（参考主流 AI 对话） */
export const CHAR_LIMIT_SUGGESTED = 32000;

/** 字符警告阈值（达到限制的 80%） */
export const CHAR_LIMIT_WARNING = Math.floor(CHAR_LIMIT_SUGGESTED * 0.8);

/** 字符危险阈值（达到限制的 95%） */
export const CHAR_LIMIT_DANGER = Math.floor(CHAR_LIMIT_SUGGESTED * 0.95);

/** 提及补全时延阈值（毫秒） */
export const MENTION_LOADING_THRESHOLD_MS = 300;

/** 草稿自动保存防抖延迟（毫秒） */
export const DRAFT_AUTOSAVE_DEBOUNCE_MS = 5000;

/** 长文截断警告阈值 */
export const LONG_TEXT_WARNING_THRESHOLD = 10000;

/**
 * 草稿存储键工厂函数
 * @param threadId - 线程 ID
 * @returns localStorage 键名
 */
export function getDraftStorageKey(threadId: string): string {
  return `composer:draft:${threadId}`;
}

/**
 * 字符计数状态类型
 */
export type CharCountStatus = "normal" | "warning" | "danger" | "exceeded";

/**
 * 获取字符计数状态
 * @param charCount - 当前字符数
 * @returns 字符计数状态
 */
export function getCharCountStatus(charCount: number): CharCountStatus {
  if (charCount >= CHAR_LIMIT_SUGGESTED) {
    return "exceeded";
  }
  if (charCount >= CHAR_LIMIT_DANGER) {
    return "danger";
  }
  if (charCount >= CHAR_LIMIT_WARNING) {
    return "warning";
  }
  return "normal";
}

/**
 * 智能截断文本
 *
 * @description
 * 优先级：
 * 1. 句子边界（中英文标点）
 * 2. 段落边界（双换行）
 * 3. 列表边界（单换行 + 项目符号）
 * 4. 单词边界（半角空格 / 全角空格）
 * 5. 兜底：直接截断 + 省略号
 *
 * 为兼顾中文场景，对所有"边界字符"使用 JS 码点正向遍历（处理 surrogate pair），
 * 同时为 CJK 文本提供"宽松句子边界"——即便位于 maxLength * 0.7 之后也算命中。
 *
 * @param text - 原始文本
 * @param maxLength - 最大长度（按 JS string length 计算，码点可能不一致）
 * @returns 截断后的文本
 */
export function smartTruncateText(text: string, maxLength: number = CHAR_LIMIT_SUGGESTED): string {
  if (text.length <= maxLength) {
    return text;
  }

  const truncated = text.slice(0, maxLength);

  // ─── 1. 句子边界（最强信号）──────────────────────────────────
  const sentenceEndings = new Set<string>([".", "!", "?", "。", "！", "？", "…", "..."]);
  // 中文句末标点（用于 CJK 文本的"宽松阈值"）
  const cjkSentenceEndings = new Set<string>(["。", "！", "？", "…"]);
  // 统计 CJK 字符占比，超过 30% 视为中文为主的文本
  const cjkRatio = countCjkRatio(truncated);

  for (let i = truncated.length - 1; i > 0; i--) {
    const ch = truncated[i];
    if (ch && sentenceEndings.has(ch)) {
      const minIdx = cjkRatio > 0.3 ? maxLength * 0.5 : maxLength * 0.8;
      if (cjkRatio > 0.3 && cjkSentenceEndings.has(ch)) {
        // CJK 句子边界：阈值更宽松
        return truncated.slice(0, i + 1);
      }
      if (i > minIdx) {
        return truncated.slice(0, i + 1);
      }
      break;
    }
  }

  // ─── 2. 段落边界（双换行）────────────────────────────────────
  const lastParagraph = truncated.lastIndexOf("\n\n");
  if (lastParagraph > maxLength * 0.5) {
    return truncated.slice(0, lastParagraph);
  }

  // ─── 3. 列表边界（单换行 + 列表前缀）──────────────────────────
  const listPrefixes = ["- ", "* ", "• ", "· ", "1. ", "2. ", "3. ", "4. ", "5. "];
  for (let i = truncated.length - 1; i > maxLength * 0.6; i--) {
    if (truncated[i] === "\n" && i + 1 < truncated.length) {
      const nextSlice = truncated.slice(i + 1, i + 4);
      if (listPrefixes.some((prefix) => nextSlice.startsWith(prefix))) {
        return truncated.slice(0, i + 1);
      }
    }
  }

  // ─── 4. 单词/空格边界（兼容英文 + CJK 全角空格）──────────────
  const lastSpace = Math.max(
    truncated.lastIndexOf(" "),
    truncated.lastIndexOf("　"),
  );
  if (lastSpace > maxLength * 0.7) {
    return `${truncated.slice(0, lastSpace)}...`;
  }

  // ─── 5. 兜底：直接截断 + 省略号 ─────────────────────────────
  return `${truncated}...`;
}

/**
 * 统计字符串中 CJK 字符的占比（用于决定截断策略）
 *
 * @param text - 待统计文本
 * @returns CJK 字符占比（0-1）
 */
function countCjkRatio(text: string): number {
  if (text.length === 0) return 0;
  let cjkCount = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    // CJK Unified Ideographs + Hiragana + Katakana + CJK Symbols and Punctuation
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3040 && code <= 0x30ff) ||
      (code >= 0x3000 && code <= 0x303f)
    ) {
      cjkCount += 1;
    }
  }
  return cjkCount / text.length;
}

/**
 * 检测文本是否包含 @ 提及触发
 * @param text - 输入文本
 * @param cursorPosition - 光标位置
 * @returns 是否正在输入 @ 提及
 */
export function detectMentionTrigger(text: string, cursorPosition: number): boolean {
  if (cursorPosition <= 0 || cursorPosition > text.length) {
    return false;
  }

  // 从光标位置向前查找最近的 @ 符号
  const textBeforeCursor = text.slice(0, cursorPosition);
  const lastAtIndex = textBeforeCursor.lastIndexOf("@");

  if (lastAtIndex === -1) {
    return false;
  }

  // 检查 @ 是否在行首或前面是空白
  const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : " ";
  if (charBeforeAt !== " " && charBeforeAt !== "\n" && charBeforeAt !== "\t") {
    return false;
  }

  // 检查 @ 后面是否有内容且没有空格（正在输入提及）
  const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
  if (textAfterAt.length === 0) {
    return true; // 刚输入 @
  }

  // 如果 @ 后面有空格，说明提及已完成
  if (textAfterAt.includes(" ") || textAfterAt.includes("\n")) {
    return false;
  }

  return true;
}

/**
 * 智能输入反馈 Hook 选项
 */
export interface UseSmartInputFeedbackOptions {
  /** 线程 ID */
  threadId: string;
  /** 当前输入值 */
  value: string;
  /** 光标位置 */
  cursorPosition: number;
  /** 是否启用草稿自动保存 */
  enableAutosave?: boolean;
  /** 提及补全是否正在加载 */
  mentionLoading?: boolean;
  /** 字符限制 */
  charLimit?: number;
}

/**
 * 智能输入反馈 Hook 返回值
 */
export interface UseSmartInputFeedbackReturn {
  /** 当前字符数 */
  charCount: number;
  /** 字符计数状态 */
  charCountStatus: CharCountStatus;
  /** 是否接近字符限制 */
  isApproachingLimit: boolean;
  /** 是否超过字符限制 */
  isExceedingLimit: boolean;
  /** 是否正在触发 @ 提及 */
  isMentionTriggered: boolean;
  /** 提及补全是否显示加载指示器 */
  showMentionLoading: boolean;
  /** 是否显示长文截断警告 */
  showTruncationWarning: boolean;
  /** 截断文本（返回截断后的字符串，由调用方应用到输入值） */
  truncateText: () => string;
  /** 忽略截断警告 */
  dismissTruncationWarning: () => void;
  /** 草稿最后保存时间 */
  lastSavedAt: number | null;
  /** 是否正在保存草稿 */
  isSaving: boolean;
  /** 手动保存草稿 */
  saveDraft: () => void;
  /** 恢复草稿 */
  restoreDraft: () => string | null;
  /** 清除草稿 */
  clearDraft: () => void;
  /** 是否偏好减少动画 */
  prefersReducedMotion: boolean;
}

/**
 * 智能输入反馈 Hook
 *
 * @description
 * 提供 Composer 输入框的智能反馈功能：
 * - 字符计数与状态检测
 * - @提及补全时延指示
 * - 长文截断警告与智能截断
 * - 5 秒防抖的草稿自动保存
 *
 * @param options - Hook 选项
 * @returns 智能输入反馈状态与操作方法
 *
 * @example
 * ```tsx
 * const {
 *   charCount,
 *   charCountStatus,
 *   showMentionLoading,
 *   showTruncationWarning,
 *   truncateText,
 * } = useSmartInputFeedback({
 *   threadId: "thread-123",
 *   value: promptText,
 *   cursorPosition: cursor,
 *   mentionLoading: isSearching,
 * });
 * ```
 */
export function useSmartInputFeedback(
  options: UseSmartInputFeedbackOptions
): UseSmartInputFeedbackReturn {
  const {
    threadId,
    value,
    cursorPosition,
    enableAutosave = true,
    mentionLoading = false,
    charLimit = CHAR_LIMIT_SUGGESTED,
  } = options;

  const prefersReducedMotion = useReducedMotion().isReducedMotionEnabled;

  // 字符计数相关状态
  const charCount = value.length;
  const charCountStatus = useMemo(() => getCharCountStatus(charCount), [charCount]);
  const isApproachingLimit = charCount >= CHAR_LIMIT_WARNING;
  const isExceedingLimit = charCount >= charLimit;

  // @提及相关状态
  const isMentionTriggered = useMemo(
    () => detectMentionTrigger(value, cursorPosition),
    [value, cursorPosition]
  );

  // 提及加载指示器状态（延迟显示）
  const [showMentionLoading, setShowMentionLoading] = useState(false);
  const mentionLoadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // 清除之前的定时器
    if (mentionLoadingTimerRef.current) {
      clearTimeout(mentionLoadingTimerRef.current);
      mentionLoadingTimerRef.current = null;
    }

    if (isMentionTriggered && mentionLoading) {
      // 如果提及加载超过阈值，显示加载指示器
      mentionLoadingTimerRef.current = setTimeout(() => {
        setShowMentionLoading(true);
      }, MENTION_LOADING_THRESHOLD_MS);
    } else {
      setShowMentionLoading(false);
    }

    return () => {
      if (mentionLoadingTimerRef.current) {
        clearTimeout(mentionLoadingTimerRef.current);
      }
    };
  }, [isMentionTriggered, mentionLoading]);

  // 长文截断警告状态
  const [truncationWarningDismissed, setTruncationWarningDismissed] = useState(false);
  const showTruncationWarning =
    charCount > LONG_TEXT_WARNING_THRESHOLD && !truncationWarningDismissed;

  // 当文本长度变化时，重新显示警告
  useEffect(() => {
    if (charCount <= LONG_TEXT_WARNING_THRESHOLD) {
      setTruncationWarningDismissed(false);
    }
  }, [charCount]);

  const dismissTruncationWarning = useCallback(() => {
    setTruncationWarningDismissed(true);
  }, []);

  // 草稿自动保存相关状态
  const storageKey = useMemo(() => getDraftStorageKey(threadId), [threadId]);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedValueRef = useRef<string>("");

  // 保存草稿（手动调用，忽略 enableAutosave 状态）
  const saveDraft = useCallback(() => {
    if (!threadId) {
      return;
    }

    // 如果内容没有变化，不保存
    if (value === lastSavedValueRef.current) {
      return;
    }

    setIsSaving(true);
    try {
      setLocalStorageItem(storageKey, {
        value,
        savedAt: Date.now(),
      });
      lastSavedValueRef.current = value;
      setLastSavedAt(Date.now());
    } catch (error) {
      console.error("[SMART_INPUT] Failed to save draft:", error);
    } finally {
      setIsSaving(false);
    }
  }, [threadId, value, storageKey]);

  // 恢复草稿
  const restoreDraft = useCallback((): string | null => {
    try {
      const draft = getLocalStorageItem<{ value: string; savedAt: number }>(storageKey);
      if (draft && typeof draft.value === "string") {
        lastSavedValueRef.current = draft.value;
        setLastSavedAt(draft.savedAt);
        return draft.value;
      }
    } catch (error) {
      console.error("[SMART_INPUT] Failed to restore draft:", error);
    }
    return null;
  }, [storageKey]);

  // 清除草稿
  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
      lastSavedValueRef.current = "";
      setLastSavedAt(null);
    } catch (error) {
      console.error("[SMART_INPUT] Failed to clear draft:", error);
    }
  }, [storageKey]);

  // 防抖自动保存
  useEffect(() => {
    if (!enableAutosave) {
      return;
    }

    // 清除之前的定时器
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    // 设置新的防抖定时器
    autosaveTimerRef.current = setTimeout(() => {
      saveDraft();
    }, DRAFT_AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [value, enableAutosave, saveDraft]);

  // 页面卸载前立即保存
  useEffect(() => {
    if (!enableAutosave) {
      return;
    }

    const handleBeforeUnload = () => {
      if (value !== lastSavedValueRef.current) {
        try {
          setLocalStorageItem(storageKey, {
            value,
            savedAt: Date.now(),
          });
        } catch {
          // 忽略错误
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [enableAutosave, value, storageKey]);

  // 截断文本
  const truncateText = useCallback(() => {
    // 这里需要通过外部回调来更新文本，因为 hook 不直接控制输入值
    // 返回截断后的文本，由调用方处理
    return smartTruncateText(value, charLimit);
  }, [value, charLimit]);

  return {
    charCount,
    charCountStatus,
    isApproachingLimit,
    isExceedingLimit,
    isMentionTriggered,
    showMentionLoading,
    showTruncationWarning,
    truncateText,
    dismissTruncationWarning,
    lastSavedAt,
    isSaving,
    saveDraft,
    restoreDraft,
    clearDraft,
    prefersReducedMotion,
  };
}
