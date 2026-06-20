/**
 * @file 娴犳挸绨?Diff 閼煎啫娲块悩鑸碘偓浣侯吀閻? *
 * 缁狅紕鎮?Diff 闂堛垺婢橀崪灞姐仈闁劌绐樼粩鐘插彙娴滎偆娈戣ぐ鎾冲娴犳挸绨?Diff 閼煎啫娲块妴? * 閺€顖涘瘮 workingTree閿涘牆浼愭担婊勭埐閿涘鈧菇nstaged閿涘牊婀弳鍌氱摠閿涘鈧够taged閿涘牆鍑￠弳鍌氱摠閿涘鈧攻ranch閿涘牆鍨庨弨顖ょ礆
 * 閸ユ稓顫掗懠鍐ㄦ纯閿涘奔濞囬悽?Zustand + persist 娑擃參妫挎禒鑸靛瘮娑斿懎瀵查崚?localStorage閵? */

import type { GitReadWorkingTreeDiffInput } from "~/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 娴犳挸绨?Diff 閼煎啫娲跨猾璇茬€?*/
export type RepoDiffScope = NonNullable<GitReadWorkingTreeDiffInput["scope"]>;

/** 姒涙顓婚惃?Diff 閼煎啫娲块敍姘紣娴ｆ粍鐖?*/
export const DEFAULT_REPO_DIFF_SCOPE: RepoDiffScope = "workingTree";

/** Diff 閼煎啫娲块惃鍕▔缁€鐑樼垼缁涚偓妲х亸?*/
export const REPO_DIFF_SCOPE_LABELS: Record<RepoDiffScope, string> = {
  /** 瀹搞儰缍旈弽鎴窗閸栧懎鎯堥幍鈧張澶嬫弓閹绘劒姘﹂惃鍕纯閺€?*/
  workingTree: "Working tree",
  /** 閺堫亝娈忕€涙﹫绱版禒鍛弓閺嗗倸鐡ㄩ惃鍕纯閺€?*/
  unstaged: "Unstaged",
  /** 瀹稿弶娈忕€涙﹫绱版禒鍛嚒閺嗗倸鐡ㄩ惃鍕纯閺€?*/
  staged: "Staged",
  /** 閸掑棙鏁敍姘瑢閻╊喗鐖ｉ崚鍡樻暜閻ㄥ嫬妯婂?*/
  branch: "Branch",
};

/**
 * 閸掋倖鏌囩紒娆忕暰鐎涙顑佹稉鍙夋Ц閸氾缚璐熼張澶嬫櫏閻?Diff 閼煎啫娲块崐绗衡偓? *
 * @param value - 瀵板懎鍨介弬顓犳畱鐎涙顑佹稉? * @returns 閺勵垰鎯佹稉鐑樻箒閺佸牏娈?RepoDiffScope
 */
export function isRepoDiffScope(value: string): value is RepoDiffScope {
  return (
    value === "workingTree" || value === "unstaged" || value === "staged" || value === "branch"
  );
}

/** Diff 閼煎啫娲?Store 閻ㄥ嫮濮搁幀浣瑰复閸?*/
interface RepoDiffScopeStore {
  /** 瑜版挸澧?Diff 閼煎啫娲?*/
  scope: RepoDiffScope;
  /** 鐠佸墽鐤?Diff 閼煎啫娲?*/
  setScope: (scope: RepoDiffScope) => void;
}

/** localStorage 娑擃厾娈戠€涙ê鍋嶉柨?*/
const REPO_DIFF_SCOPE_STORAGE_KEY = "remicode:repo-diff-scope:v1";

/**
 * Diff 閼煎啫娲?Zustand Store閵? * 閹镐椒绠欓崠鏍у煂 localStorage閿涘矁顔囪ぐ鏇犳暏閹寸兘鈧瀚ㄩ惃?Diff 閼煎啫娲块妴? */
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
