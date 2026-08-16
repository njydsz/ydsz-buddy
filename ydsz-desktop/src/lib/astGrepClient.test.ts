/**
 * @file astGrepClient 单元测试
 *
 * 覆盖：
 * 1. astGrepFindByNodeKind — 浏览器/WS 路径
 * 2. astGrepFindByNodeKind — Tauri 路径（含 TauriMatchResult → AstGrepMatch 映射）
 * 3. astGrepFindByQuery — 浏览器/WS 路径
 * 4. astGrepFindByName — calls / references 模式
 * 5. astGrepListPresets — 无 language 时返回所有
 * 6. compileAstGrepPattern — 浏览器/WS 路径
 * 7. astGrepRewrite — Tauri 路径
 * 8. searchAstGrep — 统一入口：pattern / node-kind / calls-to / references
 * 9. 空输入 → 返回空数组（不抛错）
 * 10. WS 不可用 → 抛出错误
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Hoist mocks
const {
  readNativeApiMock,
  astGrepFindByNodeKindMock,
  astGrepFindByQueryMock,
  astGrepFindByNameMock,
  astGrepListPresetsMock,
  astGrepCompilePatternMock,
  astGrepRewriteMock,
  tauriInvokeMock,
} = vi.hoisted(() => ({
  readNativeApiMock: vi.fn(),
  astGrepFindByNodeKindMock: vi.fn(),
  astGrepFindByQueryMock: vi.fn(),
  astGrepFindByNameMock: vi.fn(),
  astGrepListPresetsMock: vi.fn(),
  astGrepCompilePatternMock: vi.fn(),
  astGrepRewriteMock: vi.fn(),
  tauriInvokeMock: vi.fn(),
}));

vi.mock("../nativeApi", () => ({
  readNativeApi: () => readNativeApiMock(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => tauriInvokeMock(...args),
}));

import {
  astGrepFindByNodeKind,
  astGrepFindByQuery,
  astGrepFindByName,
  astGrepListPresets,
  compileAstGrepPattern,
  astGrepRewrite,
  searchAstGrep,
} from "./astGrepClient";

/** 标准 AstGrepMatch DTO */
const SAMPLE_MATCH = {
  file: "src/foo.ts",
  line: 12,
  column: 5,
  startByte: 100,
  endByte: 120,
  text: "console.log($MSG)",
  nodeKind: "call_expression",
  captures: [{ name: "MSG", text: "hello" }],
};

/** 原始 Tauri MatchResult（snake_case） */
const SAMPLE_TAURI_MATCH = {
  file: "src/foo.ts",
  line: 12,
  column: 5,
  start_byte: 100,
  end_byte: 120,
  text: "console.log($MSG)",
  node_kind: "call_expression",
  captures: { MSG: "hello" },
};

