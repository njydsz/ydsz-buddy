/**
 * @file 线程环境模式解析模块
 *
 * 本模块提供对线程（Thread）的环境模式（Environment Mode）进行解析的工具：
 *
 * - **环境模式解析**：将 `local` / `worktree` 模式解析为可执行的状态
 * - **工作区状态**：判定当前工作区是 local、worktree-pending 还是 worktree-ready
 * - **跨模式一致性**：确保前端展示与后端执行的环境一致
 *
 * ## 核心导出
 *
 * - `ResolvedThreadWorkspaceState`：线程工作区状态类型
 * - `resolveThreadEnvironmentMode`：解析线程环境模式
 * - `isWorktreeMode`：判断是否为 worktree 模式
 * - `shouldCreateWorktree`：判断是否需要创建 worktree
 *
 * ## 使用场景
 *
 * - 启动线程前决定工作区模式
 * - UI 中展示当前线程的环境状态
 * - worktree 创建/删除时的状态流转
 *
 * ## 注意事项
 *
 * - `local`：直接在项目根目录执行
 * - `worktree`：在 git worktree 中执行（隔离分支）
 * - 模式变更需要重新启动线程
 */

import type { ThreadEnvironmentMode } from "@ydsz-buddy/contracts";

export type ResolvedThreadWorkspaceState = "local" | "worktree-pending" | "worktree-ready";

export function resolveThreadEnvironmentMode(input: {
  envMode?: ThreadEnvironmentMode | null | undefined;
  worktreePath?: string | null | undefined;
}): ThreadEnvironmentMode {
  if (input.worktreePath) {
    return "worktree";
  }
  return input.envMode ?? "local";
}

export function resolveThreadWorkspaceState(input: {
  envMode?: ThreadEnvironmentMode | null | undefined;
  worktreePath?: string | null | undefined;
}): ResolvedThreadWorkspaceState {
  const mode = resolveThreadEnvironmentMode(input);
  if (mode === "local") {
    return "local";
  }
  return input.worktreePath ? "worktree-ready" : "worktree-pending";
}

export function isPendingThreadWorktree(input: {
  envMode?: ThreadEnvironmentMode | null | undefined;
  worktreePath?: string | null | undefined;
}): boolean {
  return resolveThreadWorkspaceState(input) === "worktree-pending";
}

// Runtime-facing operations should only target a materialized worktree path.
export function resolveThreadWorkspaceCwd(input: {
  projectCwd?: string | null | undefined;
  envMode?: ThreadEnvironmentMode | null | undefined;
  worktreePath?: string | null | undefined;
}): string | null {
  const mode = resolveThreadEnvironmentMode(input);
  if (mode === "worktree") {
    return input.worktreePath ?? null;
  }
  return input.projectCwd ?? null;
}

// Branch discovery can still use the project root before a worktree exists.
export function resolveThreadBranchSourceCwd(input: {
  projectCwd?: string | null | undefined;
  worktreePath?: string | null | undefined;
}): string | null {
  return input.worktreePath ?? input.projectCwd ?? null;
}
