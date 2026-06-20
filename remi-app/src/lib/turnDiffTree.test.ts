/**
 * @file Turn 差异树构建测试
 */

import { describe, expect, it } from "vitest";

import { buildTurnDiffTree, summarizeTurnDiffStats } from "./turnDiffTree";

const makeFile = (path: string, additions: number, deletions: number) => ({
  path,
  additions,
  deletions,
});

describe("summarizeTurnDiffStats", () => {
  it("returns zero totals for empty input", () => {
    expect(summarizeTurnDiffStats([])).toEqual({ additions: 0, deletions: 0 });
  });

  it("sums additions and deletions across all files", () => {
    const files = [
      makeFile("a.ts", 10, 2),
      makeFile("b.ts", 5, 3),
    ];
    expect(summarizeTurnDiffStats(files)).toEqual({ additions: 15, deletions: 5 });
  });

  it("skips files with non-numeric stats", () => {
    const files = [
      makeFile("a.ts", 10, 2),
      // @ts-expect-error intentionally invalid
      { path: "b.ts", additions: "x", deletions: 1 },
    ];
    expect(summarizeTurnDiffStats(files)).toEqual({ additions: 10, deletions: 2 });
  });
});

describe("buildTurnDiffTree", () => {
  it("returns empty tree for no files", () => {
    expect(buildTurnDiffTree([])).toEqual([]);
  });

  it("creates a single file node for a top-level file", () => {
    const tree = buildTurnDiffTree([makeFile("README.md", 3, 1)]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.kind).toBe("file");
    if (tree[0]?.kind === "file") {
      expect(tree[0].name).toBe("README.md");
      expect(tree[0].stat).toEqual({ additions: 3, deletions: 1 });
    }
  });

  it("groups files by directory", () => {
    const tree = buildTurnDiffTree([
      makeFile("src/a.ts", 1, 0),
      makeFile("src/b.ts", 2, 1),
      makeFile("docs/readme.md", 5, 0),
    ]);
    expect(tree).toHaveLength(2);
    const srcNode = tree.find((n) => n.kind === "directory" && n.name === "src");
    expect(srcNode).toBeDefined();
    if (srcNode?.kind === "directory") {
      expect(srcNode.children).toHaveLength(2);
      expect(srcNode.stat).toEqual({ additions: 3, deletions: 1 });
    }
  });

  it("normalizes windows backslashes", () => {
    const tree = buildTurnDiffTree([makeFile("src\\file.ts", 1, 0)]);
    const srcNode = tree.find((n) => n.kind === "directory" && n.name === "src");
    expect(srcNode).toBeDefined();
  });

  it("compacts single-child directory chains", () => {
    const tree = buildTurnDiffTree([makeFile("a/b/c/d.ts", 1, 0)]);
    // 应该有 1 个目录节点（合并后的），包含 1 个文件
    expect(tree).toHaveLength(1);
    const dir = tree[0];
    if (dir?.kind === "directory") {
      expect(dir.name).toBe("a/b/c");
      expect(dir.children).toHaveLength(1);
      expect(dir.children[0]?.kind).toBe("file");
    }
  });
});
