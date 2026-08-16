/**
 * @file desktopProjectRecovery.ts 单元测试
 *
 * 覆盖：
 * - hasLiveThreadsWithMissingProjects：
 *   - 空 snapshot → false
 *   - 全部 thread 都对应 project → false
 *   - 有 thread 引用不存在的 project → true
 *   - deleted project 不算 live
 *   - deleted thread 不算 live
 *   - 混合 deleted + live 状态
 */

import { describe, expect, it } from "vitest";
import { hasLiveThreadsWithMissingProjects } from "./desktopProjectRecovery";
import type {
  OrchestrationReadModel,
  OrchestrationShellSnapshot,
  Project,
  Thread,
} from "@ydsz-buddy/contracts";

function makeSnapshot(input: {
  projects: Project[];
  threads: Thread[];
}): OrchestrationReadModel {
  return {
    projects: input.projects,
    threads: input.threads,
  } as unknown as OrchestrationReadModel;
}

const project = (id: string, deletedAt: string | null = null): Project =>
  ({
    id: id as Project["id"],
    name: id,
    kind: "project",
    cwd: `/repo/${id}`,
    scripts: [],
    defaultModelSelection: null,
    deletedAt,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }) as unknown as Project;

const thread = (id: string, projectId: string, deletedAt: string | null = null): Thread =>
  ({
    id: id as Thread["id"],
    projectId: projectId as Project["id"],
    title: id,
    messages: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt,
  }) as unknown as Thread;

describe("hasLiveThreadsWithMissingProjects", () => {
  it("空 snapshot → false", () => {
    expect(hasLiveThreadsWithMissingProjects(makeSnapshot({ projects: [], threads: [] }))).toBe(false);
  });

  it("所有 thread 都有对应 project → false", () => {
    const p1 = project("p1");
    const t1 = thread("t1", "p1");
    expect(hasLiveThreadsWithMissingProjects(makeSnapshot({ projects: [p1], threads: [t1] }))).toBe(
      false,
    );
  });

  it("thread 引用不存在的 project → true", () => {
    const t1 = thread("t1", "missing");
    expect(hasLiveThreadsWithMissingProjects(makeSnapshot({ projects: [], threads: [t1] }))).toBe(
      true,
    );
  });

  it("deleted project 不算 live", () => {
    const p1 = project("p1", "2026-01-02T00:00:00.000Z");
    const t1 = thread("t1", "p1");
    // p1 是 deleted，所以 liveProjectIds 为空，t1 引用已删除的 p1 → 算 missing
    expect(hasLiveThreadsWithMissingProjects(makeSnapshot({ projects: [p1], threads: [t1] }))).toBe(
      true,
    );
  });

  it("deleted thread 不算 live", () => {
    const t1 = thread("t1", "missing", "2026-01-02T00:00:00.000Z");
    // thread 是 deleted，isLive=false → 不触发
    expect(hasLiveThreadsWithMissingProjects(makeSnapshot({ projects: [], threads: [t1] }))).toBe(
      false,
    );
  });

  it("live thread 引用 live project → false", () => {
    const p1 = project("p1");
    const t1 = thread("t1", "p1");
    expect(
      hasLiveThreadsWithMissingProjects(
        makeSnapshot({ projects: [p1], threads: [t1] }),
      ),
    ).toBe(false);
  });

  it("混合：一个 live thread 引用 missing project 即触发 true", () => {
    const p1 = project("p1");
    const t1 = thread("t1", "p1");
    const t2 = thread("t2", "ghost");
    expect(
      hasLiveThreadsWithMissingProjects(
        makeSnapshot({ projects: [p1], threads: [t1, t2] }),
      ),
    ).toBe(true);
  });

  it("兼容 OrchestrationShellSnapshot 类型", () => {
    const snap: OrchestrationShellSnapshot = {
      projects: [],
      threads: [thread("t1", "missing")],
    } as unknown as OrchestrationShellSnapshot;
    expect(hasLiveThreadsWithMissingProjects(snap)).toBe(true);
  });
});
