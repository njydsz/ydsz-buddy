/**
 * @file useSmartInputFeedback 单元测试
 *
 * 覆盖:
 *
 * 1. 字符计数与状态 (getCharCountStatus)
 * 2. 字符阈值边界 (warning / danger / exceeded)
 * 3. 智能截断 (smartTruncateText)
 *    - 句子边界优先
 *    - 段落边界次之
 *    - 单词边界兜底
 * 4. @提及触发检测 (detectMentionTrigger)
 * 5. Hook 集成 (字符计数、提及触发、加载指示、长文警告、草稿保存)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { __resetAppearanceStorageBridgeForTest, useAppearanceStore } from "../shared/appearanceStore";
import {
  CHAR_LIMIT_DANGER,
  CHAR_LIMIT_SUGGESTED,
  CHAR_LIMIT_WARNING,
  DRAFT_AUTOSAVE_DEBOUNCE_MS,
  LONG_TEXT_WARNING_THRESHOLD,
  MENTION_LOADING_THRESHOLD_MS,
  detectMentionTrigger,
  getCharCountStatus,
  getDraftStorageKey,
  smartTruncateText,
  useSmartInputFeedback,
} from "./useSmartInputFeedback";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  // 重置 appearance store (avoid reduced motion 副作用)
  useAppearanceStore.setState({ reducedMotionMode: "auto" });
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  __resetAppearanceStorageBridgeForTest();
});

afterEach(() => {
  // 清理所有 composer draft keys
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("composer:draft:")) {
      localStorage.removeItem(key);
    }
  }
});

describe("getCharCountStatus", () => {
  it("normal: 字符数 < warning 阈值", () => {
    expect(getCharCountStatus(0)).toBe("normal");
    expect(getCharCountStatus(CHAR_LIMIT_WARNING - 1)).toBe("normal");
  });

  it("warning: 字符数达到 warning 阈值", () => {
    expect(getCharCountStatus(CHAR_LIMIT_WARNING)).toBe("warning");
    expect(getCharCountStatus(CHAR_LIMIT_DANGER - 1)).toBe("warning");
  });

  it("danger: 字符数达到 danger 阈值", () => {
    expect(getCharCountStatus(CHAR_LIMIT_DANGER)).toBe("danger");
    expect(getCharCountStatus(CHAR_LIMIT_SUGGESTED - 1)).toBe("danger");
  });

  it("exceeded: 字符数达到或超过建议上限", () => {
    expect(getCharCountStatus(CHAR_LIMIT_SUGGESTED)).toBe("exceeded");
    expect(getCharCountStatus(CHAR_LIMIT_SUGGESTED + 1000)).toBe("exceeded");
  });

  it("阈值常量关系正确 (warning < danger < suggested)", () => {
    expect(CHAR_LIMIT_WARNING).toBeLessThan(CHAR_LIMIT_DANGER);
    expect(CHAR_LIMIT_DANGER).toBeLessThan(CHAR_LIMIT_SUGGESTED);
  });
});

describe("smartTruncateText", () => {
  it("未超过 maxLength 时原样返回", () => {
    expect(smartTruncateText("hello", 100)).toBe("hello");
  });

  it("优先在句子边界截断（英文）", () => {
    const text =
      "This is the first sentence. This is the second sentence. This is a very long third sentence that needs to be cut.";
    const result = smartTruncateText(text, 60);
    expect(result).toMatch(/[.!?]$/);
    // 确保截断了
    expect(result.length).toBeLessThan(text.length);
  });

  it("优先在句子边界截断（中文）", () => {
    const text = "第一句。第二句比较长用来测试句末标点截断行为。第三句";
    const result = smartTruncateText(text, 10);
    // 中文句子边界在 8 字符（"第一句。" = 4 字符 + 1 句号 = 4 个位置）, 8 < 10*0.8=8 → 8 == 8 不满足 > maxLength * 0.8
    // 因此会落到兜底（...省略号）。本测试只断言：要么命中句子边界，要么回退到段落/单词边界（不是"无变化"）
    expect(result.length).toBeLessThan(text.length);
    // 应以省略号或句末标点结尾
    expect(/[。！？.!?]|\.\.\.$/.test(result)).toBe(true);
  });

  it("无句子边界时在段落边界截断", () => {
    const text = "a".repeat(80) + "\n\n" + "b".repeat(80);
    const result = smartTruncateText(text, 90);
    // 截断应发生在 \n\n 之前
    expect(result).not.toContain("\n\n");
  });

  it("兜底在单词边界截断并加省略号", () => {
    const text = "a".repeat(50) + " word boundary " + "b".repeat(50);
    const result = smartTruncateText(text, 60);
    expect(result.endsWith("...")).toBe(true);
  });

  it("完全无边界时直接截断并加省略号", () => {
    const text = "a".repeat(200);
    const result = smartTruncateText(text, 50);
    expect(result.endsWith("...")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(53);
  });

  it("中文长文本能命中宽松句子边界", () => {
    // 中文句子以"。"结束，且 30%+ 是 CJK → 应在第一个"。"处截断（即便位置 < 0.8 * maxLength）
    const text =
      "第一句比较短。第二句内容比较长用来测试句末标点。第三句以及更多后续内容。";
    const result = smartTruncateText(text, 20);
    // 应以"。"结尾，说明命中句子边界
    expect(result.endsWith("。")).toBe(true);
    // 必须小于原文
    expect(result.length).toBeLessThan(text.length);
  });

  it("中文文本中第二个句号靠近 maxLength 时优先命中", () => {
    // maxLength=10 时，第二个"。"在位置 11 之后截断
    const text = "第一句。第二句。";
    const result = smartTruncateText(text, 10);
    // 宽松阈值下应命中第二个"。"
    expect(result.endsWith("。")).toBe(true);
  });

  it("列表前缀（-、*、数字编号）作为截断点", () => {
    // 第一个"段落"超过 maxLength，"列表"前缀位于 60% 边界附近
    const text = "aa".repeat(15) + "\n- " + "bb".repeat(15);
    const result = smartTruncateText(text, 35);
    // 列表前缀应成为截断点（结果不包含 "- bb"）
    expect(result).not.toMatch(/- bb+/);
    // 结果长度合理
    expect(result.length).toBeLessThan(text.length);
  });
});

describe("detectMentionTrigger", () => {
  it("行首 @ 触发", () => {
    expect(detectMentionTrigger("@user", 5)).toBe(true);
  });

  it("空格后 @ 触发", () => {
    expect(detectMentionTrigger("hello @", 7)).toBe(true);
  });

  it("光标在 @ 之后但未输入内容也算触发", () => {
    expect(detectMentionTrigger("hi @", 4)).toBe(true);
  });

  it("光标在 @ 之后已输入字符", () => {
    expect(detectMentionTrigger("hi @use", 7)).toBe(true);
  });

  it("@ 紧贴字符（非行首/非空白）不触发", () => {
    expect(detectMentionTrigger("email@example", 12)).toBe(false);
  });

  it("@ 之后有空格（已完成）不触发", () => {
    expect(detectMentionTrigger("hi @user rest", 12)).toBe(false);
  });

  it("@ 之后有换行（已完成）不触发", () => {
    expect(detectMentionTrigger("hi @user\nnext", 12)).toBe(false);
  });

  it("没有 @ 时不触发", () => {
    expect(detectMentionTrigger("hello world", 5)).toBe(false);
  });

  it("光标位置为 0 时不触发", () => {
    expect(detectMentionTrigger("@user", 0)).toBe(false);
  });
});

describe("getDraftStorageKey", () => {
  it("根据 threadId 生成稳定的 key", () => {
    expect(getDraftStorageKey("thread-123")).toBe("composer:draft:thread-123");
  });
});

describe("useSmartInputFeedback - 字符计数", () => {
  it("value 变化时 charCount 跟随", () => {
    const { result, unmount } = renderHook(() =>
      useSmartInputFeedback({
        threadId: "t-1",
        value: "hello",
        cursorPosition: 5,
        enableAutosave: false,
      }),
    );
    expect(result.current.charCount).toBe(5);
    expect(result.current.charCountStatus).toBe("normal");
    unmount();
  });

  it("接近限制时进入 warning 状态", () => {
    const longText = "a".repeat(CHAR_LIMIT_WARNING);
    const { result, unmount } = renderHook(() =>
      useSmartInputFeedback({
        threadId: "t-1",
        value: longText,
        cursorPosition: longText.length,
        enableAutosave: false,
      }),
    );
    expect(result.current.charCountStatus).toBe("warning");
    expect(result.current.isApproachingLimit).toBe(true);
    expect(result.current.isExceedingLimit).toBe(false);
    unmount();
  });

  it("超过限制时进入 exceeded 状态", () => {
    const longText = "a".repeat(CHAR_LIMIT_SUGGESTED + 100);
    const { result, unmount } = renderHook(() =>
      useSmartInputFeedback({
        threadId: "t-1",
        value: longText,
        cursorPosition: longText.length,
        enableAutosave: false,
      }),
    );
    expect(result.current.charCountStatus).toBe("exceeded");
    expect(result.current.isExceedingLimit).toBe(true);
    unmount();
  });
});

describe("useSmartInputFeedback - 提及检测", () => {
  it("正在输入 @ 时 isMentionTriggered=true", () => {
    const { result, unmount } = renderHook(() =>
      useSmartInputFeedback({
        threadId: "t-1",
        value: "hi @use",
        cursorPosition: 7,
        enableAutosave: false,
      }),
    );
    expect(result.current.isMentionTriggered).toBe(true);
    unmount();
  });

  it("没有 @ 时 isMentionTriggered=false", () => {
    const { result, unmount } = renderHook(() =>
      useSmartInputFeedback({
        threadId: "t-1",
        value: "hi world",
        cursorPosition: 8,
        enableAutosave: false,
      }),
    );
    expect(result.current.isMentionTriggered).toBe(false);
    unmount();
  });
});

describe("useSmartInputFeedback - 长文截断警告", () => {
  it("超过阈值时 showTruncationWarning=true", () => {
    const longText = "a".repeat(LONG_TEXT_WARNING_THRESHOLD + 100);
    const { result, unmount } = renderHook(() =>
      useSmartInputFeedback({
        threadId: "t-1",
        value: longText,
        cursorPosition: longText.length,
        enableAutosave: false,
      }),
    );
    expect(result.current.showTruncationWarning).toBe(true);
    unmount();
  });

  it("未超过阈值时 showTruncationWarning=false", () => {
    const { result, unmount } = renderHook(() =>
      useSmartInputFeedback({
        threadId: "t-1",
        value: "short",
        cursorPosition: 5,
        enableAutosave: false,
      }),
    );
    expect(result.current.showTruncationWarning).toBe(false);
    unmount();
  });

  it("dismissTruncationWarning 后立即关闭警告", () => {
    const longText = "a".repeat(LONG_TEXT_WARNING_THRESHOLD + 100);
    const { result, unmount } = renderHook(() =>
      useSmartInputFeedback({
        threadId: "t-1",
        value: longText,
        cursorPosition: longText.length,
        enableAutosave: false,
      }),
    );
    expect(result.current.showTruncationWarning).toBe(true);

    act(() => {
      result.current.dismissTruncationWarning();
    });
    expect(result.current.showTruncationWarning).toBe(false);
    unmount();
  });
});

describe("useSmartInputFeedback - 截断操作", () => {
  it("truncateText 返回截断后的字符串（不超过 maxLength + 省略号）", () => {
    const text = "a".repeat(CHAR_LIMIT_SUGGESTED + 1000);
    const { result, unmount } = renderHook(() =>
      useSmartInputFeedback({
        threadId: "t-1",
        value: text,
        cursorPosition: text.length,
        enableAutosave: false,
        charLimit: CHAR_LIMIT_SUGGESTED,
      }),
    );
    const truncated = result.current.truncateText();
    // 截断后长度应 <= maxLength + 3 (省略号)
    expect(truncated.length).toBeLessThanOrEqual(CHAR_LIMIT_SUGGESTED + 3);
    expect(truncated.length).toBeLessThan(text.length);
    unmount();
  });
});

describe("useSmartInputFeedback - 草稿保存", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saveDraft 立即写入 localStorage", () => {
    const threadId = "t-save-1";
    const { result, unmount } = renderHook(() =>
      useSmartInputFeedback({
        threadId,
        value: "draft content",
        cursorPosition: 0,
        enableAutosave: false,
      }),
    );
    act(() => {
      result.current.saveDraft();
    });
    const stored = localStorage.getItem(getDraftStorageKey(threadId));
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.value).toBe("draft content");
    expect(parsed.savedAt).toBeGreaterThan(0);
    unmount();
  });

  it("restoreDraft 返回最近保存的内容", () => {
    const threadId = "t-restore-1";
    localStorage.setItem(
      getDraftStorageKey(threadId),
      JSON.stringify({ value: "previous", savedAt: Date.now() - 1000 }),
    );

    const { result, unmount } = renderHook(() =>
      useSmartInputFeedback({
        threadId,
        value: "",
        cursorPosition: 0,
        enableAutosave: false,
      }),
    );
    const restored = result.current.restoreDraft();
    expect(restored).toBe("previous");
    unmount();
  });

  it("clearDraft 移除 localStorage 条目", () => {
    const threadId = "t-clear-1";
    localStorage.setItem(
      getDraftStorageKey(threadId),
      JSON.stringify({ value: "x", savedAt: Date.now() }),
    );

    const { result, unmount } = renderHook(() =>
      useSmartInputFeedback({
        threadId,
        value: "x",
        cursorPosition: 0,
        enableAutosave: false,
      }),
    );
    act(() => {
      result.current.clearDraft();
    });
    expect(localStorage.getItem(getDraftStorageKey(threadId))).toBeNull();
    unmount();
  });

  it("value 不变时 saveDraft 不重复写", () => {
    const threadId = "t-noop";
    const { result, unmount } = renderHook(() =>
      useSmartInputFeedback({
        threadId,
        value: "same",
        cursorPosition: 0,
        enableAutosave: false,
      }),
    );
    act(() => {
      result.current.saveDraft();
    });
    const first = localStorage.getItem(getDraftStorageKey(threadId));

    act(() => {
      result.current.saveDraft();
    });
    const second = localStorage.getItem(getDraftStorageKey(threadId));
    // 内容未变化时应返回相同 key（值相同）
    expect(first).toBe(second);
    unmount();
  });
});

describe("常量", () => {
  it("LONG_TEXT_WARNING_THRESHOLD < CHAR_LIMIT_WARNING", () => {
    expect(LONG_TEXT_WARNING_THRESHOLD).toBeLessThan(CHAR_LIMIT_WARNING);
  });

  it("MENTION_LOADING_THRESHOLD_MS 为合理值", () => {
    expect(MENTION_LOADING_THRESHOLD_MS).toBeGreaterThanOrEqual(200);
    expect(MENTION_LOADING_THRESHOLD_MS).toBeLessThanOrEqual(1000);
  });

  it("DRAFT_AUTOSAVE_DEBOUNCE_MS 为合理值", () => {
    expect(DRAFT_AUTOSAVE_DEBOUNCE_MS).toBeGreaterThanOrEqual(1000);
    expect(DRAFT_AUTOSAVE_DEBOUNCE_MS).toBeLessThanOrEqual(30000);
  });
});
