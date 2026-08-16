/**
 * @file terminalNewAction 单元测试
 *
 * 覆盖：
 * - terminalOpen=false → 总是返回 new-group
 * - activeGroup 命中 + activeTerminalId 在 group → new-tab
 * - activeGroup 命中 + normalizedActiveTerminalId 在 group → new-tab
 * - activeGroup 命中 + 不在 group → 退到第一个 terminal
 * - activeGroup 命中 + 都未命中 → 用 normalized id（如果非空）
 * - activeGroup=null → 兜底 new-group
 * - group 优先级：精确 groupId 匹配 > active terminal 命中 > 第一个 group
 *
 * 策略：纯函数 + 构造 ThreadTerminalGroup 输入。
 */

import { describe, expect, it } from "vitest";
import { resolveTerminalNewAction } from "./terminalNewAction";
import type { ThreadTerminalGroup, ThreadTerminalLeafNode } from "../types";

function makeLeaf(paneId: string, terminalIds: string[], activeTerminalId: string): ThreadTerminalLeafNode {
  return { type: "terminal", paneId, terminalIds, activeTerminalId };
}

function makeGroup(id: string, leaf: ThreadTerminalLeafNode, activeTerminalId: string): ThreadTerminalGroup {
  return { id, layout: leaf, activeTerminalId };
}

// =============================================================================
// 1. terminalOpen=false
// =============================================================================

describe("resolveTerminalNewAction - terminalOpen=false", () => {
  it("terminalOpen=false → 总是 new-group", () => {
    const group = makeGroup("g1", makeLeaf("p1", ["t1", "t2"], "t1"), "t1");
    expect(
      resolveTerminalNewAction({
        terminalOpen: false,
        activeTerminalId: "t1",
        activeTerminalGroupId: "g1",
        terminalGroups: [group],
      }),
    ).toEqual({ kind: "new-group" });
  });
});

// =============================================================================
// 2. 命中 activeGroup.activeTerminalId
// =============================================================================

describe("resolveTerminalNewAction - activeTerminalId 命中", () => {
  it("activeGroup.activeTerminalId 在 group → new-tab with that id", () => {
    const group = makeGroup("g1", makeLeaf("p1", ["t1", "t2"], "t1"), "t1");
    const result = resolveTerminalNewAction({
      terminalOpen: true,
      activeTerminalId: "t1",
      activeTerminalGroupId: "g1",
      terminalGroups: [group],
    });
    expect(result).toEqual({ kind: "new-tab", targetTerminalId: "t1" });
  });

  it("activeGroup.activeTerminalId 不在 group 时 → fallback 到 normalized activeTerminalId", () => {
    const group = makeGroup("g1", makeLeaf("p1", ["t1", "t2"], "ghost"), "ghost");
    const result = resolveTerminalNewAction({
      terminalOpen: true,
      activeTerminalId: "  t1  ",
      activeTerminalGroupId: "g1",
      terminalGroups: [group],
    });
    expect(result).toEqual({ kind: "new-tab", targetTerminalId: "t1" });
  });
});

// =============================================================================
// 3. 都不命中时退到 group 第一个 terminal
// =============================================================================

describe("resolveTerminalNewAction - 退到 group 第一个", () => {
  it("activeGroupTerminalIds 都不命中 → 用第一个 terminal id", () => {
    const group = makeGroup("g1", makeLeaf("p1", ["t1", "t2", "t3"], "ghost"), "ghost");
    const result = resolveTerminalNewAction({
      terminalOpen: true,
      activeTerminalId: "ghost",
      activeTerminalGroupId: "g1",
      terminalGroups: [group],
    });
    expect(result).toEqual({ kind: "new-tab", targetTerminalId: "t1" });
  });
});

// =============================================================================
// 4. normalized activeTerminalId 非空
// =============================================================================

describe("resolveTerminalNewAction - 退到 normalized id", () => {
  it("group 为空 + normalized id 非空 → new-tab with normalized id", () => {
    const group = makeGroup("g1", makeLeaf("p1", [], "ghost"), "ghost");
    const result = resolveTerminalNewAction({
      terminalOpen: true,
      activeTerminalId: "  fallback-id  ",
      activeTerminalGroupId: "g1",
      terminalGroups: [group],
    });
    expect(result).toEqual({ kind: "new-tab", targetTerminalId: "fallback-id" });
  });

  it("group 为空 + normalized id 也为空 → new-group", () => {
    const group = makeGroup("g1", makeLeaf("p1", [], "ghost"), "ghost");
    const result = resolveTerminalNewAction({
      terminalOpen: true,
      activeTerminalId: "   ",
      activeTerminalGroupId: "g1",
      terminalGroups: [group],
    });
    expect(result).toEqual({ kind: "new-group" });
  });
});

// =============================================================================
// 5. group 查找优先级
// =============================================================================

describe("resolveTerminalNewAction - group 查找优先级", () => {
  it("activeTerminalGroupId 不存在时 → fallback 到 active terminal 命中的 group", () => {
    const g1 = makeGroup("g1", makeLeaf("p1", ["a1", "a2"], "a1"), "a1");
    const g2 = makeGroup("g2", makeLeaf("p2", ["b1", "b2"], "b1"), "b1");
    const result = resolveTerminalNewAction({
      terminalOpen: true,
      activeTerminalId: "b2",
      activeTerminalGroupId: "g-unknown",
      terminalGroups: [g1, g2],
    });
    // g2.activeTerminalId='b1' 在 g2 中 → 选中 g2
    expect(result).toEqual({ kind: "new-tab", targetTerminalId: "b1" });
  });

  it("activeTerminalGroupId 不存在 + active terminal 也不在 → fallback 到第一个 group", () => {
    const g1 = makeGroup("g1", makeLeaf("p1", ["a1", "a2"], "a1"), "a1");
    const g2 = makeGroup("g2", makeLeaf("p2", ["b1", "b2"], "b1"), "b1");
    const result = resolveTerminalNewAction({
      terminalOpen: true,
      activeTerminalId: "ghost",
      activeTerminalGroupId: "g-unknown",
      terminalGroups: [g1, g2],
    });
    expect(result).toEqual({ kind: "new-tab", targetTerminalId: "a1" });
  });

  it("terminalGroups 为空 + activeTerminalId 非空 → new-tab with id", () => {
    const result = resolveTerminalNewAction({
      terminalOpen: true,
      activeTerminalId: "solo",
      activeTerminalGroupId: "g1",
      terminalGroups: [],
    });
    expect(result).toEqual({ kind: "new-tab", targetTerminalId: "solo" });
  });

  it("terminalGroups 为空 + activeTerminalId 为空 → new-group", () => {
    const result = resolveTerminalNewAction({
      terminalOpen: true,
      activeTerminalId: "  ",
      activeTerminalGroupId: "g1",
      terminalGroups: [],
    });
    expect(result).toEqual({ kind: "new-group" });
  });
});
