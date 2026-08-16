/**
 * @file useComposerLspPick 单元测试
 *
 * 覆盖：
 * 1. trigger 为 null → items 为空
 * 2. mention 触发器但非 @lsp → items 为空
 * 3. @lsp 触发器 → 触发 lsp_list_presets,返回 result
 * 4. @lsp 关键词过滤(命中 displayName / language / fileExtensions)
 * 5. 后端 invoke 抛错 → 返回 empty:error
 * 6. 防抖:cancel 后不调用
 * 7. active=true 排在最前
 * 8. 无结果 + query 非空 → 返回 empty:no-match
 * 9. 无结果 + query 为空 → 返回 empty:no-presets
 * 10. @lsp-foo 长前缀不会误匹配
 * 11. selectPreset() 返回正确预设或 null
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ComposerTrigger } from "../composer-logic";

// Mock @tauri-apps/api/core 的 invoke
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const { useComposerLspPick } = await import("./useComposerLspPick");

function makeTrigger(query: string): ComposerTrigger {
  return { kind: "mention", query };
}

const SAMPLE_PRESETS = [
  { language: "typescript", displayName: "TypeScript / JavaScript", fileExtensions: ["ts", "tsx", "js", "jsx"], active: true },
  { language: "python", displayName: "Python", fileExtensions: ["py"], active: false },
  { language: "rust", displayName: "Rust", fileExtensions: ["rs"], active: false },
  { language: "go", displayName: "Go", fileExtensions: ["go"], active: false },
];

beforeEach(() => {
  invokeMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useComposerLspPick / trigger matching", () => {
  it("trigger 为 null 时 items 为空", () => {
    const { result } = renderHook(() => useComposerLspPick(null, "/workspace"));
    expect(result.current.items).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("mention 触发器但非 @lsp → items 为空", () => {
    const { result } = renderHook(() =>
      useComposerLspPick(makeTrigger("wiki"), "/workspace"),
    );
    expect(result.current.items).toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("@lsp-foo 长前缀不会误匹配", () => {
    const { result } = renderHook(() =>
      useComposerLspPick(makeTrigger("lsp-foo"), "/workspace"),
    );
    expect(result.current.items).toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe("useComposerLspPick / fetch flow", () => {
  it("@lsp 触发器 → 触发 lsp_list_presets 并返回 result", async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValueOnce(SAMPLE_PRESETS);

    const { result } = renderHook(() =>
      useComposerLspPick(makeTrigger("lsp"), "/workspace"),
    );

    // 防抖期间 → loading hint
    expect(result.current.items[0]?.type).toBe("lsp-hint");
    expect(result.current.items[0]?.id).toBe("lsp-hint:loading");
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(220);
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("lsp_list_presets");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.items).toHaveLength(4);
    expect(result.current.items[0]?.type).toBe("lsp-result");
    // active=true 排最前
    expect(result.current.items[0]?.active).toBe(true);
    expect(result.current.items[0]?.language).toBe("typescript");
  });

  it("invoke 抛错 → 返回 empty:error", async () => {
    vi.useFakeTimers();
    invokeMock.mockRejectedValueOnce(new Error("backend down"));

    const { result } = renderHook(() =>
      useComposerLspPick(makeTrigger("lsp"), "/workspace"),
    );

    await act(async () => {
      vi.advanceTimersByTime(220);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasError).toBe(true);
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.type).toBe("lsp-empty");
    expect(result.current.items[0]?.id).toBe("lsp-empty:error");
  });

  it("防抖:cancel 后不调用", async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValue(SAMPLE_PRESETS);

    const { result, rerender } = renderHook(
      ({ trigger }: { trigger: ComposerTrigger | null }) =>
        useComposerLspPick(trigger, "/workspace"),
      { initialProps: { trigger: makeTrigger("lsp") as ComposerTrigger | null } },
    );

    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(invokeMock).not.toHaveBeenCalled();

    // 切到 null,清理 effect
    rerender({ trigger: null });
    await act(async () => {
      vi.advanceTimersByTime(220);
    });
    expect(invokeMock).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([]);
  });

  it("无结果 + query 非空 → 返回 empty:no-match", async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValueOnce(SAMPLE_PRESETS);

    const { result } = renderHook(() =>
      useComposerLspPick(makeTrigger("lsp nonexistent-zzz"), "/workspace"),
    );

    await act(async () => {
      vi.advanceTimersByTime(220);
    });

    expect(result.current.items[0]?.type).toBe("lsp-empty");
    expect(result.current.items[0]?.id).toBe("lsp-empty:no-match:nonexistent-zzz");
  });

  it("无结果 + query 为空 → 返回 empty:no-presets", async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValueOnce([]);

    const { result } = renderHook(() =>
      useComposerLspPick(makeTrigger("lsp"), "/workspace"),
    );

    await act(async () => {
      vi.advanceTimersByTime(220);
    });

    expect(result.current.items[0]?.type).toBe("lsp-empty");
    expect(result.current.items[0]?.id).toBe("lsp-empty:no-presets");
  });
});

describe("useComposerLspPick / filter & sort", () => {
  it("@lsp <query> 关键词过滤(命中 language)", async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValueOnce(SAMPLE_PRESETS);

    const { result } = renderHook(() =>
      useComposerLspPick(makeTrigger("lsp python"), "/workspace"),
    );

    await act(async () => {
      vi.advanceTimersByTime(220);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.language).toBe("python");
  });

  it("@lsp <query> 关键词过滤(命中 fileExtensions)", async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValueOnce(SAMPLE_PRESETS);

    const { result } = renderHook(() =>
      useComposerLspPick(makeTrigger("lsp .rs"), "/workspace"),
    );

    await act(async () => {
      vi.advanceTimersByTime(220);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.language).toBe("rust");
  });

  it("@lsp <query> 关键词过滤(命中 displayName)", async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValueOnce(SAMPLE_PRESETS);

    const { result } = renderHook(() =>
      useComposerLspPick(makeTrigger("lsp JavaScript"), "/workspace"),
    );

    await act(async () => {
      vi.advanceTimersByTime(220);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.language).toBe("typescript");
  });

  it("active=true 排在最前", async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValueOnce(SAMPLE_PRESETS);

    const { result } = renderHook(() =>
      useComposerLspPick(makeTrigger("lsp"), "/workspace"),
    );

    await act(async () => {
      vi.advanceTimersByTime(220);
    });

    const first = result.current.items[0];
    expect(first?.active).toBe(true);
    expect(first?.description).toContain("已启动");
  });

  it("active=false 描述带「未启动」前缀", async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValueOnce(SAMPLE_PRESETS);

    const { result } = renderHook(() =>
      useComposerLspPick(makeTrigger("lsp"), "/workspace"),
    );

    await act(async () => {
      vi.advanceTimersByTime(220);
    });

    const inactive = result.current.items.find((it) => !it.active);
    expect(inactive?.description).toContain("未启动");
  });
});

describe("useComposerLspPick / selectPreset", () => {
  it("selectPreset() 返回正确预设", async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValueOnce(SAMPLE_PRESETS);

    const { result } = renderHook(() =>
      useComposerLspPick(makeTrigger("lsp"), "/workspace"),
    );

    await act(async () => {
      vi.advanceTimersByTime(220);
    });

    const preset = result.current.selectPreset("python");
    expect(preset).not.toBeNull();
    expect(preset?.language).toBe("python");
    expect(preset?.displayName).toBe("Python");
  });

  it("selectPreset() 找不到时返回 null", async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValueOnce(SAMPLE_PRESETS);

    const { result } = renderHook(() =>
      useComposerLspPick(makeTrigger("lsp"), "/workspace"),
    );

    await act(async () => {
      vi.advanceTimersByTime(220);
    });

    expect(result.current.selectPreset("ruby")).toBeNull();
  });
});
