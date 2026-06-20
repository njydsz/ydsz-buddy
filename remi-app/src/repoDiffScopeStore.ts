/**
 * @file 浠撳簱 Diff 鑼冨洿鐘舵€佺鐞? *
 * 绠＄悊 Diff 闈㈡澘鍜屽ご閮ㄥ窘绔犲叡浜殑褰撳墠浠撳簱 Diff 鑼冨洿銆? * 鏀寔 workingTree锛堝伐浣滄爲锛夈€乽nstaged锛堟湭鏆傚瓨锛夈€乻taged锛堝凡鏆傚瓨锛夈€乥ranch锛堝垎鏀級
 * 鍥涚鑼冨洿锛屼娇鐢?Zustand + persist 涓棿浠舵寔涔呭寲鍒?localStorage銆? */

import type { GitReadWorkingTreeDiffInput } from "~/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 浠撳簱 Diff 鑼冨洿绫诲瀷 */
export type RepoDiffScope = NonNullable<GitReadWorkingTreeDiffInput["scope"]>;

/** 榛樿鐨?Diff 鑼冨洿锛氬伐浣滄爲 */
export const DEFAULT_REPO_DIFF_SCOPE: RepoDiffScope = "workingTree";

/** Diff 鑼冨洿鐨勬樉绀烘爣绛炬槧灏?*/
export const REPO_DIFF_SCOPE_LABELS: Record<RepoDiffScope, string> = {
  /** 宸ヤ綔鏍戯細鍖呭惈鎵€鏈夋湭鎻愪氦鐨勬洿鏀?*/
  workingTree: "Working tree",
  /** 鏈殏瀛橈細浠呮湭鏆傚瓨鐨勬洿鏀?*/
  unstaged: "Unstaged",
  /** 宸叉殏瀛橈細浠呭凡鏆傚瓨鐨勬洿鏀?*/
  staged: "Staged",
  /** 鍒嗘敮锛氫笌鐩爣鍒嗘敮鐨勫樊寮?*/
  branch: "Branch",
};

/**
 * 鍒ゆ柇缁欏畾瀛楃涓叉槸鍚︿负鏈夋晥鐨?Diff 鑼冨洿鍊笺€? *
 * @param value - 寰呭垽鏂殑瀛楃涓? * @returns 鏄惁涓烘湁鏁堢殑 RepoDiffScope
 */
export function isRepoDiffScope(value: string): value is RepoDiffScope {
  return (
    value === "workingTree" || value === "unstaged" || value === "staged" || value === "branch"
  );
}

/** Diff 鑼冨洿 Store 鐨勭姸鎬佹帴鍙?*/
interface RepoDiffScopeStore {
  /** 褰撳墠 Diff 鑼冨洿 */
  scope: RepoDiffScope;
  /** 璁剧疆 Diff 鑼冨洿 */
  setScope: (scope: RepoDiffScope) => void;
}

/** localStorage 涓殑瀛樺偍閿?*/
const REPO_DIFF_SCOPE_STORAGE_KEY = "remicode:repo-diff-scope:v1";

/**
 * Diff 鑼冨洿 Zustand Store銆? * 鎸佷箙鍖栧埌 localStorage锛岃褰曠敤鎴烽€夋嫨鐨?Diff 鑼冨洿銆? */
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
