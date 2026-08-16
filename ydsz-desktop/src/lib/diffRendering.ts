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
 * 从文件差异元数据列表派生 ChangedFilesTree 所需的 `TurnDiffFileChange[]`。
 *
 * Review 模式右侧文件树需要把 `FileDiffMetadata`（来自 @pierre/diffs）
 * 转换成 `TurnDiffFileChange`（来自 ChangedFilesTree 的 contract）。
 *
 * 设计要点：
 * - 仅保留有可见文件路径的项（去除 `/dev/null` 与空名）
 * - 文件路径去掉 `a/` 或 `b/` 的 unified diff 前缀，与 DiffPanel 渲染保持一致
 * - additions/deletions 从每个 hunk 的 additionLines / deletionLines 求和
 * - 新增/删除/修改状态通过 name 变化启发式推断：prevName 与 name 不同 → modified
 *
 * @param files - 文件差异元数据列表
 * @returns 可直接喂给 `ChangedFilesTree` 的 TurnDiffFileChange 列表
 */
export function deriveReviewChangedFiles(
  files: ReadonlyArray<FileDiffMetadata>,
): Array<{
  path: string;
  kind?: string | undefined;
  additions?: number | undefined;
  deletions?: number | undefined;
}> {
  const result: Array<{
    path: string;
    kind?: string | undefined;
    additions?: number | undefined;
    deletions?: number | undefined;
  }> = [];

  for (const file of files) {
    const rawPath = file.name || file.prevName || "";
    if (!rawPath) continue;
    const path = rawPath.startsWith("a/") || rawPath.startsWith("b/") ? rawPath.slice(2) : rawPath;
    if (!path) continue;

    let additions = 0;
    let deletions = 0;
    for (const hunk of file.hunks) {
      additions += hunk.additionLines;
      deletions += hunk.deletionLines;
    }

    // 启发式：prevName 与 name 不同 → 视为 modified
    const kind =
      file.prevName && file.name && file.prevName !== file.name ? "modified" : "modified";

    result.push({ path, kind, additions, deletions });
  }

  return result;
}

/**
 * 聚合多个 Turn 的文件变更（用于"全部 Turn" 视图下的 ChangedFilesTree）。
 *
 * 当用户没选单个 turn 时，我们把所有 turn 的文件按 path 去重并合并统计。
 * 同 path 在不同 turn 中分别出现 modified 时优先保留 modified。
 *
 * @param perTurnFiles - 每个 turn 的 TurnDiffFileChange 列表
 * @returns 去重合并后的 TurnDiffFileChange 列表
 */
