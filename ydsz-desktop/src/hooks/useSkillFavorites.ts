/**
 * @file useSkillFavorites
 * @description 技能收藏 / 排序持久化 Hook
 *
 * 用户在 SkillsView 中可以把常用技能标记为「收藏」，并通过 dnd-kit
 * 拖拽调整顺序。本 Hook 只负责状态持久化（localStorage），不关心 UI。
 *
 * ## 数据形状
 *
 * - 存储 key：`ydsz-buddy:skill-favorites:v1`
 * - 字段：`{ orderedPaths: string[] }`
 *   - `orderedPaths` 是收藏的技能 path 列表（按展示顺序）
 *   - 同一 path 出现多次会被去重，重复项会移到队首
 *
 * ## 核心导出
 *
 * - `useSkillFavorites`：主 Hook
 * - `SkillFavoritesState`：状态类型
 *
 * ## 使用场景
 *
 * - SkillsView 顶部「收藏」区域渲染与排序
 * - 其他视图（如 Composer @ mention 面板）读取收藏
 *
 * ## 注意事项
 *
 * - localStorage 写入失败 / 解析失败时回落到空列表
 * - 不在收藏中的技能 path 不会自动清理（用户主动取消收藏才移除）
 */

import { useCallback, useEffect, useState } from "react";

export const SKILL_FAVORITES_STORAGE_KEY = "ydsz-buddy:skill-favorites:v1";

export interface SkillFavoritesState {
  orderedPaths: string[];
}

const EMPTY_FAVORITES: SkillFavoritesState = { orderedPaths: [] };

function isStringishArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function readFavorites(): SkillFavoritesState {
  if (typeof window === "undefined" || !window.localStorage) {
    return EMPTY_FAVORITES;
  }
  try {
    const raw = window.localStorage.getItem(SKILL_FAVORITES_STORAGE_KEY);
    if (!raw) return EMPTY_FAVORITES;
    const parsed = JSON.parse(raw) as { orderedPaths?: unknown };
    if (!parsed || !isStringishArray(parsed.orderedPaths)) return EMPTY_FAVORITES;
    // 过滤空串 + 去重，保留顺序
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const p of parsed.orderedPaths) {
      if (p.length === 0 || seen.has(p)) continue;
      seen.add(p);
      unique.push(p);
    }
    return { orderedPaths: unique };
  } catch {
    return EMPTY_FAVORITES;
  }
}

function writeFavorites(state: SkillFavoritesState): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(SKILL_FAVORITES_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 配额溢出或写入失败：静默忽略以避免打断用户
  }
}

export interface UseSkillFavoritesResult {
  /** 当前收藏的技能 path（按展示顺序） */
  favorites: ReadonlyArray<string>;
  /** 判断某个 path 是否在收藏中 */
  isFavorite: (path: string) => boolean;
  /** 添加收藏（如果已存在则移到队首） */
  addFavorite: (path: string) => void;
  /** 移除收藏 */
  removeFavorite: (path: string) => void;
  /** 切换收藏状态 */
  toggleFavorite: (path: string) => void;
  /** dnd-kit 拖拽结束后调用：调整顺序 */
  reorderFavorites: (sourceIndex: number, destIndex: number) => void;
  /** 清空所有收藏 */
  clearFavorites: () => void;
}

/**
 * 技能收藏持久化 Hook
 *
 * @returns 收藏状态与变更函数
 */
export function useSkillFavorites(): UseSkillFavoritesResult {
  const [favorites, setFavorites] = useState<ReadonlyArray<string>>(() => readFavorites().orderedPaths);

  // 监听跨标签页 / 同标签页其他位置的 localStorage 写入
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== SKILL_FAVORITES_STORAGE_KEY) return;
      setFavorites(readFavorites().orderedPaths);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const isFavorite = useCallback(
    (path: string) => favorites.includes(path),
    [favorites],
  );

  const persist = useCallback((next: ReadonlyArray<string>) => {
    setFavorites(next);
    writeFavorites({ orderedPaths: [...next] });
  }, []);

  const addFavorite = useCallback(
    (path: string) => {
      if (!path) return;
      if (favorites.includes(path)) {
        // 移到队首
        const filtered = favorites.filter((p) => p !== path);
        persist([path, ...filtered]);
        return;
      }
      persist([path, ...favorites]);
    },
    [favorites, persist],
  );

  const removeFavorite = useCallback(
    (path: string) => {
      if (!favorites.includes(path)) return;
      persist(favorites.filter((p) => p !== path));
    },
    [favorites, persist],
  );

  const toggleFavorite = useCallback(
    (path: string) => {
      if (favorites.includes(path)) {
        removeFavorite(path);
      } else {
        addFavorite(path);
      }
    },
    [addFavorite, favorites, removeFavorite],
  );

  const reorderFavorites = useCallback(
    (sourceIndex: number, destIndex: number) => {
      if (sourceIndex === destIndex) return;
      if (sourceIndex < 0 || sourceIndex >= favorites.length) return;
      if (destIndex < 0 || destIndex >= favorites.length) return;
      const next = [...favorites];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(destIndex, 0, moved);
      persist(next);
    },
    [favorites, persist],
  );

  const clearFavorites = useCallback(() => {
    persist([]);
  }, [persist]);

  return {
    favorites,
    isFavorite,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    reorderFavorites,
    clearFavorites,
  };
}
