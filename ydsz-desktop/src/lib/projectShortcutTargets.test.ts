/**
 * @file projectShortcutTargets 单元测试
 *
 * 覆盖项目快捷方式目标解析:
 *
 * 1. resolveCurrentProjectTargetId - 解析当前聚焦项目目标
 * 2. resolveLatestProjectTargetId - 解析最近使用项目目标
 *
 * 关键规则:仅 kind 为 "project" 的活跃项目可用
 */

import { describe, expect, it } from "vitest";

import type { ProjectId } from "@ydsz-buddy/contracts";
import type { Project } from "../types";
import {
  resolveCurrentProjectTargetId,
  resolveLatestProjectTargetId,
} from "./projectShortcutTargets";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj-1" as ProjectId,
    kind: "project",
    name: "test",
    remoteName: "test",
    folderName: "test",
    localName: null,
    cwd: "/path",
    defaultModelSelection: null,
    expanded: false,
    scripts: [],
    ...overrides,
  };
}

describe("projectShortcutTargets", () => {
  describe("resolveCurrentProjectTargetId", () => {
    it("null 焦点项目返回 null", () => {
      expect(resolveCurrentProjectTargetId([], null)).toBeNull();
    });

    it("空列表返回 null", () => {
      expect(resolveCurrentProjectTargetId([], "proj-1" as ProjectId)).toBeNull();
    });

    it("匹配 kind=project 返回 ID", () => {
      const project = makeProject({ id: "p1" as ProjectId });
      expect(resolveCurrentProjectTargetId([project], "p1" as ProjectId)).toBe("p1");
    });

    it("kind=chat 不可用", () => {
      const project = makeProject({ id: "p1" as ProjectId, kind: "chat" });
      expect(resolveCurrentProjectTargetId([project], "p1" as ProjectId)).toBeNull();
    });

    it("id 不匹配返回 null", () => {
      const project = makeProject({ id: "p1" as ProjectId });
      expect(resolveCurrentProjectTargetId([project], "p2" as ProjectId)).toBeNull();
    });

    it("多项目中匹配目标", () => {
      const a = makeProject({ id: "p1" as ProjectId, name: "a" });
      const b = makeProject({ id: "p2" as ProjectId, name: "b" });
      const c = makeProject({ id: "p3" as ProjectId, name: "c" });
      expect(resolveCurrentProjectTargetId([a, b, c], "p2" as ProjectId)).toBe("p2");
    });
  });

  describe("resolveLatestProjectTargetId", () => {
    it("null 最近项目返回 null", () => {
      expect(resolveLatestProjectTargetId([], null)).toBeNull();
    });

    it("匹配 kind=project 返回 ID", () => {
      const project = makeProject({ id: "p1" as ProjectId });
      expect(resolveLatestProjectTargetId([project], "p1" as ProjectId)).toBe("p1");
    });

    it("kind=chat 不可用", () => {
      const project = makeProject({ id: "p1" as ProjectId, kind: "chat" });
      expect(resolveLatestProjectTargetId([project], "p1" as ProjectId)).toBeNull();
    });
  });
});
