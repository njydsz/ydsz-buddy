/**
 * @file composerMentions 单元测试
 *
 * 覆盖编辑器提及解析与格式化工具:
 *
 * 1. createComposerMentionTokenRegex - 提及标记正则
 * 2. extractComposerMentionPath - 从匹配中提取路径
 * 3. formatComposerMentionToken - 格式化提及标记
 * 4. getComposerMentionType - 触发字符串 → 类型
 * 5. listComposerMentionTypes - 列出所有类型
 * 6. searchCodebase - 搜索合并(双 Tauri 命令并行 + 降级)
 * 7. searchCodebaseDebounced - 300ms 防抖
 * 8. searchWiki - Wiki 搜索 + 异常降级
 * 9. searchWikiDebounced - 300ms 防抖
 * 10. pickOfficeDocument - 文件选择对话框
 * 11. pickAndExtractOfficeDocument - 选择 + 提取(3 种 kind)
 * 12. buildComposerMentionContext - 上下文包装
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// mock @tauri-apps/api/core
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// mock @tauri-apps/plugin-dialog
const mockOpen = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => mockOpen(...args),
}));

// mock astGrepClient（composerMentions 的 searchAstGrep 通过它调用）
const searchAstGrepClientMock = vi.fn();
vi.mock("./astGrepClient", () => ({
  searchAstGrep: (...args: unknown[]) => searchAstGrepClientMock(...args),
}));

import {
  buildComposerMentionContext,
  createComposerMentionTokenRegex,
  extractComposerMentionPath,
  formatComposerMentionToken,
  getComposerMentionType,
  listComposerMentionTypes,
  parseAstGrepQuery,
  pickAndExtractOfficeDocument,
  pickOfficeDocument,
  searchAstGrep,
  searchAstGrepDebounced,
  searchCodebase,
  searchCodebaseDebounced,
  searchWiki,
  searchWikiDebounced,
  type ComposerMentionItem,
} from "./composerMentions";

describe("composerMentions", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockOpen.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("createComposerMentionTokenRegex", () => {
    it("匹配简单 @path 提及", () => {
      const regex = createComposerMentionTokenRegex({ includeTrailingTokenAtEnd: true });
      const matches = [...("hello @src/foo.ts world".matchAll(regex))];
      expect(matches).toHaveLength(1);
      expect(matches[0][0]).toContain("@src/foo.ts");
    });

    it("匹配带引号 @\"path with spaces\" 提及", () => {
      const regex = createComposerMentionTokenRegex({ includeTrailingTokenAtEnd: true });
      const matches = [...('see @"my file.ts" please'.matchAll(regex))];
      expect(matches).toHaveLength(1);
      expect(matches[0][0]).toContain('@"my file.ts"');
    });

    it("字符串末尾的 @path 在 includeTrailingTokenAtEnd=true 时匹配", () => {
      const regex = createComposerMentionTokenRegex({ includeTrailingTokenAtEnd: true });
      const matches = [...("trailing @src/foo".matchAll(regex))];
      expect(matches).toHaveLength(1);
    });

    it("字符串末尾的 @path 在 includeTrailingTokenAtEnd=false 时不匹配", () => {
      const regex = createComposerMentionTokenRegex({ includeTrailingTokenAtEnd: false });
      const matches = [...("trailing @src/foo".matchAll(regex))];
      expect(matches).toHaveLength(0);
    });

    it("不匹配 @-@ 连续", () => {
      const regex = createComposerMentionTokenRegex({ includeTrailingTokenAtEnd: true });
      const matches = [...("weird @-@x".matchAll(regex))];
      expect(matches).toHaveLength(0);
    });

    it("global: false 时 regex 不带 g flag", () => {
      const regex = createComposerMentionTokenRegex({
        includeTrailingTokenAtEnd: true,
        global: false,
      });
      expect(regex.global).toBe(false);
    });

    it("默认 global 为 true", () => {
      const regex = createComposerMentionTokenRegex({ includeTrailingTokenAtEnd: true });
      expect(regex.global).toBe(true);
    });
  });

  describe("extractComposerMentionPath", () => {
    it("从引号路径提取", () => {
      const regex = createComposerMentionTokenRegex({ includeTrailingTokenAtEnd: true });
      const match = [...('see @"path/file.txt" end'.matchAll(regex))][0];
      const path = extractComposerMentionPath(match);
      expect(path).toBe("path/file.txt");
    });

    it("从无引号路径提取", () => {
      const regex = createComposerMentionTokenRegex({ includeTrailingTokenAtEnd: true });
      const match = [...("see @src/foo.ts end".matchAll(regex))][0];
      const path = extractComposerMentionPath(match);
      expect(path).toBe("src/foo.ts");
    });

    it("无匹配时返回空字符串", () => {
      const fakeMatch = [""] as unknown as RegExpMatchArray;
      expect(extractComposerMentionPath(fakeMatch)).toBe("");
    });
  });

  describe("formatComposerMentionToken", () => {
    it("无空格路径不加引号", () => {
      expect(formatComposerMentionToken("src/foo.ts")).toBe("@src/foo.ts");
    });

    it("含空格路径加双引号", () => {
      expect(formatComposerMentionToken("my file.txt")).toBe('@"my file.txt"');
    });

    it("已带 @ 前缀的路径去重", () => {
      expect(formatComposerMentionToken("@src/foo.ts")).toBe("@src/foo.ts");
      expect(formatComposerMentionToken("@my file.txt")).toBe('@"my file.txt"');
    });
  });

  describe("getComposerMentionType", () => {
    it("@codebase 返回对应类型", () => {
      const type = getComposerMentionType("@codebase");
      expect(type).not.toBeNull();
      expect(type!.label).toBe("Codebase");
      expect(type!.searchable).toBe(true);
      expect(type!.picksFile).toBe(false);
    });

    it("@docx 是文件选择型", () => {
      const type = getComposerMentionType("@docx");
      expect(type!.picksFile).toBe(true);
      expect(type!.searchable).toBe(false);
    });

    it("@office 是 Skill", () => {
      const type = getComposerMentionType("@office");
      expect(type!.isSkill).toBe(true);
    });

    it("未知 trigger 返回 null", () => {
      expect(getComposerMentionType("@unknown")).toBeNull();
      expect(getComposerMentionType("codebase")).toBeNull();
    });
  });

  describe("listComposerMentionTypes", () => {
    it("返回所有 14 种类型(含 ast-grep + search)", () => {
      const types = listComposerMentionTypes();
      expect(types).toHaveLength(14);
      const labels = types.map((t) => t.label);
      expect(labels).toContain("Codebase");
      expect(labels).toContain("Word Document");
      expect(labels).toContain("Excel Spreadsheet");
      expect(labels).toContain("PDF Document");
      expect(labels).toContain("Wiki");
      expect(labels).toContain("AST-Grep");
      expect(labels).toContain("Search");
    });
  });

  describe("searchCodebase", () => {
    it("空 query 返回空数组", async () => {
      const result = await searchCodebase("");
      expect(result).toEqual([]);
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("空白 query 返回空数组", async () => {
      const result = await searchCodebase("   ");
      expect(result).toEqual([]);
    });

    it("符号 + 文本结果合并,符号优先", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "indexer_search_symbols") {
          return [
            { name: "foo", kind: "function", file: "foo.ts", line: 10, column: 1 },
          ];
        }
        if (cmd === "indexer_search_text") {
          return [
            {
              file: "bar.ts",
              line: 20,
              column: 1,
              text: "foo bar baz",
              context: "ctx",
            },
          ];
        }
        return [];
      });
      const result = await searchCodebase("foo");
      expect(result).toHaveLength(2);
      expect(result[0].label).toBe("foo");
      expect(result[0].kind).toBe("codebase");
      expect(result[1].label).toBe("foo bar baz");
    });

    it("符号失败时降级到文本结果", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "indexer_search_symbols") {
          throw new Error("indexer error");
        }
        if (cmd === "indexer_search_text") {
          return [
            {
              file: "bar.ts",
              line: 20,
              column: 1,
              text: "foo",
              context: "ctx",
            },
          ];
        }
        return [];
      });
      const result = await searchCodebase("foo");
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("foo");
    });

    it("文本失败时仅返回符号", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "indexer_search_symbols") {
          return [
            { name: "foo", kind: "function", file: "foo.ts", line: 10, column: 1 },
          ];
        }
        throw new Error("text search error");
      });
      const result = await searchCodebase("foo");
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("foo");
    });

    it("结果超过 20 时被截断", async () => {
      const symbols = Array.from({ length: 30 }, (_, i) => ({
        name: `sym${i}`,
        kind: "function",
        file: `sym${i}.ts`,
        line: i + 1,
        column: 1,
      }));
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "indexer_search_symbols") return symbols;
        return [];
      });
      const result = await searchCodebase("sym");
      expect(result).toHaveLength(20);
    });

    it("长文本结果(>80 字符)被截断显示", async () => {
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === "indexer_search_symbols") return [];
        if (cmd === "indexer_search_text") {
          return [
            {
              file: "long.ts",
              line: 1,
              column: 1,
              text: "a".repeat(100),
              context: "ctx",
            },
          ];
        }
        return [];
      });
      const result = await searchCodebase("a");
      expect(result[0].label.length).toBeLessThanOrEqual(81);
      expect(result[0].label.endsWith("…")).toBe(true);
    });
  });

  describe("searchCodebaseDebounced", () => {
    it("300ms 内重复调用只执行最后一次", async () => {
      vi.useFakeTimers();
      mockInvoke.mockResolvedValue([]);

      // 第一次:清掉初始 timer
      searchCodebaseDebounced("first");
      // 第二次:清掉 first 的 timer,建立 second 的
      searchCodebaseDebounced("second");
      // 第三次:清掉 second 的 timer,建立 third 的
      const lastPromise = searchCodebaseDebounced("third");

      // 推进 300ms,执行 lastPromise
      await vi.advanceTimersByTimeAsync(300);
      const result = await lastPromise;
      expect(result).toEqual([]);
      // 只触发了一次 searchCodebase 内部 invoke
      expect(mockInvoke).toHaveBeenCalledTimes(2);
    });
  });

  describe("searchWiki", () => {
    it("空 query 返回空数组", async () => {
      const result = await searchWiki("");
      expect(result).toEqual([]);
    });

    it("成功返回 wiki 条目", async () => {
      mockInvoke.mockResolvedValue({
        count: 1,
        entries: [
          {
            module: "auth",
            title: "Login Flow",
            content: "content",
            symbols: ["login", "logout"],
            updated_at: "2026-06-24T00:00:00.000Z",
          },
        ],
      });
      const result = await searchWiki("login");
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("Login Flow");
      expect(result[0].kind).toBe("wiki");
    });

    it("invoke 失败时降级返回空数组", async () => {
      mockInvoke.mockRejectedValue(new Error("network"));
      const result = await searchWiki("login");
      expect(result).toEqual([]);
    });

    it("symbols 超过 10 个时显示省略信息", async () => {
      const symbols = Array.from({ length: 15 }, (_, i) => `sym${i}`);
      mockInvoke.mockResolvedValue({
        count: 1,
        entries: [
          { module: "mod", title: "T", content: "C", symbols, updated_at: "2026-06-24" },
        ],
      });
      const result = await searchWiki("T");
      expect(result[0].context).toContain("等 15 个符号");
    });
  });

  describe("searchWikiDebounced", () => {
    it("300ms 防抖", async () => {
      vi.useFakeTimers();
      mockInvoke.mockResolvedValue({ count: 0, entries: [] });

      const p = searchWikiDebounced("query");
      await vi.advanceTimersByTimeAsync(300);
      const r = await p;
      expect(r).toEqual([]);
    });
  });

  describe("parseAstGrepQuery", () => {
    it("kind: 前缀 → node-kind 模式", () => {
      expect(parseAstGrepQuery("kind:call_expression")).toEqual({
        mode: "node-kind",
        query: "call_expression",
      });
    });

    it("refs/ref: 前缀 → references 模式", () => {
      expect(parseAstGrepQuery("refs:foo")).toEqual({
        mode: "references",
        query: "foo",
      });
      expect(parseAstGrepQuery("ref:obj.foo")).toEqual({
        mode: "references",
        query: "obj.foo",
      });
    });

    it("含括号/空格/$ → pattern 模式", () => {
      expect(parseAstGrepQuery("console.log($MSG)")).toEqual({
        mode: "pattern",
        query: "console.log($MSG)",
      });
      expect(parseAstGrepQuery("foo bar")).toEqual({
        mode: "pattern",
        query: "foo bar",
      });
    });

    it("纯标识符 → calls-to 模式", () => {
      expect(parseAstGrepQuery("console.log")).toEqual({
        mode: "calls-to",
        query: "console.log",
      });
    });

    it("空字符串 → empty query (caller 应直接跳过)", () => {
      const result = parseAstGrepQuery("");
      expect(result.query).toBe("");
    });
  });

  describe("searchAstGrep", () => {
    beforeEach(() => {
      searchAstGrepClientMock.mockReset();
    });

    it("空 query / 缺 root → 返回空数组", async () => {
      expect(await searchAstGrep("")).toEqual([]);
      expect(await searchAstGrep("query", "")).toEqual([]);
      // 调用了 mock 是因为 root 缺省时直接 return，不应调用 client
      expect(searchAstGrepClientMock).not.toHaveBeenCalled();
    });

    it("kind: 前缀 → 调用 client.mode=node-kind", async () => {
      searchAstGrepClientMock.mockResolvedValue([
        {
          file: "src/foo.ts",
          line: 12,
          column: 5,
          startByte: 0,
          endByte: 0,
          text: "call_expression",
          nodeKind: "call_expression",
          captures: [],
        },
      ]);
      const items = await searchAstGrep("kind:call_expression", "/ws");
      expect(searchAstGrepClientMock).toHaveBeenCalledWith({
        workspaceRoot: "/ws",
        mode: "node-kind",
        query: "call_expression",
      });
      expect(items).toHaveLength(1);
      expect(items[0].kind).toBe("ast-grep");
      expect(items[0].file).toBe("src/foo.ts");
    });

    it("纯标识符 → 调用 client.mode=calls-to", async () => {
      searchAstGrepClientMock.mockResolvedValue([]);
      await searchAstGrep("console.log", "/ws");
      expect(searchAstGrepClientMock).toHaveBeenCalledWith({
        workspaceRoot: "/ws",
        mode: "calls-to",
        query: "console.log",
      });
    });

    it("模式语法 → 调用 client.mode=pattern", async () => {
      searchAstGrepClientMock.mockResolvedValue([]);
      await searchAstGrep("console.log($MSG)", "/ws");
      expect(searchAstGrepClientMock).toHaveBeenCalledWith({
        workspaceRoot: "/ws",
        mode: "pattern",
        query: "console.log($MSG)",
      });
    });

    it("client 抛错 → 降级返回空数组", async () => {
      searchAstGrepClientMock.mockRejectedValue(new Error("rpc fail"));
      const items = await searchAstGrep("foo", "/ws");
      expect(items).toEqual([]);
    });

    it("context 包含节点类型/查询/源码", async () => {
      searchAstGrepClientMock.mockResolvedValue([
        {
          file: "src/foo.ts",
          line: 12,
          column: 5,
          startByte: 0,
          endByte: 0,
          text: "console.log($MSG)",
          nodeKind: "call_expression",
          captures: [],
        },
      ]);
      const items = await searchAstGrep("console.log($MSG)", "/ws");
      expect(items[0].context).toContain("@ast-grep 命中");
      expect(items[0].context).toContain("call_expression");
      expect(items[0].context).toContain("console.log($MSG)");
    });

    it("截断到 30 条", async () => {
      const many = Array.from({ length: 50 }, (_, i) => ({
        file: `f-${i}.ts`,
        line: i,
        column: 0,
        startByte: 0,
        endByte: 0,
        text: `match ${i}`,
        nodeKind: "call_expression",
        captures: [],
      }));
      searchAstGrepClientMock.mockResolvedValue(many);
      const items = await searchAstGrep("foo", "/ws");
      expect(items.length).toBe(30);
    });
  });

  describe("searchAstGrepDebounced", () => {
    beforeEach(() => {
      searchAstGrepClientMock.mockReset();
    });

    it("300ms 防抖", async () => {
      vi.useFakeTimers();
      searchAstGrepClientMock.mockResolvedValue([]);

      const p = searchAstGrepDebounced("foo", "/ws");
      // 200ms 内不应调用
      await vi.advanceTimersByTimeAsync(200);
      expect(searchAstGrepClientMock).not.toHaveBeenCalled();
      // 累计到 300ms
      await vi.advanceTimersByTimeAsync(100);
      const r = await p;
      expect(searchAstGrepClientMock).toHaveBeenCalledTimes(1);
      expect(r).toEqual([]);
    });
  });

  describe("@ast-grep mention type registration", () => {
    it("@ast-grep 触发字符串映射到 ast-grep 类型", () => {
      const t = getComposerMentionType("@ast-grep");
      expect(t).toMatchObject({
        trigger: "@ast-grep",
        label: "AST-Grep",
        searchable: true,
        picksFile: false,
        isSkill: false,
      });
    });

    it("listComposerMentionTypes 包含 ast-grep", () => {
      const types = listComposerMentionTypes();
      const triggers = types.map((t) => t.trigger);
      expect(triggers).toContain("@ast-grep");
    });
  });

  describe("pickOfficeDocument", () => {
    it("用户选择文件时返回路径", async () => {
      mockOpen.mockResolvedValue("/path/to/file.docx");
      const result = await pickOfficeDocument("docx");
      expect(result).toBe("/path/to/file.docx");
      expect(mockOpen).toHaveBeenCalledWith(
        expect.objectContaining({
          multiple: false,
          directory: false,
          filters: [{ name: "DOCX", extensions: ["docx"] }],
        }),
      );
    });

    it("用户取消(返回 null)时返回 null", async () => {
      mockOpen.mockResolvedValue(null);
      const result = await pickOfficeDocument("docx");
      expect(result).toBeNull();
    });

    it("返回数组时取第一个元素", async () => {
      mockOpen.mockResolvedValue(["/path/to/a.docx", "/path/to/b.docx"]);
      const result = await pickOfficeDocument("docx");
      expect(result).toBe("/path/to/a.docx");
    });

    it("空数组返回 null", async () => {
      mockOpen.mockResolvedValue([]);
      const result = await pickOfficeDocument("xlsx");
      expect(result).toBeNull();
    });

    it("不同 kind 使用不同扩展名", async () => {
      mockOpen.mockResolvedValue(null);
      await pickOfficeDocument("xlsx");
      expect(mockOpen).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filters: [{ name: "XLSX", extensions: ["xlsx"] }],
        }),
      );
      await pickOfficeDocument("pdf");
      expect(mockOpen).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filters: [{ name: "PDF", extensions: ["pdf"] }],
        }),
      );
    });
  });

  describe("pickAndExtractOfficeDocument", () => {
    it("用户取消时返回 null", async () => {
      mockOpen.mockResolvedValue(null);
      const result = await pickAndExtractOfficeDocument("docx");
      expect(result).toBeNull();
    });

    it("docx: 提取段落并构建提及项", async () => {
      mockOpen.mockResolvedValue("/path/to/file.docx");
      mockInvoke.mockResolvedValue(["para1", "para2", "para3"]);
      const result = await pickAndExtractOfficeDocument("docx");
      expect(result).not.toBeNull();
      expect(result!.kind).toBe("docx");
      expect(result!.label).toBe("file");
      expect(result!.description).toContain("3 段");
      expect(result!.context).toContain("para1");
      expect(result!.context).toContain("para2");
    });

    it("xlsx: 转换为 Markdown 表格", async () => {
      mockOpen.mockResolvedValue("/path/to/data.xlsx");
      mockInvoke.mockResolvedValue([
        { sheetName: "Sheet1", rows: [["a", "b"], ["c", "d"]] },
      ]);
      const result = await pickAndExtractOfficeDocument("xlsx");
      expect(result!.kind).toBe("xlsx");
      expect(result!.description).toContain("1 sheet");
      expect(result!.context).toContain("### Sheet: Sheet1");
      expect(result!.context).toContain("| a | b |");
    });

    it("xlsx: 单元格包含 | 时需要转义", async () => {
      mockOpen.mockResolvedValue("/path/to/data.xlsx");
      mockInvoke.mockResolvedValue([
        { sheetName: "S", rows: [["a|b", "c"]] },
      ]);
      const result = await pickAndExtractOfficeDocument("xlsx");
      expect(result!.context).toContain("a\\|b");
    });

    it("pdf: 提取全文并截断", async () => {
      mockOpen.mockResolvedValue("/path/to/file.pdf");
      mockInvoke.mockResolvedValue("PDF content here");
      const result = await pickAndExtractOfficeDocument("pdf");
      expect(result!.kind).toBe("pdf");
      expect(result!.description).toContain("16 字符");
      expect(result!.context).toContain("PDF content here");
    });

    it("docx 超长内容被截断", async () => {
      mockOpen.mockResolvedValue("/path/to/big.docx");
      const paragraphs = Array.from({ length: 1000 }, (_, i) => "a".repeat(50));
      mockInvoke.mockResolvedValue(paragraphs);
      const result = await pickAndExtractOfficeDocument("docx");
      expect(result!.context).toContain("已截断");
    });
  });

  describe("buildComposerMentionContext", () => {
    it("用代码块包裹 context", () => {
      const item: ComposerMentionItem = {
        id: "test",
        kind: "codebase",
        label: "label",
        description: "desc",
        context: "raw text",
      };
      const result = buildComposerMentionContext(item);
      expect(result).toBe("\n```\nraw text\n```\n");
    });
  });
});
