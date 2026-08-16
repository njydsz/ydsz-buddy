/**
 * @file workspaceStore.test.ts
 * @description workspaceStore 单元测试
 *
 * 覆盖：
 * 1. createWorkspace 返回唯一 ID 并追加到列表
 * 2. renameWorkspace 校验空字符串 → 自动生成
 * 3. renameWorkspace 修剪多余空白
 * 4. deleteWorkspace 不允许清空（始终保留 1 个默认 workspace）
 * 5. setActiveWorkspace 校验 ID 存在
 * 6. setActiveWorkspace(null) 允许
 * 7. reorderWorkspace 改变顺序
 * 8. reorderWorkspace 无效索引是 noop
 * 9. ensureWorkspacePage 已存在时是 noop
 * 10. ensureWorkspacePage 追加新 page
 * 11. ensureWorkspacePage 忽略空白 ID
 * 12. setHomeDir undefined 时不更新
 * 13. setHomeDir null / 字符串都被规范化（trim）
 * 14. workspaceThreadId 格式化正确
 * 15. nextWorkspaceTitle 跳过已占用的标题
 * 16. workspacePage 默认 cwd=null, mode="local"
 * 17. setWorkspaceCwd 写入 per-workspace cwd 并同步刷新全局 homeDir
 * 18. setWorkspaceCwd(null) 不会覆盖全局 homeDir
 * 19. setWorkspaceCwd 纯空白被 trim 成 null
 * 20. setWorkspaceCwd 前后空白被 trim
 * 21. setWorkspaceCwd 不存在的 workspaceId 是 noop
 * 22. setWorkspaceMode 切换到 worktree
 * 23. setWorkspaceMode 不存在的 workspaceId 是 noop
 * 24. setWorkspaceMode 相同 mode 是 noop
 * 25. dismissMigrationHint 置位并保持幂等
 * 26. selectIsMigrationHintPending 仅在「未 dismiss + 存在 cwd=null」时为 true
 * 27. selectUnsetCwdWorkspaceCount 正确计数
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  selectIsMigrationHintPending,
  selectOpenWorkspaceIds,
  selectUnsetCwdWorkspaceCount,
  selectWorkspaceByThreadId,
  useWorkspaceStore,
  workspaceThreadId,
} from "./workspaceStore";

function resetStore(): void {
  // 清空 localStorage 并重置 store
  localStorage.clear();
  useWorkspaceStore.setState({
    homeDir: null,
    workspacePages: [],
    activeWorkspaceId: null,
    migrationHintDismissed: false,
  });
}

/**
 * 构造一个最小可用的 WorkspacePage 对象(包含 v4 必填字段 threadId/worktreePath)。
 * 用于测试辅助。
 */
function makePage(overrides: Partial<import("./workspaceStore").WorkspacePage> = {}): import("./workspaceStore").WorkspacePage {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? "ws-test",
    title: overrides.title ?? "Test Workspace",
    layoutPresetId: overrides.layoutPresetId ?? "default",
    cwd: overrides.cwd ?? null,
    mode: overrides.mode ?? "local",
    threadId: overrides.threadId ?? null,
    worktreePath: overrides.worktreePath ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  resetStore();
});

describe("workspaceStore.createWorkspace", () => {
  it("返回新 ID 并追加到列表末尾", () => {
    const first = useWorkspaceStore.getState().createWorkspace();
    expect(useWorkspaceStore.getState().workspacePages).toHaveLength(1);
    expect(useWorkspaceStore.getState().workspacePages[0]?.id).toBe(first);

    const second = useWorkspaceStore.getState().createWorkspace();
    expect(useWorkspaceStore.getState().workspacePages).toHaveLength(2);
    expect(useWorkspaceStore.getState().workspacePages[1]?.id).toBe(second);
    expect(first).not.toBe(second);
  });
});

