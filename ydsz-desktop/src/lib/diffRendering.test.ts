/**
 * @file 差异渲染工具测试
 *
 * 验证 fnv1a32 哈希、buildPatchCacheKey 缓存键生成、
 * resolveDiffCopyText 文本提取以及 resolveDiffThemeName 主题解析。
 */

import {
  buildPatchCacheKey,
  deriveReviewChangedFiles,
  DIFF_THEME_NAMES,
  fnv1a32,
  mergeChangedFilesForAllTurns,
  resolveDiffCopyText,
  resolveDiffThemeName,
} from "./diffRendering";
import type { FileDiffMetadata } from "@pierre/diffs/react";

describe("fnv1a32", () => {
  it("returns the seed for empty input", () => {
    // 0 xor = seed (no iteration)
    expect(fnv1a32("")).toBe(0x811c9dc5);
  });

  it("is deterministic for same input", () => {
    const a = fnv1a32("hello");
    const b = fnv1a32("hello");
    expect(a).toBe(b);
  });

  it("produces different hashes for different inputs", () => {
    expect(fnv1a32("foo")).not.toBe(fnv1a32("bar"));
  });

  it("respects custom seed and multiplier", () => {
    const custom = fnv1a32("x", 0x12345678, 0xdeadbeef);
    const defaultHash = fnv1a32("x");
    expect(custom).not.toBe(defaultHash);
  });

  it("returns 32-bit unsigned values", () => {
    const result = fnv1a32("a long string with many characters ".repeat(100));
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(result)).toBe(true);
  });
});

describe("buildPatchCacheKey", () => {
  it("is deterministic for same patch", () => {
    expect(buildPatchCacheKey("a\nb\n")).toBe(buildPatchCacheKey("a\nb\n"));
  });

  it("trims whitespace before hashing", () => {
    expect(buildPatchCacheKey("  a\nb\n  ")).toBe(buildPatchCacheKey("a\nb\n"));
  });

  it("uses the default scope when not provided", () => {
    const a = buildPatchCacheKey("x");
    expect(a.startsWith("diff-panel:")).toBe(true);
  });

  it("honors custom scope", () => {
    const a = buildPatchCacheKey("x", "my-scope");
    expect(a.startsWith("my-scope:")).toBe(true);
  });

  it("encodes patch length in the key", () => {
    const a = buildPatchCacheKey("a");
    const b = buildPatchCacheKey("aa");
    expect(a).not.toBe(b);
  });
});

