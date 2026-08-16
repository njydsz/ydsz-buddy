/**
 * @file threadEnvironment 单元测试
 *
 * 覆盖：
 * - resolveThreadEnvironmentPresentation 各种 mode/workspaceState
 * - resolveDiffEnvironmentState：pending vs ready
 * - resolveForkThreadEnvironment：local/worktree 目标 + 关联 worktree 派生
 *
 * 策略：纯函数，构造输入，断言输出。
 */

import { describe, expect, it } from "vitest";
import {
  resolveThreadEnvironmentPresentation,
  resolveDiffEnvironmentState,
  resolveForkThreadEnvironment,
} from "./threadEnvironment";
import type { Thread } from "../types";

const baseThread: Pick<
  Thread,
  "branch" | "envMode" | "worktreePath" | "associatedWorktreePath" | "associatedWorktreeBranch" | "associatedWorktreeRef"
> = {
  branch: null,
  envMode: "local" as never,
  worktreePath: null,
  associatedWorktreePath: null,
  associatedWorktreeBranch: null,
  associatedWorktreeRef: null,
};

describe("threadEnvironment - resolveThreadEnvironmentPresentation", () => {
  it("默认（无输入）→ local / local / no badge", () => {
    const result = resolveThreadEnvironmentPresentation({});
    expect(result.mode).toBe("local");
    expect(result.workspaceState).toBe("local");
    expect(result.shortLabel).toBe("Local");
    expect(result.worktreeBadgeLabel).toBeNull();
  });

  it("envMode='worktree' + worktreePath=undefined → worktree-pending", () => {
    const result = resolveThreadEnvironmentPresentation({
      envMode: "worktree",
    });
    expect(result.mode).toBe("worktree");
    expect(result.workspaceState).toBe("worktree-pending");
    expect(result.shortLabel).toBe("Worktree");
    expect(result.worktreeBadgeLabel).toBe("Worktree pending");
  });

  it("envMode='worktree' + 有 worktreePath → worktree-ready", () => {
    const result = resolveThreadEnvironmentPresentation({
      envMode: "worktree",
      worktreePath: "/repo/.worktrees/foo",
    });
    expect(result.workspaceState).toBe("worktree-ready");
    expect(result.worktreeBadgeLabel).toBe("Worktree");
  });

  it("envMode='local' + 有 worktreePath → worktree (worktree 优先)", () => {
    const result = resolveThreadEnvironmentPresentation({
      envMode: "local",
      worktreePath: "/repo/.worktrees/foo",
    });
    expect(result.mode).toBe("worktree");
  });

  it("label 字段：localOptionLabel / worktreeOptionLabel", () => {
    const result = resolveThreadEnvironmentPresentation({});
    expect(result.localOptionLabel).toBe("Local project");
    expect(result.worktreeOptionLabel).toBe("Worktree");
  });
});

describe("threadEnvironment - resolveDiffEnvironmentState", () => {
  it("envMode='worktree' + 无 path → pending=true, cwd=null, 有 reason", () => {
    const result = resolveDiffEnvironmentState({ envMode: "worktree" });
    expect(result.pending).toBe(true);
    expect(result.cwd).toBeNull();
    expect(result.disabledReason).toMatch(/available once the worktree/);
  });

  it("envMode='worktree' + 有 path → pending=false, cwd=worktreePath", () => {
    const result = resolveDiffEnvironmentState({
      envMode: "worktree",
      worktreePath: "/repo/.worktrees/foo",
    });
    expect(result.pending).toBe(false);
    expect(result.cwd).toBe("/repo/.worktrees/foo");
    expect(result.disabledReason).toBeNull();
  });

  it("envMode='local' + projectCwd → cwd=projectCwd", () => {
    const result = resolveDiffEnvironmentState({
      envMode: "local",
      projectCwd: "/repo",
    });
    expect(result.pending).toBe(false);
    expect(result.cwd).toBe("/repo");
  });

  it("envMode='local' + 无 projectCwd → cwd=null", () => {
    const result = resolveDiffEnvironmentState({ envMode: "local" });
    expect(result.cwd).toBeNull();
  });
});

describe("threadEnvironment - resolveForkThreadEnvironment", () => {
  it("target='worktree' + source=local → 始终 worktree + worktreePath=null", () => {
    const result = resolveForkThreadEnvironment({
      target: "worktree",
      activeRootBranch: "main",
      sourceThread: {
        ...baseThread,
        envMode: "local",
        branch: "feature-a",
      },
    });
    expect(result.target).toBe("worktree");
    expect(result.envMode).toBe("worktree");
    expect(result.worktreePath).toBeNull();
    expect(result.branch).toBe("feature-a");
  });

  it("target='worktree' + source 无 branch → 退到 activeRootBranch", () => {
    const result = resolveForkThreadEnvironment({
      target: "worktree",
      activeRootBranch: "main",
      sourceThread: { ...baseThread, envMode: "local" },
    });
    expect(result.branch).toBe("main");
  });

  it("target='local' + source=worktree → 复用 source worktree（不弹回 root）", () => {
    const result = resolveForkThreadEnvironment({
      target: "local",
      activeRootBranch: "main",
      sourceThread: {
        ...baseThread,
        envMode: "worktree",
        branch: "feature-a",
        worktreePath: "/repo/.worktrees/foo",
        associatedWorktreePath: "/repo/.worktrees/foo",
        associatedWorktreeBranch: "feature-a",
        associatedWorktreeRef: "abc123",
      },
    });
    expect(result.target).toBe("local");
    expect(result.envMode).toBe("worktree"); // 保留 source 的 worktree 模式
    expect(result.worktreePath).toBe("/repo/.worktrees/foo");
    expect(result.associatedWorktreePath).toBe("/repo/.worktrees/foo");
    expect(result.associatedWorktreeBranch).toBe("feature-a");
    expect(result.associatedWorktreeRef).toBe("abc123");
  });

  it("target='local' + source=local → 走 plain local（无关联 worktree）", () => {
    const result = resolveForkThreadEnvironment({
      target: "local",
      activeRootBranch: "main",
      sourceThread: {
        ...baseThread,
        envMode: "local",
        branch: "feature-a",
      },
    });
    expect(result.target).toBe("local");
    expect(result.envMode).toBe("local");
    expect(result.worktreePath).toBeNull();
    expect(result.associatedWorktreePath).toBeNull();
    expect(result.associatedWorktreeBranch).toBeNull();
  });

  it("target='worktree' + 关联 worktree 派生", () => {
    const result = resolveForkThreadEnvironment({
      target: "worktree",
      activeRootBranch: "main",
      sourceThread: {
        ...baseThread,
        envMode: "worktree",
        branch: "feature-b",
        worktreePath: "/old-worktree",
        associatedWorktreeBranch: "old-branch",
        associatedWorktreeRef: "ref-1",
      },
    });
    // target=worktree 路径下：associatedWorktreePath=null（新的还没建）
    expect(result.associatedWorktreePath).toBeNull();
    // branch 来自 source
    expect(result.associatedWorktreeBranch).toBe("feature-b");
    // ref 保留 source 的值
    expect(result.associatedWorktreeRef).toBe("ref-1");
  });
});