describe("workspaceStore.renameWorkspace", () => {
  it("正常重命名", () => {
    const id = useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().renameWorkspace(id, "项目 A");
    expect(useWorkspaceStore.getState().workspacePages[0]?.title).toBe("项目 A");
  });

  it("空字符串 → 自动生成 Workspace N", () => {
    const id = useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().renameWorkspace(id, "   ");
    const title = useWorkspaceStore.getState().workspacePages[0]?.title;
    expect(title).toMatch(/^Workspace \d+$/);
  });

  it("压缩多余空白", () => {
    const id = useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().renameWorkspace(id, "  Hello    World  ");
    expect(useWorkspaceStore.getState().workspacePages[0]?.title).toBe("Hello World");
  });

  it("重命名不存在的 ID 是 noop", () => {
    useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().renameWorkspace("missing-id", "X");
    expect(useWorkspaceStore.getState().workspacePages[0]?.title).toMatch(/^Workspace 1$/);
  });
});

describe("workspaceStore.deleteWorkspace", () => {
  it("允许删除非最后一个 workspace", () => {
    const a = useWorkspaceStore.getState().createWorkspace();
    const b = useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().deleteWorkspace(a);
    const pages = useWorkspaceStore.getState().workspacePages;
    expect(pages).toHaveLength(1);
    expect(pages[0]?.id).toBe(b);
  });

  it("不允许清空,删除最后一个会创建一个默认 page", () => {
    const id = useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().deleteWorkspace(id);
    const pages = useWorkspaceStore.getState().workspacePages;
    expect(pages).toHaveLength(1);
    expect(pages[0]?.id).not.toBe(id);
  });
});

describe("workspaceStore.setActiveWorkspace", () => {
  it("null 是允许的", () => {
    useWorkspaceStore.getState().setActiveWorkspace(null);
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBeNull();
  });

  it("设置存在的 ID", () => {
    const id = useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().setActiveWorkspace(id);
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe(id);
  });

  it("设置不存在的 ID 是 noop", () => {
    useWorkspaceStore.getState().createWorkspace();
    const before = useWorkspaceStore.getState().activeWorkspaceId;
    useWorkspaceStore.getState().setActiveWorkspace("not-found");
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe(before);
  });
});

describe("workspaceStore.reorderWorkspace", () => {
  it("调整顺序", () => {
    const a = useWorkspaceStore.getState().createWorkspace();
    const b = useWorkspaceStore.getState().createWorkspace();
    const c = useWorkspaceStore.getState().createWorkspace();
    expect(useWorkspaceStore.getState().workspacePages.map((p) => p.id)).toEqual([a, b, c]);

    // 把 a 移到末尾
    useWorkspaceStore.getState().reorderWorkspace(a, 2);
    expect(useWorkspaceStore.getState().workspacePages.map((p) => p.id)).toEqual([b, c, a]);
  });

  it("无效索引是 noop", () => {
    const a = useWorkspaceStore.getState().createWorkspace();
    const before = useWorkspaceStore.getState().workspacePages;
    useWorkspaceStore.getState().reorderWorkspace(a, 99);
    expect(useWorkspaceStore.getState().workspacePages).toEqual(before);
  });

  it("不存在的 ID 是 noop", () => {
    useWorkspaceStore.getState().createWorkspace();
    const before = useWorkspaceStore.getState().workspacePages;
    useWorkspaceStore.getState().reorderWorkspace("missing", 0);
    expect(useWorkspaceStore.getState().workspacePages).toEqual(before);
  });
});

describe("workspaceStore.ensureWorkspacePage", () => {
  it("已存在时是 noop", () => {
    const id = useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().ensureWorkspacePage(id);
    expect(useWorkspaceStore.getState().workspacePages).toHaveLength(1);
  });

  it("不存在时追加", () => {
    useWorkspaceStore.getState().ensureWorkspacePage("ws-external");
    const pages = useWorkspaceStore.getState().workspacePages;
    expect(pages).toHaveLength(1);
    expect(pages[0]?.id).toBe("ws-external");
  });

  it("忽略空白 ID", () => {
    useWorkspaceStore.getState().ensureWorkspacePage("   ");
    expect(useWorkspaceStore.getState().workspacePages).toHaveLength(0);
  });
});

