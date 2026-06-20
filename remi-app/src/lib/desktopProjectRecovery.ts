/**
 * @file 妗岄潰椤圭洰鎭㈠妫€娴嬫ā鍧? * @description 妫€娴嬫闈㈠惎鍔ㄥ揩鐓т腑鏄惁瀛樺湪闅愯棌椤圭洰浣嗙嚎绋嬭浠嶅瓨鍦ㄧ殑鎯呭喌銆? *              鐢ㄤ簬妗岄潰鍚姩淇璺緞鐨勫揩鐓у舰鐘跺畧鍗€? */

import type { OrchestrationReadModel, OrchestrationShellSnapshot } from "~/contracts";

/** 椤圭洰鎭㈠蹇収绫诲瀷 */
type ProjectRecoverySnapshot = OrchestrationReadModel | OrchestrationShellSnapshot;

/**
 * 妫€娴嬫槸鍚﹀瓨鍦ㄦ椿璺冪嚎绋嬩絾缂哄皯瀵瑰簲椤圭洰鐨勬儏鍐? * @param snapshot - 椤圭洰鎭㈠蹇収
 * @returns 鏄惁瀛樺湪闇€瑕佹仮澶嶇殑椤圭洰
 */
export function hasLiveThreadsWithMissingProjects(snapshot: ProjectRecoverySnapshot): boolean {
  // 鏀堕泦鎵€鏈夋湭鍒犻櫎鐨勯」鐩?ID
  const liveProjectIds = new Set(
    snapshot.projects
      .filter((project) => !("deletedAt" in project) || project.deletedAt === null)
      .map((project) => project.id),
  );

  // 妫€鏌ユ槸鍚︽湁娲昏穬绾跨▼寮曠敤浜嗕笉瀛樺湪鐨勯」鐩?  return snapshot.threads.some((thread) => {
    const isLiveThread = !("deletedAt" in thread) || thread.deletedAt === null;
    return isLiveThread && !liveProjectIds.has(thread.projectId);
  });
}
