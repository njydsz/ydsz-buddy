/**
 * @file workspaceSummary.test.ts
 * @description workspaceSummary 纯函数单元测试
 */

import { describe, expect, it } from "vitest";
import {
  formatBusyLine,
  isBusyStatus,
  summarizeWorkspaces,
  type WorkspaceActivity,
} from "./workspaceSummary";

function activity(
  workspaceId: string,
  status: WorkspaceActivity["status"],
  taskTitle?: string,
): WorkspaceActivity {
  return { workspaceId, status, taskTitle };
}

describe("summarizeWorkspaces", () => {
  it("空输入 → 全部为 0,无 busy", () => {
    const s = summarizeWorkspaces({ workspaceIds: [], activities: [] });
    expect(s.total).toBe(0);
    expect(s.byStatus).toEqual({
      idle: 0,
      starting: 0,
      running: 0,
      waiting: 0,
      error: 0,
    });
    expect(s.busy).toEqual([]);
    expect(s.hasErrors).toBe(false);
    expect(s.hasWaiting).toBe(false);
  });

  it("没有 activity 的 workspace 算作 idle", () => {
    const s = summarizeWorkspaces({
      workspaceIds: ["ws1", "ws2"],
      activities: [],
    });
    expect(s.total).toBe(2);
    expect(s.byStatus.idle).toBe(2);
    expect(s.busy).toEqual([]);
  });

  it("按状态聚合数量", () => {
    const s = summarizeWorkspaces({
      workspaceIds: ["a", "b", "c", "d", "e"],
      activities: [
        activity("a", "running"),
        activity("b", "waiting"),
        activity("c", "error"),
        activity("d", "starting"),
      ],
    });
    expect(s.byStatus.running).toBe(1);
    expect(s.byStatus.waiting).toBe(1);
    expect(s.byStatus.error).toBe(1);
    expect(s.byStatus.starting).toBe(1);
    expect(s.byStatus.idle).toBe(1); // e
  });

  it("busy 列表包含 running/starting/waiting,不含 idle/error", () => {
    const s = summarizeWorkspaces({
      workspaceIds: ["a", "b", "c"],
      activities: [
        activity("a", "running"),
        activity("b", "error"),
        activity("c", "starting"),
      ],
    });
    expect(s.busy.map((b) => b.workspaceId).sort()).toEqual(["a", "c"]);
  });

  it("busy 排序: waiting → running → starting", () => {
    const s = summarizeWorkspaces({
      workspaceIds: ["a", "b", "c"],
      activities: [
        activity("a", "starting"),
        activity("b", "running"),
        activity("c", "waiting"),
      ],
    });
    expect(s.busy.map((b) => b.workspaceId)).toEqual(["c", "b", "a"]);
  });

  it("hasErrors / hasWaiting 反映状态分布", () => {
    const withError = summarizeWorkspaces({
      workspaceIds: ["a"],
      activities: [activity("a", "error")],
    });
    expect(withError.hasErrors).toBe(true);
    expect(withError.hasWaiting).toBe(false);

    const withWaiting = summarizeWorkspaces({
      workspaceIds: ["a"],
      activities: [activity("a", "waiting")],
    });
    expect(withWaiting.hasErrors).toBe(false);
    expect(withWaiting.hasWaiting).toBe(true);
  });
});

describe("isBusyStatus", () => {
  it("running/starting/waiting → true", () => {
    expect(isBusyStatus("running")).toBe(true);
    expect(isBusyStatus("starting")).toBe(true);
    expect(isBusyStatus("waiting")).toBe(true);
  });

  it("idle/error → false", () => {
    expect(isBusyStatus("idle")).toBe(false);
    expect(isBusyStatus("error")).toBe(false);
  });
});

describe("formatBusyLine", () => {
  it("busy 为空时返回'无活跃 Workspace'", () => {
    const s = summarizeWorkspaces({ workspaceIds: [], activities: [] });
    expect(formatBusyLine(s)).toBe("无活跃 Workspace");
  });

  it("混合状态时输出三段", () => {
    const s = summarizeWorkspaces({
      workspaceIds: ["a", "b", "c"],
      activities: [
        activity("a", "running"),
        activity("b", "running"),
        activity("c", "waiting"),
      ],
    });
    expect(formatBusyLine(s)).toBe("2 运行中 · 1 等待中");
  });

  it("只有 starting 时只显示启动中", () => {
    const s = summarizeWorkspaces({
      workspaceIds: ["a"],
      activities: [activity("a", "starting")],
    });
    expect(formatBusyLine(s)).toBe("1 启动中");
  });
});