describe("workspaceStore.setHomeDir", () => {
  it("undefined 不更新", () => {
    useWorkspaceStore.getState().setHomeDir("/initial");
    const before = useWorkspaceStore.getState().homeDir;
    useWorkspaceStore.getState().setHomeDir(undefined);
    expect(useWorkspaceStore.getState().homeDir).toBe(before);
  });

  it("null 清空", () => {
    useWorkspaceStore.getState().setHomeDir("/initial");
    useWorkspaceStore.getState().setHomeDir(null);
    expect(useWorkspaceStore.getState().homeDir).toBeNull();
  });

  it("字符串被 trim", () => {
    useWorkspaceStore.getState().setHomeDir("  /home/x  ");
    expect(useWorkspaceStore.getState().homeDir).toBe("/home/x");
  });

  it("纯空白字符串 → trim 后是空字符串(保留原行为)", () => {
    useWorkspaceStore.getState().setHomeDir("   ");
    expect(useWorkspaceStore.getState().homeDir).toBe("");
  });
});

describe("workspaceThreadId", () => {
  it("生成 workspace: 前缀的 ThreadId", () => {
    expect(workspaceThreadId("abc")).toBe("workspace:abc");
  });
});

describe("自动命名", () => {
  it("createWorkspace 默认标题为 Workspace 1", () => {
    useWorkspaceStore.getState().createWorkspace();
    expect(useWorkspaceStore.getState().workspacePages[0]?.title).toBe("Workspace 1");
  });

  it("连续创建多个 → 标题递增", () => {
    useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().createWorkspace();
    const titles = useWorkspaceStore.getState().workspacePages.map((p) => p.title);
    expect(titles).toEqual(["Workspace 1", "Workspace 2", "Workspace 3"]);
  });

  it("重命名占用 Workspace 1 后,自动命名跳过 1", () => {
    const a = useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().renameWorkspace(a, "Workspace 1");
    const b = useWorkspaceStore.getState().createWorkspace();
    expect(useWorkspaceStore.getState().workspacePages.find((p) => p.id === b)?.title).toBe(
      "Workspace 2",
    );
  });
});

describe("workspaceStore v3 - workspacePage 默认形态", () => {
  it("createWorkspace 默认 cwd=null, mode='local'", () => {
    const id = useWorkspaceStore.getState().createWorkspace();
    const page = useWorkspaceStore.getState().workspacePages[0];
    expect(page?.id).toBe(id);
    expect(page?.cwd).toBeNull();
    expect(page?.mode).toBe("local");
  });
});

describe("workspaceStore.setWorkspaceCwd", () => {
  it("写入 per-workspace cwd 并同步刷新全局 homeDir", () => {
    const id = useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().setWorkspaceCwd(id, "/repos/my-app");
    const page = useWorkspaceStore.getState().workspacePages[0];
    expect(page?.cwd).toBe("/repos/my-app");
    expect(useWorkspaceStore.getState().homeDir).toBe("/repos/my-app");
  });

  it("null 不会覆盖全局 homeDir(保留已选值)", () => {
    useWorkspaceStore.getState().setHomeDir("/previous");
    const id = useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().setWorkspaceCwd(id, null);
    expect(useWorkspaceStore.getState().homeDir).toBe("/previous");
  });

  it("纯空白被 trim 成 null", () => {
    const id = useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().setWorkspaceCwd(id, "   ");
    expect(useWorkspaceStore.getState().workspacePages[0]?.cwd).toBeNull();
  });

  it("前后空白被 trim", () => {
    const id = useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().setWorkspaceCwd(id, "  /repos/x  ");
    expect(useWorkspaceStore.getState().workspacePages[0]?.cwd).toBe("/repos/x");
  });

  it("不存在的 workspaceId 是 noop", () => {
    useWorkspaceStore.getState().createWorkspace();
    const before = useWorkspaceStore.getState().workspacePages;
    useWorkspaceStore.getState().setWorkspaceCwd("missing", "/x");
    expect(useWorkspaceStore.getState().workspacePages).toEqual(before);
  });

  it("与原值相同时不更新 updatedAt", () => {
    const id = useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().setWorkspaceCwd(id, "/a");
    const beforeUpdatedAt = useWorkspaceStore.getState().workspacePages[0]?.updatedAt;
    useWorkspaceStore.getState().setWorkspaceCwd(id, "/a");
    expect(useWorkspaceStore.getState().workspacePages[0]?.updatedAt).toBe(beforeUpdatedAt);
  });
});

