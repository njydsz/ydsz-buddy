/**
 * @file 仓库 Diff 范围状态管�? *
 * 管理 Diff 面板和头部徽章共享的当前仓库 Diff 范围�? * 支持 workingTree（工作树）、unstaged（未暂存）、staged（已暂存）、branch（分支）
 * 四种范围，使�?Zustand + persist 中间件持久化�?localStorage�? */

import type { GitReadWorkingTreeDiffInput } from "~/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 仓库 Diff 范围类型 */
export type RepoDiffScope = NonNullable<GitReadWorkingTreeDiffInput["scope"]>;

/** 默认�?Diff 范围：工作树 */
export const DEFAULT_REPO_DIFF_SCOPE: RepoDiffScope = "workingTree";

/** Diff 范围的显示标签映�?*/
export const REPO_DIFF_SCOPE_LABELS: Record<RepoDiffScope, string> = {
  /** 工作树：包含所有未提交的更�?*/
  workingTree: "Working tree",
  /** 未暂存：仅未暂存的更�?*/
  unstaged: "Unstaged",
  /** 已暂存：仅已暂存的更�?*/
  staged: "Staged",
  /** 分支：与目标分支的差�?*/
  branch: "Branch",
};

/**
 * 判断给定字符串是否为有效�?Diff 范围值�? *
 * @param value - 待判断的字符�? * @returns 是否为有效的 RepoDiffScope
 */
export function isRepoDiffScope(value: string): value is RepoDiffScope {
  return (
    value === "workingTree" || value === "unstaged" || value === "staged" || value === "branch"
  );
}

/** Diff 范围 Store 的状态接�?*/
interface RepoDiffScopeStore {
  /** 当前 Diff 范围 */
  scope: RepoDiffScope;
  /** 设置 Diff 范围 */
  setScope: (scope: RepoDiffScope) => void;
}

/** localStorage 中的存储�?*/
const REPO_DIFF_SCOPE_STORAGE_KEY = "remicode:repo-diff-scope:v1";

/**
 * Diff 范围 Zustand Store�? * 持久化到 localStorage，记录用户选择�?Diff 范围�? */
export const useRepoDiffScopeStore = create<RepoDiffScopeStore>()(
  persist(
    (set) => ({
      scope: DEFAULT_REPO_DIFF_SCOPE,
      setScope: (scope) => set({ scope }),
    }),
    {
      name: REPO_DIFF_SCOPE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ scope: state.scope }),
    },
  ),
);
