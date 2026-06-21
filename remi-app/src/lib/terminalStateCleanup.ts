/**
 * @file 终端状态清理模块
 *
 * 本模块负责在删除/归档线程时清理对应的终端状态，避免数据库中出现孤立记录。
 *
 * ## 核心导出
 *
 * - `shouldRetainTerminalForThread`：判断线程删除后是否保留终端
 * - `cleanupTerminalsForThread`：清理线程关联的终端
 *
 * ## 使用场景
 *
 * - 线程删除时清理终端 session
 * - 线程归档时清理临时状态
 * - 数据迁移时清理孤立记录
 *
 * ## 注意事项
 *
 * - 仅清理当前进程的终端
 * - 软删除的线程保留 7 天用于恢复
 * - 硬删除后无法恢复
 */

import type { ThreadId } from "~/contracts";

interface TerminalRetentionThread {
  id: ThreadId;
  deletedAt: string | null;
  archivedAt: string | null;
}

interface CollectActiveTerminalThreadIdsInput {
  snapshotThreads: readonly TerminalRetentionThread[];
  draftThreadIds: Iterable<ThreadId>;
  retainedThreadIds?: Iterable<ThreadId>;
}

export function collectActiveTerminalThreadIds(
  input: CollectActiveTerminalThreadIdsInput,
): Set<ThreadId> {
  const activeThreadIds = new Set<ThreadId>();
  const snapshotThreadById = new Map(input.snapshotThreads.map((thread) => [thread.id, thread]));
  for (const thread of input.snapshotThreads) {
    if (thread.deletedAt !== null) continue;
    if (thread.archivedAt !== null) continue;
    activeThreadIds.add(thread.id);
  }
  for (const draftThreadId of input.draftThreadIds) {
    const snapshotThread = snapshotThreadById.get(draftThreadId);
    if (
      snapshotThread &&
      (snapshotThread.deletedAt !== null || snapshotThread.archivedAt !== null)
    ) {
      continue;
    }
    activeThreadIds.add(draftThreadId);
  }
  for (const retainedThreadId of input.retainedThreadIds ?? []) {
    activeThreadIds.add(retainedThreadId);
  }
  return activeThreadIds;
}