describe("workspaceStore.setWorkspaceMode", () => {
  it("切换到 worktree", () => {
    const id = useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().setWorkspaceMode(id, "worktree");
    expect(useWorkspaceStore.getState().workspacePages[0]?.mode).toBe("worktree");
  });

  it("切换到 cloud", () => {
    const id = useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().setWorkspaceMode(id, "cloud");
    expect(useWorkspaceStore.getState().workspacePages[0]?.mode).toBe("cloud");
  });

  it("切换回 local", () => {
    const id = useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().setWorkspaceMode(id, "worktree");
    useWorkspaceStore.getState().setWorkspaceMode(id, "local");
    expect(useWorkspaceStore.getState().workspacePages[0]?.mode).toBe("local");
  });

  it("不存在的 workspaceId 是 noop", () => {
    useWorkspaceStore.getState().createWorkspace();
    const before = useWorkspaceStore.getState().workspacePages;
    useWorkspaceStore.getState().setWorkspaceMode("missing", "worktree");
    expect(useWorkspaceStore.getState().workspacePages).toEqual(before);
  });

  it("相同 mode 是 noop(updatedAt 不变)", () => {
    const id = useWorkspaceStore.getState().createWorkspace();
    const beforeUpdatedAt = useWorkspaceStore.getState().workspacePages[0]?.updatedAt;
    useWorkspaceStore.getState().setWorkspaceMode(id, "local");
    expect(useWorkspaceStore.getState().workspacePages[0]?.updatedAt).toBe(beforeUpdatedAt);
  });
});

describe("workspaceStore v3 - storage migration", () => {
  it("旧 v2 schema 数据升到 v5 时全局 homeDir 应清空 + threadId/worktreePath 补 null", async () => {
    // 模拟 v2 时代的持久化内容(storage key 已升到 v5,但 schema version=2)
    localStorage.setItem(
      "ydsz-buddy:workspace-pages:v5",
      JSON.stringify({
        state: {
          homeDir: "/server-injected-dir",
          workspacePages: [
            {
              id: "ws-1",
              title: "Workspace 1",
              layoutPresetId: "default",
              createdAt: "2024-01-01T00:00:00.000Z",
              updatedAt: "2024-01-01T00:00:00.000Z",
            },
          ],
          activeWorkspaceId: null,
        },
        version: 2,
      }),
    );
    // 重新 import 触发 lazy hydrate
    vi.resetModules();
    const { useWorkspaceStore: freshStore } = await import("./workspaceStore");
    // 等待 microtask 让 persist 完成 hydrate
    await new Promise((resolve) => setTimeout(resolve, 10));

    const state = freshStore.getState();
    expect(() => state.workspacePages.length).not.toThrow();
    // v2→v3 迁移:homeDir 被清空(由 server 注入的路径不应保留)
    expect(state.homeDir).toBeNull();
    // v3→v4→v5 迁移:threadId/worktreePath/sshConnectionId 自动补 null
    const page = state.workspacePages[0];
    expect(page?.threadId).toBeNull();
    expect(page?.worktreePath).toBeNull();
    // 旧字段应保留
    expect(page?.id).toBe("ws-1");
    expect(page?.title).toBe("Workspace 1");
  });
});

describe("workspaceStore.dismissMigrationHint", () => {
  it("默认 migrationHintDismissed=false", () => {
    expect(useWorkspaceStore.getState().migrationHintDismissed).toBe(false);
  });

  it("调用后置 true", () => {
    useWorkspaceStore.getState().dismissMigrationHint();
    expect(useWorkspaceStore.getState().migrationHintDismissed).toBe(true);
  });

  it("再次调用保持 true(幂等)", () => {
    useWorkspaceStore.getState().dismissMigrationHint();
    useWorkspaceStore.getState().dismissMigrationHint();
    expect(useWorkspaceStore.getState().migrationHintDismissed).toBe(true);
  });
});