function setTauriAvailable() {
  // Tauri 运行时标记：window.__TAURI_INTERNALS__
  (globalThis as { window?: unknown }).window = globalThis.window ?? globalThis;
  (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {};
}

function clearTauriAvailable() {
  delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

function setWsApi(overrides: Partial<{
  astGrepFindByNodeKind: typeof astGrepFindByNodeKindMock;
  astGrepFindByQuery: typeof astGrepFindByQueryMock;
  astGrepFindByName: typeof astGrepFindByNameMock;
  astGrepListPresets: typeof astGrepListPresetsMock;
  astGrepCompilePattern: typeof astGrepCompilePatternMock;
  astGrepRewrite: typeof astGrepRewriteMock;
}> = {}) {
  readNativeApiMock.mockReturnValue({
    indexer: {
      astGrepFindByNodeKind: overrides.astGrepFindByNodeKind ?? astGrepFindByNodeKindMock,
      astGrepFindByQuery: overrides.astGrepFindByQuery ?? astGrepFindByQueryMock,
      astGrepFindByName: overrides.astGrepFindByName ?? astGrepFindByNameMock,
      astGrepListPresets: overrides.astGrepListPresets ?? astGrepListPresetsMock,
      astGrepCompilePattern: overrides.astGrepCompilePattern ?? astGrepCompilePatternMock,
      astGrepRewrite: overrides.astGrepRewrite ?? astGrepRewriteMock,
    },
  });
}

beforeEach(() => {
  // 默认：浏览器环境（无 Tauri）
  clearTauriAvailable();
  readNativeApiMock.mockReset();
  astGrepFindByNodeKindMock.mockReset();
  astGrepFindByQueryMock.mockReset();
  astGrepFindByNameMock.mockReset();
  astGrepListPresetsMock.mockReset();
  astGrepCompilePatternMock.mockReset();
  astGrepRewriteMock.mockReset();
  tauriInvokeMock.mockReset();
});

afterEach(() => {
  clearTauriAvailable();
});

describe("astGrepFindByNodeKind", () => {
  it("returns [] when workspaceRoot is empty", async () => {
    const result = await astGrepFindByNodeKind({ workspaceRoot: "", kind: "call_expression" });
    expect(result).toEqual([]);
    expect(readNativeApiMock).not.toHaveBeenCalled();
  });

  it("returns [] when kind is empty", async () => {
    const result = await astGrepFindByNodeKind({ workspaceRoot: "/ws", kind: "" });
    expect(result).toEqual([]);
    expect(readNativeApiMock).not.toHaveBeenCalled();
  });

  it("WS path: forwards to readNativeApi().indexer.astGrepFindByNodeKind", async () => {
    astGrepFindByNodeKindMock.mockResolvedValue([SAMPLE_MATCH]);
    setWsApi();

    const result = await astGrepFindByNodeKind({
      workspaceRoot: "/ws",
      kind: "call_expression",
    });

    expect(result).toEqual([SAMPLE_MATCH]);
    expect(astGrepFindByNodeKindMock).toHaveBeenCalledWith({
      workspaceRoot: "/ws",
      kind: "call_expression",
    });
  });

  it("Tauri path: invokes indexer_ast_grep_search with mode=node_kind and maps result", async () => {
    setTauriAvailable();
    tauriInvokeMock.mockResolvedValue([SAMPLE_TAURI_MATCH]);

    const result = await astGrepFindByNodeKind({
      workspaceRoot: "/ws",
      kind: "call_expression",
    });

    expect(tauriInvokeMock).toHaveBeenCalledWith("indexer_ast_grep_search", {
      request: { workspaceRoot: "/ws", mode: "node_kind", kind: "call_expression" },
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      file: "src/foo.ts",
      line: 12,
      nodeKind: "call_expression",
      captures: [{ name: "MSG", text: "hello" }],
    });
  });
});

describe("astGrepFindByQuery", () => {
  it("WS path: forwards to WS client", async () => {
    astGrepFindByQueryMock.mockResolvedValue([SAMPLE_MATCH]);
    setWsApi();

    const result = await astGrepFindByQuery({
      workspaceRoot: "/ws",
      language: "typescript",
      query: "(call_expression)",
    });

    expect(astGrepFindByQueryMock).toHaveBeenCalled();
    expect(result).toEqual([SAMPLE_MATCH]);
  });

  it("returns [] when query is empty", async () => {
    const result = await astGrepFindByQuery({
      workspaceRoot: "/ws",
      language: "typescript",
      query: "",
    });
    expect(result).toEqual([]);
  });
});

describe("astGrepFindByName", () => {
  it("WS path: defaults to mode=calls", async () => {
    astGrepFindByNameMock.mockResolvedValue([SAMPLE_MATCH]);
    setWsApi();

    await astGrepFindByName({ workspaceRoot: "/ws", name: "console.log" });

    expect(astGrepFindByNameMock).toHaveBeenCalledWith({
      workspaceRoot: "/ws",
      name: "console.log",
      mode: "calls",
    });
  });

  it("WS path: passes mode=references through", async () => {
    astGrepFindByNameMock.mockResolvedValue([SAMPLE_MATCH]);
    setWsApi();

    await astGrepFindByName({ workspaceRoot: "/ws", name: "foo", mode: "references" });

    expect(astGrepFindByNameMock).toHaveBeenCalledWith({
      workspaceRoot: "/ws",
      name: "foo",
      mode: "references",
    });
  });

  it("Tauri path: mode=calls maps to mode=calls_to", async () => {
    setTauriAvailable();
    tauriInvokeMock.mockResolvedValue([SAMPLE_TAURI_MATCH]);

    await astGrepFindByName({ workspaceRoot: "/ws", name: "console.log" });

    expect(tauriInvokeMock).toHaveBeenCalledWith("indexer_ast_grep_search", {
      request: { workspaceRoot: "/ws", mode: "calls_to", name: "console.log" },
    });
  });
});

describe("astGrepListPresets", () => {
  it("WS path: no language → empty input", async () => {
    astGrepListPresetsMock.mockResolvedValue([]);
    setWsApi();

    await astGrepListPresets();

    expect(astGrepListPresetsMock).toHaveBeenCalledWith({});
  });

  it("WS path: language passed through", async () => {
    astGrepListPresetsMock.mockResolvedValue([]);
    setWsApi();

    await astGrepListPresets({ language: "rust" });

    expect(astGrepListPresetsMock).toHaveBeenCalledWith({ language: "rust" });
  });
});

describe("compileAstGrepPattern", () => {
  it("WS path: forwards to indexer.astGrepCompilePattern", async () => {
    astGrepCompilePatternMock.mockResolvedValue({
      query: "(call_expression)",
      captures: ["MSG"],
    });
    setWsApi();

    const result = await compileAstGrepPattern({
      language: "typescript",
      pattern: "console.log($MSG)",
    });

    expect(astGrepCompilePatternMock).toHaveBeenCalledWith({
      language: "typescript",
      pattern: "console.log($MSG)",
    });
    expect(result).toEqual({ query: "(call_expression)", captures: ["MSG"] });
  });

  it("Tauri path: invokes indexer_ast_grep_compile and maps s_expression→query", async () => {
    setTauriAvailable();
    tauriInvokeMock.mockResolvedValue({
      s_expression: "(call_expression)",
      captures: ["MSG"],
    });

    const result = await compileAstGrepPattern({
      language: "typescript",
      pattern: "console.log($MSG)",
    });

    expect(tauriInvokeMock).toHaveBeenCalledWith("indexer_ast_grep_compile", {
      pattern: "console.log($MSG)",
      language: "typescript",
    });
    expect(result).toEqual({ query: "(call_expression)", captures: ["MSG"] });
  });

  it("returns empty result when pattern is empty", async () => {
    const result = await compileAstGrepPattern({
      language: "typescript",
      pattern: "",
    });
    expect(result).toEqual({ query: "", captures: [] });
    expect(tauriInvokeMock).not.toHaveBeenCalled();
  });
});

describe("astGrepRewrite", () => {
  it("WS path: forwards to indexer.astGrepRewrite", async () => {
    astGrepRewriteMock.mockResolvedValue({
      newContent: "rewritten",
      replacements: 2,
      matchLocations: [],
    });
    setWsApi();

    const result = await astGrepRewrite({
      filePath: "src/foo.ts",
      language: "typescript",
      pattern: "console.log($MSG)",
      rewrite: "logger.info($MSG)",
    });

    expect(astGrepRewriteMock).toHaveBeenCalled();
    expect(result.replacements).toBe(2);
  });

  it("Tauri path: invokes indexer_ast_grep_rewrite and maps snake_case fields", async () => {
    setTauriAvailable();
    tauriInvokeMock.mockResolvedValue({
      new_content: "rewritten",
      replacements: 1,
      match_locations: [{ file: "src/foo.ts", line: 12, column: 5 }],
    });

    const result = await astGrepRewrite({
      filePath: "src/foo.ts",
      language: "typescript",
      pattern: "console.log($MSG)",
      rewrite: "logger.info($MSG)",
    });

    expect(tauriInvokeMock).toHaveBeenCalledWith("indexer_ast_grep_rewrite", {
      filePath: "src/foo.ts",
      pattern: "console.log($MSG)",
      rewrite: "logger.info($MSG)",
      language: "typescript",
    });
    expect(result).toEqual({
      newContent: "rewritten",
      replacements: 1,
      matchLocations: [{ file: "src/foo.ts", line: 12, column: 5 }],
    });
  });
});

describe("searchAstGrep (unified entry)", () => {
  it("mode=node-kind delegates to astGrepFindByNodeKind", async () => {
    astGrepFindByNodeKindMock.mockResolvedValue([SAMPLE_MATCH]);
    setWsApi();

    const result = await searchAstGrep({
      workspaceRoot: "/ws",
      mode: "node-kind",
      query: "call_expression",
    });

    expect(astGrepFindByNodeKindMock).toHaveBeenCalledWith({
      workspaceRoot: "/ws",
      kind: "call_expression",
    });
    expect(result).toEqual([SAMPLE_MATCH]);
  });

  it("mode=calls-to delegates to astGrepFindByName with calls", async () => {
    astGrepFindByNameMock.mockResolvedValue([SAMPLE_MATCH]);
    setWsApi();

    await searchAstGrep({
      workspaceRoot: "/ws",
      mode: "calls-to",
      query: "console.log",
    });

    expect(astGrepFindByNameMock).toHaveBeenCalledWith({
      workspaceRoot: "/ws",
      name: "console.log",
      mode: "calls",
    });
  });

  it("mode=references delegates to astGrepFindByName with references", async () => {
    astGrepFindByNameMock.mockResolvedValue([SAMPLE_MATCH]);
    setWsApi();

    await searchAstGrep({
      workspaceRoot: "/ws",
      mode: "references",
      query: "foo",
    });

    expect(astGrepFindByNameMock).toHaveBeenCalledWith({
      workspaceRoot: "/ws",
      name: "foo",
      mode: "references",
    });
  });

  it("mode=pattern: compile + findByQuery", async () => {
    astGrepCompilePatternMock.mockResolvedValue({
      query: "(call_expression)",
      captures: [],
    });
    astGrepFindByQueryMock.mockResolvedValue([SAMPLE_MATCH]);
    setWsApi();

    const result = await searchAstGrep({
      workspaceRoot: "/ws",
      mode: "pattern",
      query: "console.log($MSG)",
    });

    expect(astGrepCompilePatternMock).toHaveBeenCalledWith({
      language: "typescript",
      pattern: "console.log($MSG)",
    });
    expect(astGrepFindByQueryMock).toHaveBeenCalledWith({
      workspaceRoot: "/ws",
      language: "typescript",
      query: "(call_expression)",
    });
    expect(result).toEqual([SAMPLE_MATCH]);
  });

  it("returns [] when query is empty", async () => {
    setWsApi();
    const result = await searchAstGrep({ workspaceRoot: "/ws", mode: "pattern", query: "" });
    expect(result).toEqual([]);
    expect(astGrepFindByNodeKindMock).not.toHaveBeenCalled();
  });

  it("returns [] when workspaceRoot is empty", async () => {
    setWsApi();
    const result = await searchAstGrep({ workspaceRoot: "", mode: "pattern", query: "x" });
    expect(result).toEqual([]);
  });
});

describe("error handling", () => {
  it("throws when WS path has no indexer namespace", async () => {
    readNativeApiMock.mockReturnValue({}); // 无 indexer
    await expect(
      astGrepFindByNodeKind({ workspaceRoot: "/ws", kind: "call_expression" }),
    ).rejects.toThrow(/astGrepFindByNodeKind/);
  });

  it("throws when WS path missing for compile", async () => {
    readNativeApiMock.mockReturnValue({ indexer: {} });
    await expect(
      compileAstGrepPattern({ language: "typescript", pattern: "x" }),
    ).rejects.toThrow(/astGrepCompilePattern/);
  });
});
