/**
 * @file reviewModePrompt 单元测试
 */

import { describe, expect, it } from "vitest";

import {
  buildReviewModePrompt,
  REVIEW_MODE_SYSTEM_PROMPT,
} from "./reviewModePrompt";

describe("reviewModePrompt", () => {
  describe("REVIEW_MODE_SYSTEM_PROMPT", () => {
    it("为非空字符串", () => {
      expect(typeof REVIEW_MODE_SYSTEM_PROMPT).toBe("string");
      expect(REVIEW_MODE_SYSTEM_PROMPT.length).toBeGreaterThan(0);
    });

    it("包含关键评审维度标签", () => {
      expect(REVIEW_MODE_SYSTEM_PROMPT).toContain("代码审查模式");
      expect(REVIEW_MODE_SYSTEM_PROMPT).toContain("评论格式");
    });
  });

  describe("buildReviewModePrompt", () => {
    it("无 basePrompt 时仅返回 REVIEW 提示词", () => {
      const result = buildReviewModePrompt();
      expect(result).toBe(REVIEW_MODE_SYSTEM_PROMPT);
    });

    it("undefined basePrompt 等同于无", () => {
      const result = buildReviewModePrompt(undefined);
      expect(result).toBe(REVIEW_MODE_SYSTEM_PROMPT);
    });

    it("空字符串 basePrompt 等同于无", () => {
      const result = buildReviewModePrompt("");
      expect(result).toBe(REVIEW_MODE_SYSTEM_PROMPT);
    });

    it("非空 basePrompt 追加到末尾(用 上下文 章节)", () => {
      const result = buildReviewModePrompt("diff context here");
      expect(result).toContain(REVIEW_MODE_SYSTEM_PROMPT);
      expect(result).toContain("## 上下文");
      expect(result).toContain("diff context here");
    });
  });
});
