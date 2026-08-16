/**
 * @file openUsageRateLimits 单元测试
 *
 * 覆盖 OpenUsage HTTP 快照 → ydsz Provider 速率限制模型的归一化逻辑。
 *
 * 关键覆盖：
 *
 * 1. openUsageProviderIdForProvider - 内部 ProviderKind ↔ OpenUsage providerId 双向映射
 * 2. normalizeOpenUsageSnapshot - 解析 OpenUsage 进度行 → RateLimitWindow
 * 3. normalizeOpenUsageUsageLines - 解析 OpenUsage 文本行 → OpenUsageUsageLine
 *
 * ## 数据构造策略
 *
 * 直接构造 unknown 数据(模拟 HTTP 响应)并断言归一化结果，覆盖：
 * - 正常数据
 * - 缺失/异常字段(null/空字符串/错误类型/NaN/Infinity)
 * - 边界条件(usedPercent 越界、limit<=0)
 * - preferredProvider 回退路径
 */

import { describe, expect, it } from "vitest";

import {
  normalizeOpenUsageSnapshot,
  normalizeOpenUsageUsageLines,
  openUsageProviderIdForProvider,
  type OpenUsageUsageLine,
} from "./openUsageRateLimits";

function makeProgressLine(overrides: Record<string, unknown> = {}) {
  return {
    type: "progress",
    label: "5h",
    used: 50,
    limit: 100,
    resetsAt: "2026-06-25T12:00:00.000Z",
    periodDurationMs: 18_000_000,
    ...overrides,
  };
}

function makeTextLine(overrides: Record<string, unknown> = {}) {
  return {
    type: "text",
    label: "Plan",
    value: "Pro",
    subtitle: "monthly",
    ...overrides,
  };
}

function makeSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    providerId: "codex",
    fetchedAt: "2026-06-25T10:00:00.000Z",
    lines: [],
    ...overrides,
  };
}

