/**
 * @file 鏍硅矾鐢变簨浠跺け鏁堝寲妯″潡
 * @description 鍒嗙被娴佸紡缂栨帓浜嬩欢锛屽垽鏂摢浜涗簨浠跺簲璇ヤ娇鍏变韩鏌ヨ缂撳瓨澶辨晥
 * @layer 鏍硅矾鐢卞伐鍏峰嚱鏁? * @exports 鎻愪緵鑰呭拰 Git 鏌ヨ缂撳瓨鐨勪簨浠跺け鏁堝寲鍒ゆ柇鍑芥暟
 */

import type { OrchestrationEvent, ThreadId } from "~/contracts";
import { resolveThreadWorkspaceCwd } from "~/shared/threadEnvironment";

import type { AppState } from "../store";
import { getThreadFromState } from "../threadDerivation";

/**
 * 鏂囦欢鍙樻洿浜嬩欢绫诲瀷闆嗗悎
 * @description 杩欎簺浜嬩欢浼氬鑷存枃浠剁郴缁熷彂鐢熷彉鍖栵紝闇€瑕佷娇鐩稿叧缂撳瓨澶辨晥
 */
const FILE_CHANGE_EVENT_TYPES = new Set<OrchestrationEvent["type"]>([
  "thread.turn-diff-completed", // 杞宸紓瀵规瘮瀹屾垚
  "thread.reverted", // 绾跨▼宸插洖婊?  "thread.conversation-rolled-back", // 瀵硅瘽宸插洖婊?]);

/**
 * 鍒ゆ柇鏄惁搴旇浣挎彁渚涜€呮煡璇㈢紦瀛樺け鏁? * @param event - 缂栨帓浜嬩欢瀵硅薄
 * @returns 濡傛灉浜嬩欢绫诲瀷灞炰簬鏂囦欢鍙樻洿浜嬩欢锛屽垯杩斿洖 true锛岃〃绀洪渶瑕佸埛鏂版彁渚涜€呯浉鍏崇紦瀛? */
export function shouldInvalidateProviderQueriesForEvent(event: OrchestrationEvent): boolean {
  return FILE_CHANGE_EVENT_TYPES.has(event.type);
}

/**
 * 鍒ゆ柇鏄惁搴旇浣?Git 鏌ヨ缂撳瓨澶辨晥
 * @param event - 缂栨帓浜嬩欢瀵硅薄
 * @returns 濡傛灉浜嬩欢鏄枃浠跺彉鏇翠簨浠讹紝鎴栬€呮槸鍖呭惈鍒嗘敮/鐜/worktree 绛夊厓鏁版嵁鍙樻洿鐨?meta-updated 浜嬩欢锛屽垯杩斿洖 true
 * @description Git 缂撳瓨澶辨晥鑼冨洿姣旀彁渚涜€呯紦瀛樻洿骞匡紝杩樺寘鎷嚎绋嬪厓鏁版嵁涓笌 Git 鐩稿叧鐨勫瓧娈靛彉鏇? */
export function shouldInvalidateGitQueriesForEvent(event: OrchestrationEvent): boolean {
  // 鏂囦欢鍙樻洿浜嬩欢蹇呯劧闇€瑕佸埛鏂?Git 缂撳瓨
  if (FILE_CHANGE_EVENT_TYPES.has(event.type)) {
    return true;
  }

  // 闈?meta-updated 浜嬩欢涓嶉渶瑕佸鐞?  if (event.type !== "thread.meta-updated") {
    return false;
  }

  // 妫€鏌?meta-updated 浜嬩欢涓槸鍚﹀寘鍚?Git 鐩稿叧鐨勫厓鏁版嵁鍙樻洿
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
 * 鑾峰彇闇€瑕佸埛鏂?Git 缂撳瓨鐨勭嚎绋?ID
 * @param event - 缂栨帓浜嬩欢瀵硅薄
 * @returns 濡傛灉浜嬩欢闇€瑕佸埛鏂?Git 缂撳瓨涓斿寘鍚嚎绋?ID锛屽垯杩斿洖璇ョ嚎绋?ID锛屽惁鍒欒繑鍥?null
 * @description 鐢ㄤ簬瀹氫綅闇€瑕佸埛鏂扮紦瀛樼殑鍏蜂綋绾跨▼
 */
export function getGitInvalidationThreadIdForEvent(event: OrchestrationEvent): ThreadId | null {
  if (!shouldInvalidateGitQueriesForEvent(event)) {
    return null;
  }
  return "threadId" in event.payload ? (event.payload.threadId as ThreadId) : null;
}

/**
 * 瑙ｆ瀽闇€瑕佸埛鏂?Git 缂撳瓨鐨勭嚎绋嬪伐浣滅洰褰? * @param state - 搴旂敤鐘舵€佸璞? * @param threadId - 绾跨▼ ID
 * @returns 绾跨▼瀵瑰簲鐨勫伐浣滅洰褰曡矾寰勶紝濡傛灉鏃犳硶瑙ｆ瀽鍒欒繑鍥?null
 * @description 鍦ㄩ鍩熶簨浠跺簲鐢ㄥ悗瑙ｆ瀽锛岀‘淇?worktree 鍏冩暟鎹彉鏇存寚鍚戞柊鐨勫伐浣滅洰褰? */
export function resolveGitInvalidationCwdForThreadId(
  state: AppState,
  threadId: ThreadId,
): string | null {
  // 浼樺厛浠庣姸鎬佷腑鑾峰彇绾跨▼锛屽鏋滀笉瀛樺湪鍒欎粠绾跨▼鍒楄〃涓煡鎵?  const thread =
    getThreadFromState(state, threadId) ??
    state.threads.find((candidate) => candidate.id === threadId);
  if (!thread) {
    return null;
  }
  // 鑾峰彇绾跨▼鎵€灞為」鐩殑鏍瑰伐浣滅洰褰?  const projectCwd = state.projects.find((project) => project.id === thread.projectId)?.cwd ?? null;
  // 鏍规嵁椤圭洰鐩綍銆佺幆澧冩ā寮忓拰 worktree 璺緞瑙ｆ瀽鏈€缁堢殑宸ヤ綔鐩綍
  return resolveThreadWorkspaceCwd({
    projectCwd,
    envMode: thread.envMode,
    worktreePath: thread.worktreePath,
  });
}