describe("workspaceStore selectors - migration hint", () => {
  it("无 workspace → pending=false", () => {
    const state = useWorkspaceStore.getState();
    expect(selectIsMigrationHintPending(state)).toBe(false);
  });

  it("所有 workspace 都有 cwd → pending=false", () => {
    const a = useWorkspaceStore.getState().createWorkspace();
    const b = useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().setWorkspaceCwd(a, "/repos/a");
    useWorkspaceStore.getState().setWorkspaceCwd(b, "/repos/b");
    const state = useWorkspaceStore.getState();
    expect(selectIsMigrationHintPending(state)).toBe(false);
  });

  it("存在 cwd=null + 未 dismiss → pending=true", () => {
    useWorkspaceStore.getState().createWorkspace();
    const state = useWorkspaceStore.getState();
    expect(selectIsMigrationHintPending(state)).toBe(true);
  });

  it("dismiss=true → pending=false(即使有未选 cwd)", () => {
    useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().dismissMigrationHint();
    const state = useWorkspaceStore.getState();
    expect(selectIsMigrationHintPending(state)).toBe(false);
  });

  it("selectUnsetCwdWorkspaceCount 正确计数", () => {
    const a = useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().setWorkspaceCwd(a, "/repos/a");
    const state = useWorkspaceStore.getState();
    expect(selectUnsetCwdWorkspaceCount(state)).toBe(1);
  });

  it("所有 workspace 都有 cwd → count=0", () => {
    const a = useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().setWorkspaceCwd(a, "/repos/a");
    const state = useWorkspaceStore.getState();
    expect(selectUnsetCwdWorkspaceCount(state)).toBe(0);
  });
});

describe("workspaceStore v4 - threadId / worktreePath 字段", () => {
  it("新创建的 workspace 默认 threadId=null, worktreePath=null", () => {
    const id = useWorkspaceStore.getState().createWorkspace();
    const page = useWorkspaceStore.getState().workspacePages.find((w) => w.id === id);
    expect(page?.threadId).toBeNull();
    expect(page?.worktreePath).toBeNull();
  });

  it("setWorkspaceThreadId 写入并刷新 updatedAt", async () => {
    const id = useWorkspaceStore.getState().createWorkspace();
    const before = useWorkspaceStore.getState().workspacePages[0]?.updatedAt;
    // 强制让时间推进
    await new Promise((r) => setTimeout(r, 5));
    useWorkspaceStore.getState().setWorkspaceThreadId(id, "thread-abc");
    const page = useWorkspaceStore.getState().workspacePages[0];
    expect(page?.threadId).toBe("thread-abc");
    expect(page?.updatedAt).not.toBe(before);
  });

  it("setWorkspaceThreadId(null) 清空", () => {
    const id = useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().setWorkspaceThreadId(id, "thread-abc");
    useWorkspaceStore.getState().setWorkspaceThreadId(id, null);
    expect(useWorkspaceStore.getState().workspacePages[0]?.threadId).toBeNull();
  });

  it("setWorkspaceThreadId 纯空白被 trim 成 null", () => {
    const id = useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().setWorkspaceThreadId(id, "   ");
    expect(useWorkspaceStore.getState().workspacePages[0]?.threadId).toBeNull();
  });

  it("setWorkspaceThreadId 相同值是 noop(updatedAt 不变)", () => {
    const id = useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().setWorkspaceThreadId(id, "thread-x");
    const before = useWorkspaceStore.getState().workspacePages[0]?.updatedAt;
    useWorkspaceStore.getState().setWorkspaceThreadId(id, "thread-x");
    expect(useWorkspaceStore.getState().workspacePages[0]?.updatedAt).toBe(before);
  });

  it("setWorkspaceThreadId 不存在的 ID 是 noop", () => {
    const before = useWorkspaceStore.getState().workspacePages;
    useWorkspaceStore.getState().setWorkspaceThreadId("missing", "thread-x");
    expect(useWorkspaceStore.getState().workspacePages).toEqual(before);
  });

  it("setWorkspaceWorktreePath 写入并刷新 updatedAt", async () => {
    const id = useWorkspaceStore.getState().createWorkspace();
    await new Promise((r) => setTimeout(r, 5));
    useWorkspaceStore.getState().setWorkspaceWorktreePath(id, "/repo/.ydsz-worktrees/feat");
    const page = useWorkspaceStore.getState().workspacePages[0];
    expect(page?.worktreePath).toBe("/repo/.ydsz-worktrees/feat");
  });

  it("setWorkspaceWorktreePath(null) 清空", () => {
    const id = useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().setWorkspaceWorktreePath(id, "/wt");
    useWorkspaceStore.getState().setWorkspaceWorktreePath(id, null);
    expect(useWorkspaceStore.getState().workspacePages[0]?.worktreePath).toBeNull();
  });

  it("setWorkspaceWorktreePath 纯空白被 trim 成 null", () => {
    const id = useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().setWorkspaceWorktreePath(id, "   ");
    expect(useWorkspaceStore.getState().workspacePages[0]?.worktreePath).toBeNull();
  });

  it("setWorkspaceWorktreePath 不存在的 ID 是 noop", () => {
    const before = useWorkspaceStore.getState().workspacePages;
    useWorkspaceStore.getState().setWorkspaceWorktreePath("missing", "/wt");
    expect(useWorkspaceStore.getState().workspacePages).toEqual(before);
  });
});

