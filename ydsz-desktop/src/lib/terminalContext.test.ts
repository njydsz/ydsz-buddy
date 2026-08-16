/**
 * @file terminalContext 单元测试
 *
 * 覆盖终端上下文模块的纯函数：
 * 1. normalizeTerminalContextText - 换行/前后空白归一化
 * 2. hasTerminalContextText / isTerminalContextExpired / filterTerminalContextsWithText
 * 3. formatTerminalContextRange / formatTerminalContextLabel / formatInlineTerminalContextLabel
 * 4. normalizeTerminalContextSelection - 必填字段校验、lineStart 修正
 * 5. buildTerminalContextBlock / appendTerminalContextsToPrompt / appendOriginalTerminalContextBlock
 * 6. extractTrailingTerminalContexts - 解析 <terminal_context> 块
 * 7. deriveDisplayedUserMessageState - 综合显示状态
 * 8. countInlineTerminalContextPlaceholders / ensureInlineTerminalContextPlaceholders
 * 9. insertInlineTerminalContextPlaceholder / removeInlineTerminalContextPlaceholder
 *    / stripInlineTerminalContextPlaceholders
 * 10. materializeInlineTerminalContextPrompt - 将占位符替换为可读标签
 */

import { describe, expect, it } from "vitest";

import {
  appendOriginalTerminalContextBlock,
  appendTerminalContextsToPrompt,
  buildTerminalContextBlock,
  countInlineTerminalContextPlaceholders,
  deriveDisplayedUserMessageState,
  ensureInlineTerminalContextPlaceholders,
  extractTrailingTerminalContexts,
  filterTerminalContextsWithText,
  formatInlineTerminalContextLabel,
  formatTerminalContextLabel,
  formatTerminalContextRange,
  hasTerminalContextText,
  IMAGE_ONLY_BOOTSTRAP_PROMPT,
  IMAGE_ONLY_VISIBLE_PLACEHOLDER,
  INLINE_TERMINAL_CONTEXT_PLACEHOLDER,
  insertInlineTerminalContextPlaceholder,
  isTerminalContextExpired,
  materializeInlineTerminalContextPrompt,
  normalizeTerminalContextSelection,
  normalizeTerminalContextText,
  removeInlineTerminalContextPlaceholder,
  stripInlineTerminalContextPlaceholders,
  type TerminalContextSelection,
} from "./terminalContext";

function makeSelection(overrides: Partial<TerminalContextSelection> = {}): TerminalContextSelection {
  return {
    terminalId: "term-1",
    terminalLabel: "bash",
    lineStart: 1,
    lineEnd: 3,
    text: "echo hello",
    ...overrides,
  };
}

