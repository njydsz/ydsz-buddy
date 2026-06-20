/**
 * @file threadEnvironment.ts
 * @description 绾跨▼鐜閰嶇疆瑙ｆ瀽宸ュ叿妯″潡
 * @purpose 鎻愪緵绾跨▼宸ヤ綔鍖虹姸鎬併€佺幆澧冩ā寮忓拰宸ヤ綔鐩綍瑙ｆ瀽鐨勫叡浜伐鍏峰嚱鏁? * @exports 鐜妯″紡瑙ｆ瀽銆佸伐浣滃尯鐘舵€佸垽鏂€佸伐浣滅洰褰曡В鏋愮瓑宸ュ叿鍑芥暟
 */

import type { ThreadEnvironmentMode } from "~/contracts";

/**
 * @type ResolvedThreadWorkspaceState
 * @description 瑙ｆ瀽鍚庣殑绾跨▼宸ヤ綔鍖虹姸鎬佺被鍨? * @property {"local"} local - 鏈湴妯″紡锛岀洿鎺ヤ娇鐢ㄩ」鐩牴鐩綍
 * @property {"worktree-pending"} worktree-pending - Worktree 妯″紡浣嗗皻鏈氨缁紙璺緞鏈彁渚涳級
 * @property {"worktree-ready"} worktree-ready - Worktree 妯″紡涓斿凡灏辩华锛堣矾寰勫凡鎻愪緵锛? */
export type ResolvedThreadWorkspaceState = "local" | "worktree-pending" | "worktree-ready";

/**
 * @function resolveThreadEnvironmentMode
 * @description 瑙ｆ瀽绾跨▼鐜妯″紡
 * @param {Object} input - 杈撳叆鍙傛暟
 * @param {ThreadEnvironmentMode | null | undefined} input.envMode - 鐜妯″紡閰嶇疆
 * @param {string | null | undefined} input.worktreePath - Worktree 璺緞
 * @returns {ThreadEnvironmentMode} 瑙ｆ瀽鍚庣殑鐜妯″紡
 * @note 濡傛灉鎻愪緵浜?worktreePath锛屽垯寮哄埗杩斿洖 "worktree" 妯″紡锛涘惁鍒欎娇鐢ㄩ厤缃殑妯″紡鎴栭粯璁?"local"
 */
export function resolveThreadEnvironmentMode(input: {
  envMode?: ThreadEnvironmentMode | null | undefined;
  worktreePath?: string | null | undefined;
}): ThreadEnvironmentMode {
  // 濡傛灉瀛樺湪 worktree 璺緞锛岃鏄庢槸 worktree 妯″紡
  if (input.worktreePath) {
    return "worktree";
  }
  // 鍚﹀垯浣跨敤閰嶇疆鐨勬ā寮忥紝鏈厤缃垯榛樿涓?local
  return input.envMode ?? "local";
}

/**
 * @function resolveThreadWorkspaceState
 * @description 瑙ｆ瀽绾跨▼宸ヤ綔鍖虹姸鎬? * @param {Object} input - 杈撳叆鍙傛暟
 * @param {ThreadEnvironmentMode | null | undefined} input.envMode - 鐜妯″紡閰嶇疆
 * @param {string | null | undefined} input.worktreePath - Worktree 璺緞
 * @returns {ResolvedThreadWorkspaceState} 瑙ｆ瀽鍚庣殑宸ヤ綔鍖虹姸鎬? * @note 鏍规嵁鐜妯″紡鍜?worktree 璺緞鍒ゆ柇宸ヤ綔鍖烘槸鍚﹀氨缁? */
export function resolveThreadWorkspaceState(input: {
  envMode?: ThreadEnvironmentMode | null | undefined;
  worktreePath?: string | null | undefined;
}): ResolvedThreadWorkspaceState {
  const mode = resolveThreadEnvironmentMode(input);
  // 鏈湴妯″紡鐩存帴杩斿洖 local
  if (mode === "local") {
    return "local";
  }
  // worktree 妯″紡涓嬶紝鏍规嵁璺緞鏄惁瀛樺湪鍒ゆ柇灏辩华鐘舵€?  return input.worktreePath ? "worktree-ready" : "worktree-pending";
}