describe("workspaceStore v4 - selectOpenWorkspaceIds / selectWorkspaceByThreadId", () => {
  it("selectOpenWorkspaceIds 返回所有 workspace id(顺序保持)", () => {
    const a = useWorkspaceStore.getState().createWorkspace();
    const b = useWorkspaceStore.getState().createWorkspace();
    const c = useWorkspaceStore.getState().createWorkspace();
    const state = useWorkspaceStore.getState();
    expect(selectOpenWorkspaceIds(state)).toEqual([a, b, c]);
  });

  it("selectWorkspaceByThreadId 命中", () => {
    const id = useWorkspaceStore.getState().createWorkspace();
    useWorkspaceStore.getState().setWorkspaceThreadId(id, "thread-lookup");
    const state = useWorkspaceStore.getState();
    const found = selectWorkspaceByThreadId(state, "thread-lookup");
    expect(found?.id).toBe(id);
  });

  it("selectWorkspaceByThreadId 未命中返回 undefined", () => {
    useWorkspaceStore.getState().createWorkspace();
    const state = useWorkspaceStore.getState();
    expect(selectWorkspaceByThreadId(state, "thread-404")).toBeUndefined();
  });
});

describe("workspaceStore v4 - normalizeWorkspacePages 补齐字段", () => {
  it("缺失 threadId/worktreePath 的 v3 数据被 normalize 为 null", async () => {
    // 模拟 v3 时代的持久化内容(没有 threadId/worktreePath 字段)
    localStorage.setItem(
      "ydsz-buddy:workspace-pages:v5",
      JSON.stringify({
        state: {
          homeDir: "/repo",
          workspacePages: [
            {
              id: "ws-1",
              title: "Workspace 1",
              layoutPresetId: "default",
              cwd: "/repo",
              mode: "local",
              createdAt: "2024-01-01T00:00:00.000Z",
              updatedAt: "2024-01-01T00:00:00.000Z",
            },
          ],
          activeWorkspaceId: "ws-1",
          migrationHintDismissed: true,
        },
        version: 3,
      }),
    );
    // 重新 import 触发 lazy hydrate
    vi.resetModules();
    const { useWorkspaceStore: freshStore } = await import("./workspaceStore");
    // 等待 microtask 让 persist 完成 hydrate
    await new Promise((resolve) => setTimeout(resolve, 10));
    const pages = freshStore.getState().workspacePages;
    expect(pages.length).toBeGreaterThan(0);
    expect(pages[0]?.threadId).toBeNull();
    expect(pages[0]?.worktreePath).toBeNull();
    // 旧字段应保留
    expect(pages[0]?.cwd).toBe("/repo");
    expect(pages[0]?.mode).toBe("local");
  });
});
