/**
 * @file chatProjects 单元测试
 *
 * 覆盖主目录聊天容器项目的核心纯函数与集成路径:
 *
 * 1. isHomeChatContainerProject - 纯函数判定
 * 2. findHomeChatContainerProject - 在项目列表中查找
 * 3. ensureHomeChatProject - mock nativeApi + store 验证创建流程
 * 4. prewarmHomeChatProject - fire-and-forget 调用验证
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// mock nativeApi + store
const mockDispatchCommand = vi.fn();
const mockReadNativeApi = vi.fn();
const mockStoreGetState = vi.fn();

vi.mock("../nativeApi", () => ({
  readNativeApi: () => mockReadNativeApi(),
}));

vi.mock("../store", () => ({
  useStore: {
    getState: () => mockStoreGetState(),
  },
}));

vi.mock("../threadDerivation", () => ({
  getThreadFromState: () => undefined,
}));

vi.mock("./utils", () => ({
  newCommandId: () => "cmd-id" as never,
  newProjectId: () => "proj-id" as never,
}));

import type { ProjectId } from "@ydsz-buddy/contracts";
import type { Project } from "../types";
import {
  ensureHomeChatProject,
  findHomeChatContainerProject,
  isHomeChatContainerProject,
  prewarmHomeChatProject,
} from "./chatProjects";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj-1" as never,
    kind: "chat",
    name: "Home",
    remoteName: "Home",
    folderName: "Home",
    localName: null,
    cwd: "/home/user",
    defaultModelSelection: null,
    expanded: false,
    scripts: [],
    ...overrides,
  };
}

describe("chatProjects", () => {
  beforeEach(() => {
    mockDispatchCommand.mockReset();
    mockDispatchCommand.mockResolvedValue({ success: true });
    mockReadNativeApi.mockReset();
    mockStoreGetState.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("isHomeChatContainerProject", () => {
    it("null 项目返回 false", () => {
      expect(isHomeChatContainerProject(null, "/home/user")).toBe(false);
    });

    it("undefined homeDir 返回 false", () => {
      expect(isHomeChatContainerProject(makeProject(), null)).toBe(false);
      expect(isHomeChatContainerProject(makeProject(), undefined)).toBe(false);
    });

    it("cwd 不匹配返回 false", () => {
      const project = makeProject({ cwd: "/other" });
      expect(isHomeChatContainerProject(project, "/home/user")).toBe(false);
    });

    it("kind=chat 且 cwd 匹配返回 true", () => {
      const project = makeProject({ kind: "chat", cwd: "/home/user" });
      expect(isHomeChatContainerProject(project, "/home/user")).toBe(true);
    });

    it("kind!=chat 但 remoteName=Home 仍返回 true(向后兼容)", () => {
      const project = makeProject({ kind: "code", remoteName: "Home", cwd: "/home/user" });
      expect(isHomeChatContainerProject(project, "/home/user")).toBe(true);
    });

    it("kind!=chat 但 name=Home 仍返回 true", () => {
      const project = makeProject({ kind: "code", name: "Home", remoteName: "Other", cwd: "/home/user" });
      expect(isHomeChatContainerProject(project, "/home/user")).toBe(true);
    });

    it("kind、remoteName、name 都不匹配时返回 false", () => {
      const project = makeProject({ kind: "code", name: "Other", remoteName: "Other", cwd: "/home/user" });
      expect(isHomeChatContainerProject(project, "/home/user")).toBe(false);
    });
  });

  describe("findHomeChatContainerProject", () => {
    it("空 homeDir 返回 null", () => {
      const projects = [makeProject()];
      expect(findHomeChatContainerProject(projects, null)).toBeNull();
      expect(findHomeChatContainerProject(projects, undefined)).toBeNull();
    });

    it("空列表返回 null", () => {
      expect(findHomeChatContainerProject([], "/home/user")).toBeNull();
    });

    it("找到第一个匹配项目", () => {
      // a: kind=code, name=Other - 不匹配(无关项目)
      const a = makeProject({ id: "a" as never, kind: "code", name: "Other", remoteName: "Other" });
      // b: kind=chat - 匹配
      const b = makeProject({ id: "b" as never, kind: "chat" });
      // c: kind=chat - 也匹配,但应取第一个
      const c = makeProject({ id: "c" as never, kind: "chat" });
      const result = findHomeChatContainerProject([a, b, c], "/home/user");
      expect(result?.id).toBe("b");
    });

    it("未找到返回 null", () => {
      const a = makeProject({ id: "a" as never, kind: "chat", cwd: "/other" });
      expect(findHomeChatContainerProject([a], "/home/user")).toBeNull();
    });
  });

  describe("ensureHomeChatProject", () => {
    it("nativeApi 不可用返回 null", async () => {
      mockReadNativeApi.mockReturnValue(undefined);
      const result = await ensureHomeChatProject("/home/user");
      expect(result).toBeNull();
      expect(mockDispatchCommand).not.toHaveBeenCalled();
    });

    it("已存在 canonical 项目时直接返回 ID,不调用 dispatchCommand 创建", async () => {
      const existingId = "existing-proj" as ProjectId;
      mockReadNativeApi.mockReturnValue({
        orchestration: { dispatchCommand: mockDispatchCommand },
      });
      mockStoreGetState.mockReturnValue({
        projects: [
          {
            id: existingId,
            kind: "chat",
            name: "Home",
            remoteName: "Home",
            folderName: "Home",
            localName: null,
            cwd: "/home/user",
            defaultModelSelection: null,
            expanded: false,
            scripts: [],
          },
        ],
        threadIds: [],
      });

      const result = await ensureHomeChatProject("/home/user");
      expect(result).toBe(existingId);
      // 不应调用 dispatchCommand 创建新项目
      const createCalls = mockDispatchCommand.mock.calls.filter(
        ([cmd]) => cmd?.type === "project.create",
      );
      expect(createCalls).toHaveLength(0);
    });

    it("canonical 不存在时调用 project.create 创建新项目", async () => {
      mockReadNativeApi.mockReturnValue({
        orchestration: { dispatchCommand: mockDispatchCommand },
      });
      mockStoreGetState.mockReturnValue({
        projects: [],
        threadIds: [],
      });

      const result = await ensureHomeChatProject("/home/user");
      expect(result).toBe("proj-id");
      const createCall = mockDispatchCommand.mock.calls.find(
        ([cmd]) => cmd?.type === "project.create",
      );
      expect(createCall).toBeDefined();
      const cmd = createCall![0] as { kind: string; title: string; workspaceRoot: string };
      expect(cmd.kind).toBe("chat");
      expect(cmd.title).toBe("Home");
      expect(cmd.workspaceRoot).toBe("/home/user");
    });
  });

  describe("prewarmHomeChatProject", () => {
    it("不阻塞,fire-and-forget 调用", () => {
      mockReadNativeApi.mockReturnValue(undefined);
      // 同步调用不应抛错
      expect(() => prewarmHomeChatProject("/home/user")).not.toThrow();
    });
  });
});
