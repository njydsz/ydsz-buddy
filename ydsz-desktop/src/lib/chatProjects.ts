/**
 * @file 聊天项目容器模块
 *
 * 本模块提供"主目录聊天容器项目"的发现、创建和修复功能。
 * 用于在用户的主目录下维护一个隐藏的聊天项目，作为所有聊天行的底层容器。
 *
 * ## 核心导出
 *
 * - `findHomeChatContainerProject`：在工作区列表中查找主目录聊天容器项目
 * - `ensureHomeChatProject`：确保主目录聊天容器项目存在，必要时创建
 * - `prewarmHomeChatProject`：预热主目录聊天容器项目（异步创建）
 * - `isHomeChatContainerProject`：判断项目是否为主目录聊天容器
 *
 * ## 使用场景
 *
 * - 侧边栏聊天行列表的底层存储
 * - 空项目的默认容器
 * - 聊天记录的主目录隔离
 *
 * ## 注意事项
 *
 * - 每个主目录只能有一个聊天容器项目
 * - 重复创建时返回已有的项目 ID
 * - 自动修复重复和 kind 不一致的问题
 */

import { type ProjectId } from "@ydsz-buddy/contracts";
import type { Project } from "../types";
import { readNativeApi } from "../nativeApi";
import { useStore } from "../store";
import { getThreadFromState } from "../threadDerivation";
import { newCommandId, newProjectId } from "./utils";

/** 正在创建中的项目 ID 承诺（按主目录缓存，防止重复创建） */
const pendingHomeChatCreationByHomeDir = new Map<string, Promise<ProjectId | null>>();
/** 正在修复中的项目 ID 承诺（按主目录缓存） */
const pendingHomeChatFixupByHomeDir = new Map<string, Promise<void>>();

/**
 * 在项目列表中查找主目录聊天容器项目
 *
 * @param projects - 项目列表
 * @param homeDir - 主目录路径
 * @returns 匹配的主目录聊天容器项目，若未找到返回 null
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
 * 查找规范的主目录项目
 *
 * 从同属于该主目录的多个项目中，找到"规范"的那一个。
 * 规范项目是指 kind 为 "chat" 的项目，如果没有则取第一个。
 *
 * @param homeDir - 主目录路径
 * @returns 包含规范项目 ID、重复项目 ID 和是否需要修复 kind 的信息
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
  const canonicalProject =
    homeProjects.find((project) => project.kind === "chat") ?? homeProjects[0];
  if (!canonicalProject) {
    return {
      canonicalProjectId: null,
      duplicateProjectIds: [],
      needsKindFixup: false,
    };
  }

  const duplicateProjectIds = homeProjects
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
 * 修复主目录聊天项目的元数据
 *
 * 将重复项目删除，并将非 chat 类型的项目更新为 chat 类型。
 *
 * @param homeDir - 主目录路径
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

  for (const duplicateProjectId of duplicateProjectIds) {
    await api.orchestration.dispatchCommand({
      type: "project.delete",
      commandId: newCommandId(),
      projectId: duplicateProjectId,
    });
  }
}

/**
 * 调度主目录聊天项目修复任务
 *
 * @param homeDir - 主目录路径
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
 * 确保主目录聊天容器项目存在
 *
 * 如果已存在则直接返回，如果正在创建则等待创建完成，
 * 如果不存在则创建新的聊天容器项目。
 *
 * @param homeDir - 主目录路径
 * @returns 项目 ID，如果 API 不可用则返回 null
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

  const pendingCreation = pendingHomeChatCreationByHomeDir.get(homeDir);
  if (pendingCreation) {
    return pendingCreation;
  }

  const creationPromise = (async () => {
    const projectId = newProjectId();
    await api.orchestration.dispatchCommand({
      type: "project.create",
      commandId: newCommandId(),
      projectId,
      kind: "chat",
      title: "Home",
      workspaceRoot: homeDir,
      createWorkspaceRootIfMissing: false,
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
 * 预热主目录聊天容器项目
 *
 * 异步调用 ensureHomeChatProject，但不等待结果。
 * 用于在可能需要之前提前触发创建。
 *
 * @param homeDir - 主目录路径
 */
export function prewarmHomeChatProject(homeDir: string): void {
  void ensureHomeChatProject(homeDir);
}

/**
 * 判断项目是否为主目录聊天容器
 *
 * @param project - 项目对象
 * @param homeDir - 主目录路径
 * @returns 是否为主目录聊天容器
 */
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