describe("resolveDiffCopyText", () => {
  it("returns null for undefined", () => {
    expect(resolveDiffCopyText(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(resolveDiffCopyText("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(resolveDiffCopyText("   \n\t ")).toBeNull();
  });

  it("returns the patch for non-empty input", () => {
    expect(resolveDiffCopyText("diff --git a/foo b/foo")).toBe("diff --git a/foo b/foo");
  });
});

describe("resolveDiffThemeName", () => {
  it("maps dark to dark theme", () => {
    expect(resolveDiffThemeName("dark")).toBe(DIFF_THEME_NAMES.dark);
  });

  it("maps light to light theme", () => {
    expect(resolveDiffThemeName("light")).toBe(DIFF_THEME_NAMES.light);
  });
});

// ---------------------------------------------------------------------------
// Review 模式 ChangedFilesTree 数据源
// ---------------------------------------------------------------------------

function makeFileDiff(
  overrides: Partial<FileDiffMetadata> & {
    name?: string;
    prevName?: string;
    hunks?: Array<{ additionLines: number; deletionLines: number }>;
  },
): FileDiffMetadata {
  const name = overrides.name ?? "src/foo.ts";
  return {
    cacheKey: overrides.cacheKey ?? "test-key",
    name,
    prevName: overrides.prevName ?? name,
    hunks: (overrides.hunks ?? []) as FileDiffMetadata["hunks"],
  } as unknown as FileDiffMetadata;
}

describe("deriveReviewChangedFiles", () => {
  it("返回空数组当 files 为空", () => {
    expect(deriveReviewChangedFiles([])).toEqual([]);
  });

  it("剥离 a/ 或 b/ 前缀", () => {
    const file = makeFileDiff({ name: "b/src/foo.ts", prevName: "a/src/foo.ts" });
    const result = deriveReviewChangedFiles([file]);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("src/foo.ts");
  });

  it("剥离 a/ 前缀（新增文件）", () => {
    const file = makeFileDiff({ name: "b/src/new.ts", prevName: "b/src/new.ts" });
    const result = deriveReviewChangedFiles([file]);
    expect(result[0].path).toBe("src/new.ts");
  });

  it("汇总 hunk 的 additions/deletions", () => {
    const file = makeFileDiff({
      name: "src/foo.ts",
      prevName: "src/foo.ts",
      hunks: [
        { additionLines: 3, deletionLines: 1 },
        { additionLines: 2, deletionLines: 0 },
      ],
    });
    const result = deriveReviewChangedFiles([file]);
    expect(result[0].additions).toBe(5);
    expect(result[0].deletions).toBe(1);
  });

  it("过滤空 name + 空 prevName 的项", () => {
    const file = makeFileDiff({ name: "", prevName: "" });
    expect(deriveReviewChangedFiles([file])).toEqual([]);
  });

  it("name 缺失时回退到 prevName", () => {
    const file = makeFileDiff({ name: "", prevName: "src/legacy.ts" });
    const result = deriveReviewChangedFiles([file]);
    expect(result[0].path).toBe("src/legacy.ts");
  });

  it("name 缺失且 prevName 为空时跳过", () => {
    const file = makeFileDiff({ name: "", prevName: "" });
    expect(deriveReviewChangedFiles([file])).toEqual([]);
  });

  it("name 仅以 a/ 开头时正确剥离", () => {
    const file = makeFileDiff({ name: "a/solo.ts", prevName: "a/solo.ts" });
    const result = deriveReviewChangedFiles([file]);
    expect(result[0].path).toBe("solo.ts");
  });

  it("hunks 为空时返回 0/0 统计", () => {
    const file = makeFileDiff({ name: "src/x.ts", prevName: "src/x.ts" });
    const result = deriveReviewChangedFiles([file]);
    expect(result[0].additions).toBe(0);
    expect(result[0].deletions).toBe(0);
  });

  it("kind 字段恒为 modified（与 DiffPanel 现有逻辑对齐）", () => {
    const file = makeFileDiff({ name: "src/x.ts", prevName: "src/x.ts" });
    const result = deriveReviewChangedFiles([file]);
    expect(result[0].kind).toBe("modified");
  });

  it("多文件按输入顺序保留", () => {
    const files = [
      makeFileDiff({ cacheKey: "a", name: "src/a.ts", prevName: "src/a.ts" }),
      makeFileDiff({ cacheKey: "b", name: "src/b.ts", prevName: "src/b.ts" }),
      makeFileDiff({ cacheKey: "c", name: "src/c.ts", prevName: "src/c.ts" }),
    ];
    const result = deriveReviewChangedFiles(files);
    expect(result.map((f) => f.path)).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
  });
});

describe("mergeChangedFilesForAllTurns", () => {
  it("返回空数组当输入为空", () => {
    expect(mergeChangedFilesForAllTurns([])).toEqual([]);
  });

  it("单 turn 透传", () => {
    const turn = [{ path: "src/a.ts", additions: 3, deletions: 1 }];
    const result = mergeChangedFilesForAllTurns([turn]);
    expect(result).toEqual([
      { path: "src/a.ts", kind: undefined, additions: 3, deletions: 1 },
    ]);
  });

  it("按 path 聚合多 turn 统计", () => {
    const turn1 = [{ path: "src/a.ts", additions: 3, deletions: 1 }];
    const turn2 = [{ path: "src/a.ts", additions: 2, deletions: 0 }];
    const result = mergeChangedFilesForAllTurns([turn1, turn2]);
    expect(result).toEqual([
      { path: "src/a.ts", kind: undefined, additions: 5, deletions: 1 },
    ]);
  });

  it("不同 path 不合并", () => {
    const turn1 = [{ path: "src/a.ts", additions: 3, deletions: 1 }];
    const turn2 = [{ path: "src/b.ts", additions: 2, deletions: 0 }];
    const result = mergeChangedFilesForAllTurns([turn1, turn2]);
    expect(result).toHaveLength(2);
    expect(result.map((f) => f.path).sort()).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("modified 优先级：跨 turn 一旦出现 modified 即升级", () => {
    const turn1 = [{ path: "src/a.ts", additions: 3, deletions: 1, kind: "added" }];
    const turn2 = [{ path: "src/a.ts", additions: 1, deletions: 0, kind: "modified" }];
    const result = mergeChangedFilesForAllTurns([turn1, turn2]);
    expect(result[0].kind).toBe("modified");
  });

  it("modified 不被降级：已经 modified 时保持", () => {
    const turn1 = [{ path: "src/a.ts", additions: 3, deletions: 1, kind: "modified" }];
    const turn2 = [{ path: "src/a.ts", additions: 1, deletions: 0, kind: "added" }];
    const result = mergeChangedFilesForAllTurns([turn1, turn2]);
    expect(result[0].kind).toBe("modified");
  });

  it("additions/deletions 缺省时按 0 处理", () => {
    const turn = [{ path: "src/a.ts" }];
    const result = mergeChangedFilesForAllTurns([turn]);
    expect(result[0].additions).toBe(0);
    expect(result[0].deletions).toBe(0);
  });

  it("结果按 path 字典序排序", () => {
    const turn1 = [{ path: "src/c.ts" }];
    const turn2 = [{ path: "src/a.ts" }];
    const turn3 = [{ path: "src/b.ts" }];
    const result = mergeChangedFilesForAllTurns([turn1, turn2, turn3]);
    expect(result.map((f) => f.path)).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
  });

  it("空 turn 数组不抛错且不影响其他 turn", () => {
    const turn1: Array<{ path: string }> = [];
    const turn2 = [{ path: "src/a.ts", additions: 1, deletions: 0 }];
    const result = mergeChangedFilesForAllTurns([turn1, turn2]);
    expect(result).toEqual([
      { path: "src/a.ts", kind: undefined, additions: 1, deletions: 0 },
    ]);
  });
});
