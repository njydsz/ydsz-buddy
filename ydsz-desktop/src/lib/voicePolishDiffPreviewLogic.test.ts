/**
 * @file voicePolishDiffPreviewLogic 单元测试
 *
 * 覆盖：
 * 1. planPolishDiffDisplay: 空段、正常段、超长段裁剪
 * 2. computePolishDiffCountdown: 倒计时进度、过期判定
 * 3. summarizePolishDiff: 中英文标签、零变更场景
 */

import { describe, it, expect } from "vitest";

import {
  computePolishDiffCountdown,
  planPolishDiffDisplay,
  summarizePolishDiff,
  VOICE_POLISH_PREVIEW_WINDOW_MS,
} from "./voicePolishDiffPreviewLogic";
import type { PolishDiffSegment, PolishDiffStats } from "./voicePolishDiff";

describe("planPolishDiffDisplay", () => {
  it("returns empty plan for empty segments", () => {
    const result = planPolishDiffDisplay([]);
    expect(result.segments).toEqual([]);
    expect(result.truncated).toBe(false);
    expect(result.skippedSegmentCount).toBe(0);
  });

  it("keeps short segments unchanged", () => {
    const segments: PolishDiffSegment[] = [
      { kind: "kept", text: "Hello " },
      { kind: "removed", text: "world" },
      { kind: "added", text: "Claude" },
    ];
    const result = planPolishDiffDisplay(segments);
    expect(result.segments).toEqual(segments);
    expect(result.truncated).toBe(false);
    expect(result.skippedSegmentCount).toBe(0);
  });

  it("truncates by segment count with head+tail strategy", () => {
    const segments: PolishDiffSegment[] = Array.from({ length: 200 }, (_, i) => ({
      kind: "kept" as const,
      text: `tok${i}`,
    }));
    const result = planPolishDiffDisplay(segments, { maxTokens: 20 });
    expect(result.segments.length).toBe(20);
    expect(result.truncated).toBe(true);
    expect(result.skippedSegmentCount).toBe(180);
    // 头段保留
    expect(result.segments[0]?.text).toBe("tok0");
  });

  it("truncates long change segment text using ellipsis", () => {
    const longText = "x".repeat(500);
    const segments: PolishDiffSegment[] = [
      { kind: "kept", text: "Hi " },
      { kind: "removed", text: longText },
      { kind: "added", text: "ok" },
    ];
    const result = planPolishDiffDisplay(segments, { maxLineChars: 40 });
    const removed = result.segments.find((s) => s.kind === "removed");
    expect(removed?.text).toContain("…");
    expect(removed?.text.length).toBeLessThan(longText.length);
    expect(removed?.text.length).toBeLessThanOrEqual(41); // 20 + 1 + 20
  });

  it("preserves kept segments without truncation", () => {
    const segments: PolishDiffSegment[] = [
      { kind: "kept", text: "a".repeat(500) },
    ];
    const result = planPolishDiffDisplay(segments, { maxLineChars: 40 });
    expect(result.segments[0]?.text.length).toBe(500);
    expect(result.segments[0]?.kind).toBe("kept");
  });
});

describe("computePolishDiffCountdown", () => {
  it("reports full remaining window at start", () => {
    const result = computePolishDiffCountdown(1000, 1000, 30_000);
    expect(result.remainingMs).toBe(30_000);
    expect(result.progress).toBe(0);
    expect(result.expired).toBe(false);
  });

  it("computes half-way progress", () => {
    const result = computePolishDiffCountdown(0, 15_000, 30_000);
    expect(result.remainingMs).toBe(15_000);
    expect(result.progress).toBeCloseTo(0.5, 5);
    expect(result.expired).toBe(false);
  });

  it("marks as expired when window elapsed", () => {
    const result = computePolishDiffCountdown(0, 30_500, 30_000);
    expect(result.remainingMs).toBe(0);
    expect(result.progress).toBe(1);
    expect(result.expired).toBe(true);
  });

  it("clamps progress at 1 even when far past window", () => {
    const result = computePolishDiffCountdown(0, 999_999, 30_000);
    expect(result.progress).toBe(1);
  });

  it("uses VOICE_POLISH_PREVIEW_WINDOW_MS as default", () => {
    const result = computePolishDiffCountdown(0, 0);
    expect(VOICE_POLISH_PREVIEW_WINDOW_MS).toBe(30_000);
    expect(result.remainingMs).toBe(30_000);
  });
});

describe("summarizePolishDiff", () => {
  it("returns 'no changes' label when changedChars is 0", () => {
    const stats: PolishDiffStats = {
      addedChars: 0,
      removedChars: 0,
      keptChars: 100,
      segmentCount: 5,
      changedChars: 0,
      changeRatio: 0,
    };
    expect(summarizePolishDiff({ stats, locale: "zh" }).label).toBe(
      "未检测到需要润色的差异",
    );
    expect(summarizePolishDiff({ stats, locale: "en" }).label).toBe("No changes detected");
  });

  it("produces zh summary with change count + percent", () => {
    const stats: PolishDiffStats = {
      addedChars: 12,
      removedChars: 8,
      keptChars: 80,
      segmentCount: 3,
      changedChars: 20,
      changeRatio: 0.2,
    };
    const summary = summarizePolishDiff({ stats, locale: "zh" });
    expect(summary.label).toBe("3 处修改 · 变更率 20%");
    expect(summary.hasChanges).toBe(true);
    expect(summary.changedChars).toBe(20);
  });

  it("produces en summary with pluralization", () => {
    const single: PolishDiffStats = {
      addedChars: 1,
      removedChars: 0,
      keptChars: 9,
      segmentCount: 1,
      changedChars: 1,
      changeRatio: 0.1,
    };
    expect(summarizePolishDiff({ stats: single, locale: "en" }).label).toBe(
      "1 change · 10% modified",
    );

    const multi: PolishDiffStats = { ...single, segmentCount: 4, changeRatio: 0.4 };
    expect(summarizePolishDiff({ stats: multi, locale: "en" }).label).toBe(
      "4 changes · 40% modified",
    );
  });
});
