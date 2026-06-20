/**
 * @file 聊天项目管理模块
 * @description 复用隐藏的首页作用域聊天项目作为聊天行的后台容器�? *              提供首页聊天项目的查找、创建、修复等功能�? */

import { type ProjectId } from "~/contracts";
import type { Project } from "../types";
import { readNativeApi } from "../nativeApi";
import { useStore } from "../store";
import { getThreadFromState } from "../threadDerivation";
import { newCommandId, newProjectId } from "./utils";

/** 按首页目录缓存的待创建首页聊天项�?Promise */
const pendingHomeChatCreationByHomeDir = new Map<string, Promise<ProjectId | null>>();
/** 按首页目录缓存的待修复首页聊天项�?Promise */
const pendingHomeChatFixupByHomeDir = new Map<string, Promise<void>>();

/**
 * 在项目中查找首页聊天容器项目
 * @param projects - 项目列表
 * @param homeDir - 首页目录路径
 * @returns 匹配的首页聊天容器项目，如果未找到则返回 null
 */
export function findHomeChatContainerProject<
  T extends Pick<Project, "cwd" | "kind" | "name" | "remoteName">,
>(projects: readonly T[], homeDir: string | null | undefined): T | null {
  if (!homeDir) {
    return null;
  }
  return projects.find((project) => isHomeChatContainerProject(project, homeDir)) ?? null;
}

/**
 * 查找规范的首页项目（内部函数�? * 识别规范项目和重复项目，检测是否需要修复项目类�? * @param homeDir - 首页目录路径
 * @returns 包含规范项目ID、重复项目ID列表和是否需要修复类型的对象
 */
function findCanonicalHomeProject(homeDir: string): {
  canonicalProjectId: ProjectId | null;
  duplicateProjectIds: ProjectId[];
  needsKindFixup: boolean;
} {
  const state = useStore.getState();
  const homeProjects = state.projects.filter((project) =>
    isHomeChatContainerProject(project, homeDir),
  );
  // 优先选择类型�?"chat" 的项目作为规范项�?  const canonicalProject =
    homeProjects.find((project) => project.kind === "chat") ?? homeProjects[0];
  if (!canonicalProject) {
    return {
      canonicalProjectId: null,
      duplicateProjectIds: [],
      needsKindFixup: false,
    };
  }

  // 查找重复项目（仅当没有关联线程时才可删除�?  const duplicateProjectIds = homeProjects
    .filter((project) => project.id !== canonicalProject.id)
    .flatMap((project) => {
      const hasThreads = (state.threadIds ?? [])
        .map((threadId) => getThreadFromState(state, threadId))
        .some((thread) => thread?.projectId === project.id);
      return hasThreads ? [] : [project.id];
    });

  return {
    canonicalProjectId: canonicalProject.id,
    duplicateProjectIds,
    needsKindFixup: canonicalProject.kind !== "chat",
  };
}

/**
 * 修复首页聊天项目（内部函数）
 * 修复项目类型和清理重复项�? * @param homeDir - 首页目录路径
 */
async function fixupHomeChatProject(homeDir: string): Promise<void> {
  const api = readNativeApi();
  if (!api) {
    return;
  }

  const { canonicalProjectId, duplicateProjectIds, needsKindFixup } =
    findCanonicalHomeProject(homeDir);
  if (!canonicalProjectId) {
    return;
  }

  // 修复项目类型
  if (needsKindFixup) {
    await api.orchestration.dispatchCommand({
      type: "project.meta.update",
      commandId: newCommandId(),
      projectId: canonicalProjectId,
      kind: "chat",
      title: "Home",
      workspaceRoot: homeDir,
    });
  }

  // 删除重复项目
  for (const duplicateProjectId of duplicateProjectIds) {
    await api.orchestration.dispatchCommand({
      type: "project.delete",
      commandId: newCommandId(),
      projectId: duplicateProjectId,
    });
  }
}

/**
 * 调度首页聊天项目修复（内部函数）
 * 使用缓存避免重复修复
 * @param homeDir - 首页目录路径
 */
function scheduleHomeChatFixup(homeDir: string): void {
  if (pendingHomeChatFixupByHomeDir.has(homeDir)) {
    return;
  }
  const promise = fixupHomeChatProject(homeDir).finally(() => {
    pendingHomeChatFixupByHomeDir.delete(homeDir);
  });
  pendingHomeChatFixupByHomeDir.set(homeDir, promise);
}

/**
 * 确保首页聊天项目存在
 * 如果不存在则创建，如果存在则调度修复
 * @param homeDir - 首页目录路径
 * @returns 首页聊天项目 ID，如�?API 不可用则返回 null
 */
export async function ensureHomeChatProject(homeDir: string): Promise<ProjectId | null> {
  const api = readNativeApi();
  if (!api) {
    return null;
  }

  const { canonicalProjectId } = findCanonicalHomeProject(homeDir);
  if (canonicalProjectId) {
    scheduleHomeChatFixup(homeDir);
    return canonicalProjectId;
  }

  // 检查是否已有待创建�?Promise
  const pendingCreation = pendingHomeChatCreationByHomeDir.get(homeDir);
  if (pendingCreation) {
    return pendingCreation;
  }

  // 创建新的首页聊天项目
  const creationPromise = (async () => {
    const projectId = newProjectId();
    await api.orchestration.dispatchCommand({
      type: "project.create",
      commandId: newCommandId(),
      projectId,
      kind: "chat",
      title: "Home",
      workspaceRoot: homeDir,
      createdAt: new Date().toISOString(),
    });
    return projectId;
  })().finally(() => {
    pendingHomeChatCreationByHomeDir.delete(homeDir);
  });

  pendingHomeChatCreationByHomeDir.set(homeDir, creationPromise);
  return creationPromise;
}

/**
 * 预热首页聊天项目
 * 异步触发项目创建，不等待结果
 * @param homeDir - 首页目录路径
 */
export function prewarmHomeChatProject(homeDir: string): void {
  void ensureHomeChatProject(homeDir);
}

/**
 * 判断项目是否为首页聊天容器项�? * @param project - 项目对象
 * @param homeDir - 首页目录路径
 * @returns 是否为首页聊天容器项�? */
export function isHomeChatContainerProject(
  project: Pick<Project, "cwd" | "kind" | "name" | "remoteName"> | null | undefined,
  homeDir: string | null | undefined,
): boolean {
  if (!project || !homeDir) {
    return false;
  }
  return (
    project.cwd === homeDir &&
    (project.kind === "chat" || project.remoteName === "Home" || project.name === "Home")
  );
}
