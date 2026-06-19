/**
 * @file threadEnvironment.ts
 * @description 线程环境配置解析工具模块
 * @purpose 提供线程工作区状态、环境模式和工作目录解析的共享工具函数
 * @exports 环境模式解析、工作区状态判断、工作目录解析等工具函数
 */

import type { ThreadEnvironmentMode } from "@remi-code/contracts";

/**
 * @type ResolvedThreadWorkspaceState
 * @description 解析后的线程工作区状态类型
 * @property {"local"} local - 本地模式，直接使用项目根目录
 * @property {"worktree-pending"} worktree-pending - Worktree 模式但尚未就绪（路径未提供）
 * @property {"worktree-ready"} worktree-ready - Worktree 模式且已就绪（路径已提供）
 */
export type ResolvedThreadWorkspaceState = "local" | "worktree-pending" | "worktree-ready";

/**
 * @function resolveThreadEnvironmentMode
 * @description 解析线程环境模式
 * @param {Object} input - 输入参数
 * @param {ThreadEnvironmentMode | null | undefined} input.envMode - 环境模式配置
 * @param {string | null | undefined} input.worktreePath - Worktree 路径
 * @returns {ThreadEnvironmentMode} 解析后的环境模式
 * @note 如果提供了 worktreePath，则强制返回 "worktree" 模式；否则使用配置的模式或默认 "local"
 */
export function resolveThreadEnvironmentMode(input: {
  envMode?: ThreadEnvironmentMode | null | undefined;
  worktreePath?: string | null | undefined;
}): ThreadEnvironmentMode {
  // 如果存在 worktree 路径，说明是 worktree 模式
  if (input.worktreePath) {
    return "worktree";
  }
  // 否则使用配置的模式，未配置则默认为 local
  return input.envMode ?? "local";
}

/**
 * @function resolveThreadWorkspaceState
 * @description 解析线程工作区状态
 * @param {Object} input - 输入参数
 * @param {ThreadEnvironmentMode | null | undefined} input.envMode - 环境模式配置
 * @param {string | null | undefined} input.worktreePath - Worktree 路径
 * @returns {ResolvedThreadWorkspaceState} 解析后的工作区状态
 * @note 根据环境模式和 worktree 路径判断工作区是否就绪
 */
export function resolveThreadWorkspaceState(input: {
  envMode?: ThreadEnvironmentMode | null | undefined;
  worktreePath?: string | null | undefined;
}): ResolvedThreadWorkspaceState {
  const mode = resolveThreadEnvironmentMode(input);
  // 本地模式直接返回 local
  if (mode === "local") {
    return "local";
  }
  // worktree 模式下，根据路径是否存在判断就绪状态
  return input.worktreePath ? "worktree-ready" : "worktree-pending";
}

/**
 * @function isPendingThreadWorktree
 * @description 判断线程的 worktree 是否处于待就绪状态
 * @param {Object} input - 输入参数
 * @param {ThreadEnvironmentMode | null | undefined} input.envMode - 环境模式配置
 * @param {string | null | undefined} input.worktreePath - Worktree 路径
 * @returns {boolean} 如果 worktree 待就绪返回 true，否则返回 false
 */
export function isPendingThreadWorktree(input: {
  envMode?: ThreadEnvironmentMode | null | undefined;
  worktreePath?: string | null | undefined;
}): boolean {
  return resolveThreadWorkspaceState(input) === "worktree-pending";
}

/**
 * @function resolveThreadWorkspaceCwd
 * @description 解析线程工作区的当前工作目录（CWD）
 * @param {Object} input - 输入参数
 * @param {string | null | undefined} input.projectCwd - 项目根目录
 * @param {ThreadEnvironmentMode | null | undefined} input.envMode - 环境模式配置
 * @param {string | null | undefined} input.worktreePath - Worktree 路径
 * @returns {string | null} 解析后的工作目录，未找到返回 null
 * @note 运行时操作应仅针对已物化的 worktree 路径，确保文件操作在正确的隔离环境中执行
 */
export function resolveThreadWorkspaceCwd(input: {
  projectCwd?: string | null | undefined;
  envMode?: ThreadEnvironmentMode | null | undefined;
  worktreePath?: string | null | undefined;
}): string | null {
  const mode = resolveThreadEnvironmentMode(input);
  // worktree 模式下使用 worktree 路径
  if (mode === "worktree") {
    return input.worktreePath ?? null;
  }
  // 本地模式下使用项目根目录
  return input.projectCwd ?? null;
}

/**
 * @function resolveThreadBranchSourceCwd
 * @description 解析线程分支发现源的当前工作目录
 * @param {Object} input - 输入参数
 * @param {string | null | undefined} input.projectCwd - 项目根目录
 * @param {string | null | undefined} input.worktreePath - Worktree 路径
 * @returns {string | null} 解析后的工作目录，未找到返回 null
 * @note 分支发现操作在 worktree 存在前仍可使用项目根目录，因为 Git 仓库信息是共享的
 */
export function resolveThreadBranchSourceCwd(input: {
  projectCwd?: string | null | undefined;
  worktreePath?: string | null | undefined;
}): string | null {
  // 优先使用 worktree 路径，其次使用项目根目录
  return input.worktreePath ?? input.projectCwd ?? null;
}