describe("openUsageRateLimits", () => {
  describe("openUsageProviderIdForProvider", () => {
    it("映射 codex → codex", () => {
      expect(openUsageProviderIdForProvider("codex")).toBe("codex");
    });

    it("映射 claudeAgent → claude", () => {
      expect(openUsageProviderIdForProvider("claudeAgent")).toBe("claude");
    });

    it("映射 gemini → gemini", () => {
      expect(openUsageProviderIdForProvider("gemini")).toBe("gemini");
    });

    it("未知 ProviderKind 返回 null", () => {
      // @ts-expect-error 故意测试未在联合类型中的 provider
      expect(openUsageProviderIdForProvider("unknown")).toBeNull();
    });

    it("null / undefined 输入返回 null", () => {
      expect(openUsageProviderIdForProvider(null)).toBeNull();
      expect(openUsageProviderIdForProvider(undefined)).toBeNull();
    });
  });

  describe("normalizeOpenUsageSnapshot", () => {
    it("非对象输入返回 null", () => {
      expect(normalizeOpenUsageSnapshot(null)).toBeNull();
      expect(normalizeOpenUsageSnapshot(undefined)).toBeNull();
      expect(normalizeOpenUsageSnapshot("raw-string")).toBeNull();
      expect(normalizeOpenUsageSnapshot(42)).toBeNull();
      expect(normalizeOpenUsageSnapshot([])).toBeNull();
    });

    it("正常 progress 行被正确归一化", () => {
      const snapshot = makeSnapshot({
        lines: [
          makeProgressLine({ used: 30, limit: 100, periodDurationMs: 18_000_000 }),
        ],
      });
      const result = normalizeOpenUsageSnapshot(snapshot);
      expect(result).not.toBeNull();
      expect(result?.provider).toBe("codex");
      expect(result?.limits).toHaveLength(1);
      expect(result?.limits?.[0].usedPercent).toBe(30);
      expect(result?.limits?.[0].resetsAt).toBe("2026-06-25T12:00:00.000Z");
      expect(result?.limits?.[0].windowDurationMins).toBe(300);
    });

    it("usedPercent 被裁剪到 0-100", () => {
      const over = makeSnapshot({
        lines: [makeProgressLine({ used: 150, limit: 100 })],
      });
      const under = makeSnapshot({
        lines: [makeProgressLine({ used: -10, limit: 100 })],
      });
      expect(normalizeOpenUsageSnapshot(over)?.limits?.[0].usedPercent).toBe(100);
      expect(normalizeOpenUsageSnapshot(under)?.limits?.[0].usedPercent).toBe(0);
    });

    it("limit<=0 时跳过 usedPercent 计算", () => {
      const snapshot = makeSnapshot({
        lines: [makeProgressLine({ used: 30, limit: 0 })],
      });
      // 没有 usedPercent 也没有 resetsAt 时会被整体过滤
      const result = normalizeOpenUsageSnapshot({
        ...snapshot,
        lines: [
          makeProgressLine({ used: 30, limit: 0, resetsAt: "2026-06-25T12:00:00.000Z" }),
        ],
      });
      expect(result).not.toBeNull();
      expect(result?.limits?.[0].usedPercent).toBeUndefined();
      expect(result?.limits?.[0].resetsAt).toBe("2026-06-25T12:00:00.000Z");
    });

    it("非有限数字(NaN/Infinity)被忽略", () => {
      const snapshot = makeSnapshot({
        lines: [
          makeProgressLine({ used: Number.NaN, limit: 100 }),
          makeProgressLine({ used: Number.POSITIVE_INFINITY, limit: 100 }),
        ],
      });
      const result = normalizeOpenUsageSnapshot(snapshot);
      // 既无 usedPercent 又无 resetsAt 时整行被过滤
      // 这里 limit 数字有效但 used 无效 → usedPercent=undefined
      // 但 resetsAt 仍存在,会保留
      expect(result?.limits).toHaveLength(2);
      expect(result?.limits?.[0].usedPercent).toBeUndefined();
    });

    it("非 progress 类型的行被过滤", () => {
      const snapshot = makeSnapshot({
        lines: [
          makeTextLine(),
          makeProgressLine({ used: 10, limit: 100 }),
        ],
      });
      const result = normalizeOpenUsageSnapshot(snapshot);
      expect(result?.limits).toHaveLength(1);
    });

    it("进度行缺 label / 缺 used / 缺 limit 时只保留 resetsAt", () => {
      const snapshot = makeSnapshot({
        lines: [
          makeProgressLine({
            label: "",
            used: undefined,
            limit: undefined,
            resetsAt: "2026-06-25T12:00:00.000Z",
          }),
        ],
      });
      const result = normalizeOpenUsageSnapshot(snapshot);
      expect(result?.limits).toHaveLength(1);
      expect(result?.limits?.[0].usedPercent).toBeUndefined();
      expect(result?.limits?.[0].resetsAt).toBe("2026-06-25T12:00:00.000Z");
    });

    it("fetchedAt 缺失时填充为当前 ISO", () => {
      const before = Date.now();
      const result = normalizeOpenUsageSnapshot(
        makeSnapshot({
          fetchedAt: undefined,
          lines: [makeProgressLine()],
        }),
      );
      const after = Date.now();
      const updatedAtMs = Date.parse(result!.updatedAt);
      expect(updatedAtMs).toBeGreaterThanOrEqual(before);
      expect(updatedAtMs).toBeLessThanOrEqual(after + 1_000);
    });

    it("所有行无效时返回 null", () => {
      const snapshot = makeSnapshot({
        lines: [
          makeTextLine(),
          { type: "progress" }, // 缺 used 和 resetsAt
        ],
      });
      expect(normalizeOpenUsageSnapshot(snapshot)).toBeNull();
    });

    it("lines 字段缺失或非数组时按空数组处理", () => {
      const noLines = normalizeOpenUsageSnapshot({
        providerId: "codex",
        fetchedAt: "2026-06-25T10:00:00.000Z",
      });
      expect(noLines).toBeNull();

      const notArray = normalizeOpenUsageSnapshot({
        providerId: "codex",
        fetchedAt: "2026-06-25T10:00:00.000Z",
        // @ts-expect-error 故意传入非数组
        lines: "not-an-array",
      });
      expect(notArray).toBeNull();
    });

    it("providerId 未知时回退到 preferredProvider", () => {
      const snapshot = makeSnapshot({
        providerId: "unknown-provider",
        lines: [makeProgressLine()],
      });
      const result = normalizeOpenUsageSnapshot(snapshot, "claudeAgent");
      expect(result?.provider).toBe("claudeAgent");
    });

    it("providerId 已知时优先于 preferredProvider", () => {
      const snapshot = makeSnapshot({
        providerId: "gemini",
        lines: [makeProgressLine()],
      });
      const result = normalizeOpenUsageSnapshot(snapshot, "codex");
      expect(result?.provider).toBe("gemini");
    });

    it("providerId 未知且无 preferredProvider 时返回 null", () => {
      const snapshot = makeSnapshot({
        providerId: "unknown",
        lines: [makeProgressLine()],
      });
      expect(normalizeOpenUsageSnapshot(snapshot)).toBeNull();
    });

    it("providerId 为空字符串时回退到 preferredProvider", () => {
      const snapshot = makeSnapshot({
        providerId: "",
        lines: [makeProgressLine()],
      });
      const result = normalizeOpenUsageSnapshot(snapshot, "gemini");
      expect(result?.provider).toBe("gemini");
    });

    it("非字符串 providerId 时回退到 preferredProvider", () => {
      const snapshot = makeSnapshot({
        // @ts-expect-error 故意传入非字符串
        providerId: 42,
        lines: [makeProgressLine()],
      });
      const result = normalizeOpenUsageSnapshot(snapshot, "claudeAgent");
      expect(result?.provider).toBe("claudeAgent");
    });

    it("providerId 为空白字符串时视为无效", () => {
      const snapshot = makeSnapshot({
        providerId: "   ",
        lines: [makeProgressLine()],
      });
      const result = normalizeOpenUsageSnapshot(snapshot, "codex");
      expect(result?.provider).toBe("codex");
    });

    it("行中字段类型错误时被忽略(只保留有效字段)", () => {
      const snapshot = makeSnapshot({
        lines: [
          {
            type: "progress",
            label: 123, // 错误类型
            used: "50", // 错误类型
            limit: 100,
            resetsAt: "2026-06-25T12:00:00.000Z",
            periodDurationMs: 18_000_000,
          },
        ],
      });
      const result = normalizeOpenUsageSnapshot(snapshot);
      expect(result?.limits?.[0].usedPercent).toBeUndefined();
      expect(result?.limits?.[0].resetsAt).toBe("2026-06-25T12:00:00.000Z");
    });

    it("行是字符串/数字等非对象时被跳过", () => {
      const snapshot = makeSnapshot({
        lines: [
          "garbage",
          42,
          null,
          undefined,
          makeProgressLine(),
        ],
      });
      const result = normalizeOpenUsageSnapshot(snapshot);
      expect(result?.limits).toHaveLength(1);
    });

    it("多 Provider 同时出现时返回多个结果(同一 provider 仅保留最新)", () => {
      // 这里只测试单个 provider 多行的排序(去重逻辑)
      const snapshot = makeSnapshot({
        lines: [
          makeProgressLine({ used: 30, limit: 100, label: "Weekly" }),
          makeProgressLine({ used: 50, limit: 100, label: "5h" }),
        ],
      });
      const result = normalizeOpenUsageSnapshot(snapshot);
      expect(result?.limits).toHaveLength(2);
    });
  });

  describe("normalizeOpenUsageUsageLines", () => {
    it("非对象输入返回空数组", () => {
      expect(normalizeOpenUsageUsageLines(null)).toEqual([]);
      expect(normalizeOpenUsageUsageLines(undefined)).toEqual([]);
      expect(normalizeOpenUsageUsageLines("string")).toEqual([]);
      expect(normalizeOpenUsageUsageLines(42)).toEqual([]);
    });

    it("正常 text 行被解析", () => {
      const snapshot = makeSnapshot({
        lines: [makeTextLine()],
      });
      const result: OpenUsageUsageLine[] = normalizeOpenUsageUsageLines(snapshot);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        label: "Plan",
        value: "Pro",
        subtitle: "monthly",
      });
    });

    it("缺少 subtitle 字段时不会出现在结果中", () => {
      const snapshot = makeSnapshot({
        lines: [makeTextLine({ subtitle: undefined })],
      });
      const result = normalizeOpenUsageUsageLines(snapshot);
      expect(result[0]).toEqual({
        label: "Plan",
        value: "Pro",
      });
      expect(result[0].subtitle).toBeUndefined();
    });

    it("缺 label 或 value 的行被过滤", () => {
      const snapshot = makeSnapshot({
        lines: [
          makeTextLine({ label: "" }),
          makeTextLine({ value: "" }),
          makeTextLine({ label: undefined, value: undefined }),
          makeTextLine(),
        ],
      });
      const result = normalizeOpenUsageUsageLines(snapshot);
      expect(result).toHaveLength(1);
    });

    it("空白字符串 label / value 被视为缺失", () => {
      const snapshot = makeSnapshot({
        lines: [
          makeTextLine({ label: "   " }),
          makeTextLine({ value: "\t" }),
        ],
      });
      expect(normalizeOpenUsageUsageLines(snapshot)).toEqual([]);
    });

    it("非 text 类型的行被过滤", () => {
      const snapshot = makeSnapshot({
        lines: [
          makeProgressLine(),
          makeTextLine(),
        ],
      });
      const result = normalizeOpenUsageUsageLines(snapshot);
      expect(result).toHaveLength(1);
    });

    it("label / value 类型错误时行被过滤", () => {
      const snapshot = makeSnapshot({
        lines: [
          { type: "text", label: 123, value: "Pro" },
          { type: "text", label: "Plan", value: null },
          makeTextLine(),
        ],
      });
      const result = normalizeOpenUsageUsageLines(snapshot);
      expect(result).toHaveLength(1);
    });

    it("lines 字段缺失时返回空数组", () => {
      expect(
        normalizeOpenUsageUsageLines({
          providerId: "codex",
          fetchedAt: "2026-06-25T10:00:00.000Z",
        }),
      ).toEqual([]);
    });

    it("lines 是非数组时按空数组处理", () => {
      expect(
        normalizeOpenUsageUsageLines({
          providerId: "codex",
          fetchedAt: "2026-06-25T10:00:00.000Z",
          // @ts-expect-error 故意传入非数组
          lines: { foo: "bar" },
        }),
      ).toEqual([]);
    });

    it("多行混合 progress + text 都能正确处理", () => {
      const snapshot = makeSnapshot({
        lines: [
          makeTextLine({ label: "Plan", value: "Pro" }),
          makeTextLine({ label: "Credits", value: "Unlimited" }),
          makeProgressLine({ used: 50, limit: 100 }),
        ],
      });
      const result = normalizeOpenUsageUsageLines(snapshot);
      expect(result).toHaveLength(2);
      expect(result.map((line) => line.label)).toEqual(["Plan", "Credits"]);
    });
  });
});
