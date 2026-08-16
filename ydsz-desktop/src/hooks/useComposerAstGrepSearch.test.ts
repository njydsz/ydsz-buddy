/**
 * @file useComposerAstGrepSearch 单元测试
 *
 * 覆盖：
 * 1. trigger 为 null → items 为空数组
 * 2. mention 触发器但非 @ast-grep → items 为空数组
 * 3. mention 触发器 = @ast-grep 但无 workspaceRoot → 返回 hint:no-root
 * 4. mention 触发器 = @ast-grep 且有 root,但 query 为空 → 返回 hint:empty-query
 * 5. mention 触发器 = @ast-grep<query> → 触发 searchAstGrep,结果映射为 ast-grep-result
 * 6. mention 触发器 = @ast-grep kind:<node_kind> → 走 node-kind 模式
 * 7. 后端调用失败 → 返回 empty:error
 * 8. 防抖:cancel 后不调用
 * 9. 超过 AST_GREP_RESULT_LIMIT → 截断
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ComposerTrigger } from "../composer-logic";

// Mock astGrepClient.searchAstGrep（hook 内部唯一调用）
const searchAstGrepMock = vi.fn();
vi.mock("../lib/astGrepClient", () => ({
  searchAstGrep: (...args: unknown[]) => searchAstGrepMock(...args),
}));

const { useComposerAstGrepSearch } = await import("./useComposerAstGrepSearch");

function makeTrigger(query: string): ComposerTrigger {
  return { kind: "mention", query };
}

/** AstGrepMatch DTO 示例（与 contracts/astGrep.ts 一致） */
const SAMPLE_MATCHES = [
  {
    file: "src/foo.ts",
    line: 12,
    column: 5,
    startByte: 100,
    endByte: 120,
    text: "console.log($MSG)",
    nodeKind: "call_expression",
    captures: [],
  },
  {
    file: "src/bar.ts",
    line: 45,
    column: 1,
    startByte: 200,
    endByte: 220,
    text: 'console.log("hello")',
    nodeKind: "call_expression",
    captures: [],
  },
];