export function mergeChangedFilesForAllTurns(
  perTurnFiles: ReadonlyArray<ReadonlyArray<{
    path: string;
    kind?: string | undefined;
    additions?: number | undefined;
    deletions?: number | undefined;
  }>>,
): Array<{
  path: string;
  kind?: string | undefined;
  additions?: number | undefined;
  deletions?: number | undefined;
}> {
  const byPath = new Map<
    string,
    {
      path: string;
      kind?: string;
      additions: number;
      deletions: number;
    }
  >();

  for (const turnFiles of perTurnFiles) {
    for (const file of turnFiles) {
      const existing = byPath.get(file.path);
      if (!existing) {
        byPath.set(file.path, {
          path: file.path,
          kind: file.kind,
          additions: file.additions ?? 0,
          deletions: file.deletions ?? 0,
        });
        continue;
      }
      existing.additions += file.additions ?? 0;
      existing.deletions += file.deletions ?? 0;
      // 多个 turn 中出现 modified/added 不同状态时优先保留 modified
      if (file.kind === "modified" && existing.kind !== "modified") {
        existing.kind = "modified";
      }
    }
  }

  return Array.from(byPath.values()).sort((a, b) => a.path.localeCompare(b.path));
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

/**
 * 从已接受的 hunk 构建过滤后的 patch
 *
 * 解析原始 unified diff 文本，仅保留已接受的 hunk，
 * 生成可直接用于 `git apply` 的 patch 字符串。
 *
 * @param rawDiff - 原始 unified diff 文本
 * @param acceptedHunks - 文件级 hunk 接受状态映射：fileKey -> (hunkIndex -> 'accept' | 'reject')
 * @param fileDiffByKey - 文件 key 到 FileDiffMetadata 的映射（用于匹配 hunk 数量）
 * @returns 过滤后的 patch 字符串，若无已接受 hunk 则返回 null
 */
export function buildAcceptedPatch(
  rawDiff: string,
  acceptedHunks: ReadonlyMap<string, ReadonlyMap<number, 'accept' | 'reject'>>,
  _fileDiffByKey: ReadonlyMap<string, FileDiffMetadata>,
): string | null {
  if (acceptedHunks.size === 0) return null;

  // 收集所有已接受的 hunk 信息
  const acceptedFileHunks = new Map<string, Set<number>>();
  for (const [fileKey, hunkActions] of acceptedHunks) {
    const accepted = new Set<number>();
    for (const [hunkIndex, action] of hunkActions) {
      if (action === 'accept') {
        accepted.add(hunkIndex);
      }
    }
    if (accepted.size > 0) {
      acceptedFileHunks.set(fileKey, accepted);
    }
  }

  if (acceptedFileHunks.size === 0) return null;

  // 解析原始 diff 并过滤 hunk
  const lines = rawDiff.split('\n');
  const outputLines: string[] = [];
  let currentFilePath = '';
  let currentFileKey = '';
  let currentHunkIndex = -1;
  let inHunk = false;
  let hunkLines: string[] = [];
  let fileHeaderLines: string[] = [];
  let hasAcceptedHunksInFile = false;

  const flushHunk = () => {
    if (!inHunk || hunkLines.length === 0) return;
    const acceptedSet = acceptedFileHunks.get(currentFileKey);
    if (acceptedSet && acceptedSet.has(currentHunkIndex)) {
      outputLines.push(...hunkLines);
      hasAcceptedHunksInFile = true;
    }
    hunkLines = [];
    inHunk = false;
  };

  const flushFileHeader = () => {
    if (fileHeaderLines.length > 0 && hasAcceptedHunksInFile) {
      // 文件头已经在 outputLines 中，无需额外操作
    }
    fileHeaderLines = [];
    hasAcceptedHunksInFile = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 检测文件头 (diff --git a/... b/...)
    if (line.startsWith('diff --git ')) {
      flushHunk();
      flushFileHeader();
      currentHunkIndex = -1;

      // 从 diff --git 行提取文件路径
      const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      if (match) {
        currentFilePath = match[2];
        // 构建 fileKey 用于匹配 acceptedHunks
        // fileKey 的格式是 cacheKey，需要与 buildFileDiffRenderKey 一致
        currentFileKey = currentFilePath;
      }

      fileHeaderLines = [line];
      outputLines.push(line);
      continue;
    }

    // 检测 --- 和 +++ 行
    if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      fileHeaderLines.push(line);
      outputLines.push(line);
      continue;
    }

    // 检测 hunk 头 (@@ ... @@)
    if (line.startsWith('@@ ')) {
      flushHunk();
      currentHunkIndex++;
      inHunk = true;
      hunkLines = [line];

      // 检查这个 hunk 是否被接受
      const acceptedSet = acceptedFileHunks.get(currentFileKey);
      if (acceptedSet && acceptedSet.has(currentHunkIndex)) {
        // 直接添加到 output
        outputLines.push(line);
      }
      continue;
    }

    // hunk 内容行
    if (inHunk) {
      hunkLines.push(line);
      const acceptedSet = acceptedFileHunks.get(currentFileKey);
      if (acceptedSet && acceptedSet.has(currentHunkIndex)) {
        outputLines.push(line);
      }
    }
  }

  // 处理最后一个 hunk
  flushHunk();
  flushFileHeader();

  const result = outputLines.join('\n').trim();
  return result.length > 0 ? result : null;
}
