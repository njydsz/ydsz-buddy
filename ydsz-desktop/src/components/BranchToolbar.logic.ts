import type { GitBranch } from "~/contracts";
import {
  deriveAssociatedWorktreeMetadata,
  type AssociatedWorktreeMetadata,
} from "~/shared/threadWorkspace";
import { Schema } from "effect";

/**
 * @file 分支工具栏逻辑工具
 *
 * 提供分支工具栏使用的纯函数逻辑：
 *
 * - `EnvMode` / `EnvModeSchema`：本地/Worktree 环境模式定义
 * - `resolveEffectiveEnvMode`：计算当前会话的有效环境模式
 * - `resolveDraftEnvModeAfterBranchChange`：草稿线程分支变更后的 envMode 推算
 * - `resolveBranchToolbarValue`：工具栏显示用的当前分支名
 * - `shouldSyncLocalThreadBranch`：判断是否需要把本地线程分支同步到 git 实际分支
 * - `resolveAssociatedWorktreeMetadataAfterWorkspacePatch`：分支切换后保留/合并 worktree 元数据
 * - `dedupeRemoteBranchesWithLocalMatches`：去重已存在本地的远端分支
 * - `resolveBranchSelectionTarget`：选择分支时确认 checkout cwd 与 worktree 路径
 *
 * ## 使用场景
 *
 * - BranchToolbar 主组件
 * - BranchToolbarBranchSelector 分支选择器
 *
 * ## 注意事项
 *
 * - 本模块不依赖 React，可在任何上下文（reducer / 事件处理）调用
 * - 所有函数均为纯函数，副作用由调用方处理
 */

/** 本地 / Worktree 环境模式 Schema */
export const EnvMode = Schema.Literal("local", "worktree");
export type EnvMode = "local" | "worktree";

/** 计算线程的有效环境模式：worktree 路径存在或显示声明为 worktree 即为 worktree */
export function resolveEffectiveEnvMode(input: {
  activeWorktreePath: string | null;
  hasServerThread: boolean;
  draftThreadEnvMode: EnvMode | undefined;
  serverThreadEnvMode?: EnvMode | undefined;
}): EnvMode {
  const { activeWorktreePath, hasServerThread, draftThreadEnvMode, serverThreadEnvMode } = input;
  return activeWorktreePath ||
    serverThreadEnvMode === "worktree" ||
    (!hasServerThread && draftThreadEnvMode === "worktree")
    ? "worktree"
    : "local";
}

/** 草稿线程切换分支后的 envMode 推导：优先看新 worktree 路径，其次回落到当前有效模式 */
export function resolveDraftEnvModeAfterBranchChange(input: {
  nextWorktreePath: string | null;
  currentWorktreePath: string | null;
  effectiveEnvMode: EnvMode;
}): EnvMode {
  const { nextWorktreePath, currentWorktreePath, effectiveEnvMode } = input;
  if (nextWorktreePath) {
    return "worktree";
  }
  if (effectiveEnvMode === "worktree" && !currentWorktreePath) {
    return "worktree";
  }
  return "local";
}

/**
 * 工具栏显示用的当前分支名：
 *
 * - worktree 模式下尚未选具体 worktree 时显示线程声明的分支
 * - 其他场景以 git 当前分支为主，线程声明分支为兜底
 */
export function resolveBranchToolbarValue(input: {
  envMode: EnvMode;
  activeWorktreePath: string | null;
  activeThreadBranch: string | null;
  currentGitBranch: string | null;
}): string | null {
  const { envMode, activeWorktreePath, activeThreadBranch, currentGitBranch } = input;
  if (envMode === "worktree" && !activeWorktreePath) {
    return activeThreadBranch ?? currentGitBranch;
  }
  return currentGitBranch ?? activeThreadBranch;
}

// Local threads should mirror the concrete checkout; stale thread metadata makes
// the current Git branch appear selectable while clicks only perform a no-op.
/** 是否需要把本地线程分支同步到 git 实际分支（仅在本地、无 worktree、动作空闲时进行） */
export function shouldSyncLocalThreadBranch(input: {
  envMode: EnvMode;
  activeWorktreePath: string | null;
  activeThreadBranch: string | null;
  currentGitBranch: string | null;
  isBranchActionPending: boolean;
}): boolean {
  return (
    input.envMode === "local" &&
    input.activeWorktreePath === null &&
    !input.isBranchActionPending &&
    input.currentGitBranch !== null &&
    input.activeThreadBranch !== input.currentGitBranch
  );
}

// Branch-only local updates should keep the paired worktree metadata intact.
/**
 * 合并 worktree 元数据：仅当未切换 worktree 且 patch 未提供新关联时才保留旧的关联元数据
 */