/**
 * @function isPendingThreadWorktree
 * @description 鍒ゆ柇绾跨▼鐨?worktree 鏄惁澶勪簬寰呭氨缁姸鎬? * @param {Object} input - 杈撳叆鍙傛暟
 * @param {ThreadEnvironmentMode | null | undefined} input.envMode - 鐜妯″紡閰嶇疆
 * @param {string | null | undefined} input.worktreePath - Worktree 璺緞
 * @returns {boolean} 濡傛灉 worktree 寰呭氨缁繑鍥?true锛屽惁鍒欒繑鍥?false
 */
export function isPendingThreadWorktree(input: {
  envMode?: ThreadEnvironmentMode | null | undefined;
  worktreePath?: string | null | undefined;
}): boolean {
  return resolveThreadWorkspaceState(input) === "worktree-pending";
}

/**
 * @function resolveThreadWorkspaceCwd
 * @description 瑙ｆ瀽绾跨▼宸ヤ綔鍖虹殑褰撳墠宸ヤ綔鐩綍锛圕WD锛? * @param {Object} input - 杈撳叆鍙傛暟
 * @param {string | null | undefined} input.projectCwd - 椤圭洰鏍圭洰褰? * @param {ThreadEnvironmentMode | null | undefined} input.envMode - 鐜妯″紡閰嶇疆
 * @param {string | null | undefined} input.worktreePath - Worktree 璺緞
 * @returns {string | null} 瑙ｆ瀽鍚庣殑宸ヤ綔鐩綍锛屾湭鎵惧埌杩斿洖 null
 * @note 杩愯鏃舵搷浣滃簲浠呴拡瀵瑰凡鐗╁寲鐨?worktree 璺緞锛岀‘淇濇枃浠舵搷浣滃湪姝ｇ‘鐨勯殧绂荤幆澧冧腑鎵ц
 */
export function resolveThreadWorkspaceCwd(input: {
  projectCwd?: string | null | undefined;
  envMode?: ThreadEnvironmentMode | null | undefined;
  worktreePath?: string | null | undefined;
}): string | null {
  const mode = resolveThreadEnvironmentMode(input);
  // worktree 妯″紡涓嬩娇鐢?worktree 璺緞
  if (mode === "worktree") {
    return input.worktreePath ?? null;
  }
  // 鏈湴妯″紡涓嬩娇鐢ㄩ」鐩牴鐩綍
  return input.projectCwd ?? null;
}

/**
 * @function resolveThreadBranchSourceCwd
 * @description 瑙ｆ瀽绾跨▼鍒嗘敮鍙戠幇婧愮殑褰撳墠宸ヤ綔鐩綍
 * @param {Object} input - 杈撳叆鍙傛暟
 * @param {string | null | undefined} input.projectCwd - 椤圭洰鏍圭洰褰? * @param {string | null | undefined} input.worktreePath - Worktree 璺緞
 * @returns {string | null} 瑙ｆ瀽鍚庣殑宸ヤ綔鐩綍锛屾湭鎵惧埌杩斿洖 null
 * @note 鍒嗘敮鍙戠幇鎿嶄綔鍦?worktree 瀛樺湪鍓嶄粛鍙娇鐢ㄩ」鐩牴鐩綍锛屽洜涓?Git 浠撳簱淇℃伅鏄叡浜殑
 */
export function resolveThreadBranchSourceCwd(input: {
  projectCwd?: string | null | undefined;
  worktreePath?: string | null | undefined;
}): string | null {
  // 浼樺厛浣跨敤 worktree 璺緞锛屽叾娆′娇鐢ㄩ」鐩牴鐩綍
  return input.worktreePath ?? input.projectCwd ?? null;
}
