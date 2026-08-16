/**
 * @file useDirectoryDropConfirmation 单元测试
 *
 * 覆盖:
 *
 * 1. 无目录拖入 → 直接调 onResolved(expanded, regularFiles)
 * 2. 含目录拖入 → isOpen=true
 * 3. handleExpandAll → 展开目录并调 onResolved(expanded, merged)
 * 4. handleMentionFolderOnly → 只把目录作为 mentions
 * 5. handleCancel → onResolved(cancelled, [])
 * 6. depth=recursive → maxDepth 改变
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useDirectoryDropConfirmation } from "./useDirectoryDropConfirmation";
import type { DirectoryReader, FileInfo } from "~/lib/fileUtils";

function makeReader(map: Record<string, Array<{ name: string; isDirectory: boolean }>>): DirectoryReader {
  return async (path: string) => {
    if (path in map) return map[path]!;
    throw new Error(`ENOENT: ${path}`);
  };
}

function makeFile(name: string, size = 100, type = "image/png"): FileInfo {
  return { name, size, type, category: "image", icon: "image", supported: true };
}

function makeDir(name: string): FileInfo {
  return { name, size: 0, type: "", category: "unknown", icon: "file", supported: false };
}

describe("useDirectoryDropConfirmation", () => {
  it("无目录拖入 → 直接 onResolved(expanded) 跳过对话框", () => {
    const onResolved = vi.fn();
    const { result } = renderHook(() =>
      useDirectoryDropConfirmation({
        directoryReader: makeReader({}),
        onResolved,
      }),
    );
    act(() => {
      result.current.handleInitialDrop([makeFile("a.png"), makeFile("b.png")]);
    });
    expect(onResolved).toHaveBeenCalledTimes(1);
    expect(onResolved).toHaveBeenCalledWith(
      [makeFile("a.png"), makeFile("b.png")],
      "expanded",
    );
    expect(result.current.isOpen).toBe(false);
  });

  it("含目录拖入 → 弹窗打开", () => {
    const onResolved = vi.fn();
    const { result } = renderHook(() =>
      useDirectoryDropConfirmation({
        directoryReader: makeReader({}),
        onResolved,
      }),
    );
    act(() => {
      result.current.handleInitialDrop([makeDir("docs"), makeFile("a.png")]);
    });
    expect(result.current.isOpen).toBe(true);
    expect(result.current.summary).toEqual({ count: 1, names: ["docs"] });
    expect(onResolved).not.toHaveBeenCalled();
  });

  it("handleExpandAll(top) → 展开并合并", async () => {
    const reader = makeReader({
      docs: [
        { name: "intro.md", isDirectory: false },
        { name: "spec.md", isDirectory: false },
      ],
    });
    const onResolved = vi.fn();
    const { result } = renderHook(() =>
      useDirectoryDropConfirmation({ directoryReader: reader, onResolved }),
    );
    act(() => {
      result.current.handleInitialDrop([makeDir("docs"), makeFile("a.png")]);
    });
    await act(async () => {
      await result.current.handleExpandAll("top");
    });
    expect(onResolved).toHaveBeenCalledTimes(1);
    const [files, kind] = onResolved.mock.calls[0]!;
    expect(kind).toBe("expanded");
    expect((files as FileInfo[]).map((f) => f.name)).toEqual([
      "docs/intro.md",
      "docs/spec.md",
      "a.png",
    ]);
    expect(result.current.isOpen).toBe(false);
  });

  it("handleExpandAll(recursive) → 递归展开", async () => {
    const reader = makeReader({
      docs: [{ name: "sub", isDirectory: true }],
      "docs/sub": [{ name: "leaf.md", isDirectory: false }],
    });
    const onResolved = vi.fn();
    const { result } = renderHook(() =>
      useDirectoryDropConfirmation({ directoryReader: reader, onResolved }),
    );
    act(() => {
      result.current.handleInitialDrop([makeDir("docs")]);
    });
    await act(async () => {
      await result.current.handleExpandAll("recursive");
    });
    const [files] = onResolved.mock.calls[0]!;
    expect((files as FileInfo[]).map((f) => f.name)).toContain("docs/sub/leaf.md");
  });

  it("handleExpandAll 目录不可读时跳过该目录,其他正常展开", async () => {
    const reader = makeReader({
      ok: [{ name: "a.txt", isDirectory: false }],
      // "fail" 故意不在 map 中,readDir 会抛错
    });
    const onResolved = vi.fn();
    const { result } = renderHook(() =>
      useDirectoryDropConfirmation({ directoryReader: reader, onResolved }),
    );
    act(() => {
      result.current.handleInitialDrop([makeDir("ok"), makeDir("fail")]);
    });
    await act(async () => {
      await result.current.handleExpandAll("top");
    });
    const [files] = onResolved.mock.calls[0]!;
    // fail 目录被跳过,只剩 ok 目录的子文件
    expect((files as FileInfo[]).map((f) => f.name)).toEqual(["ok/a.txt"]);
  });

  it("handleMentionFolderOnly → 仅返回目录名作为 mentions", () => {
    const onResolved = vi.fn();
    const { result } = renderHook(() =>
      useDirectoryDropConfirmation({
        directoryReader: makeReader({}),
        onResolved,
      }),
    );
    act(() => {
      result.current.handleInitialDrop([makeDir("docs"), makeFile("a.png")]);
    });
    act(() => {
      result.current.handleMentionFolderOnly();
    });
    expect(onResolved).toHaveBeenCalledTimes(1);
    const [files, kind] = onResolved.mock.calls[0]!;
    expect(kind).toBe("folder-only");
    expect((files as FileInfo[]).map((f) => f.name)).toEqual(["docs"]);
    expect(result.current.isOpen).toBe(false);
  });

  it("handleCancel → onResolved(cancelled, [])", () => {
    const onResolved = vi.fn();
    const { result } = renderHook(() =>
      useDirectoryDropConfirmation({
        directoryReader: makeReader({}),
        onResolved,
      }),
    );
    act(() => {
      result.current.handleInitialDrop([makeDir("docs")]);
    });
    act(() => {
      result.current.handleCancel();
    });
    expect(onResolved).toHaveBeenCalledWith([], "cancelled");
    expect(result.current.isOpen).toBe(false);
  });

  it("重复拖入同一目录 → summary 正确累计", () => {
    const onResolved = vi.fn();
    const { result } = renderHook(() =>
      useDirectoryDropConfirmation({
        directoryReader: makeReader({}),
        onResolved,
      }),
    );
    act(() => {
      result.current.handleInitialDrop([makeDir("docs"), makeDir("images")]);
    });
    expect(result.current.summary).toEqual({
      count: 2,
      names: ["docs", "images"],
    });
  });
});
