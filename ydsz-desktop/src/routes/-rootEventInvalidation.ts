/**
 * @file 根路由事件失效判断模块
 * @description 对 WebSocket 流中的编排事件进行分类，判断哪些事件需要使 Provider/Project 和 Git 查询缓存失效。
 *   用于根路由的 EventRouter 组件，在事件发生时精准清除相关缓存而非全量刷新。
 * @layer 根路由工具层
 * @depends OrchestrationEvent, ThreadId, AppState, getThreadFromState
 */

import type { OrchestrationEvent, ThreadId } from "@ydsz-buddy/contracts";
import { resolveThreadWorkspaceCwd } from "@njydsz/shared/threadEnvironment";

import type { AppState } from "../store";
import { getThreadFromState } from "../threadDerivation";

// 文件变更事件类型集合：这些事件会导致文件内容变化，需要刷新相关缓存
const FILE_CHANGE_EVENT_TYPES = new Set<OrchestrationEvent["type"]>([
  "thread.turn-diff-completed", // Diff 完成
  "thread.reverted",            // 回退操作
  "thread.conversation.rolled-back", // 对话回滚
]);

/**
 * 判断事件是否需要使 Provider/Project 查询缓存失效
 * @param event - 编排事件
 * @returns 如果需要失效则返回 true
 */
export function shouldInvalidateProviderQueriesForEvent(event: OrchestrationEvent): boolean {
  return FILE_CHANGE_EVENT_TYPES.has(event.type);
}

/**
 * 判断事件是否需要使 Git 查询缓存失效
 * @param event - 编排事件
 * @returns 如果需要失效则返回 true
 */
export function shouldInvalidateGitQueriesForEvent(event: OrchestrationEvent): boolean {
  // 文件变更事件一定需要失效
  if (FILE_CHANGE_EVENT_TYPES.has(event.type)) {
    return true;
  }

  // 只有 meta-updated 事件需要进一步检查
  if (event.type !== "thread.meta-updated") {
    return false;
  }

  // 检查是否变更了与 Git 相关的元数据
  return (
    event.payload.branch !== undefined ||
    event.payload.envMode !== undefined ||
    event.payload.worktreePath !== undefined ||
    event.payload.associatedWorktreePath !== undefined ||
    event.payload.associatedWorktreeBranch !== undefined ||
    event.payload.associatedWorktreeRef !== undefined
  );
}

/**
 * 从事件中获取需要失效缓存的线程 ID
 * @param event - 编排事件
 * @returns 线程 ID，如果事件不需要 Git 缓存失效则返回 null
 */
export function getGitInvalidationThreadIdForEvent(event: OrchestrationEvent): ThreadId | null {
  if (!shouldInvalidateGitQueriesForEvent(event)) {
    return null;
  }
  return "threadId" in event.payload ? (event.payload.threadId as ThreadId) : null;
}

/**
 * 根据线程 ID 解析需要失效的 Git 工作目录
 * @description 需要在领域事件应用之后调用，以确保 worktree 元数据变更指向新的工作目录
 * @param state - 应用状态
 * @param threadId - 线程 ID
 * @returns 工作目录路径，如果无法解析则返回 null
 */
export function resolveGitInvalidationCwdForThreadId(
  state: AppState,
  threadId: ThreadId,
): string | null {
  const thread =
    getThreadFromState(state, threadId) ??
    state.threads.find((candidate) => candidate.id === threadId);
  if (!thread) {
    return null;
  }
  const projectCwd = state.projects.find((project) => project.id === thread.projectId)?.cwd ?? null;
  return resolveThreadWorkspaceCwd({
    projectCwd,
    envMode: thread.envMode,
    worktreePath: thread.worktreePath,
  });
}
