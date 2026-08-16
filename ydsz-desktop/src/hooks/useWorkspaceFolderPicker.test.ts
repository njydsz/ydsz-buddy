/**
 * @file useWorkspaceFolderPicker 单元测试
 *
 * 覆盖：
 * - local 模式: picker 选定后写入 store,返回选定路径
 * - local 模式: picker 取消时返回 null, 不写入 store
 * - worktree 模式: 通过 createWorktree 创建 worktree, cwd 指向主仓库, worktreePath 单独写入
 * - worktree 模式: 透传合成 threadId 给后端 createWorktree
 * - cloud 模式: 抛错 "Cloud mode is not available yet."
 * - native api 不可用时抛错
 * - picker 抛错时透传错误
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ProjectId } from "@ydsz-buddy/contracts";

const { mockState } = vi.hoisted(() => ({
  mockState: {
    pickFolder: vi.fn(async () => "/picked/dir"),
    createWorktree: vi.fn(async () => ({
      worktree: { path: "/picked/dir/.git/worktrees/my-feature", branch: "my-feature" },
    })),
    setWorkspaceCwd: vi.fn(),
    setWorkspaceWorktreePath: vi.fn(),
  },
}));

vi.mock("~/nativeApi", () => ({
  readNativeApi: () => ({
    dialogs: { pickFolder: mockState.pickFolder },
    git: { createWorktree: mockState.createWorktree },
  }),
}));

vi.mock("~/workspaceStore", () => ({
  useWorkspaceStore: (selector: (state: unknown) => unknown) =>
    selector({
      setWorkspaceCwd: mockState.setWorkspaceCwd,
      setWorkspaceWorktreePath: mockState.setWorkspaceWorktreePath,
    }),
  // 与 workspaceStore.ts 实现保持一致: 合成 threadId = `workspace:<id>`
  workspaceThreadId: (workspaceId: string) => `workspace:${workspaceId}`,
}));

import { useWorkspaceFolderPicker } from "./useWorkspaceFolderPicker";

beforeEach(() => {
  mockState.pickFolder.mockClear();
  mockState.createWorktree.mockClear();
  mockState.setWorkspaceCwd.mockClear();
  mockState.setWorkspaceWorktreePath.mockClear();
  mockState.pickFolder.mockResolvedValue("/picked/dir");
  mockState.createWorktree.mockResolvedValue({
    worktree: { path: "/picked/dir/.git/worktrees/my-feature", branch: "my-feature" },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useWorkspaceFolderPicker - local 模式", () => {
  it("picker 选定后写入 store, 返回选定路径", async () => {
    const { result } = renderHook(() => useWorkspaceFolderPicker());
    const picked = await result.current.pickWorkspaceFolder({
      workspaceId: "ws-1",
      mode: "local",
    });
    expect(picked).toBe("/picked/dir");
    expect(mockState.setWorkspaceCwd).toHaveBeenCalledWith("ws-1", "/picked/dir");
    // local 模式不应触碰 worktreePath
    expect(mockState.setWorkspaceWorktreePath).not.toHaveBeenCalled();
  });

  it("picker 取消时返回 null, 不写入 store", async () => {
    mockState.pickFolder.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useWorkspaceFolderPicker());
    const picked = await result.current.pickWorkspaceFolder({
      workspaceId: "ws-1",
      mode: "local",
    });
    expect(picked).toBeNull();
    expect(mockState.setWorkspaceCwd).not.toHaveBeenCalled();
    expect(mockState.setWorkspaceWorktreePath).not.toHaveBeenCalled();
  });
});

describe("useWorkspaceFolderPicker - worktree 模式", () => {
  it("通过 createWorktree 创建 worktree, cwd 指向主仓库, worktreePath 单独写入, 返回 worktree 路径", async () => {
    const { result } = renderHook(() => useWorkspaceFolderPicker());
    const picked = await result.current.pickWorkspaceFolder({
      workspaceId: "ws-1",
      mode: "worktree",
    });
    // 返回值仍是 worktree 路径(向后兼容, chat cwd 应在 worktree 内)
    expect(picked).toBe("/picked/dir/.git/worktrees/my-feature");
    // createWorktree 应透传合成 threadId = "workspace:ws-1"
    expect(mockState.createWorktree).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: "/picked/dir",
        threadId: "workspace:ws-1",
      }),
    );
    // cwd 字段记录主仓库路径(语义分离)
    expect(mockState.setWorkspaceCwd).toHaveBeenCalledWith("ws-1", "/picked/dir");
    // worktreePath 单独写入(不再混入 cwd)
    expect(mockState.setWorkspaceWorktreePath).toHaveBeenCalledWith(
      "ws-1",
      "/picked/dir/.git/worktrees/my-feature",
    );
  });

  it("createWorktree 失败时透传错误, 但 cwd 已写入(主仓库路径), worktreePath 未写入", async () => {
    // 注意: v4 实现先写 cwd(主仓库路径), 再调 createWorktree;
    // 失败时 cwd 保留(因为主仓库选择本身是有效的), 仅 worktreePath 不写入。
    mockState.createWorktree.mockRejectedValueOnce(new Error("not a git repo"));
    const { result } = renderHook(() => useWorkspaceFolderPicker());
    await expect(
      result.current.pickWorkspaceFolder({ workspaceId: "ws-1", mode: "worktree" }),
    ).rejects.toThrow("not a git repo");
    expect(mockState.setWorkspaceCwd).toHaveBeenCalledWith("ws-1", "/picked/dir");
    expect(mockState.setWorkspaceWorktreePath).not.toHaveBeenCalled();
  });
});

describe("useWorkspaceFolderPicker - cloud 模式", () => {
  it("直接抛错 'Cloud mode is not available yet.', 不调 picker", async () => {
    const { result } = renderHook(() => useWorkspaceFolderPicker());
    await expect(
      result.current.pickWorkspaceFolder({ workspaceId: "ws-1", mode: "cloud" }),
    ).rejects.toThrow(/Cloud mode is not available yet/);
    expect(mockState.pickFolder).not.toHaveBeenCalled();
    expect(mockState.setWorkspaceCwd).not.toHaveBeenCalled();
    expect(mockState.setWorkspaceWorktreePath).not.toHaveBeenCalled();
  });
});

describe("useWorkspaceFolderPicker - native api 不可用", () => {
  it("picker 函数被替换为抛错时,调用方会接收到错误", async () => {
    // 由于 vi.mock 在文件顶层固定注入 readNativeApi,这里通过替换 pickFolder
    // 模拟 "native api 不可用导致 picker 调用入口抛错" 的等价场景。
    mockState.pickFolder.mockImplementationOnce(() => {
      throw new Error("Native API unavailable");
    });
    const { result } = renderHook(() => useWorkspaceFolderPicker());
    await expect(
      result.current.pickWorkspaceFolder({ workspaceId: "ws-1", mode: "local" }),
    ).rejects.toThrow(/Native API unavailable/);
  });
});

describe("useWorkspaceFolderPicker - picker 抛错", () => {
  it("透传 picker 抛出的错误", async () => {
    mockState.pickFolder.mockRejectedValueOnce(new Error("user denied"));
    const { result } = renderHook(() => useWorkspaceFolderPicker());
    await expect(
      result.current.pickWorkspaceFolder({ workspaceId: "ws-1", mode: "local" }),
    ).rejects.toThrow("user denied");
    expect(mockState.setWorkspaceCwd).not.toHaveBeenCalled();
    expect(mockState.setWorkspaceWorktreePath).not.toHaveBeenCalled();
  });
});
