/**
 * @file turnAiShare 单元测试
 *
 * 覆盖 normalizeFileAuthor、clampShare、splitFileAuthoredLines、
 * computeTurnAiShare、formatAiSharePercent 与 emptyTurnAiShareStats。
 */
import { describe, expect, it } from "vitest";
import {
  clampShare,
  computeTurnAiShare,
  emptyTurnAiShareStats,
  formatAiSharePercent,
  normalizeFileAuthor,
  splitFileAuthoredLines,
} from "./turnAiShare";
import type { TurnDiffFileChange, TurnDiffSummary } from "../types";

const TURN_ID = "turn-1" as never;
const TURN_ID_2 = "turn-2" as never;

function makeFile(partial: Partial<TurnDiffFileChange>): TurnDiffFileChange {
  return {
    path: "/src/a.ts",
    additions: 0,
    deletions: 0,
    ...partial,
  };
}

function makeTurn(
  id: string,
  files: TurnDiffFileChange[],
  status?: string,
): TurnDiffSummary {
  return {
    turnId: id as never,
    completedAt: "2026-06-25T00:00:00.000Z",
    status,
    files,
  };
}

describe("normalizeFileAuthor", () => {
  it('"ai" → "ai"', () => {
    expect(normalizeFileAuthor("ai")).toBe("ai");
  });
  it('"user" → "user"', () => {
    expect(normalizeFileAuthor("user")).toBe("user");
  });
  it('"mixed" → "mixed"', () => {
    expect(normalizeFileAuthor("mixed")).toBe("mixed");
  });
  it("未知值兜底为 ai", () => {
    expect(normalizeFileAuthor("ydsz-bot")).toBe("ai");
    expect(normalizeFileAuthor("")).toBe("ai");
    expect(normalizeFileAuthor(null)).toBe("ai");
    expect(normalizeFileAuthor(undefined)).toBe("ai");
    expect(normalizeFileAuthor(123)).toBe("ai");
  });
});

describe("clampShare", () => {
  it("把 [0, 1] 区间值原样返回", () => {
    expect(clampShare(0)).toBe(0);
    expect(clampShare(0.5)).toBe(0.5);
    expect(clampShare(1)).toBe(1);
  });
  it("负数 → 0", () => {
    expect(clampShare(-0.1)).toBe(0);
  });
  it("大于 1 → 1", () => {
    expect(clampShare(1.5)).toBe(1);
  });
  it("NaN / Infinity → 0", () => {
    expect(clampShare(NaN)).toBe(0);
    expect(clampShare(Infinity)).toBe(0);
    expect(clampShare(-Infinity)).toBe(0);
  });
});

describe("splitFileAuthoredLines", () => {
  it("author=ai → 全部归 AI", () => {
    const out = splitFileAuthoredLines(makeFile({ additions: 10, deletions: 2, author: "ai" }));
    expect(out).toEqual({ ai: 8, user: 0, mixed: 0 });
  });
  it("author=user → 全部归 user", () => {
    const out = splitFileAuthoredLines(
      makeFile({ additions: 10, deletions: 2, author: "user" }),
    );
    expect(out).toEqual({ ai: 0, user: 8, mixed: 0 });
  });
  it("author=mixed → 50/50 拆分,余数归 AI", () => {
    // net = 7 → half=3,remainder=1 → ai=4 user=3
    const out = splitFileAuthoredLines(
      makeFile({ additions: 10, deletions: 3, author: "mixed" }),
    );
    expect(out).toEqual({ ai: 4, user: 3, mixed: 0 });
  });
  it("缺省 author 视为 ai", () => {
    const out = splitFileAuthoredLines(makeFile({ additions: 5, deletions: 0 }));
    expect(out).toEqual({ ai: 5, user: 0, mixed: 0 });
  });
  it("additions 缺失视为 0", () => {
    const out = splitFileAuthoredLines({ path: "/x" });
    expect(out).toEqual({ ai: 0, user: 0, mixed: 0 });
  });
  it("删除主导时 net 截 0", () => {
    const out = splitFileAuthoredLines(
      makeFile({ additions: 1, deletions: 99, author: "ai" }),
    );
    expect(out.ai).toBe(0);
  });
});

describe("emptyTurnAiShareStats", () => {
  it("返回全空态", () => {
    const stats = emptyTurnAiShareStats();
    expect(stats).toEqual({
      aiLines: 0,
      humanLines: 0,
      mixedLines: 0,
      totalAuthoredLines: 0,
      aiShare: null,
      humanShare: null,
      mixedShare: null,
      turnCount: 0,
      fileCount: 0,
      isEmpty: true,
    });
  });
});

