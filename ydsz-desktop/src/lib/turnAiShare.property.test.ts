/**
 * @file turnAiShare 属性化测试
 *
 * 使用 fast-check 对 AI 占比聚合关键不变量进行随机化验证:
 * 1. **占比恒等**: aiShare + humanShare + mixedShare ≈ 1(浮点误差内)
 * 2. **占比边界**: aiShare / humanShare / mixedShare 全部在 [0, 1]
 * 3. **总和恒等**: totalAuthoredLines = aiLines + humanLines + mixedLines
 * 4. **拆分恒等**: splitFileAuthoredLines 的 ai + user + mixed = netAdditions
 * 5. **clamp 不变量**: clampShare 输出永远在 [0, 1]
 * 6. **fileCount 单调性**: fileCount 不会超过总 files 数量
 * 7. **turnCount 恒等**: turnCount = 输入 turnDiffSummaries.length
 * 8. **空态空数据**: 当所有文件 additions 全 0 时 isEmpty = true,占比 = null
 *
 * 互联网大厂基线:核心聚合函数必须有 property-based 兜底,
 * 避免 example-based 漏掉的边界(混合拆分 / 负数 / NaN / 全 0 / 大数溢出)。
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  clampShare,
  computeTurnAiShare,
  splitFileAuthoredLines,
} from "./turnAiShare";
import type { TurnDiffFileChange, TurnDiffSummary } from "../types";

const authorArb = fc.constantFrom("ai", "user", "mixed", "YDSZBOT", "", null, undefined);

const fileArb: fc.Arbitrary<TurnDiffFileChange> = fc.record({
  path: fc.string({ minLength: 1, maxLength: 50 }).map((s) => `/src/${s}.ts`),
  additions: fc.integer({ min: 0, max: 1000 }),
  deletions: fc.integer({ min: 0, max: 1000 }),
  author: authorArb,
});

const turnArb: fc.Arbitrary<TurnDiffSummary> = fc.record({
  turnId: fc.uuid().map((s) => `turn-${s}`) as fc.Arbitrary<never>,
  completedAt: fc.constant("2026-06-25T00:00:00.000Z"),
  files: fc.array(fileArb, { maxLength: 20 }),
});

const turnSummaryListArb: fc.Arbitrary<TurnDiffSummary[]> = fc.array(turnArb, {
  maxLength: 10,
});

describe("clampShare 不变量", () => {
  it("clampShare 输出永远在 [0, 1]", () => {
    fc.assert(
      fc.property(fc.double(), (n) => {
        const out = clampShare(n);
        return out >= 0 && out <= 1;
      }),
      { numRuns: 200 },
    );
  });
  it("NaN / ±Infinity 归 0", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(NaN, Infinity, -Infinity),
        (n) => clampShare(n) === 0,
      ),
    );
  });
});

describe("splitFileAuthoredLines 拆分恒等", () => {
  it("ai + user + mixed = netAdditions", () => {
    fc.assert(
      fc.property(fileArb, (file) => {
        const out = splitFileAuthoredLines(file);
        const net = Math.max(0, file.additions - file.deletions);
        // 我们的 split 把 mixed 拆成 ai + user,所有输出总和 = net(差额余数归 AI)
        const sum = out.ai + out.user + out.mixed;
        return sum === net;
      }),
      { numRuns: 200 },
    );
  });
  it("拆分各项都 >= 0", () => {
    fc.assert(
      fc.property(fileArb, (file) => {
        const out = splitFileAuthoredLines(file);
        return out.ai >= 0 && out.user >= 0 && out.mixed >= 0;
      }),
      { numRuns: 200 },
    );
  });
});

describe("computeTurnAiShare 不变量", () => {
  it("aiShare + humanShare + mixedShare ≈ 1(总和恒等)", () => {
    fc.assert(
      fc.property(turnSummaryListArb, (turns) => {
        const stats = computeTurnAiShare(turns);
        if (stats.aiShare === null) return true;
        const sum = stats.aiShare + (stats.humanShare ?? 0) + (stats.mixedShare ?? 0);
        return Math.abs(sum - 1) < 1e-6;
      }),
      { numRuns: 100 },
    );
  });
  it("aiShare / humanShare / mixedShare 全部在 [0, 1]", () => {
    fc.assert(
      fc.property(turnSummaryListArb, (turns) => {
        const stats = computeTurnAiShare(turns);
        const check = (v: number | null) => v === null || (v >= 0 && v <= 1);
        return (
          check(stats.aiShare) &&
          check(stats.humanShare) &&
          check(stats.mixedShare)
        );
      }),
      { numRuns: 100 },
    );
  });
  it("totalAuthoredLines = aiLines + humanLines + mixedLines", () => {
    fc.assert(
      fc.property(turnSummaryListArb, (turns) => {
        const stats = computeTurnAiShare(turns);
        return (
          stats.totalAuthoredLines === stats.aiLines + stats.humanLines + stats.mixedLines
        );
      }),
      { numRuns: 100 },
    );
  });
  it("turnCount = 输入长度", () => {
    fc.assert(
      fc.property(turnSummaryListArb, (turns) => {
        const stats = computeTurnAiShare(turns);
        return stats.turnCount === turns.length;
      }),
      { numRuns: 100 },
    );
  });
  it("fileCount <= 总 files 数量(去重约束)", () => {
    fc.assert(
      fc.property(turnSummaryListArb, (turns) => {
        const stats = computeTurnAiShare(turns);
        const total = turns.reduce((acc, t) => acc + (t.files?.length ?? 0), 0);
        return stats.fileCount <= total;
      }),
      { numRuns: 100 },
    );
  });
  it("全部空数据时 isEmpty = true,占比 = null", () => {
    const emptyList: TurnDiffSummary[] = [
      {
        turnId: "t1" as never,
        completedAt: "",
        files: [
          { path: "/a" } as TurnDiffFileChange,
          { path: "/b" } as TurnDiffFileChange,
        ],
      },
    ];
    const stats = computeTurnAiShare(emptyList);
    expect(stats.isEmpty).toBe(true);
    expect(stats.aiShare).toBeNull();
    expect(stats.humanShare).toBeNull();
    expect(stats.mixedShare).toBeNull();
  });
});
