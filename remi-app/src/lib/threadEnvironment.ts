/**
 * @file 线程环境处理
 * @description 提供线程环境意图推导和分支目标规划的共享辅助函数，
 *              包括环境模式解析、工作区状态展示、差异环境状态及分支环境规划。
 */

import type { ThreadEnvironmentMode } from "~/contracts";
import {
  isPendingThreadWorktree,
  resolveThreadEnvironmentMode,
  resolveThreadWorkspaceCwd,
  resolveThreadWorkspaceState,
  type ResolvedThreadWorkspaceState,
} from "~/shared/threadEnvironment";
import { deriveAssociatedWorktreeMetadata } from "~/shared/threadWorkspace";
import type { Thread } from "../types";

/** 分支线程目标类型："local" 为本地项目，"worktree" 为 Git 工作树 */
export type ForkThreadTarget = "local" | "worktree";

/** 已解析的分支线程环境信息 */
export interface ResolvedForkThreadEnvironment {
  /** 分支目标类型 */
  target: ForkThreadTarget;
  /** 环境模式 */
  envMode: ThreadEnvironmentMode;
  /** 分支名称 */
  branch: string | null;
  /** 工作树路径 */
  worktreePath: string | null;
  /** 关联的工作树路径 */
  associatedWorktreePath: string | null;
  /** 关联的工作树分支 */
  associatedWorktreeBranch: string | null;
  /** 关联的工作树引用 */
  associatedWorktreeRef: string | null;
}

export {
  isPendingThreadWorktree,
  resolveThreadEnvironmentMode,
  resolveThreadWorkspaceState,
} from "~/shared/threadEnvironment";

/** 线程环境展示信息，包含模式、工作区状态和 UI 标签 */
export interface ThreadEnvironmentPresentation {
  /** 环境模式 */
  mode: ThreadEnvironmentMode;
  /** 工作区状态 */
  workspaceState: ResolvedThreadWorkspaceState;
  /** 短标签 */
  shortLabel: "Local" | "Worktree";
  /** 本地选项标签 */
  localOptionLabel: "Local project";
  /** 工作树选项标签 */
  worktreeOptionLabel: "Worktree";
  /** 工作树徽章标签，无工作树时为 null */
  worktreeBadgeLabel: "Worktree" | "Worktree pending" | null;
}

/**
 * 解析线程环境展示信息
 *
 * @param input - 包含环境模式和工作树路径的输入对象
 * @returns 线程环境展示信息对象
 */
export function resolveThreadEnvironmentPresentation(input: {
  envMode?: ThreadEnvironmentMode | null | undefined;
  worktreePath?: string | null | undefined;
}): ThreadEnvironmentPresentation {
  const mode = resolveThreadEnvironmentMode(input);
  const workspaceState = resolveThreadWorkspaceState(input);

  return {
    mode,
    workspaceState,
    shortLabel: mode === "worktree" ? "Worktree" : "Local",
    localOptionLabel: "Local project",
    worktreeOptionLabel: "Worktree",
    worktreeBadgeLabel:
      workspaceState === "worktree-ready"
        ? "Worktree"
        : workspaceState === "worktree-pending"
          ? "Worktree pending"
          : null,
  };
}

/** 差异环境状态，包含是否等待中、工作目录和禁用原因 */
export interface DiffEnvironmentState {
  /** 工作树是否仍在等待创建 */
  pending: boolean;
  /** 当前工作目录 */
  cwd: string | null;
  /** 差异功能禁用原因，可用时为 null */
  disabledReason: string | null;
}

/**
 * 解析差异环境状态
 *
 * 工作树意图的聊天在等待路径就绪期间，差异面板保持禁用。
 *
 * @param input - 包含项目目录、环境模式和工作树路径的输入对象
 * @returns 差异环境状态对象
 */
export function resolveDiffEnvironmentState(input: {
  projectCwd?: string | null | undefined;
  envMode?: ThreadEnvironmentMode | null | undefined;
  worktreePath?: string | null | undefined;
}): DiffEnvironmentState {
  const pending = isPendingThreadWorktree(input);
  return {
    pending,
    cwd: pending
      ? null
      : resolveThreadWorkspaceCwd({
          projectCwd: input.projectCwd,
          envMode: input.envMode,
          worktreePath: input.worktreePath,
        }),
    disabledReason: pending
      ? "Diff and summary will be available once the worktree is ready for this chat."
      : null,
  };
}

/**
 * 解析分支线程的目标环境
 *
 * "local" 目标保持当前本地检出（工作树线程复用现有工作树），
 * "worktree" 目标始终规划新的工作树。
 *
 * @param input - 包含分支目标、活跃根分支和源线程信息的输入对象
 * @returns 已解析的分支线程环境信息
 */
export function resolveForkThreadEnvironment(input: {
  target: ForkThreadTarget;
  activeRootBranch: string | null;
  sourceThread: Pick<
    Thread,
    | "branch"
    | "envMode"
    | "worktreePath"
    | "associatedWorktreePath"
    | "associatedWorktreeBranch"
    | "associatedWorktreeRef"
  >;
}): ResolvedForkThreadEnvironment {
  const sourceEnvMode = resolveThreadEnvironmentMode({
    envMode: input.sourceThread.envMode,
    worktreePath: input.sourceThread.worktreePath,
  });
  const sourceBranch = input.sourceThread.branch ?? input.activeRootBranch;
  const sourceWorktreePath = input.sourceThread.worktreePath ?? null;
  const sourceAssociatedWorktreePath =
    input.sourceThread.associatedWorktreePath ?? sourceWorktreePath;
  const sourceAssociatedWorktreeBranch =
    input.sourceThread.associatedWorktreeBranch ?? sourceBranch;
  const sourceAssociatedWorktreeRef =
    input.sourceThread.associatedWorktreeRef ?? sourceAssociatedWorktreeBranch;

  if (input.target === "worktree") {
    const associatedWorktree = deriveAssociatedWorktreeMetadata({
      associatedWorktreePath: null,
      associatedWorktreeBranch: sourceBranch,
      associatedWorktreeRef: sourceAssociatedWorktreeRef ?? sourceBranch,
    });
    return {
      target: "worktree",
      envMode: "worktree",
      branch: sourceBranch,
      worktreePath: null,
      ...associatedWorktree,
    };
  }

  // Codex-style "Fork Into Local" stays in the current local checkout, which for a
  // worktree-backed thread means reusing that worktree rather than bouncing to root.
  if (sourceEnvMode === "worktree" && sourceWorktreePath) {
    const associatedWorktree = deriveAssociatedWorktreeMetadata({
      branch: sourceBranch,
      worktreePath: sourceWorktreePath,
      associatedWorktreePath: sourceAssociatedWorktreePath,
      associatedWorktreeBranch: sourceAssociatedWorktreeBranch,
      associatedWorktreeRef: sourceAssociatedWorktreeRef,
    });
    return {
      target: "local",
      envMode: "worktree",
      branch: sourceBranch,
      worktreePath: sourceWorktreePath,
      ...associatedWorktree,
    };
  }

  const associatedWorktree = deriveAssociatedWorktreeMetadata({
    associatedWorktreePath: null,
    associatedWorktreeBranch: null,
    associatedWorktreeRef: null,
  });
  return {
    target: "local",
    envMode: "local",
    branch: sourceBranch,
    worktreePath: null,
    ...associatedWorktree,
  };
}
