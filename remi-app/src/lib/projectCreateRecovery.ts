/**
 * @file projectCreateRecovery.ts
 * @description 集中处理 project.create 重复错误的解析与恢复逻辑�? * 提供重复创建错误检测、项�?ID 提取、快照匹配及重试等待等恢复工具函数�? */

import type { OrchestrationReadModel } from "~/contracts";
import { workspaceRootsEqual } from "~/shared/threadWorkspace";

/** 重复项目创建错误消息的前缀 */
const DUPLICATE_PROJECT_CREATE_ERROR_PREFIX =
  "Orchestration command invariant failed (project.create): Project '";
/** 默认最大恢复重试次�?*/
const DEFAULT_RECOVERY_MAX_ATTEMPTS = 6;
/** 默认重试间隔（毫秒） */
const DEFAULT_RECOVERY_DELAY_MS = 50;

/** 可恢复的项目候选对象，包含 ID、类型、工作区根路径及删除时间 */
export interface DuplicateProjectCreateRecoveryCandidate {
  /** 项目 ID */
  readonly id: string;
  /** 项目类型，默认为 "project" */
  readonly kind?: string | undefined;
  /** 工作区根路径 */
  readonly workspaceRoot: string;
  /** 项目删除时间，未删除则为 null */
  readonly deletedAt?: string | null | undefined;
}

/** 包含项目列表的快照结�?*/
interface SnapshotWithProjects<T extends DuplicateProjectCreateRecoveryCandidate> {
  readonly projects: readonly T[];
}

/** 项目查找输入参数 */
interface ProjectLookupInput {
  /** 项目 ID */
  readonly projectId?: string | null | undefined;
  /** 工作区根路径 */
  readonly workspaceRoot?: string | null | undefined;
}

/** 判断项目类型是否可恢复（�?"project" 类型可恢复） */
function isRecoverableProjectKind(kind: string | undefined): boolean {
  return (kind ?? "project") === "project";
}

/** 判断项目是否为可恢复的活跃项目（未删除且类型可恢复） */
function isRecoverableActiveProject(project: DuplicateProjectCreateRecoveryCandidate): boolean {
  return (project.deletedAt ?? null) === null && isRecoverableProjectKind(project.kind);
}

/** 等待指定毫秒�?*/
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 判断错误消息是否为重复项目创建错�? *
 * @param message - 错误消息字符�? * @returns 是否为重复项目创建错�? */
export function isDuplicateProjectCreateError(message: string): boolean {
  if (!message.startsWith(DUPLICATE_PROJECT_CREATE_ERROR_PREFIX)) {
    return false;
  }

  const duplicateMarkerIndex = message.indexOf("' already uses workspace root '");
  return duplicateMarkerIndex > DUPLICATE_PROJECT_CREATE_ERROR_PREFIX.length;
}

/**
 * 从重复项目创建错误消息中提取项目 ID
 *
 * @param message - 错误消息字符�? * @returns 提取到的项目 ID，若消息格式不匹配则返回 null
 */
export function extractDuplicateProjectCreateProjectId(message: string): string | null {
  if (!isDuplicateProjectCreateError(message)) {
    return null;
  }

  const duplicateMarkerIndex = message.indexOf("' already uses workspace root '");
  return message.slice(DUPLICATE_PROJECT_CREATE_ERROR_PREFIX.length, duplicateMarkerIndex) || null;
}

/**
 * 在项目列表中查找可恢复的活跃项目
 *
 * @typeParam T - 项目候选类�? * @param input - 查找输入，包含项目列表及可选的 projectId/workspaceRoot
 * @returns 匹配到的项目，若未找到则返回 null
 *
 * @remarks 优先�?projectId 精确匹配，其次按 workspaceRoot 模糊匹配
 */
export function findRecoverableProject<T extends DuplicateProjectCreateRecoveryCandidate>(
  input: ProjectLookupInput & {
    readonly projects: readonly T[];
  },
): T | null {
  if (input.projectId) {
    const projectById = input.projects.find(
      (project) => isRecoverableActiveProject(project) && project.id === input.projectId,
    );
    if (projectById) {
      return projectById;
    }
  }

  if (!input.workspaceRoot) {
    return null;
  }

  const workspaceRoot = input.workspaceRoot;
  return (
    input.projects.find(
      (project) =>
        isRecoverableActiveProject(project) &&
        workspaceRootsEqual(project.workspaceRoot, workspaceRoot),
    ) ?? null
  );
}

/**
 * 从重复创建错误消息中查找可恢复的项目
 *
 * @typeParam T - 项目候选类�? * @param input - 包含错误消息、项目列表和工作区根路径的输�? * @returns 匹配到的可恢复项目，若未找到则返�?null
 *
 * @remarks 优先使用错误消息中提取的重复项目 ID，回退到工作区根路径匹�? */
export function findRecoverableProjectForDuplicateCreate<
  T extends DuplicateProjectCreateRecoveryCandidate,
