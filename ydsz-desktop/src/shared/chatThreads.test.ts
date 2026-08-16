/**
 * @file chatThreads.ts 单元测试
 *
 * 覆盖纯函数：
 * 1. truncateChatThreadTitle - 标题截断
 * 2. buildPromptThreadTitleFallback - 消息构建临时标题
 * 3. sanitizeGeneratedThreadTitle - 清洗 AI 生成的标题
 * 4. isGenericChatThreadTitle - 判断通用占位标题
 */

import { describe, expect, it } from "vitest";

import {
  buildPromptThreadTitleFallback,
  GENERIC_CHAT_THREAD_TITLE,
  isGenericChatThreadTitle,
  sanitizeGeneratedThreadTitle,
  truncateChatThreadTitle,
} from "./chatThreads";

describe("chatThreads", () => {
  describe("GENERIC_CHAT_THREAD_TITLE", () => {
    it("暴露固定常量", () => {
      expect(GENERIC_CHAT_THREAD_TITLE).toBe("New thread");
    });
  });

  describe("truncateChatThreadTitle", () => {
    it("短标题原样返回", () => {
      expect(truncateChatThreadTitle("Hello world")).toBe("Hello world");
    });

    it("多空白合并为单空格", () => {
      expect(truncateChatThreadTitle("Hello   world")).toBe("Hello world");
    });

    it("首尾空白被去除", () => {
      expect(truncateChatThreadTitle("  trim me  ")).toBe("trim me");
    });

    it("超过默认长度（50）时截断并加省略号", () => {
      const long = "x".repeat(120);
      const result = truncateChatThreadTitle(long);
      expect(result.endsWith("...")).toBe(true);
      // 截取 50 字符 + 三个点 = 53
      expect(result.length).toBe(53);
    });

    it("正好等于默认长度时不截断", () => {
      const exact = "a".repeat(50);
      expect(truncateChatThreadTitle(exact)).toBe(exact);
    });

    it("支持自定义 maxLength", () => {
      const result = truncateChatThreadTitle("abcdefghij", 5);
      expect(result).toBe("abcde...");
    });

    it("maxLength 0 时空字符串加省略号", () => {
      expect(truncateChatThreadTitle("test", 0)).toBe("...");
    });
  });

  describe("buildPromptThreadTitleFallback", () => {
    it("提取前 4 个单词作为标题", () => {
      // 注：当前实现只取前 4 个 token（不超过 4 个单词），超出部分被丢弃
      expect(buildPromptThreadTitleFallback("How do I fix a bug in my code?")).toBe(
        "How do I fix",
      );
    });

    it("单词数不足时使用全部单词", () => {
      expect(buildPromptThreadTitleFallback("Hello world")).toBe("Hello world");
    });

    it("空消息回退为通用标题", () => {
      expect(buildPromptThreadTitleFallback("")).toBe(GENERIC_CHAT_THREAD_TITLE);
    });

    it("只包含空白字符时回退为通用标题", () => {
      expect(buildPromptThreadTitleFallback("   \t  \n  ")).toBe(GENERIC_CHAT_THREAD_TITLE);
    });

    it("只包含特殊字符时部分被 trim 保留核心", () => {
      // trimTitleToken 会去除首尾 ( ) 等符号，保留中间非 trim 集字符
      expect(buildPromptThreadTitleFallback("!@#$%^&*()")).toBe("!@#$%^&*(");
    });

    it("去除首尾引号和括号", () => {
      // 单个 token 加上引号会被 trimTitleToken 去除，得到 4 个单词
      expect(buildPromptThreadTitleFallback('"Fix the login bug"')).toBe("Fix the login bug");
    });

    it("去除多空白与多标点", () => {
      expect(buildPromptThreadTitleFallback("   hello,,,   world!!!   ")).toBe("hello world");
    });
  });

  describe("sanitizeGeneratedThreadTitle", () => {
    it("去除首尾双引号", () => {
      expect(sanitizeGeneratedThreadTitle('"Fix the login bug"')).toBe("Fix the login bug");
    });

    it("去除首尾单引号", () => {
      expect(sanitizeGeneratedThreadTitle("'Hello world'")).toBe("Hello world");
    });

    it("去除首尾反引号", () => {
      expect(sanitizeGeneratedThreadTitle("`Code review`")).toBe("Code review");
    });

    it("只取前 4 个单词", () => {
      expect(
        sanitizeGeneratedThreadTitle(
          "Comprehensive analysis of distributed system performance bottlenecks",
        ),
      ).toBe("Comprehensive analysis of distributed");
    });

    it("首尾空白被去除", () => {
      expect(sanitizeGeneratedThreadTitle("   Hello world   ")).toBe("Hello world");
    });

    it("全部为特殊字符时回退为通用标题", () => {
      expect(sanitizeGeneratedThreadTitle("\"\".!?,;:")).toBe(GENERIC_CHAT_THREAD_TITLE);
    });

    it("空字符串回退为通用标题", () => {
      expect(sanitizeGeneratedThreadTitle("")).toBe(GENERIC_CHAT_THREAD_TITLE);
    });

    it("保留合法标点（如连字符、斜杠）", () => {
      expect(sanitizeGeneratedThreadTitle("feat/api-client add retry")).toBe(
        "feat/api-client add retry",
      );
    });

    it("截断超过 50 字符的清洗结果", () => {
      const long = "x".repeat(120);
      const result = sanitizeGeneratedThreadTitle(long);
      expect(result.endsWith("...")).toBe(true);
      expect(result.length).toBe(53);
    });
  });

  describe("isGenericChatThreadTitle", () => {
    it("匹配通用标题", () => {
      expect(isGenericChatThreadTitle("New thread")).toBe(true);
    });

    it("带前后空白的通用标题仍匹配", () => {
      expect(isGenericChatThreadTitle("  New thread  ")).toBe(true);
    });

    it("中间多空白的通用标题仍匹配", () => {
      expect(isGenericChatThreadTitle("New   thread")).toBe(true);
    });

    it("自定义标题不匹配", () => {
      expect(isGenericChatThreadTitle("My custom thread")).toBe(false);
    });

    it("空字符串不匹配", () => {
      expect(isGenericChatThreadTitle("")).toBe(false);
    });

    it("null/undefined 不匹配", () => {
      expect(isGenericChatThreadTitle(null)).toBe(false);
      expect(isGenericChatThreadTitle(undefined)).toBe(false);
    });
  });
});
