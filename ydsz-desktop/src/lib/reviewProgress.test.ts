/**
 * @file reviewProgress.test.ts
 * @description reviewProgress 纯函数单元测试
 */

import { describe, expect, it } from "vitest";
import type { FileDiffMetadata } from "@pierre/diffs/react";
import {
  computeReviewProgress,
  findNextUndecidedHunk,
  formatReviewProgressLine,
  type ReviewProgressStats,
} from "./reviewProgress";
import type { HunkDecisions } from "../components/chat/ReviewDiffToolbar";

const FILE_KEY_A = "a:src/foo.ts";
const FILE_KEY_B = "b:src/bar.ts";
const FILE_KEY_C = "c:src/baz.ts";

const fakeFileA = {
  cacheKey: FILE_KEY_A,
  name: "src/foo.ts",
  prevName: "src/foo.ts",
  hunks: [
    { additionStart: 1, additionCount: 1 },
    { additionStart: 10, additionCount: 1 },
  ],
} as unknown as FileDiffMetadata;

const fakeFileB = {
  cacheKey: FILE_KEY_B,
  name: "src/bar.ts",
  prevName: "src/bar.ts",
  hunks: [{ additionStart: 1, additionCount: 1 }],
} as unknown as FileDiffMetadata;

const fakeFileC = {
  cacheKey: FILE_KEY_C,
  name: "src/baz.ts",
  prevName: "src/baz.ts",
  hunks: [],
} as unknown as FileDiffMetadata;

describe("computeReviewProgress", () => {
  it("空文件列表时,所有指标为 0,complete = false", () => {
    const stats = computeReviewProgress([], new Map());
    expect(stats).toEqual({
      fileCount: 0,
      totalHunks: 0,
      decidedHunks: 0,
      acceptCount: 0,
      rejectCount: 0,
      undecidedHunks: 0,
      progressPercent: 0,
      isComplete: false,
    });
  });

  it("仅含文件但无决策时,进度为 0,complete = false", () => {
    const stats = computeReviewProgress([fakeFileA, fakeFileB], new Map());
    expect(stats.fileCount).toBe(2);
    expect(stats.totalHunks).toBe(3);
    expect(stats.decidedHunks).toBe(0);
    expect(stats.undecidedHunks).toBe(3);
    expect(stats.progressPercent).toBe(0);
    expect(stats.isComplete).toBe(false);
  });

  it("部分决策时,正确统计 accept/reject 与进度", () => {
    const decisions: HunkDecisions = new Map([
      [FILE_KEY_A, new Map([
        [0, "accept"],
        [1, "reject"],
      ])],
      [FILE_KEY_B, new Map([[0, "accept"]])],
    ]);
    const stats = computeReviewProgress([fakeFileA, fakeFileB], decisions);
    expect(stats.totalHunks).toBe(3);
    expect(stats.acceptCount).toBe(2);
    expect(stats.rejectCount).toBe(1);
    expect(stats.decidedHunks).toBe(3);
    expect(stats.undecidedHunks).toBe(0);
    expect(stats.progressPercent).toBe(100);
    expect(stats.isComplete).toBe(true);
  });

  it("所有 hunk 都已 accept/reject 时 isComplete = true", () => {
    const decisions: HunkDecisions = new Map([
      [FILE_KEY_A, new Map([
        [0, "accept"],
        [1, "reject"],
      ])],
      [FILE_KEY_B, new Map([[0, "accept"]])],
    ]);
    const stats = computeReviewProgress([fakeFileA, fakeFileB], decisions);
    expect(stats.isComplete).toBe(true);
  });

  it("文件列表含 0 hunks 的文件时,不被计入 totalHunks", () => {
    const stats = computeReviewProgress([fakeFileC], new Map());
    expect(stats.fileCount).toBe(1);
    expect(stats.totalHunks).toBe(0);
    expect(stats.undecidedHunks).toBe(0);
    expect(stats.progressPercent).toBe(0);
    expect(stats.isComplete).toBe(false);
  });

  it("进度百分比保留 1 位小数(1/3 ≈ 33.3%)", () => {
    const decisions: HunkDecisions = new Map([
      [FILE_KEY_A, new Map([[0, "accept"]])],
    ]);
    const stats = computeReviewProgress([fakeFileA, fakeFileB], decisions);
    expect(stats.progressPercent).toBe(33.3);
  });
});

describe("findNextUndecidedHunk", () => {
  it("无未决策 hunk 时返回 null", () => {
    const decisions: HunkDecisions = new Map([
      [FILE_KEY_A, new Map([
        [0, "accept"],
        [1, "reject"],
      ])],
      [FILE_KEY_B, new Map([[0, "accept"]])],
    ]);
    expect(findNextUndecidedHunk([fakeFileA, fakeFileB], decisions)).toBeNull();
  });

  it("从第一个文件开始找到第一个未决策 hunk", () => {
    const decisions: HunkDecisions = new Map([
      [FILE_KEY_A, new Map([[0, "accept"]])],
    ]);
    const result = findNextUndecidedHunk([fakeFileA, fakeFileB], decisions);
    expect(result).not.toBeNull();
    expect(result?.fileIndex).toBe(0);
    expect(result?.hunkIndex).toBe(1);
    expect(result?.identifier).toBe(`${FILE_KEY_A}:1`);
  });

  it("跳过已完全决策的文件", () => {
    const decisions: HunkDecisions = new Map([
      [FILE_KEY_A, new Map([
        [0, "accept"],
        [1, "accept"],
      ])],
    ]);
    const result = findNextUndecidedHunk([fakeFileA, fakeFileB], decisions);
    expect(result?.fileIndex).toBe(1);
    expect(result?.hunkIndex).toBe(0);
    expect(result?.identifier).toBe(`${FILE_KEY_B}:0`);
  });

  it("startFileIndex 跳过前面的文件", () => {
    const decisions: HunkDecisions = new Map();
    const result = findNextUndecidedHunk(
      [fakeFileA, fakeFileB],
      decisions,
      1,
    );
    expect(result?.fileIndex).toBe(1);
    expect(result?.hunkIndex).toBe(0);
  });

  it("空文件列表时返回 null", () => {
    expect(findNextUndecidedHunk([], new Map())).toBeNull();
  });

  it("文件存在但 hunks 为空时,跳过该文件", () => {
    const result = findNextUndecidedHunk([fakeFileC, fakeFileA], new Map());
    expect(result?.fileIndex).toBe(1);
    expect(result?.hunkIndex).toBe(0);
  });
});

describe("formatReviewProgressLine", () => {
  it("totalHunks=0 时返回'无待审查 hunks'", () => {
    const stats: ReviewProgressStats = {
      fileCount: 0,
      totalHunks: 0,
      decidedHunks: 0,
      acceptCount: 0,
      rejectCount: 0,
      undecidedHunks: 0,
      progressPercent: 0,
      isComplete: false,
    };
    expect(formatReviewProgressLine(stats)).toBe("无待审查 hunks");
  });

  it("有 hunks 时格式化为 'X/Y hunks · Z%'", () => {
    const stats: ReviewProgressStats = {
      fileCount: 2,
      totalHunks: 3,
      decidedHunks: 1,
      acceptCount: 1,
      rejectCount: 0,
      undecidedHunks: 2,
      progressPercent: 33.3,
      isComplete: false,
    };
    expect(formatReviewProgressLine(stats)).toBe("1/3 hunks · 33.3%");
  });
});
