/**
 * @file useRecentComposerCommands
 * @description 跟踪用户在 Composer 中最近使用过的命令 + 增强分组匹配 (P1-7)
 *
 * ## 目标
 *
 * 1. **Recent 优先**: 顶部单独分组展示「最近使用」的 5 条命令,提高回访效率
 * 2. **分组**: 菜单按 `recent / skills / slash-commands / mentions` 4 组隔离
 * 3. **Skill 模糊匹配**: 内部用 fuzzy 算法,支持跨词边界/容错
 *
 * ## 持久化
 *
 * - 通过 `useLocalStorage` 持久化,key: `composer.recent-commands.v1`
 * - 上限 20 条,超出时按 LRU 淘汰
 *
 * ## a11y
 *
 * - 每个分组有 `aria-label`,屏幕阅读器能区分"最近 / 技能 / 命令 / 提及"
 */

import { useCallback, useMemo } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { fuzzyMatch, fuzzyScore } from "~/lib/fuzzySearch";

/** 最近使用命令条目 */
export interface RecentCommandEntry {
  /** 命令唯一 ID(由 type + 名称 拼出) */
  id: string;
  /** 命令类型:slash / skill / mention / plugin */
  kind: "slash" | "skill" | "mention" | "plugin";
  /** 命令显示名 */
  label: string;
  /** 命令描述(可选) */
  description?: string;
  /** 最近一次使用时间戳(ms) */
  lastUsedAt: number;
  /** 使用次数(用于排序加权) */
  useCount: number;
}

const STORAGE_KEY = "composer.recent-commands.v1";
const MAX_ENTRIES = 20;
const RECENT_GROUP_SIZE = 5;

/** 默认值 */
const EMPTY_RECENT: RecentCommandEntry[] = [];

/**
 * 跟踪 + 持久化最近使用的 Composer 命令
 */
export function useRecentComposerCommands() {
  const [recents, setRecents] = useLocalStorage<RecentCommandEntry[]>(
    STORAGE_KEY,
    EMPTY_RECENT,
  );

  /** 记录一次使用 */
  const recordUse = useCallback(
    (input: { id: string; kind: RecentCommandEntry["kind"]; label: string; description?: string }) => {
      const now = Date.now();
      setRecents((prev) => {
        const filtered = prev.filter((e) => e.id !== input.id);
        const next: RecentCommandEntry[] = [
          {
            id: input.id,
            kind: input.kind,
            label: input.label,
            description: input.description,
            lastUsedAt: now,
            useCount: (prev.find((e) => e.id === input.id)?.useCount ?? 0) + 1,
          },
          ...filtered,
        ];
        return next.slice(0, MAX_ENTRIES);
      });
    },
    [setRecents],
  );

  /** 清空历史 */
  const clearRecents = useCallback(() => {
    setRecents([]);
  }, [setRecents]);

  /** 提取最近 N 条(按 lastUsedAt 降序) */
  const recentSlice = useMemo(
    () => recents.slice(0, RECENT_GROUP_SIZE),
    [recents],
  );

  return {
    recents,
    recentSlice,
    recordUse,
    clearRecents,
    recentGroupSize: RECENT_GROUP_SIZE,
    maxEntries: MAX_ENTRIES,
  };
}

/**
 * 把菜单项按分组(recent / skills / commands / mentions)分类
 *
 * @param items - 全部菜单项
 * @param recentIds - 最近使用命令的 ID 集合
 */
export function partitionMenuItemsByGroup<
  T extends {
    id: string;
    type: string;
  },
>(items: readonly T[], recentIds: ReadonlySet<string>) {
  const recent: T[] = [];
  const skills: T[] = [];
  const commands: T[] = [];
  const mentions: T[] = [];

  for (const item of items) {
    if (recentIds.has(item.id)) {
      recent.push(item);
    }
    if (item.type === "skill" || item.type.startsWith("skill-")) {
      skills.push(item);
    } else if (item.type === "slash" || item.type === "command") {
      commands.push(item);
    } else if (item.type === "mention" || item.type.startsWith("mention-")) {
      mentions.push(item);
    }
  }
  return { recent, skills, commands, mentions };
}

/**
 * 对技能列表做模糊匹配,返回带分数的条目
 *
 * 排序规则:
 * 1. fuzzyScore 高 → 前
 * 2. label 短 → 前
 * 3. 字典序
 */
export function fuzzyMatchSkills<
  T extends { id: string; label: string; description?: string },
>(items: readonly T[], query: string): T[] {
  const trimmed = query.trim();
  if (!trimmed) return [...items];

  const scored: Array<{ item: T; score: number }> = [];
  const lcQuery = trimmed.toLowerCase();
  for (const item of items) {
    const blob = `${item.label} ${item.description ?? ""}`;
    const lcBlob = blob.toLowerCase();
    const matches = fuzzyMatch(lcQuery, lcBlob);
    if (!matches) continue;
    const score = fuzzyScore(lcQuery, lcBlob, matches);
    scored.push({ item, score });
  }
  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.item.label.length !== b.item.label.length) {
      return a.item.label.length - b.item.label.length;
    }
    return a.item.label.localeCompare(b.item.label);
  });
  return scored.map((s) => s.item);
}