describe("terminalContext", () => {
  describe("normalizeTerminalContextText", () => {
    it("替换 CRLF 为 LF", () => {
      expect(normalizeTerminalContextText("a\r\nb")).toBe("a\nb");
    });

    it("去除首尾换行", () => {
      expect(normalizeTerminalContextText("\n\nabc\n\n")).toBe("abc");
    });

    it("保留中间换行", () => {
      expect(normalizeTerminalContextText("a\nb\nc")).toBe("a\nb\nc");
    });
  });

  describe("hasTerminalContextText / isTerminalContextExpired / filterTerminalContextsWithText", () => {
    it("纯换行视为无文本", () => {
      expect(hasTerminalContextText({ text: "\n\n\n" })).toBe(false);
    });

    it("正常文本返回 true", () => {
      expect(hasTerminalContextText({ text: "echo" })).toBe(true);
    });

    it("isTerminalContextExpired 与 hasTerminalContextText 取反", () => {
      expect(isTerminalContextExpired({ text: "" })).toBe(true);
      expect(isTerminalContextExpired({ text: "x" })).toBe(false);
    });

    it("filterTerminalContextsWithText 过滤纯换行项", () => {
      const result = filterTerminalContextsWithText([
        { text: "keep" },
        { text: "\n\n" },
        { text: "also" },
      ]);
      expect(result).toHaveLength(2);
    });
  });

  describe("formatTerminalContextRange", () => {
    it("单行显示 line N", () => {
      expect(formatTerminalContextRange({ lineStart: 5, lineEnd: 5 })).toBe("line 5");
    });

    it("多行显示 lines N-M", () => {
      expect(formatTerminalContextRange({ lineStart: 5, lineEnd: 10 })).toBe("lines 5-10");
    });
  });

  describe("formatTerminalContextLabel", () => {
    it("单行组合为 'label line N'", () => {
      expect(
        formatTerminalContextLabel({ terminalLabel: "bash", lineStart: 3, lineEnd: 3 }),
      ).toBe("bash line 3");
    });

    it("多行组合为 'label lines N-M'", () => {
      expect(
        formatTerminalContextLabel({ terminalLabel: "bash", lineStart: 1, lineEnd: 5 }),
      ).toBe("bash lines 1-5");
    });
  });

  describe("formatInlineTerminalContextLabel", () => {
    it("小写化+空白转 -", () => {
      expect(
        formatInlineTerminalContextLabel({
          terminalLabel: "Bash Pro",
          lineStart: 1,
          lineEnd: 1,
        }),
      ).toBe("@bash-pro:1");
    });

    it("多行格式为 N-M", () => {
      expect(
        formatInlineTerminalContextLabel({
          terminalLabel: "zsh",
          lineStart: 1,
          lineEnd: 5,
        }),
      ).toBe("@zsh:1-5");
    });
  });

  describe("normalizeTerminalContextSelection", () => {
    it("text 为空返回 null", () => {
      expect(normalizeTerminalContextSelection(makeSelection({ text: "" }))).toBeNull();
      expect(normalizeTerminalContextSelection(makeSelection({ text: "\n\n" }))).toBeNull();
    });

    it("terminalId 为空返回 null", () => {
      expect(
        normalizeTerminalContextSelection(makeSelection({ terminalId: "" })),
      ).toBeNull();
      expect(
        normalizeTerminalContextSelection(makeSelection({ terminalId: "   " })),
      ).toBeNull();
    });

    it("terminalLabel 为空返回 null", () => {
      expect(
        normalizeTerminalContextSelection(makeSelection({ terminalLabel: "" })),
      ).toBeNull();
    });

    it("lineStart < 1 时夹到 1", () => {
      const result = normalizeTerminalContextSelection(
        makeSelection({ lineStart: -5, lineEnd: 3 }),
      );
      expect(result?.lineStart).toBe(1);
      expect(result?.lineEnd).toBe(3);
    });

    it("lineEnd < lineStart 时夹到 lineStart", () => {
      const result = normalizeTerminalContextSelection(
        makeSelection({ lineStart: 5, lineEnd: 3 }),
      );
      expect(result?.lineStart).toBe(5);
      expect(result?.lineEnd).toBe(5);
    });

    it("lineStart 浮点数向下取整", () => {
      const result = normalizeTerminalContextSelection(
        makeSelection({ lineStart: 1.9, lineEnd: 3.5 }),
      );
      expect(result?.lineStart).toBe(1);
      expect(result?.lineEnd).toBe(3);
    });

    it("trim terminalId/terminalLabel", () => {
      const result = normalizeTerminalContextSelection(
        makeSelection({ terminalId: "  term  ", terminalLabel: "  bash  " }),
      );
      expect(result?.terminalId).toBe("term");
      expect(result?.terminalLabel).toBe("bash");
    });
  });

  describe("buildTerminalContextBlock", () => {
    it("空数组返回空字符串", () => {
      expect(buildTerminalContextBlock([])).toBe("");
    });

    it("无效 selection 被过滤", () => {
      const result = buildTerminalContextBlock([
        makeSelection({ text: "\n\n" }),
        makeSelection({ text: "ok", lineStart: 1, lineEnd: 3 }),
      ]);
      expect(result).toContain("bash lines 1-3");
      expect(result).toContain("<terminal_context>");
      expect(result).toContain("</terminal_context>");
    });

    it("多 selection 之间插入空行", () => {
      const result = buildTerminalContextBlock([
        makeSelection({ terminalLabel: "bash", lineStart: 1, lineEnd: 1, text: "a" }),
        makeSelection({ terminalLabel: "zsh", lineStart: 1, lineEnd: 1, text: "b" }),
      ]);
      // 至少包含两个 header
      expect(result.split("- bash line 1:").length).toBe(2);
      expect(result.split("- zsh line 1:").length).toBe(2);
    });

    it("行号从 lineStart 递增", () => {
      const result = buildTerminalContextBlock([
        makeSelection({ lineStart: 10, lineEnd: 12, text: "x\ny\nz" }),
      ]);
      expect(result).toContain("  10 | x");
      expect(result).toContain("  11 | y");
      expect(result).toContain("  12 | z");
    });
  });

  describe("appendTerminalContextsToPrompt", () => {
    it("空 contexts 时只返回 prompt(trim)", () => {
      const result = appendTerminalContextsToPrompt("  hello  ", []);
      expect(result).toBe("hello");
    });

    it("正常 contexts 追加到 prompt 末尾", () => {
      const result = appendTerminalContextsToPrompt("Fix bug", [makeSelection()]);
      expect(result).toContain("Fix bug");
      expect(result).toContain("<terminal_context>");
    });
  });

  describe("appendOriginalTerminalContextBlock", () => {
    it("originalPrompt 无 terminal_context 时只返回 editedPrompt", () => {
      const result = appendOriginalTerminalContextBlock({
        editedPrompt: "  fixed  ",
        originalPrompt: "hello world",
      });
      expect(result).toBe("fixed");
    });

    it("originalPrompt 含 terminal_context 块时附加到 editedPrompt 末尾", () => {
      const original = `prompt
<terminal_context>
- bash line 1:
  1 | echo
</terminal_context>`;
      const result = appendOriginalTerminalContextBlock({
        editedPrompt: "  edited  ",
        originalPrompt: original,
      });
      expect(result).toContain("edited");
      expect(result).toContain("<terminal_context>");
    });

    it("editedPrompt 为空时只保留 context 块", () => {
      const original = `<terminal_context>
- bash line 1:
  1 | echo
</terminal_context>`;
      const result = appendOriginalTerminalContextBlock({
        editedPrompt: "",
        originalPrompt: original,
      });
      expect(result).toContain("<terminal_context>");
    });
  });

  describe("extractTrailingTerminalContexts", () => {
    it("无 terminal_context 块时返回原 prompt", () => {
      const result = extractTrailingTerminalContexts("hello world");
      expect(result.promptText).toBe("hello world");
      expect(result.contextCount).toBe(0);
      expect(result.contexts).toEqual([]);
      expect(result.previewTitle).toBeNull();
    });

    it("提取尾部 terminal_context 块", () => {
      const prompt = `main prompt
<terminal_context>
- bash line 1-2:
  1 | a
  2 | b
</terminal_context>`;
      const result = extractTrailingTerminalContexts(prompt);
      expect(result.promptText).toBe("main prompt");
      expect(result.contextCount).toBe(1);
      expect(result.contexts[0].header).toBe("bash line 1-2");
      expect(result.contexts[0].body).toContain("a");
      expect(result.previewTitle).toContain("bash line 1-2");
    });

    it("提取后去除尾部空行", () => {
      const prompt = "main\n\n\n<terminal_context>\n- bash line 1:\n  1 | a\n</terminal_context>";
      const result = extractTrailingTerminalContexts(prompt);
      expect(result.promptText).toBe("main");
    });
  });

  describe("deriveDisplayedUserMessageState", () => {
    it("基本显示状态", () => {
      const prompt = "Hello world";
      const state = deriveDisplayedUserMessageState(prompt);
      expect(state.visibleText).toBe("Hello world");
      expect(state.copyText).toBe("Hello world");
      expect(state.contextCount).toBe(0);
    });

    it("hideImageOnlyBootstrapPrompt=true 且为图片引导提示时 visibleText 替换", () => {
      const state = deriveDisplayedUserMessageState(IMAGE_ONLY_BOOTSTRAP_PROMPT, {
        hideImageOnlyBootstrapPrompt: true,
      });
      expect(state.visibleText).toBe(IMAGE_ONLY_VISIBLE_PLACEHOLDER);
      expect(state.copyText).toBe("");
    });

    it("hideImageOnlyBootstrapPrompt=true 但 prompt 不同时 visibleText 保持原文", () => {
      const state = deriveDisplayedUserMessageState("regular prompt", {
        hideImageOnlyBootstrapPrompt: true,
      });
      expect(state.visibleText).toBe("regular prompt");
    });

    it("包含 terminal_context 时解析 contexts", () => {
      const prompt = `main
<terminal_context>
- bash line 1:
  1 | a
</terminal_context>`;
      const state = deriveDisplayedUserMessageState(prompt);
      expect(state.contextCount).toBe(1);
      expect(state.contexts[0].header).toBe("bash line 1");
    });
  });

  describe("countInlineTerminalContextPlaceholders / ensureInlineTerminalContextPlaceholders", () => {
    it("占位符计数", () => {
      expect(countInlineTerminalContextPlaceholders("hello")).toBe(0);
      expect(
        countInlineTerminalContextPlaceholders(
          `a${INLINE_TERMINAL_CONTEXT_PLACEHOLDER}b${INLINE_TERMINAL_CONTEXT_PLACEHOLDER}c`,
        ),
      ).toBe(2);
    });

    it("补齐缺失的占位符", () => {
      const result = ensureInlineTerminalContextPlaceholders("hello", 2);
      expect(result.startsWith(INLINE_TERMINAL_CONTEXT_PLACEHOLDER.repeat(2))).toBe(true);
    });

    it("已存在足够占位符时不修改", () => {
      const result = ensureInlineTerminalContextPlaceholders(
        `${INLINE_TERMINAL_CONTEXT_PLACEHOLDER}hello`,
        1,
      );
      expect(result).toBe(`${INLINE_TERMINAL_CONTEXT_PLACEHOLDER}hello`);
    });

    it("已存在更多占位符时不修改", () => {
      const result = ensureInlineTerminalContextPlaceholders(
        INLINE_TERMINAL_CONTEXT_PLACEHOLDER.repeat(5),
        2,
      );
      expect(result).toBe(INLINE_TERMINAL_CONTEXT_PLACEHOLDER.repeat(5));
    });
  });

  describe("insertInlineTerminalContextPlaceholder", () => {
    it("在开头插入时不加前导空格(prompt[-1] 视为 boundary)", () => {
      // cursor=0,prompt[0]='h',但 prompt[-1]=undefined → boundary
      // needsLeadingSpace=false → replacement = "" + placeholder + " "
      // rangeEnd: prompt[0]='h' !== " " → rangeEnd=0
      // result = "" + "\uFFFC " + "hello" = "\uFFFC hello"
      const result = insertInlineTerminalContextPlaceholder("hello", 0);
      expect(result.prompt).toBe(`${INLINE_TERMINAL_CONTEXT_PLACEHOLDER} hello`);
      expect(result.contextIndex).toBe(0);
    });

    it("在已有空白后插入不加前导空格", () => {
      // prompt="abc def" cursor=4(空格后)
      // prompt[3]=' ' → boundary → needsLeadingSpace=false
      // replacement = "" + placeholder + " "
      const result = insertInlineTerminalContextPlaceholder("abc def", 4);
      // 应该是 "abc \uFFFC def" 而不是 "abc  \uFFFC def"(无重复空格)
      expect(result.prompt).toBe(`abc ${INLINE_TERMINAL_CONTEXT_PLACEHOLDER} def`);
    });

    it("cursor 越界被夹到合法范围", () => {
      const result = insertInlineTerminalContextPlaceholder("abc", 999);
      // cursor 会被夹到 3 (在末尾追加)
      expect(result.prompt).toContain("abc");
      // 不超过原 prompt.length + replacement.length
      expect(result.prompt.length).toBeLessThanOrEqual(20);
    });

    it("负数 cursor 视为 0", () => {
      const result = insertInlineTerminalContextPlaceholder("abc", -10);
      // cursor 0 时,prompt[-1] = undefined → 不加前导空格
      expect(result.prompt.startsWith(INLINE_TERMINAL_CONTEXT_PLACEHOLDER)).toBe(true);
    });

    it("在字母后插入时加前导空格", () => {
      const result = insertInlineTerminalContextPlaceholder("abc", 3);
      // prompt[2]='c' 不是 boundary → needsLeadingSpace = true
      expect(result.prompt).toContain(` ${INLINE_TERMINAL_CONTEXT_PLACEHOLDER} `);
    });
  });

  describe("removeInlineTerminalContextPlaceholder", () => {
    it("负数 index 不修改", () => {
      const result = removeInlineTerminalContextPlaceholder("hello", -1);
      expect(result.prompt).toBe("hello");
      expect(result.cursor).toBe(5);
    });

    it("移除指定索引的占位符", () => {
      // a(0) \uFFFC(1) b(2) \uFFFC(3) c(4)
      // 移除 contextIndex=1 → 第二个占位符(索引 3)
      const prompt = `a${INLINE_TERMINAL_CONTEXT_PLACEHOLDER}b${INLINE_TERMINAL_CONTEXT_PLACEHOLDER}c`;
      const result = removeInlineTerminalContextPlaceholder(prompt, 1);
      expect(result.prompt).toBe(`a${INLINE_TERMINAL_CONTEXT_PLACEHOLDER}bc`);
      expect(result.cursor).toBe(3);
    });

    it("移除 contextIndex=0(第一个占位符)", () => {
      const prompt = `a${INLINE_TERMINAL_CONTEXT_PLACEHOLDER}b${INLINE_TERMINAL_CONTEXT_PLACEHOLDER}c`;
      const result = removeInlineTerminalContextPlaceholder(prompt, 0);
      expect(result.prompt).toBe(`ab${INLINE_TERMINAL_CONTEXT_PLACEHOLDER}c`);
      expect(result.cursor).toBe(1);
    });

    it("超过范围的 index 不修改", () => {
      const prompt = `a${INLINE_TERMINAL_CONTEXT_PLACEHOLDER}b`;
      const result = removeInlineTerminalContextPlaceholder(prompt, 5);
      expect(result.prompt).toBe(prompt);
    });
  });

  describe("stripInlineTerminalContextPlaceholders", () => {
    it("移除所有占位符", () => {
      const result = stripInlineTerminalContextPlaceholders(
        `a${INLINE_TERMINAL_CONTEXT_PLACEHOLDER}b${INLINE_TERMINAL_CONTEXT_PLACEHOLDER}c`,
      );
      expect(result).toBe("abc");
    });
  });

  describe("materializeInlineTerminalContextPrompt", () => {
    it("替换占位符为 @label:N", () => {
      const prompt = `fix ${INLINE_TERMINAL_CONTEXT_PLACEHOLDER} bug`;
      const result = materializeInlineTerminalContextPrompt(prompt, [
        { terminalLabel: "bash", lineStart: 1, lineEnd: 1 },
      ]);
      expect(result).toBe("fix @bash:1 bug");
    });

    it("无 contexts 时占位符被静默移除", () => {
      const prompt = `a${INLINE_TERMINAL_CONTEXT_PLACEHOLDER}b`;
      const result = materializeInlineTerminalContextPrompt(prompt, []);
      expect(result).toBe("ab");
    });

    it("占位符少于 contexts 时多余 contexts 被忽略", () => {
      const prompt = `a${INLINE_TERMINAL_CONTEXT_PLACEHOLDER}b`;
      const result = materializeInlineTerminalContextPrompt(prompt, [
        { terminalLabel: "bash", lineStart: 1, lineEnd: 1 },
        { terminalLabel: "zsh", lineStart: 2, lineEnd: 5 },
      ]);
      expect(result).toBe("a@bash:1b");
    });
  });
});
