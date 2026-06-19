/**
 * @file 差异渲染模块
 * @description 提供 git 补丁的渲染、缓存、复制和摘要功能。
 *              依赖 @pierre/diffs 的补丁解析功能。
 */

import { parsePatchFiles } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs/react";

/** 差异主题名称配置 */
export const DIFF_THEME_NAMES = {
  /** 浅色主题（使用 GitHub 浅色主题） */
  light: "github-light",
  /** 深色主题（使用 GitHub 深色主题） */
  dark: "github-dark",
} as const;

/** 差异主题名称类型 */
export type DiffThemeName = (typeof DIFF_THEME_NAMES)[keyof typeof DIFF_THEME_NAMES];

/**
 * 解析差异主题名称
 * @param theme - 主题类型（"light" 或 "dark"）
 * @returns 对应的差异主题名称
 */
export function resolveDiffThemeName(theme: "light" | "dark"): DiffThemeName {
  return theme === "dark" ? DIFF_THEME_NAMES.dark : DIFF_THEME_NAMES.light;
}

/** FNV-1a 32位哈希的偏移基数 */
const FNV_OFFSET_BASIS_32 = 0x811c9dc5;
/** FNV-1a 32位哈希的质数 */
const FNV_PRIME_32 = 0x01000193;
/** 次要哈希种子 */
const SECONDARY_HASH_SEED = 0x9e3779b9;
/** 次要哈希乘数 */
const SECONDARY_HASH_MULTIPLIER = 0x85ebca6b;

/**
 * FNV-1a 32位哈希算法
 * @param input - 输入字符串
 * @param seed - 哈希种子，默认为 FNV 偏移基数
 * @param multiplier - 哈希乘数，默认为 FNV 质数
 * @returns 32位无符号整数哈希值
 */
export function fnv1a32(
  input: string,
  seed = FNV_OFFSET_BASIS_32,
  multiplier = FNV_PRIME_32,
): number {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, multiplier) >>> 0;
  }
  return hash >>> 0;
}

/**
 * 构建补丁缓存键
 * @param patch - 补丁文本
 * @param scope - 缓存作用域，默认为 "diff-panel"
 * @returns 缓存键字符串
 */
export function buildPatchCacheKey(patch: string, scope = "diff-panel"): string {
  const normalizedPatch = patch.trim();
  const primary = fnv1a32(normalizedPatch, FNV_OFFSET_BASIS_32, FNV_PRIME_32).toString(36);
  const secondary = fnv1a32(
    normalizedPatch,
    SECONDARY_HASH_SEED,
    SECONDARY_HASH_MULTIPLIER,
  ).toString(36);
  return `${scope}:${normalizedPatch.length}:${primary}:${secondary}`;
}

/**
 * 解析差异复制文本
 * 返回可复制的源文本，不依赖虚拟化的 DOM 行
 * @param patch - 补丁文本
 * @returns 可复制的文本，如果无效则返回 null
 */
export function resolveDiffCopyText(patch: string | undefined): string | null {
  if (typeof patch !== "string") {
    return null;
  }
  return patch.trim().length > 0 ? patch : null;
}

/**
 * 可渲染补丁类型
 * - "files": 已解析的文件差异列表
 * - "raw": 原始补丁文本（当解析失败时）
 */
export type RenderablePatch =
  | {
      kind: "files";
      files: FileDiffMetadata[];
    }
  | {
      kind: "raw";
      text: string;
      reason: string;
    };

/**
 * 获取可渲染的补丁
 * @param patch - 补丁文本
 * @param cacheScope - 缓存作用域，默认为 "diff-panel"
 * @returns 可渲染的补丁对象，如果输入为空则返回 null
 */
export function getRenderablePatch(
  patch: string | undefined,
  cacheScope = "diff-panel",
): RenderablePatch | null {
  if (!patch) return null;
  const normalizedPatch = patch.trim();
  if (normalizedPatch.length === 0) return null;

  try {
    const parsedPatches = parsePatchFiles(
      normalizedPatch,
      buildPatchCacheKey(normalizedPatch, cacheScope),
    );
    const files = parsedPatches.flatMap((parsedPatch) => parsedPatch.files);
    if (files.length > 0) {
      return { kind: "files", files };
    }

    return {
      kind: "raw",
      text: normalizedPatch,
      reason: "Unsupported diff format. Showing raw patch.",
    };
  } catch {
    return {
      kind: "raw",
      text: normalizedPatch,
      reason: "Failed to parse patch. Showing raw patch.",
    };
  }
}

/**
 * 摘要文件差异统计
 * @param files - 文件差异元数据列表
 * @returns 包含新增行数和删除行数的统计对象
 */
export function summarizeFileDiffStats(files: ReadonlyArray<FileDiffMetadata>): {
  additions: number;
  deletions: number;
} {
  return files.reduce(
    (total, file) => {
      for (const hunk of file.hunks) {
        total.additions += hunk.additionLines;
        total.deletions += hunk.deletionLines;
      }
      return total;
    },
    { additions: 0, deletions: 0 },
  );
}

/**
 * 摘要补丁统计
 * @param patch - 补丁文本
 * @returns 包含新增行数和删除行数的统计对象，如果解析失败则返回 null
 */
export function summarizePatchStats(
  patch: string | undefined,
): { additions: number; deletions: number } | null {
  const renderable = getRenderablePatch(patch, "diff-panel:stats");
  if (renderable?.kind !== "files") return null;
  return summarizeFileDiffStats(renderable.files);
}
