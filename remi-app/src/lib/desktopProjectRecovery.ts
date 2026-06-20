/**
 * @file 桌面项目恢复检测模�? * @description 检测桌面启动快照中是否存在隐藏项目但线程行仍存在的情况�? *              用于桌面启动修复路径的快照形状守卫�? */

import type { OrchestrationReadModel, OrchestrationShellSnapshot } from "~/contracts";

/** 项目恢复快照类型 */
type ProjectRecoverySnapshot = OrchestrationReadModel | OrchestrationShellSnapshot;

/**
 * 检测是否存在活跃线程但缺少对应项目的情�? * @param snapshot - 项目恢复快照
 * @returns 是否存在需要恢复的项目
 */
export function hasLiveThreadsWithMissingProjects(snapshot: ProjectRecoverySnapshot): boolean {
  // 收集所有未删除的项�?ID
  const liveProjectIds = new Set(
    snapshot.projects
      .filter((project) => !("deletedAt" in project) || project.deletedAt === null)
      .map((project) => project.id),
  );

  // 检查是否有活跃线程引用了不存在的项�?  return snapshot.threads.some((thread) => {
    const isLiveThread = !("deletedAt" in thread) || thread.deletedAt === null;
    return isLiveThread && !liveProjectIds.has(thread.projectId);
  });
}
