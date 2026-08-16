/**
 * @file terminalStateCleanup 单元测试
 */

import { describe, expect, it } from "vitest";

import type { ThreadId } from "@ydsz-buddy/contracts";
import { collectActiveTerminalThreadIds } from "./terminalStateCleanup";

describe("terminalStateCleanup", () => {
  describe("collectActiveTerminalThreadIds", () => {
    it("空 snapshot / draft / retained 返回空 Set", () => {
      const result = collectActiveTerminalThreadIds({
        snapshotThreads: [],
        draftThreadIds: [],
      });
      expect(result.size).toBe(0);
    });

    it("snapshot 中未删除/未归档的为活跃", () => {
      const result = collectActiveTerminalThreadIds({
        snapshotThreads: [{ id: "t1" as ThreadId, deletedAt: null, archivedAt: null }],
        draftThreadIds: [],
      });
      expect(result.has("t1" as ThreadId)).toBe(true);
    });

    it("已删除的 snapshot 线程被排除", () => {
      const result = collectActiveTerminalThreadIds({
        snapshotThreads: [
          { id: "t1" as ThreadId, deletedAt: "2026-06-24T00:00:00.000Z", archivedAt: null },
        ],
        draftThreadIds: [],
      });
      expect(result.size).toBe(0);
    });

    it("已归档的 snapshot 线程被排除", () => {
      const result = collectActiveTerminalThreadIds({
        snapshotThreads: [
          { id: "t1" as ThreadId, deletedAt: null, archivedAt: "2026-06-24T00:00:00.000Z" },
        ],
        draftThreadIds: [],
      });
      expect(result.size).toBe(0);
    });

    it("draft 线程不在 snapshot 中时也被加入活跃集合", () => {
      const result = collectActiveTerminalThreadIds({
        snapshotThreads: [],
        draftThreadIds: ["t1" as ThreadId],
      });
      expect(result.has("t1" as ThreadId)).toBe(true);
    });

    it("draft 线程对应 snapshot 已删除时仍被排除", () => {
      const result = collectActiveTerminalThreadIds({
        snapshotThreads: [
          { id: "t1" as ThreadId, deletedAt: "2026-06-24T00:00:00.000Z", archivedAt: null },
        ],
        draftThreadIds: ["t1" as ThreadId],
      });
      expect(result.size).toBe(0);
    });

    it("draft 线程对应 snapshot 已归档时仍被排除", () => {
      const result = collectActiveTerminalThreadIds({
        snapshotThreads: [
          { id: "t1" as ThreadId, deletedAt: null, archivedAt: "2026-06-24T00:00:00.000Z" },
        ],
        draftThreadIds: ["t1" as ThreadId],
      });
      expect(result.size).toBe(0);
    });

    it("retained 线程强制加入活跃集合(覆盖删除/归档)", () => {
      const result = collectActiveTerminalThreadIds({
        snapshotThreads: [
          { id: "t1" as ThreadId, deletedAt: "2026-06-24T00:00:00.000Z", archivedAt: null },
        ],
        draftThreadIds: [],
        retainedThreadIds: ["t1" as ThreadId],
      });
      expect(result.has("t1" as ThreadId)).toBe(true);
    });

    it("混合场景: 活跃 + 归档 + 删除 + draft", () => {
      const result = collectActiveTerminalThreadIds({
        snapshotThreads: [
          { id: "t1" as ThreadId, deletedAt: null, archivedAt: null },
          { id: "t2" as ThreadId, deletedAt: "2026-06-24T00:00:00.000Z", archivedAt: null },
          { id: "t3" as ThreadId, deletedAt: null, archivedAt: "2026-06-24T00:00:00.000Z" },
        ],
        draftThreadIds: ["t4" as ThreadId, "t5" as ThreadId],
      });
      expect(result.has("t1" as ThreadId)).toBe(true);
      expect(result.has("t2" as ThreadId)).toBe(false);
      expect(result.has("t3" as ThreadId)).toBe(false);
      expect(result.has("t4" as ThreadId)).toBe(true);
      expect(result.has("t5" as ThreadId)).toBe(true);
      expect(result.size).toBe(3);
    });
  });
});
