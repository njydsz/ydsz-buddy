/**
 * @file 仓库 Diff 范围状态管理模块
 * @description 管理 diff 面板和 header 徽章中共享的活跃仓库 diff 范围（工作区、暂存区、已提交等）。
 */

import type { GitReadWorkingTreeDiffInput } from "@ydsz-buddy/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type RepoDiffScope = NonNullable<GitReadWorkingTreeDiffInput["scope"]>;

export const DEFAULT_REPO_DIFF_SCOPE: RepoDiffScope = "workingTree";

export const REPO_DIFF_SCOPE_LABELS: Record<RepoDiffScope, string> = {
  workingTree: "Working tree",
  unstaged: "Unstaged",
  staged: "Staged",
  branch: "Branch",
};

export function isRepoDiffScope(value: string): value is RepoDiffScope {
  return (
    value === "workingTree" || value === "unstaged" || value === "staged" || value === "branch"
  );
}

interface RepoDiffScopeStore {
  scope: RepoDiffScope;
  setScope: (scope: RepoDiffScope) => void;
}

const REPO_DIFF_SCOPE_STORAGE_KEY = "ydsz-buddy:repo-diff-scope:v1";

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
