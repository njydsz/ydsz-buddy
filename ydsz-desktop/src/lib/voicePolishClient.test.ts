/**
 * @file voicePolishClient 单元测试
 *
 * 覆盖：
 * 1. 空文本 / 纯空白 → 快速路径返回原文
 * 2. 禁用开关 → 不调用 RPC
 * 3. 后端成功 → 返回润色文本
 * 4. 后端失败 → 静默回退原文（**不抛出**）
 * 5. 后端返回空文本 → 防御性回退原文
 * 6. auto 语言检测（CJK 字符比例判定）
 * 7. AbortSignal 已中断 → 立即返回原文
 * 8. 无 native api → 回退原文
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist：vi.mock 必须在模块导入前注册
const { voicePolishTextMock, readNativeApiMock } = vi.hoisted(() => ({
  voicePolishTextMock: vi.fn(),
  readNativeApiMock: vi.fn(),
}));

vi.mock("../nativeApi", () => ({
  readNativeApi: () => readNativeApiMock(),
}));

import { detectTranscriptLanguage, polishVoiceTranscript } from "./voicePolishClient";

const baseOptions = {
  enabled: true,
  removeFillerWords: true,
  fixGrammar: true,
  addStructure: false,
  targetLanguage: "auto" as const,
};

describe("detectTranscriptLanguage", () => {
  it("returns 'zh' for Chinese text", () => {
    expect(detectTranscriptLanguage("嗯那个请帮我写一个函数")).toBe("zh");
  });

  it("returns 'en' for English text", () => {
    expect(detectTranscriptLanguage("please create a function that does X")).toBe("en");
  });

  it("returns 'en' for empty text", () => {
    expect(detectTranscriptLanguage("")).toBe("en");
  });

  it("handles mixed CJK+English by ratio", () => {
    // 3 CJK + 22 latin → ~12% → en
    expect(
      detectTranscriptLanguage("写一个please create a function that does X here thanks"),
    ).toBe("en");
    // 30 CJK + 8 latin → ~79% → zh
    expect(
      detectTranscriptLanguage(
        "请帮我写一个非常复杂的函数用来处理复杂数据请帮我写一个非常复杂的函数please",
      ),
    ).toBe("zh");
  });
});

describe("polishVoiceTranscript", () => {
  beforeEach(() => {
    voicePolishTextMock.mockReset();
    readNativeApiMock.mockReset();
    readNativeApiMock.mockReturnValue({
      server: { voicePolishText: voicePolishTextMock },
    });
  });

  it("returns original when text is empty", async () => {
    const result = await polishVoiceTranscript("", baseOptions);
    expect(result.applied).toBe(false);
    expect(result.text).toBe("");
    expect(result.appliedRulesCount).toBe(0);
  });

  it("returns original when text is whitespace only", async () => {
    const result = await polishVoiceTranscript("   \n  ", baseOptions);
    expect(result.applied).toBe(false);
    expect(result.text).toBe("   \n  ");
  });

  it("returns original when disabled", async () => {
    voicePolishTextMock.mockResolvedValue({
      text: "polished",
      appliedRules: ["a"],
      originalLength: 1,
      polishedLength: 1,
    });
    const result = await polishVoiceTranscript("嗯那个请帮我", {
      ...baseOptions,
      enabled: false,
    });
    expect(result.applied).toBe(false);
    expect(result.text).toBe("嗯那个请帮我");
    expect(voicePolishTextMock).not.toHaveBeenCalled();
  });

  it("returns original when AbortSignal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await polishVoiceTranscript("hello", {
      ...baseOptions,
      signal: controller.signal,
    });
    expect(result.applied).toBe(false);
    expect(result.text).toBe("hello");
    expect(voicePolishTextMock).not.toHaveBeenCalled();
  });

  it("returns polished text on success", async () => {
    voicePolishTextMock.mockResolvedValue({
      text: "polished",
      appliedRules: ["removed_filler_words"],
      originalLength: 10,
      polishedLength: 8,
    });
    const result = await polishVoiceTranscript("嗯那个请帮我", baseOptions);
    expect(result.applied).toBe(true);
    expect(result.text).toBe("polished");
    expect(result.appliedRulesCount).toBe(1);
  });

  it("falls back to original on backend error", async () => {
    voicePolishTextMock.mockRejectedValue(new Error("network failure"));
    const result = await polishVoiceTranscript("hello", baseOptions);
    expect(result.applied).toBe(false);
    expect(result.text).toBe("hello");
  });

  it("falls back to original when backend returns empty text", async () => {
    voicePolishTextMock.mockResolvedValue({
      text: "   ",
      appliedRules: [],
      originalLength: 5,
      polishedLength: 3,
    });
    const result = await polishVoiceTranscript("hello", baseOptions);
    expect(result.applied).toBe(false);
    expect(result.text).toBe("hello");
  });

  it("passes targetLanguage as-is when not 'auto'", async () => {
    voicePolishTextMock.mockResolvedValue({
      text: "polished",
      appliedRules: [],
      originalLength: 5,
      polishedLength: 5,
    });

    await polishVoiceTranscript("hello", { ...baseOptions, targetLanguage: "en" });
    expect(voicePolishTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ targetLanguage: "en" }),
    );
  });

  it("auto-detects language from CJK content", async () => {
    voicePolishTextMock.mockResolvedValue({
      text: "polished",
      appliedRules: [],
      originalLength: 5,
      polishedLength: 5,
    });

    await polishVoiceTranscript("请帮我写一个函数", baseOptions);
    expect(voicePolishTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ targetLanguage: "zh" }),
    );
  });

  it("returns original when no native api is available", async () => {
    readNativeApiMock.mockReturnValue(undefined);
    const result = await polishVoiceTranscript("hello", baseOptions);
    expect(result.applied).toBe(false);
    expect(result.text).toBe("hello");
  });
});