export function resolveAssociatedWorktreeMetadataAfterWorkspacePatch(input: {
  branch: string | null;
  worktreePath: string | null;
  existingAssociatedWorktreePath: string | null;
  existingAssociatedWorktreeBranch: string | null;
  existingAssociatedWorktreeRef: string | null;
  patchAssociatedWorktreePath?: string | null;
  patchAssociatedWorktreeBranch?: string | null;
  patchAssociatedWorktreeRef?: string | null;
}): AssociatedWorktreeMetadata {
  const shouldPreserveExistingAssociation =
    !input.worktreePath && input.patchAssociatedWorktreePath === undefined;

  return deriveAssociatedWorktreeMetadata({
    branch: input.branch,
    worktreePath: input.worktreePath,
    ...(input.patchAssociatedWorktreePath !== undefined
      ? { associatedWorktreePath: input.patchAssociatedWorktreePath }
      : shouldPreserveExistingAssociation
        ? { associatedWorktreePath: input.existingAssociatedWorktreePath }
        : {}),
    ...(input.patchAssociatedWorktreeBranch !== undefined
      ? { associatedWorktreeBranch: input.patchAssociatedWorktreeBranch }
      : shouldPreserveExistingAssociation
        ? { associatedWorktreeBranch: input.existingAssociatedWorktreeBranch }
        : {}),
    ...(input.patchAssociatedWorktreeRef !== undefined
      ? { associatedWorktreeRef: input.patchAssociatedWorktreeRef }
      : input.patchAssociatedWorktreeBranch === undefined && shouldPreserveExistingAssociation
        ? { associatedWorktreeRef: input.existingAssociatedWorktreeRef }
        : {}),
  });
}

/** 从远端 ref 名（如 `origin/feature/x`）推导本地分支名（`feature/x`） */
export function deriveLocalBranchNameFromRemoteRef(branchName: string): string {
  const firstSeparatorIndex = branchName.indexOf("/");
  if (firstSeparatorIndex <= 0 || firstSeparatorIndex === branchName.length - 1) {
    return branchName;
  }
  return branchName.slice(firstSeparatorIndex + 1);
}

/** 从远端 ref（如 `origin/feature/x`）推导可能的本地分支名集合 */
function deriveLocalBranchNameCandidatesFromRemoteRef(
  branchName: string,
  remoteName?: string,
): ReadonlyArray<string> {
  const candidates = new Set<string>();
  const firstSlashCandidate = deriveLocalBranchNameFromRemoteRef(branchName);
  if (firstSlashCandidate.length > 0) {
    candidates.add(firstSlashCandidate);
  }

  if (remoteName) {
    const remotePrefix = `${remoteName}/`;
    if (branchName.startsWith(remotePrefix) && branchName.length > remotePrefix.length) {
      candidates.add(branchName.slice(remotePrefix.length));
    }
  }

  return [...candidates];
}

/**
 * 去除已存在本地同名分支的 origin 远端分支，避免在分支列表中重复展示
 */
export function dedupeRemoteBranchesWithLocalMatches(
  branches: ReadonlyArray<GitBranch>,
): ReadonlyArray<GitBranch> {
  const localBranchNames = new Set(
    branches.filter((branch) => !branch.isRemote).map((branch) => branch.name),
  );

  return branches.filter((branch) => {
    if (!branch.isRemote) {
      return true;
    }

    if (branch.remoteName !== "origin") {
      return true;
    }

    const localBranchCandidates = deriveLocalBranchNameCandidatesFromRemoteRef(
      branch.name,
      branch.remoteName,
    );
    return !localBranchCandidates.some((candidate) => localBranchNames.has(candidate));
  });
}

/**
 * 计算选择某分支时应该 checkout 的 cwd、下一 worktree 路径以及是否复用现有 worktree
 */
export function resolveBranchSelectionTarget(input: {
  activeProjectCwd: string;
  activeWorktreePath: string | null;
  branch: Pick<GitBranch, "isDefault" | "worktreePath">;
}): {
  checkoutCwd: string;
  nextWorktreePath: string | null;
  reuseExistingWorktree: boolean;
} {
  const { activeProjectCwd, activeWorktreePath, branch } = input;

  if (branch.worktreePath) {
    return {
      checkoutCwd: branch.worktreePath,
      nextWorktreePath: branch.worktreePath === activeProjectCwd ? null : branch.worktreePath,
      reuseExistingWorktree: true,
    };
  }

  const nextWorktreePath =
    activeWorktreePath !== null && branch.isDefault ? null : activeWorktreePath;

  return {
    checkoutCwd: nextWorktreePath ?? activeProjectCwd,
    nextWorktreePath,
    reuseExistingWorktree: false,
  };
}
