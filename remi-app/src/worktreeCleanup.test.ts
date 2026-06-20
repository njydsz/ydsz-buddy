/**
 * @file worktreeCleanup 工具测试
 */

import { describe, expect, it } from "vitest";

import { formatWorktreePathForDisplay, getOrphanedWorktreePathForThread } from "./worktreeCleanup";
import type { Thread } from "./types";

const makeThread = (id: string, worktreePath: string | null): Thread =>
  ({
    id,
    worktreePath,
  } as unknown as Thread);

describe("getOrphanedWorktreePathForThread", () => {
  it("returns null when thread does not exist", () => {
    expect(getOrphanedWorktreePathForThread([], "missing")).toBeNull();
  });

  it("returns null when target thread has no worktree path", () => {
    const t = makeThread("a", null);
    expect(getOrphanedWorktreePathForThread([t], "a")).toBeNull();
  });

  it("returns the path when only one thread uses it", () => {
    const t = makeThread("a", "/wt/a");
    expect(getOrphanedWorktreePathForThread([t], "a")).toBe("/wt/a");
  });

  it("returns null when another thread shares the worktree path", () => {
    const a = makeThread("a", "/wt/shared");
    const b = makeThread("b", "/wt/shared");
    expect(getOrphanedWorktreePathForThread([a, b], "a")).toBeNull();
  });

  it("trims whitespace and returns valid path", () => {
    const t = makeThread("a", "  /wt/a  ");
    expect(getOrphanedWorktreePathForThread([t], "a")).toBe("/wt/a");
  });
});

describe("formatWorktreePathForDisplay", () => {
  it("returns the last segment of a unix path", () => {
    expect(formatWorktreePathForDisplay("/home/user/projects/my-app")).toBe("my-app");
  });

  it("returns the last segment of a windows path", () => {
    expect(formatWorktreePathForDisplay("C:\\Users\\dev\\project")).toBe("project");
  });

  it("trims trailing slashes", () => {
    expect(formatWorktreePathForDisplay("/foo/bar/")).toBe("bar");
  });

  it("returns the input when it has no separator", () => {
    expect(formatWorktreePathForDisplay("just-a-name")).toBe("just-a-name");
  });

  it("handles empty string by returning it unchanged", () => {
    expect(formatWorktreePathForDisplay("")).toBe("");
  });
});
