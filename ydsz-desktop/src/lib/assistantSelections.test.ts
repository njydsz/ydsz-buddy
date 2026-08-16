/**
 * @file assistantSelections.ts 单元测试
 *
 * 覆盖：
 * - normalizeAssistantSelectionText
 * - getAssistantSelectionValidationError
 * - normalizeAssistantSelectionAttachment
 * - createAssistantSelectionAttachment
 * - formatAssistantSelectionPreview
 * - formatAssistantSelectionQueuePreview
 * - formatAssistantSelectionTitleSeed
 * - buildAssistantSelectionsPromptBlock
 * - appendAssistantSelectionsToPrompt
 * - extractTrailingAssistantSelections
 * - stripTrailingAssistantSelections
 * - stripEmbeddedAssistantSelections
 */

import { describe, expect, it } from "vitest";
import { CHAT_ASSISTANT_SELECTION_TEXT_MAX_CHARS } from "@ydsz-buddy/contracts";
import {
  appendAssistantSelectionsToPrompt,
  buildAssistantSelectionsPromptBlock,
  createAssistantSelectionAttachment,
  extractTrailingAssistantSelections,
  formatAssistantSelectionPreview,
  formatAssistantSelectionQueuePreview,
  formatAssistantSelectionTitleSeed,
  getAssistantSelectionValidationError,
  normalizeAssistantSelectionAttachment,
  normalizeAssistantSelectionText,
  stripEmbeddedAssistantSelections,
  stripTrailingAssistantSelections,
} from "./assistantSelections";

describe("normalizeAssistantSelectionText", () => {
  it("替换 CRLF 为 LF", () => {
    expect(normalizeAssistantSelectionText("a\r\nb")).toBe("a\nb");
  });

  it("去除首尾空行", () => {
    expect(normalizeAssistantSelectionText("\n\nhello\n\n")).toBe("hello");
  });

  it("trim 首尾空白", () => {
    expect(normalizeAssistantSelectionText("  hello  ")).toBe("hello");
  });

  it("保留内部空行", () => {
    expect(normalizeAssistantSelectionText("a\n\nb")).toBe("a\n\nb");
  });

  it("空字符串归一为 ''", () => {
    expect(normalizeAssistantSelectionText("")).toBe("");
  });
});

describe("getAssistantSelectionValidationError", () => {
  it("空 assistantMessageId 返回 'empty'", () => {
    expect(
      getAssistantSelectionValidationError({ assistantMessageId: "", text: "x" }),
    ).toBe("empty");
  });

  it("空 text 返回 'empty'", () => {
    expect(
      getAssistantSelectionValidationError({ assistantMessageId: "m1", text: "   " }),
    ).toBe("empty");
  });

  it("超长 text 返回 'too-long'", () => {
    const longText = "x".repeat(CHAT_ASSISTANT_SELECTION_TEXT_MAX_CHARS + 1);
    expect(
      getAssistantSelectionValidationError({ assistantMessageId: "m1", text: longText }),
    ).toBe("too-long");
  });

  it("正常输入返回 null", () => {
    expect(
      getAssistantSelectionValidationError({ assistantMessageId: "m1", text: "hello" }),
    ).toBeNull();
  });
});

describe("normalizeAssistantSelectionAttachment", () => {
  it("无效输入返回 null", () => {
    expect(
      normalizeAssistantSelectionAttachment({ assistantMessageId: "", text: "x" }),
    ).toBeNull();
  });

  it("trim 后 assistantMessageId", () => {
    expect(
      normalizeAssistantSelectionAttachment({ assistantMessageId: "  m1  ", text: "hello" }),
    ).toEqual({ assistantMessageId: "m1", text: "hello" });
  });

  it("text 走 normalizeAssistantSelectionText", () => {
    expect(
      normalizeAssistantSelectionAttachment({ assistantMessageId: "m1", text: "\nhi\n" }),
    ).toEqual({ assistantMessageId: "m1", text: "hi" });
  });
});

describe("createAssistantSelectionAttachment", () => {
  it("无效输入返回 null", () => {
    expect(createAssistantSelectionAttachment({ assistantMessageId: "", text: "x" })).toBeNull();
  });

  it("有效输入返回带 type/id 的 attachment", () => {
    const result = createAssistantSelectionAttachment({
      assistantMessageId: "m1",
      text: "hello",
    });
    expect(result).not.toBeNull();
    expect(result?.type).toBe("assistant-selection");
    expect(result?.id).toBeTruthy();
    expect(result?.assistantMessageId).toBe("m1");
    expect(result?.text).toBe("hello");
  });

  it("两个调用返回不同的 id（randomUUID）", () => {
    const a = createAssistantSelectionAttachment({ assistantMessageId: "m1", text: "x" });
    const b = createAssistantSelectionAttachment({ assistantMessageId: "m1", text: "x" });
    expect(a?.id).not.toBe(b?.id);
  });
});

describe("formatAssistantSelectionPreview", () => {
  it("空文本返回 'Selection'", () => {
    expect(formatAssistantSelectionPreview("")).toBe("Selection");
    expect(formatAssistantSelectionPreview("   \n\n")).toBe("Selection");
  });

  it("单行文本直接返回", () => {
    expect(formatAssistantSelectionPreview("hello world")).toBe("hello world");
  });

  it("多行只取首行", () => {
    expect(formatAssistantSelectionPreview("first\nsecond\nthird")).toBe("first");
  });

  it("超长单行被截断到 43 字符 + …", () => {
    const longLine = "x".repeat(100);
    const preview = formatAssistantSelectionPreview(longLine);
    expect(preview.endsWith("…")).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(44);
  });

  it("首行 <= 43 字符不被截断", () => {
    const line = "x".repeat(43);
    expect(formatAssistantSelectionPreview(line)).toBe(line);
  });
});

