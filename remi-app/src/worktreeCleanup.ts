/**
 * @file worktreeCleanup.ts
 * @description 工作树（Worktree）清理辅助工具。
 * 提供判断工作树路径是否为孤立（仅被单个线程使用）的逻辑，
 * 以及工作树路径的显示格式化功能。
 */

import type { Thread } from "./types";

/**
 * 归一化工作树路径，去除首尾空白。
 *
 * @param path - 原始工作树路径
 * @returns 去除空白后的路径，若为空则返回 null
 */
function normalizeWorktreePath(path: string | null): string | null {
  const trimmed = path?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

/**
 * 获取指定线程的孤立工作树路径。
 * 若该线程的工作树路径仅被此线程使用（其他线程不共享同一路径），
 * 则认为该路径为孤立的，可以安全清理。
 *
 * @param threads - 所有线程列表
 * @param threadId - 目标线程 ID
 * @returns 孤立的工作树路径，若不孤立或不存在则返回 null
 *
 * @example
 * ```ts
 * const orphanedPath = getOrphanedWorktreePathForThread(threads, "thread-123");
 * if (orphanedPath) {
 *   // 可以安全清理该工作树目录
 *   cleanupWorktree(orphanedPath);
 * }
 * ```
 */
export function getOrphanedWorktreePathForThread(
  threads: readonly Thread[],
  threadId: Thread["id"],
): string | null {
  const targetThread = threads.find((thread) => thread.id === threadId);
  if (!targetThread) {
    return null;
  }

  const targetWorktreePath = normalizeWorktreePath(targetThread.worktreePath);
  if (!targetWorktreePath) {
    return null;
  }

  const isShared = threads.some((thread) => {
    if (thread.id === threadId) {
      return false;
    }
    return normalizeWorktreePath(thread.worktreePath) === targetWorktreePath;
  });

  return isShared ? null : targetWorktreePath;
}

/**
 * 将工作树路径格式化为简洁的显示文本。
 * 将路径统一为正斜杠格式，并仅取最后一个路径段作为显示名称。
 * 例如 "/home/user/projects/my-app" 显示为 "my-app"。
 *
 * @param worktreePath - 原始工作树路径
 * @returns 格式化后的显示文本
 *
 * @example
 * ```ts
 * formatWorktreePathForDisplay("/home/user/projects/my-app"); // => "my-app"
 * formatWorktreePathForDisplay("C:\\Users\\dev\\project"); // => "project"
 * ```
 */
export function formatWorktreePathForDisplay(worktreePath: string): string {
  const trimmed = worktreePath.trim();
  if (!trimmed) {
    return worktreePath;
  }

  const normalized = trimmed.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/");
  const lastPart = parts[parts.length - 1]?.trim() ?? "";
  return lastPart.length > 0 ? lastPart : trimmed;
}
