/**
 * @file 根路由事件失效化模块
 * @description 分类流式编排事件，判断哪些事件应该使共享查询缓存失效
 * @layer 根路由工具函数
 * @exports 提供者和 Git 查询缓存的事件失效化判断函数
 */

import type { OrchestrationEvent, ThreadId } from "@remi-code/contracts";
import { resolveThreadWorkspaceCwd } from "@remi-code/shared/threadEnvironment";

import type { AppState } from "../store";
import { getThreadFromState } from "../threadDerivation";

/**
 * 文件变更事件类型集合
 * @description 这些事件会导致文件系统发生变化，需要使相关缓存失效
 */
const FILE_CHANGE_EVENT_TYPES = new Set<OrchestrationEvent["type"]>([
  "thread.turn-diff-completed", // 轮次差异对比完成
  "thread.reverted", // 线程已回滚
  "thread.conversation-rolled-back", // 对话已回滚
]);

/**
 * 判断是否应该使提供者查询缓存失效
 * @param event - 编排事件对象
 * @returns 如果事件类型属于文件变更事件，则返回 true，表示需要刷新提供者相关缓存
 */
export function shouldInvalidateProviderQueriesForEvent(event: OrchestrationEvent): boolean {
  return FILE_CHANGE_EVENT_TYPES.has(event.type);
}

/**
 * 判断是否应该使 Git 查询缓存失效
 * @param event - 编排事件对象
 * @returns 如果事件是文件变更事件，或者是包含分支/环境/worktree 等元数据变更的 meta-updated 事件，则返回 true
 * @description Git 缓存失效范围比提供者缓存更广，还包括线程元数据中与 Git 相关的字段变更
 */
export function shouldInvalidateGitQueriesForEvent(event: OrchestrationEvent): boolean {
  // 文件变更事件必然需要刷新 Git 缓存
  if (FILE_CHANGE_EVENT_TYPES.has(event.type)) {
    return true;
  }

  // 非 meta-updated 事件不需要处理
  if (event.type !== "thread.meta-updated") {
    return false;
  }

  // 检查 meta-updated 事件中是否包含 Git 相关的元数据变更
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
 * 获取需要刷新 Git 缓存的线程 ID
 * @param event - 编排事件对象
 * @returns 如果事件需要刷新 Git 缓存且包含线程 ID，则返回该线程 ID，否则返回 null
 * @description 用于定位需要刷新缓存的具体线程
 */
export function getGitInvalidationThreadIdForEvent(event: OrchestrationEvent): ThreadId | null {
  if (!shouldInvalidateGitQueriesForEvent(event)) {
    return null;
  }
  return "threadId" in event.payload ? (event.payload.threadId as ThreadId) : null;
}

/**
 * 解析需要刷新 Git 缓存的线程工作目录
 * @param state - 应用状态对象
 * @param threadId - 线程 ID
 * @returns 线程对应的工作目录路径，如果无法解析则返回 null
 * @description 在领域事件应用后解析，确保 worktree 元数据变更指向新的工作目录
 */
export function resolveGitInvalidationCwdForThreadId(
  state: AppState,
  threadId: ThreadId,
): string | null {
  // 优先从状态中获取线程，如果不存在则从线程列表中查找
  const thread =
    getThreadFromState(state, threadId) ??
    state.threads.find((candidate) => candidate.id === threadId);
  if (!thread) {
    return null;
  }
  // 获取线程所属项目的根工作目录
  const projectCwd = state.projects.find((project) => project.id === thread.projectId)?.cwd ?? null;
  // 根据项目目录、环境模式和 worktree 路径解析最终的工作目录
  return resolveThreadWorkspaceCwd({
    projectCwd,
    envMode: thread.envMode,
    worktreePath: thread.worktreePath,
  });
}
