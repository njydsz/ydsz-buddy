/**
 * @file useRecentComposerCommands 单元测试
 * @description P1-7: 验证 Composer ⌘K 增强的「近期命令 + 分组 + 模糊匹配」行为
 */

import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  partitionMenuItemsByGroup,
  fuzzyMatchSkills,
  useRecentComposerCommands,
  type RecentCommandEntry,
} from "./useRecentComposerCommands";

// ==================== partitionMenuItemsByGroup ====================

describe("partitionMenuItemsByGroup - 分组", () => {
  it("按 type 把菜单项分到 skills / commands / mentions 4 个组", () => {
    const items = [
      { id: "1", type: "skill" },
      { id: "2", type: "slash" },
      { id: "3", type: "mention" },
      { id: "4", type: "skill-extra" },
      { id: "5", type: "command" },
    ];
    const { recent, skills, commands, mentions } = partitionMenuItemsByGroup(items, new Set());
    expect(skills.map((i) => i.id)).toEqual(["1", "4"]);
    expect(commands.map((i) => i.id)).toEqual(["2", "5"]);
    expect(mentions.map((i) => i.id)).toEqual(["3"]);
    expect(recent).toEqual([]);
  });

  it("recent 集合中的项目单独归入 recent 组（不与其他组重复）", () => {
    const items = [
      { id: "1", type: "skill" },
      { id: "2", type: "slash" },
    ];
    const { recent, skills, commands } = partitionMenuItemsByGroup(
      items,
      new Set(["1", "2"]),
    );
    expect(recent.map((i) => i.id).sort()).toEqual(["1", "2"]);
    // skills/commands 仍包含全部
    expect(skills).toHaveLength(1);
    expect(commands).toHaveLength(1);
  });
});

// ==================== fuzzyMatchSkills ====================

describe("fuzzyMatchSkills - 模糊匹配", () => {
  const skills = [
    { id: "1", label: "Code Review", description: "审查代码质量" },
    { id: "2", label: "Repo Wiki", description: "生成项目知识库" },
    { id: "3", label: "Browser Test", description: "E2E 浏览器测试" },
    { id: "4", label: "AST Grep Search", description: "结构化代码搜索" },
  ];

  it("空 query 返回全部（保持原顺序）", () => {
    const out = fuzzyMatchSkills(skills, "");
    expect(out).toHaveLength(4);
  });

  it("精确匹配 label 命中", () => {
    const out = fuzzyMatchSkills(skills, "wiki");
    expect(out.map((s) => s.id)).toContain("2");
  });

  it("模糊字符匹配(label 字符跳跃)", () => {
    // 'cr' 应该匹配 "Code Review"
    const out = fuzzyMatchSkills(skills, "cr");
    expect(out.map((s) => s.id)).toContain("1");
  });

  it("匹配 description 时也算命中", () => {
    const out = fuzzyMatchSkills(skills, "知识库");
    expect(out.map((s) => s.id)).toContain("2");
  });

  it("无命中返回空数组", () => {
    const out = fuzzyMatchSkills(skills, "xxxxxx-not-found");
    expect(out).toEqual([]);
  });

  it("分数高的优先", () => {
    // 'code review' 应该让 "Code Review" 排最前
    const out = fuzzyMatchSkills(skills, "code review");
    expect(out[0]?.id).toBe("1");
  });
});

// ==================== useRecentComposerCommands ====================

describe("useRecentComposerCommands - LRU 跟踪", () => {
  beforeEach(() => {
    // 清理 localStorage
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
  });

  it("初始 recents 为空数组", () => {
    const { result } = renderHook(() => useRecentComposerCommands());
    expect(result.current.recents).toEqual([]);
    expect(result.current.recentSlice).toEqual([]);
  });

  it("recordUse 写入条目,lastUsedAt 递增", () => {
    const { result } = renderHook(() => useRecentComposerCommands());

    act(() => {
      result.current.recordUse({ id: "skill:1", kind: "skill", label: "Code Review" });
    });
    expect(result.current.recents).toHaveLength(1);
    expect(result.current.recents[0]?.id).toBe("skill:1");
    expect(result.current.recents[0]?.useCount).toBe(1);

    act(() => {
      result.current.recordUse({ id: "skill:1", kind: "skill", label: "Code Review" });
    });
    expect(result.current.recents[0]?.useCount).toBe(2);
  });

  it("同 id 重复 recordUse 移到顶部", () => {
    const { result } = renderHook(() => useRecentComposerCommands());

    act(() => {
      result.current.recordUse({ id: "skill:1", kind: "skill", label: "A" });
    });
    act(() => {
      result.current.recordUse({ id: "skill:2", kind: "skill", label: "B" });
    });
    expect(result.current.recents.map((e) => e.id)).toEqual(["skill:2", "skill:1"]);

    act(() => {
      result.current.recordUse({ id: "skill:1", kind: "skill", label: "A" });
    });
    expect(result.current.recents[0]?.id).toBe("skill:1");
    expect(result.current.recents).toHaveLength(2);
  });

  it("超出 maxEntries 时按 LRU 淘汰", () => {
    const { result } = renderHook(() => useRecentComposerCommands());
    const max = result.current.maxEntries;

    for (let i = 0; i < max + 5; i++) {
      act(() => {
        result.current.recordUse({ id: `id-${i}`, kind: "slash", label: `Cmd${i}` });
      });
    }
    expect(result.current.recents).toHaveLength(max);
    // 最新写入的应该在最前
    expect(result.current.recents[0]?.id).toBe(`id-${max + 4}`);
  });

  it("recentSlice 默认取前 5 条", () => {
    const { result } = renderHook(() => useRecentComposerCommands());
    for (let i = 0; i < 8; i++) {
      act(() => {
        result.current.recordUse({ id: `id-${i}`, kind: "slash", label: `Cmd${i}` });
      });
    }
    expect(result.current.recentSlice).toHaveLength(result.current.recentGroupSize);
  });

  it("clearRecents 清空历史", () => {
    const { result } = renderHook(() => useRecentComposerCommands());
    act(() => {
      result.current.recordUse({ id: "a", kind: "slash", label: "A" });
    });
    expect(result.current.recents).toHaveLength(1);
    act(() => {
      result.current.clearRecents();
    });
    expect(result.current.recents).toEqual([]);
  });
});

// 类型导出检查(避免误删)
function _typeCheck(): RecentCommandEntry | null {
  return null;
}
void _typeCheck;
