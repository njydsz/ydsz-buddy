/**
 * @file useHandleNewChat 单元测试
 *
 * 覆盖：
 * - options.cwd 优先于全局 homeDir
 * - options.cwd 缺失时回退到全局 homeDir
 * - cwd 为空白字符串时回退到全局 homeDir
 * - cwd 和 homeDir 都为空时返回 ok: false
 * - ensureHomeChatProject 使用 effectiveCwd
 * - options.fresh=true 时线程选项中 fresh=true
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ProjectId } from "@ydsz-buddy/contracts";

const { mockState } = vi.hoisted(() => ({
  mockState: {
    handleNewThread: vi.fn(async () => undefined),
    ensureHomeChatProject: vi.fn(async () => "test-project-id" as ProjectId),
  },
}));

vi.mock("./useHandleNewThread", () => ({
  useHandleNewThread: () => ({ handleNewThread: mockState.handleNewThread }),
}));

vi.mock("../lib/chatProjects", () => ({
  ensureHomeChatProject: (cwd: string) => mockState.ensureHomeChatProject(cwd),
}));

vi.mock("../workspaceStore", () => ({
  useWorkspaceStore: (selector: (state: unknown) => unknown) =>
    selector({ homeDir: mockState.homeDir }),
}));

// 必须在每个用例开始前 mock globalThis 上的 __YDSZ_DEBUG__ 等(避免副作用)
import { useHandleNewChat } from "./useHandleNewChat";

beforeEach(() => {
  mockState.handleNewThread.mockClear();
  mockState.ensureHomeChatProject.mockClear();
  mockState.homeDir = null;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useHandleNewChat - cwd 优先级", () => {
  it("options.cwd 优先于全局 homeDir", async () => {
    mockState.homeDir = "/global-home";
    const { result } = renderHook(() => useHandleNewChat());
    const r = await result.current.handleNewChat({ cwd: "/explicit-cwd" });
    expect(r.ok).toBe(true);
    expect(mockState.ensureHomeChatProject).toHaveBeenCalledWith("/explicit-cwd");
  });

  it("options.cwd 缺失时回退到全局 homeDir", async () => {
    mockState.homeDir = "/global-home";
    const { result } = renderHook(() => useHandleNewChat());
    const r = await result.current.handleNewChat({ fresh: true });
    expect(r.ok).toBe(true);
    expect(mockState.ensureHomeChatProject).toHaveBeenCalledWith("/global-home");
  });

  it("cwd 为空白字符串时回退到全局 homeDir", async () => {
    mockState.homeDir = "/global-home";
    const { result } = renderHook(() => useHandleNewChat());
    const r = await result.current.handleNewChat({ cwd: "   " });
    expect(r.ok).toBe(true);
    expect(mockState.ensureHomeChatProject).toHaveBeenCalledWith("/global-home");
  });

  it("cwd 和 homeDir 都为空时返回 ok: false 且不创建 thread", async () => {
    mockState.homeDir = null;
    const { result } = renderHook(() => useHandleNewChat());
    const r = await result.current.handleNewChat({ cwd: null });
    expect(r.ok).toBe(false);
    expect(mockState.handleNewThread).not.toHaveBeenCalled();
  });

  it("options.cwd 被 trim 后传递给 ensureHomeChatProject", async () => {
    mockState.homeDir = null;
    const { result } = renderHook(() => useHandleNewChat());
    const r = await result.current.handleNewChat({ cwd: "  /trimmed  " });
    expect(r.ok).toBe(true);
    expect(mockState.ensureHomeChatProject).toHaveBeenCalledWith("/trimmed");
  });
});

describe("useHandleNewChat - ensureHomeChatProject 失败", () => {
  it("返回 null 时返回 ok: false", async () => {
    mockState.ensureHomeChatProject.mockResolvedValueOnce(null as unknown as ProjectId);
    mockState.homeDir = "/some";
    const { result } = renderHook(() => useHandleNewChat());
    const r = await result.current.handleNewChat();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("Unable to prepare a new chat.");
    }
    expect(mockState.handleNewThread).not.toHaveBeenCalled();
  });
});

describe("useHandleNewChat - fresh 选项", () => {
  it("fresh=true 传递 fresh=true 到线程选项", async () => {
    mockState.homeDir = "/some";
    const { result } = renderHook(() => useHandleNewChat());
    const r = await result.current.handleNewChat({ fresh: true });
    expect(r.ok).toBe(true);
    expect(mockState.handleNewThread).toHaveBeenCalledWith(
      "test-project-id",
      expect.objectContaining({ fresh: true, envMode: "local" }),
    );
  });

  it("不传 fresh 时线程选项为 undefined", async () => {
    mockState.homeDir = "/some";
    const { result } = renderHook(() => useHandleNewChat());
    const r = await result.current.handleNewChat();
    expect(r.ok).toBe(true);
    expect(mockState.handleNewThread).toHaveBeenCalledWith("test-project-id", undefined);
  });
});
