/**
 * @file MessagesTimeline.revertSummary.test.ts
 * @description `buildRevertSummaryLine` 纯函数单元测试
 *
 * 覆盖:
 * 1. 用户消息后只有 1 条助手消息 → "将删除 1 条助手消息"
 * 2. 用户消息后助手消息 + 内联工具 → "将删除 1 条助手消息 + 3 条工具调用"
 * 3. 用户消息后跟 work 行 + proposal 行 → summary 中合并计数
 * 4. revertTurnCount 提供时,summary 中加 "将回滚 N 个 Turn（含...）"
 * 5. revertTurnCount 缺失时,回退到"将删除" 开头
 * 6. 用户消息后无任何行 → 回退到"将回滚到该消息之前的状态"
 * 7. 遇到下一条用户消息时立即停止计数(避免越界)
 * 8. 用户消息不在 rows 中 → 计数全 0
 * 9. inlineWorkEntries 缺失时不抛错
 */

import { describe, expect, it } from "vitest";

import { buildRevertSummaryLine } from "./MessagesTimeline";
import type { MessagesTimelineRow } from "./MessagesTimeline.logic";

function userRow(id: string, createdAt: string): MessagesTimelineRow {
  return {
    kind: "message",
    id,
    createdAt,
    durationStart: createdAt,
    showCompletionDivider: false,
    completionSummary: null,
    showAssistantCopyButton: false,
    assistantCopyStreaming: false,
    message: {
      id,
      role: "user",
      createdAt,
    },
  };
}

function assistantRow(
  id: string,
  createdAt: string,
  inlineWorkEntriesCount = 0,
): MessagesTimelineRow {
  const inline =
    inlineWorkEntriesCount > 0
      ? Array.from({ length: inlineWorkEntriesCount }, (_, i) => ({
          id: `tool-${id}-${i}`,
          type: "tool-call" as const,
          createdAt,
        }))
      : undefined;
  return {
    kind: "message",
    id,
    createdAt,
    durationStart: createdAt,
    showCompletionDivider: false,
    completionSummary: null,
    showAssistantCopyButton: false,
    assistantCopyStreaming: false,
    inlineWorkEntries: inline,
    inlineWorkGroupId: inline ? "g1" : undefined,
    message: {
      id,
      role: "assistant",
      createdAt,
    },
  };
}

function workRow(id: string, createdAt: string, n: number): MessagesTimelineRow {
  return {
    kind: "work",
    id,
    createdAt,
    groupedEntries: Array.from({ length: n }, (_, i) => ({
      id: `we-${i}`,
      type: "tool-call" as const,
      createdAt,
    })),
  };
}

function proposedPlanRow(id: string, createdAt: string): MessagesTimelineRow {
  return {
    kind: "proposed-plan",
    id,
    createdAt,
    proposedPlan: {
      title: "t",
      summary: "s",
      steps: [],
    },
  };
}

describe("buildRevertSummaryLine", () => {
  it("用户消息后只有 1 条助手消息 → '将删除 1 条助手消息'", () => {
    const rows: MessagesTimelineRow[] = [
      userRow("u1", "2026-06-25T00:00:00Z"),
      assistantRow("a1", "2026-06-25T00:00:01Z"),
    ];
    expect(buildRevertSummaryLine(rows, "u1", undefined)).toBe("将删除 1 条助手消息");
  });

  it("助手消息 + 内联工具 → 合并为 '将删除 1 条助手消息 + 3 条工具调用'", () => {
    const rows: MessagesTimelineRow[] = [
      userRow("u1", "2026-06-25T00:00:00Z"),
      assistantRow("a1", "2026-06-25T00:00:01Z", 3),
    ];
    expect(buildRevertSummaryLine(rows, "u1", undefined)).toBe(
      "将删除 1 条助手消息 + 3 条工具调用",
    );
  });

  it("work 行 + proposal 行 + assistant 行 → 三类合并", () => {
    const rows: MessagesTimelineRow[] = [
      userRow("u1", "2026-06-25T00:00:00Z"),
      assistantRow("a1", "2026-06-25T00:00:01Z", 1),
      workRow("w1", "2026-06-25T00:00:02Z", 2),
      proposedPlanRow("p1", "2026-06-25T00:00:03Z"),
    ];
    expect(buildRevertSummaryLine(rows, "u1", undefined)).toBe(
      "将删除 1 条助手消息 + 1 条工具调用 + 3 条 Work 日志",
    );
  });

  it("revertTurnCount 提供时,summary 以 '将回滚 N 个 Turn（含...）' 开头", () => {
    const rows: MessagesTimelineRow[] = [
      userRow("u1", "2026-06-25T00:00:00Z"),
      assistantRow("a1", "2026-06-25T00:00:01Z", 2),
    ];
    expect(buildRevertSummaryLine(rows, "u1", 2)).toBe(
      "将回滚 2 个 Turn（含 1 条助手消息 + 2 条工具调用 ）",
    );
  });

  it("revertTurnCount 缺失时回退到 '将删除' 开头", () => {
    const rows: MessagesTimelineRow[] = [
      userRow("u1", "2026-06-25T00:00:00Z"),
      assistantRow("a1", "2026-06-25T00:00:01Z"),
    ];
    expect(buildRevertSummaryLine(rows, "u1", undefined)).toBe("将删除 1 条助手消息");
  });

  it("用户消息后无任何行 → '将回滚到该消息之前的状态'", () => {
    const rows: MessagesTimelineRow[] = [userRow("u1", "2026-06-25T00:00:00Z")];
    expect(buildRevertSummaryLine(rows, "u1", undefined)).toBe(
      "将回滚到该消息之前的状态",
    );
  });

  it("遇到下一条用户消息时立即停止计数", () => {
    const rows: MessagesTimelineRow[] = [
      userRow("u1", "2026-06-25T00:00:00Z"),
      assistantRow("a1", "2026-06-25T00:00:01Z", 1),
      userRow("u2", "2026-06-25T00:00:02Z"),
      assistantRow("a2", "2026-06-25T00:00:03Z", 5), // 不应计入
    ];
    expect(buildRevertSummaryLine(rows, "u1", undefined)).toBe(
      "将删除 1 条助手消息 + 1 条工具调用",
    );
  });

  it("用户消息不在 rows 中 → 计数全 0,使用 revertTurnCount 兜底", () => {
    const rows: MessagesTimelineRow[] = [
      assistantRow("a1", "2026-06-25T00:00:01Z", 2),
      assistantRow("a2", "2026-06-25T00:00:02Z"),
    ];
    expect(buildRevertSummaryLine(rows, "missing-user-id", 3)).toBe(
      "将回滚 3 个 Turn 的所有产物",
    );
  });

  it("inlineWorkEntries 缺失时不抛错(助手消息无工具)", () => {
    const rows: MessagesTimelineRow[] = [
      userRow("u1", "2026-06-25T00:00:00Z"),
      assistantRow("a1", "2026-06-25T00:00:01Z", 0),
    ];
    expect(buildRevertSummaryLine(rows, "u1", undefined)).toBe("将删除 1 条助手消息");
  });

  it("proposal 行算作 work 计数", () => {
    const rows: MessagesTimelineRow[] = [
      userRow("u1", "2026-06-25T00:00:00Z"),
      proposedPlanRow("p1", "2026-06-25T00:00:01Z"),
      proposedPlanRow("p2", "2026-06-25T00:00:02Z"),
    ];
    expect(buildRevertSummaryLine(rows, "u1", undefined)).toBe("将删除 2 条 Work 日志");
  });
});