describe("computeTurnAiShare", () => {
  it("null / undefined / 空数组 → 空态", () => {
    expect(computeTurnAiShare(null).isEmpty).toBe(true);
    expect(computeTurnAiShare(undefined).isEmpty).toBe(true);
    expect(computeTurnAiShare([]).isEmpty).toBe(true);
  });

  it("单 turn 全 AI → aiShare = 1", () => {
    const stats = computeTurnAiShare([
      makeTurn(TURN_ID, [
        makeFile({ path: "/a.ts", additions: 10, author: "ai" }),
        makeFile({ path: "/b.ts", additions: 5, author: "ai" }),
      ]),
    ]);
    expect(stats.aiLines).toBe(15);
    expect(stats.humanLines).toBe(0);
    expect(stats.totalAuthoredLines).toBe(15);
    expect(stats.aiShare).toBe(1);
    expect(stats.turnCount).toBe(1);
    expect(stats.fileCount).toBe(2);
    expect(stats.isEmpty).toBe(false);
  });

  it("AI + User 混合 → 比例精确", () => {
    const stats = computeTurnAiShare([
      makeTurn(TURN_ID, [
        makeFile({ path: "/a.ts", additions: 30, author: "ai" }),
        makeFile({ path: "/b.ts", additions: 10, author: "user" }),
      ]),
    ]);
    expect(stats.aiLines).toBe(30);
    expect(stats.humanLines).toBe(10);
    expect(stats.aiShare).toBeCloseTo(0.75, 6);
    expect(stats.humanShare).toBeCloseTo(0.25, 6);
  });

  it("mixed 文件 50/50 拆分后,ai + user = netAdditions", () => {
    const stats = computeTurnAiShare([
      makeTurn(TURN_ID, [makeFile({ path: "/c.ts", additions: 11, author: "mixed" })]),
    ]);
    // net = 11 → half=5,remainder=1 → ai=6 user=5
    expect(stats.aiLines).toBe(6);
    expect(stats.humanLines).toBe(5);
    expect(stats.totalAuthoredLines).toBe(11);
  });

  it("同路径多 turn 去重,只算 1 个文件", () => {
    const stats = computeTurnAiShare([
      makeTurn(TURN_ID, [makeFile({ path: "/a.ts", additions: 5, author: "ai" })]),
      makeTurn(TURN_ID_2, [makeFile({ path: "/a.ts", additions: 3, author: "ai" })]),
    ]);
    expect(stats.fileCount).toBe(1);
    expect(stats.aiLines).toBe(8);
    expect(stats.turnCount).toBe(2);
  });

  it("file 缺 path → 跳过", () => {
    const stats = computeTurnAiShare([
      makeTurn(TURN_ID, [
        { additions: 10, author: "ai" } as unknown as TurnDiffFileChange,
        makeFile({ path: "/ok.ts", additions: 1, author: "ai" }),
      ]),
    ]);
    expect(stats.aiLines).toBe(1);
    expect(stats.fileCount).toBe(1);
  });

  it("turn 缺 files 数组 → 跳过(不崩)", () => {
    const stats = computeTurnAiShare([
      { turnId: TURN_ID, completedAt: "" } as unknown as TurnDiffSummary,
      makeTurn(TURN_ID_2, [makeFile({ path: "/a.ts", additions: 7, author: "ai" })]),
    ]);
    expect(stats.aiLines).toBe(7);
    expect(stats.turnCount).toBe(2);
  });

  it("空 add/deletions → isEmpty = true", () => {
    const stats = computeTurnAiShare([
      makeTurn(TURN_ID, [makeFile({ path: "/a.ts" })]),
    ]);
    expect(stats.isEmpty).toBe(true);
    expect(stats.aiShare).toBeNull();
  });
});

describe("formatAiSharePercent", () => {
  it("null → —", () => {
    expect(formatAiSharePercent(null)).toBe("—");
  });
  it("0 → 0%", () => {
    expect(formatAiSharePercent(0)).toBe("0%");
  });
  it("1 → 100%", () => {
    expect(formatAiSharePercent(1)).toBe("100%");
  });
  it("0.123 → 12.3%", () => {
    expect(formatAiSharePercent(0.123)).toBe("12.3%");
  });
  it("0.9995+ → 100%(钳到 100)", () => {
    expect(formatAiSharePercent(0.9996)).toBe("100%");
  });
  it("0.0001 → 0%(钳到 0)", () => {
    expect(formatAiSharePercent(0.0001)).toBe("0%");
  });
  it(">= 10% 保留 1 位小数(去尾零)", () => {
    expect(formatAiSharePercent(0.456)).toBe("45.6%");
    expect(formatAiSharePercent(0.11)).toBe("11%");
  });
  it("< 10% 保留 1 位小数", () => {
    expect(formatAiSharePercent(0.05)).toBe("5%");
    expect(formatAiSharePercent(0.075)).toBe("7.5%");
  });
});