describe("formatAssistantSelectionQueuePreview", () => {
  it("count=1 时单数文案", () => {
    expect(formatAssistantSelectionQueuePreview(1)).toBe("1 referenced selection");
  });

  it("count=0/2+ 时复数文案", () => {
    expect(formatAssistantSelectionQueuePreview(0)).toBe("Referenced selections");
    expect(formatAssistantSelectionQueuePreview(5)).toBe("Referenced selections");
  });
});

describe("formatAssistantSelectionTitleSeed", () => {
  it("count=1 时单数", () => {
    expect(formatAssistantSelectionTitleSeed(1)).toBe("Referenced assistant selection");
  });

  it("count=0/2+ 时复数", () => {
    expect(formatAssistantSelectionTitleSeed(0)).toBe("Referenced assistant selections");
    expect(formatAssistantSelectionTitleSeed(3)).toBe("Referenced assistant selections");
  });
});

describe("buildAssistantSelectionsPromptBlock", () => {
  it("空数组返回 ''", () => {
    expect(buildAssistantSelectionsPromptBlock([])).toBe("");
  });

  it("全部无效时返回 ''", () => {
    expect(
      buildAssistantSelectionsPromptBlock([{ assistantMessageId: "", text: "" }]),
    ).toBe("");
  });

  it("单条 selection 包裹在 <assistant_selection> 中", () => {
    const block = buildAssistantSelectionsPromptBlock([
      { assistantMessageId: "m1", text: "hello" },
    ]);
    expect(block).toContain("<assistant_selection>");
    expect(block).toContain("</assistant_selection>");
    expect(block).toContain("- assistant message m1:");
    expect(block).toContain("  hello");
  });

  it("多行 text 每行加 2 空格缩进", () => {
    const block = buildAssistantSelectionsPromptBlock([
      { assistantMessageId: "m1", text: "line1\nline2" },
    ]);
    expect(block).toContain("  line1");
    expect(block).toContain("  line2");
  });

  it("多条 selection 拼接为列表", () => {
    const block = buildAssistantSelectionsPromptBlock([
      { assistantMessageId: "m1", text: "a" },
      { assistantMessageId: "m2", text: "b" },
    ]);
    expect(block).toContain("- assistant message m1:");
    expect(block).toContain("- assistant message m2:");
  });
});

describe("appendAssistantSelectionsToPrompt", () => {
  it("空 selections 时仅 trim prompt", () => {
    expect(appendAssistantSelectionsToPrompt("  hello  ", [])).toBe("hello");
  });

  it("空 prompt + 有 selections 时仅返回 block", () => {
    const result = appendAssistantSelectionsToPrompt("", [
      { assistantMessageId: "m1", text: "x" },
    ]);
    expect(result.startsWith("<assistant_selection>")).toBe(true);
  });

  it("正常 prompt + selections 用 \\n\\n 拼接", () => {
    const result = appendAssistantSelectionsToPrompt("hello", [
      { assistantMessageId: "m1", text: "x" },
    ]);
    expect(result).toMatch(/^hello\n\n<assistant_selection>/);
  });
});

describe("extractTrailingAssistantSelections", () => {
  it("无 trailing block 时 promptText 保持原值, selections=[]", () => {
    const result = extractTrailingAssistantSelections("hello world");
    expect(result.promptText).toBe("hello world");
    expect(result.selections).toEqual([]);
  });

  it("有 trailing block 时 promptText 去除尾部", () => {
    const prompt = "hello\n\n<assistant_selection>\n- assistant message m1:\n  hello\n</assistant_selection>";
    const result = extractTrailingAssistantSelections(prompt);
    expect(result.promptText).toBe("hello");
    expect(result.selections).toEqual([
      { assistantMessageId: "m1", text: "hello" },
    ]);
  });

  it("尾部空行被去除", () => {
    const prompt = "hello\n\n<assistant_selection>\n- assistant message m1:\n  x\n</assistant_selection>\n\n\n";
    const result = extractTrailingAssistantSelections(prompt);
    expect(result.promptText).toBe("hello");
  });
});

describe("stripTrailingAssistantSelections", () => {
  it("等于 extractTrailingAssistantSelections(...).promptText", () => {
    const prompt = "hello\n\n<assistant_selection>\n- assistant message m1:\n  x\n</assistant_selection>";
    expect(stripTrailingAssistantSelections(prompt)).toBe("hello");
  });

  it("无 trailing block 时返回原 prompt", () => {
    expect(stripTrailingAssistantSelections("plain text")).toBe("plain text");
  });
});

describe("stripEmbeddedAssistantSelections", () => {
  it("移除位于末尾的嵌入 <assistant_selection> 块（按实现：要求块在末尾）", () => {
    // 嵌入规则要求 selection 后只允许跟 terminal_context 块或字符串结尾
    const prompt =
      "before\n<assistant_selection>\n- assistant message m1:\n  x\n</assistant_selection>";
    const stripped = stripEmbeddedAssistantSelections(prompt);
    expect(stripped).not.toContain("<assistant_selection>");
  });

  it("无 selection 时返回原值", () => {
    expect(stripEmbeddedAssistantSelections("plain text")).toBe("plain text");
  });
});