>(input: {
  readonly message: string;
  readonly projects: readonly T[];
  readonly workspaceRoot: string;
}): T | null {
  if (!isDuplicateProjectCreateError(input.message)) {
    return null;
  }

  return findRecoverableProject({
    projects: input.projects,
    projectId: extractDuplicateProjectCreateProjectId(input.message),
    workspaceRoot: input.workspaceRoot,
  });
}

/**
 * 在读模型中轮询等待可恢复的项目出�? *
 * @typeParam TSnapshot - 快照类型，需包含 projects 数组
 * @param input - 包含快照加载函数、查找参数及可选的重试/修复配置
 * @returns 找到的项目及最新快照，若超时未找到则项目为 null
 *
 * @remarks 先进行有限次重试轮询，若仍失败则尝试调用 repairSnapshot 修复快照后再次查�? */
export async function waitForRecoverableProjectInReadModel<
  TSnapshot extends SnapshotWithProjects<DuplicateProjectCreateRecoveryCandidate> =
    OrchestrationReadModel,
>(
  input: ProjectLookupInput & {
    readonly loadSnapshot: () => Promise<TSnapshot | null>;
    readonly repairSnapshot?: (() => Promise<TSnapshot | null>) | undefined;
    readonly maxAttempts?: number;
    readonly delayMs?: number;
  },
): Promise<{
  project: TSnapshot["projects"][number] | null;
  snapshot: TSnapshot | null;
}> {
  let latestSnapshot: TSnapshot | null = null;
  const maxAttempts = input.maxAttempts ?? DEFAULT_RECOVERY_MAX_ATTEMPTS;
  const delayMs = input.delayMs ?? DEFAULT_RECOVERY_DELAY_MS;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const snapshot = await input.loadSnapshot();
    if (snapshot) {
      latestSnapshot = snapshot;
      const project = findRecoverableProject({
        projects: snapshot.projects,
        projectId: input.projectId,
        workspaceRoot: input.workspaceRoot,
      }) as TSnapshot["projects"][number] | null;
      if (project) {
        return { project, snapshot };
      }
    }

    if (attempt < maxAttempts) {
      await wait(delayMs * attempt);
    }
  }

  if (input.repairSnapshot) {
    const repairedSnapshot = await input.repairSnapshot();
    if (repairedSnapshot) {
      latestSnapshot = repairedSnapshot;
      const repairedProject = findRecoverableProject({
        projects: repairedSnapshot.projects,
        projectId: input.projectId,
        workspaceRoot: input.workspaceRoot,
      }) as TSnapshot["projects"][number] | null;
      if (repairedProject) {
        return {
          project: repairedProject,
          snapshot: repairedSnapshot,
        };
      }
    }
  }

  return {
    project: null,
    snapshot: latestSnapshot,
  };
}

/**
 * 针对重复项目创建错误，轮询等待可恢复的项目出�? *
 * @typeParam TSnapshot - 快照类型，需包含 projects 数组
 * @param input - 包含错误消息、工作区根路径、快照加载函数及可选的重试/修复配置
 * @returns 找到的项目及最新快照，若超时未找到则项目为 null
 *
 * @remarks 先进行有限次重试轮询，若仍失败则尝试调用 repairSnapshot 修复快照后再次查找�? * 适用于首次发送流程中需要复用刚恢复的项目场景�? */
export async function waitForRecoverableProjectForDuplicateCreate<
  TSnapshot extends SnapshotWithProjects<DuplicateProjectCreateRecoveryCandidate>,
>(input: {
  readonly message: string;
  readonly workspaceRoot: string;
  readonly loadSnapshot: () => Promise<TSnapshot | null>;
  readonly repairSnapshot?: (() => Promise<TSnapshot | null>) | undefined;
  readonly maxAttempts?: number;
  readonly delayMs?: number;
}): Promise<{
  project: TSnapshot["projects"][number] | null;
  snapshot: TSnapshot | null;
}> {
  let latestSnapshot: TSnapshot | null = null;
  const maxAttempts = input.maxAttempts ?? DEFAULT_RECOVERY_MAX_ATTEMPTS;
  const delayMs = input.delayMs ?? DEFAULT_RECOVERY_DELAY_MS;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const snapshot = await input.loadSnapshot();
    if (snapshot) {
      latestSnapshot = snapshot;
      const project = findRecoverableProjectForDuplicateCreate({
        message: input.message,
        projects: snapshot.projects,
        workspaceRoot: input.workspaceRoot,
      }) as TSnapshot["projects"][number] | null;
      if (project) {
        return { project, snapshot };
      }
    }

    if (attempt < maxAttempts) {
      await wait(delayMs * attempt);
    }
  }

  if (input.repairSnapshot) {
    const repairedSnapshot = await input.repairSnapshot();
    if (repairedSnapshot) {
      latestSnapshot = repairedSnapshot;
      const repairedProject = findRecoverableProjectForDuplicateCreate({
        message: input.message,
        projects: repairedSnapshot.projects,
        workspaceRoot: input.workspaceRoot,
      }) as TSnapshot["projects"][number] | null;
      if (repairedProject) {
        return {
          project: repairedProject,
          snapshot: repairedSnapshot,
        };
      }
    }
  }

  return {
    project: null,
    snapshot: latestSnapshot,
  };
}