/**
 * @file 工作区终端布局预设测试
 */

import { describe, expect, it } from "vitest";

import {
  createWorkspaceTerminalGroupFromPreset,
  DEFAULT_WORKSPACE_LAYOUT_PRESET_ID,
  ensureTerminalIdsForPreset,
  getWorkspaceLayoutPreset,
  getWorkspaceLayoutPresetSlotCount,
  WORKSPACE_LAYOUT_PRESETS,
} from "./workspaceTerminalLayoutPresets";

describe("WORKSPACE_LAYOUT_PRESETS", () => {
  it("contains all six preset ids", () => {
    const ids = WORKSPACE_LAYOUT_PRESETS.map((p) => p.id);
    expect(ids).toEqual(["single", "two-columns", "two-rows", "top-main", "left-main", "quad"]);
  });
});

describe("getWorkspaceLayoutPreset", () => {
  it("returns preset definition for valid id", () => {
    const preset = getWorkspaceLayoutPreset("quad");
    expect(preset.slotCount).toBe(4);
    expect(preset.title).toBe("Quad");
  });

  it("returns single preset for unknown id", () => {
    const preset = getWorkspaceLayoutPreset("nonexistent");
    expect(preset.id).toBe(DEFAULT_WORKSPACE_LAYOUT_PRESET_ID);
  });
});

describe("getWorkspaceLayoutPresetSlotCount", () => {
  it("returns 4 for quad", () => {
    expect(getWorkspaceLayoutPresetSlotCount("quad")).toBe(4);
  });

  it("returns 1 for single", () => {
    expect(getWorkspaceLayoutPresetSlotCount("single")).toBe(1);
  });

  it("returns 1 for unknown id (defaults to single)", () => {
    expect(getWorkspaceLayoutPresetSlotCount("nope")).toBe(1);
  });
});

describe("ensureTerminalIdsForPreset", () => {
  it("returns existing ids when count satisfies preset", () => {
    const ids = ensureTerminalIdsForPreset(["a", "b"], "two-columns", () => "new");
    expect(ids).toEqual(["a", "b"]);
  });

  it("generates new ids when count is insufficient", () => {
    let counter = 0;
    const ids = ensureTerminalIdsForPreset(["a"], "quad", () => `new-${counter++}`);
    expect(ids).toHaveLength(4);
    expect(ids[0]).toBe("a");
  });

  it("falls back to default id when input is empty", () => {
    const ids = ensureTerminalIdsForPreset([], "single", () => "should-not-be-used");
    // 空数组会被规范化为 ["default"]，此时已有 1 个 slot
    expect(ids).toHaveLength(1);
  });
});

describe("createWorkspaceTerminalGroupFromPreset", () => {
  it("creates a single leaf for the single preset", () => {
    const group = createWorkspaceTerminalGroupFromPreset({
      presetId: "single",
      terminalIds: ["term-1"],
      activeTerminalId: "term-1",
    });
    expect(group.layout.type).toBe("terminal");
    if (group.layout.type === "terminal") {
      expect(group.layout.terminalIds).toEqual(["term-1"]);
    }
  });

  it("creates a horizontal split for two-columns", () => {
    const group = createWorkspaceTerminalGroupFromPreset({
      presetId: "two-columns",
      terminalIds: ["t1", "t2"],
      activeTerminalId: "t1",
    });
    expect(group.layout.type).toBe("split");
    if (group.layout.type === "split") {
      expect(group.layout.direction).toBe("horizontal");
      expect(group.layout.children).toHaveLength(2);
    }
  });

  it("creates a vertical split for two-rows", () => {
    const group = createWorkspaceTerminalGroupFromPreset({
      presetId: "two-rows",
      terminalIds: ["t1", "t2"],
      activeTerminalId: "t1",
    });
    if (group.layout.type === "split") {
      expect(group.layout.direction).toBe("vertical");
    }
  });

  it("creates a quad layout with 4 leaves", () => {
    const group = createWorkspaceTerminalGroupFromPreset({
      presetId: "quad",
      terminalIds: ["t1", "t2", "t3", "t4"],
      activeTerminalId: "t1",
    });
    if (group.layout.type === "split") {
      const collectLeaves = (node: typeof group.layout): number => {
        if (node.type === "terminal") return 1;
        if (node.type === "split") {
          return node.children.reduce((acc, c) => acc + collectLeaves(c), 0);
        }
        return 0;
      };
      expect(collectLeaves(group.layout)).toBe(4);
    }
  });

  it("falls back to default preset for unknown id", () => {
    const group = createWorkspaceTerminalGroupFromPreset({
      presetId: "unknown",
      terminalIds: ["t1"],
      activeTerminalId: "t1",
    });
    expect(group.id).toContain("single");
  });
});