beforeEach(() => {
  searchAstGrepMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useComposerAstGrepSearch", () => {
  it("returns empty array when trigger is null", () => {
    const { result } = renderHook(() =>
      useComposerAstGrepSearch(null, "/workspace"),
    );
    expect(result.current.items).toEqual([]);
    expect(searchAstGrepMock).not.toHaveBeenCalled();
  });

  it("returns empty array when mention is not @ast-grep", () => {
    const trigger = makeTrigger("wiki");
    const { result } = renderHook(() => useComposerAstGrepSearch(trigger, "/workspace"));
    expect(result.current.items).toEqual([]);
    expect(searchAstGrepMock).not.toHaveBeenCalled();
  });

  it("returns no-root hint when mention is @ast-grep but root is empty", () => {
    const trigger = makeTrigger("ast-grep");
    const { result } = renderHook(() => useComposerAstGrepSearch(trigger, null));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.type).toBe("ast-grep-hint");
    expect(result.current.items[0]?.id).toBe("ast-grep-hint:no-root");
  });

  it("returns empty-query hint when @ast-grep is typed but no query follows", () => {
    const trigger = makeTrigger("ast-grep");
    const { result } = renderHook(() => useComposerAstGrepSearch(trigger, "/workspace"));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.type).toBe("ast-grep-hint");
    expect(result.current.items[0]?.id).toBe("ast-grep-hint:empty-query");
    expect(searchAstGrepMock).not.toHaveBeenCalled();
  });

  it("does not match @ast-grep as prefix of a longer alias (e.g. ast-greppy)", () => {
    const trigger = makeTrigger("ast-greppy");
    const { result } = renderHook(() => useComposerAstGrepSearch(trigger, "/workspace"));
    expect(result.current.items).toEqual([]);
    expect(searchAstGrepMock).not.toHaveBeenCalled();
  });

  it("invokes searchAstGrep with pattern mode after debounce", async () => {
    vi.useFakeTimers();
    searchAstGrepMock.mockResolvedValue(SAMPLE_MATCHES);

    const trigger = makeTrigger("ast-grep console.log($MSG)");
    const { result } = renderHook(() => useComposerAstGrepSearch(trigger, "/workspace"));

    // 触发 query 非空后立即进入 loading 状态(debounce 等待中)
    expect(result.current.items[0]?.type).toBe("ast-grep-hint");
    expect(result.current.items[0]?.id).toBe("ast-grep-hint:loading");
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // After debounce
    expect(searchAstGrepMock).toHaveBeenCalledTimes(1);
    const [input] = searchAstGrepMock.mock.calls[0]!;
    expect(input).toMatchObject({
      workspaceRoot: "/workspace",
      mode: "pattern",
      query: "console.log($MSG)",
    });

    // result.items should be ast-grep-result list
    expect(result.current.items.length).toBe(2);
    expect(result.current.items[0]?.type).toBe("ast-grep-result");
    expect(result.current.isLoading).toBe(false);
  });

  it("invokes searchAstGrep with node-kind mode when query uses kind: prefix", async () => {
    vi.useFakeTimers();
    searchAstGrepMock.mockResolvedValue(SAMPLE_MATCHES);

    const trigger = makeTrigger("ast-grep kind:call_expression");
    const { result } = renderHook(() => useComposerAstGrepSearch(trigger, "/workspace"));

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(searchAstGrepMock).toHaveBeenCalledTimes(1);
    const [input] = searchAstGrepMock.mock.calls[0]!;
    expect(input).toMatchObject({
      workspaceRoot: "/workspace",
      mode: "node-kind",
      query: "call_expression",
    });
    expect(result.current.items[0]?.type).toBe("ast-grep-result");
  });

  it("returns empty:error when backend throws", async () => {
    vi.useFakeTimers();
    searchAstGrepMock.mockRejectedValue(new Error("network"));

    const trigger = makeTrigger("ast-grep console.log($MSG)");
    const { result } = renderHook(() => useComposerAstGrepSearch(trigger, "/workspace"));

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.items[0]?.type).toBe("ast-grep-empty");
    expect(result.current.items[0]?.id).toBe("ast-grep-empty:error");
  });

  it("cancels pending debounce when trigger changes before timeout fires", async () => {
    vi.useFakeTimers();
    searchAstGrepMock.mockResolvedValue([]);

    const triggerA = makeTrigger("ast-grep abc");
    const { result, rerender } = renderHook(
      ({ trigger }: { trigger: ComposerTrigger | null }) =>
        useComposerAstGrepSearch(trigger, "/workspace"),
      { initialProps: { trigger: triggerA as ComposerTrigger | null } },
    );

    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(searchAstGrepMock).not.toHaveBeenCalled();

    // Switch to null before debounce fires
    rerender({ trigger: null });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(searchAstGrepMock).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([]);
  });

  it("returns empty:no-results when backend returns empty array", async () => {
    vi.useFakeTimers();
    searchAstGrepMock.mockResolvedValue([]);

    const trigger = makeTrigger("ast-grep nothing_here");
    const { result } = renderHook(() => useComposerAstGrepSearch(trigger, "/workspace"));

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.items[0]?.type).toBe("ast-grep-empty");
    expect(result.current.items[0]?.id).toBe("ast-grep-empty:no-results");
  });

  it("truncates results to AST_GREP_RESULT_LIMIT (30)", async () => {
    vi.useFakeTimers();
    const many = Array.from({ length: 50 }, (_, i) => ({
      file: `src/file-${i}.ts`,
      line: i,
      column: 0,
      startByte: 0,
      endByte: 0,
      text: `match ${i}`,
      nodeKind: "call_expression",
      captures: [],
    }));
    searchAstGrepMock.mockResolvedValue(many);

    const trigger = makeTrigger("ast-grep something");
    const { result } = renderHook(() => useComposerAstGrepSearch(trigger, "/workspace"));

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current.items.length).toBe(30);
  });
});
