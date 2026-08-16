/**
 * @file projectShortcutTargets.ts
 * @description 项目快捷方式目标解析，根据聚焦项目和最近使用项目
 * 确定快捷方式应指向的目标项目 ID。
 */

import type { ProjectId } from "~/contracts";

import type { Project } from "../types";

/** 从项目列表中解析可用的项目 ID（仅匹配 kind 为 "project" 的活跃项目） */
function resolveUsableProjectId(
  projects: readonly Project[],
  projectId: ProjectId | null,
): ProjectId | null {
  if (!projectId) {
    return null;
  }

  const project = projects.find(
    (candidate) => candidate.id === projectId && candidate.kind === "project",
  );
  return project?.id ?? null;
}

/**
 * 解析当前聚焦项目对应的目标项目 ID
 *
 * @param projects - 项目列表
 * @param focusedProjectId - 当前聚焦的项目 ID
 * @returns 可用的目标项目 ID，若不可用则返回 null
 */
export function resolveCurrentProjectTargetId(
  projects: readonly Project[],
  focusedProjectId: ProjectId | null,
): ProjectId | null {
  return resolveUsableProjectId(projects, focusedProjectId);
}

/**
 * 解析最近使用项目对应的目标项目 ID
 *
 * @param projects - 项目列表
 * @param latestProjectId - 最近使用的项目 ID
 * @returns 可用的目标项目 ID，若不可用则返回 null
 */
export function resolveLatestProjectTargetId(
  projects: readonly Project[],
  latestProjectId: ProjectId | null,
): ProjectId | null {
  return resolveUsableProjectId(projects, latestProjectId);
}