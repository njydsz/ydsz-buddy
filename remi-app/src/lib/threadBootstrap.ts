// FILE: threadBootstrap.ts
// Purpose: Pure helpers for draft reuse and terminal-thread promotion payloads.
// Layer: Web bootstrap/domain helpers
// Exports: draft patching, reuse checks, and terminal creation state resolution.

import {
  DEFAULT_RUNTIME_MODE,
  type ModelSelection,
  type OrchestrationThreadPullRequest,
  type ProjectId,
  type ProviderInteractionMode,
  type ProviderKind,
  type RuntimeMode,
  type ThreadEnvironmentMode,
  type ThreadId,
} from "~/contracts";
import {
  type ComposerThreadDraftState,
  type DraftThreadEnvMode,
  type DraftThreadState,
  resolvePreferredComposerModelSelection,
} from "../composerDraftStore";
import { DEFAULT_INTERACTION_MODE, type ThreadPrimarySurface } from "../types";

export interface NewThreadOptions {
  branch?: string | null;
  worktreePath?: string | null;
  envMode?: DraftThreadEnvMode;
  entryPoint?: ThreadPrimarySurface;
  temporary?: boolean;
  provider?: ProviderKind;
  fresh?: boolean;
}

/** 活跃线程快照，用于纯函数辅助工具 */
interface ActiveThreadSnapshot {
  /** 项目 ID */
  projectId: ProjectId;
  /** 模型选择 */
  modelSelection: ModelSelection;
  /** 运行时模式 */
  runtimeMode: RuntimeMode;
  /** 交互模式 */
  interactionMode: ProviderInteractionMode;
  /** 环境模式 */
  envMode?: ThreadEnvironmentMode | undefined;
  /** 最近已知的 PR */
  lastKnownPr?: OrchestrationThreadPullRequest | null;
}

/** 草稿复用计划：使用已存储的草稿线程 */
export interface DraftReusePlanStored {
  /** 草稿线程状态 */
  draftThread: DraftThreadState;
  /** 计划类型 */
  kind: "stored";
  /** 线程 ID */
  threadId: ThreadId;
}

/** 草稿复用计划：使用当前路由的草稿线程 */
export interface DraftReusePlanRoute {
  /** 草稿线程状态 */
  draftThread: DraftThreadState;
  /** 计划类型 */
  kind: "route";
  /** 线程 ID */
  threadId: ThreadId;
}

/** 草稿复用计划：创建全新线程 */
export interface DraftReusePlanFresh {
  /** 计划类型 */
  kind: "fresh";
}

/** 线程引导计划联合类型 */
export type ThreadBootstrapPlan = DraftReusePlanStored | DraftReusePlanRoute | DraftReusePlanFresh;

/** 终端线程创建状态解析的输入参数 */
interface ResolveTerminalThreadCreationStateInput {
  /** 活跃的草稿线程 */
  activeDraftThread: DraftThreadState | null;
  /** 活跃的服务端线程快照 */
  activeThread: ActiveThreadSnapshot | null;
  /** 默认 Provider */
  defaultProvider?: ProviderKind | null | undefined;
  /** 草稿编辑器状态 */
  draftComposerState: ComposerThreadDraftState | null;
  /** 目标草稿线程 */
  draftThread: DraftThreadState | null;
  /** 新线程选项 */
  options: NewThreadOptions | undefined;
  /** 项目默认模型选择 */
  projectDefaultModelSelection: ModelSelection | null;
  /** 项目 ID */
  projectId: ProjectId;
}

/** 终端线程创建状态，包含模型选择、运行时模式和环境配置 */
export interface TerminalThreadCreationState {
  /** 分支名称 */
  branch: string | null;
  /** 环境模式 */
  envMode: DraftThreadEnvMode;
  /** 交互模式 */
  interactionMode: ProviderInteractionMode;
  /** 最近已知的 PR */
  lastKnownPr: OrchestrationThreadPullRequest | null;
  /** 模型选择 */
  modelSelection: ModelSelection;
  /** 运行时模式 */
  runtimeMode: RuntimeMode;
  /** 工作树路径 */
  worktreePath: string | null;
}

/**
 * 创建活跃线程快照
 *
 * 将当前活跃的服务端线程归一化为稳定的快照对象，供纯函数辅助工具使用。
 * 仅当线程属于指定项目时才返回快照。
 *
 * @param activeThread - 活跃线程对象
 * @param projectId - 目标项目 ID
 * @returns 活跃线程快照，不属于目标项目时返回 null
 */
export function createActiveThreadSnapshot(
  activeThread:
    | {
        interactionMode: ProviderInteractionMode;
        modelSelection: ModelSelection;
        projectId: ProjectId;
        runtimeMode: RuntimeMode;
        envMode?: ThreadEnvironmentMode | undefined;
        lastKnownPr?: OrchestrationThreadPullRequest | null;
      }
    | null
    | undefined,
  projectId: ProjectId,
): ActiveThreadSnapshot | null {
  if (!activeThread || activeThread.projectId !== projectId) {
    return null;
  }
  return {
    projectId: activeThread.projectId,
    modelSelection: activeThread.modelSelection,
    runtimeMode: activeThread.runtimeMode,
    interactionMode: activeThread.interactionMode,
    envMode: activeThread.envMode,
    lastKnownPr: activeThread.lastKnownPr ?? null,
  };
}

/**
 * 创建活跃草稿线程快照
 *
 * 将当前活跃的草稿线程归一化为稳定的快照对象，供纯函数辅助工具使用。
 * 仅当草稿线程属于指定项目时才返回快照。
 *
 * @param activeDraftThread - 活跃草稿线程
 * @param projectId - 目标项目 ID
 * @returns 草稿线程快照，不属于目标项目时返回 null
 */
export function createActiveDraftThreadSnapshot(
  activeDraftThread: DraftThreadState | null | undefined,
  projectId: ProjectId,
): DraftThreadState | null {
  if (!activeDraftThread || activeDraftThread.projectId !== projectId) {
    return null;
  }
  return {
    projectId: activeDraftThread.projectId,
    createdAt: activeDraftThread.createdAt,
    runtimeMode: activeDraftThread.runtimeMode,
    interactionMode: activeDraftThread.interactionMode,
    entryPoint: activeDraftThread.entryPoint,
    branch: activeDraftThread.branch,
    worktreePath: activeDraftThread.worktreePath,
    lastKnownPr: activeDraftThread.lastKnownPr ?? null,
    envMode: activeDraftThread.envMode,
    ...(activeDraftThread.isTemporary ? { isTemporary: true } : {}),
  };
}

/**
 * 解析线程引导计划
 *
 * 决定是复用已存储的草稿、当前路由的草稿，还是创建全新线程。
 * 优先级：路由草稿 > 存储草稿 > 新建。
 *
 * @param input - 包含入口界面、最新活跃草稿、项目 ID 和路由线程 ID 的输入对象
 * @returns 线程引导计划
 */
export function resolveThreadBootstrapPlan(input: {
  entryPoint: ThreadPrimarySurface;
  latestActiveDraftThread: DraftThreadState | null;
  projectId: ProjectId;
  routeThreadId: ThreadId | null;
  storedDraftThread: ({ threadId: ThreadId } & DraftThreadState) | null;
}): ThreadBootstrapPlan {
  if (
    shouldReuseActiveDraftThread({
      draftThread: input.latestActiveDraftThread,
      entryPoint: input.entryPoint,
      projectId: input.projectId,
      routeThreadId: input.routeThreadId,
    })
  ) {
    return {
      kind: "route",
      threadId: input.routeThreadId!,
      draftThread: input.latestActiveDraftThread!,
    };
  }
  if (input.storedDraftThread) {
    return {
      kind: "stored",
      threadId: input.storedDraftThread.threadId,
      draftThread: input.storedDraftThread,
    };
  }
  return { kind: "fresh" };
}

/**
 * 创建全新草稿线程种子
 *
 * 为新线程引导构建初始的草稿线程元数据。
 *
 * @param input - 包含创建时间、入口界面和选项的输入对象
 * @returns 草稿线程种子对象（不含 projectId 和 interactionMode）
 */
export function createFreshDraftThreadSeed(input: {
  createdAt: string;
  entryPoint: ThreadPrimarySurface;
  options: NewThreadOptions | undefined;
}): Omit<DraftThreadState, "projectId" | "interactionMode"> {
  return {
    createdAt: input.createdAt,
    branch: input.options?.branch ?? null,
    worktreePath: input.options?.worktreePath ?? null,
    envMode: input.options?.envMode ?? "local",
    runtimeMode: DEFAULT_RUNTIME_MODE,
    entryPoint: input.entryPoint,
    ...(input.options?.temporary ? { isTemporary: true } : {}),
  };
}

/**
 * 判断新线程选项是否包含上下文覆盖
 *
 * 检测选项中是否显式指定了分支、工作树路径或环境模式。
 *
 * @param options - 新线程选项
 * @returns 是否存在上下文覆盖
 */
export function hasDraftContextOverrides(options?: NewThreadOptions): boolean {
  return (
    options?.branch !== undefined ||
    options?.worktreePath !== undefined ||
    options?.envMode !== undefined
  );
}

/**
 * 构建草稿线程上下文补丁
 *
 * 当选项包含上下文覆盖时，构建应应用到现有草稿的补丁对象。
 * 当环境模式切换为 "local" 且未显式指定工作树路径时，自动清空工作树路径。
 *
 * @param entryPoint - 入口界面
 * @param options - 新线程选项
 * @returns 上下文补丁对象，无覆盖时返回 null
 */
export function buildDraftThreadContextPatch(
  entryPoint: ThreadPrimarySurface,
  options?: NewThreadOptions,
): {
  branch?: string | null;
  entryPoint: ThreadPrimarySurface;
  envMode?: DraftThreadEnvMode;
  worktreePath?: string | null;
} | null {
  if (!hasDraftContextOverrides(options)) {
    return null;
  }
  const shouldClearWorktreeForLocalMode =
    options?.envMode === "local" && options?.worktreePath === undefined;
  return {
    ...(options?.branch !== undefined ? { branch: options.branch ?? null } : {}),
    ...(options?.worktreePath !== undefined || shouldClearWorktreeForLocalMode
      ? { worktreePath: options?.worktreePath ?? null }
      : {}),
    ...(options?.envMode !== undefined ? { envMode: options.envMode } : {}),
    entryPoint,
  };
}

/**
 * 判断是否应复用当前路由的活跃草稿线程
 *
 * 仅当草稿线程属于目标项目且入口界面匹配时才复用。
 *
 * @param input - 包含草稿线程、入口界面、项目 ID 和路由线程 ID 的输入对象
 * @returns 是否应复用（类型守卫）
 */
export function shouldReuseActiveDraftThread(input: {
  draftThread: DraftThreadState | null;
  entryPoint: ThreadPrimarySurface;
  projectId: ProjectId;
  routeThreadId: ThreadId | null;
}): input is {
  draftThread: DraftThreadState;
  entryPoint: ThreadPrimarySurface;
  projectId: ProjectId;
  routeThreadId: ThreadId;
} {
  return Boolean(
    input.draftThread &&
    input.routeThreadId &&
    input.draftThread.projectId === input.projectId &&
    input.draftThread.entryPoint === input.entryPoint,
  );
}

/**
 * 解析终端线程创建状态
 *
 * 从最具体的状态源（草稿线程 → 活跃服务端线程 → 活跃草稿线程）逐级回退，
 * 合并模型选择、运行时模式、交互模式和环境配置。
 *
 * @param input - 包含各类线程状态和选项的输入对象
 * @returns 终端线程创建状态
 */
export function resolveTerminalThreadCreationState(
  input: ResolveTerminalThreadCreationStateInput,
): TerminalThreadCreationState {
  const hasExplicitEnvModeOverride =
    input.options !== undefined && Object.hasOwn(input.options, "envMode");
  const explicitEnvMode: DraftThreadEnvMode | undefined = hasExplicitEnvModeOverride
    ? (input.options?.envMode ?? "local")
    : undefined;
  const inheritedEnvMode =
    input.draftThread?.envMode !== undefined
      ? input.draftThread.envMode
      : input.activeThread?.projectId === input.projectId
        ? input.activeThread.envMode
        : input.activeDraftThread?.projectId === input.projectId
          ? input.activeDraftThread.envMode
          : undefined;

  return {
    modelSelection: resolvePreferredComposerModelSelection({
      draft: input.draftComposerState,
      threadModelSelection:
        input.activeThread?.projectId === input.projectId
          ? input.activeThread.modelSelection
          : null,
      projectModelSelection: input.projectDefaultModelSelection,
      defaultProvider: input.defaultProvider,
    }),
    runtimeMode:
      input.draftThread?.runtimeMode ??
      (input.activeThread?.projectId === input.projectId ? input.activeThread.runtimeMode : null) ??
      (input.activeDraftThread?.projectId === input.projectId
        ? input.activeDraftThread.runtimeMode
        : null) ??
      DEFAULT_RUNTIME_MODE,
    interactionMode:
      input.draftThread?.interactionMode ??
      (input.activeThread?.projectId === input.projectId
        ? input.activeThread.interactionMode
        : null) ??
      DEFAULT_INTERACTION_MODE,
    lastKnownPr:
      input.draftThread?.lastKnownPr ??
      (input.activeThread?.projectId === input.projectId
        ? (input.activeThread.lastKnownPr ?? null)
        : null) ??
      (input.activeDraftThread?.projectId === input.projectId
        ? (input.activeDraftThread.lastKnownPr ?? null)
        : null) ??
      null,
    envMode: hasExplicitEnvModeOverride
      ? (explicitEnvMode ?? "local")
      : (inheritedEnvMode ?? "local"),
    branch:
      input.options?.branch !== undefined
        ? (input.options.branch ?? null)
        : (input.draftThread?.branch ?? null),
    worktreePath: (() => {
      if (input.options?.worktreePath !== undefined) {
        return input.options.worktreePath ?? null;
      }
      if (explicitEnvMode === "local") {
        return null;
      }
      return input.draftThread?.worktreePath ?? null;
    })(),
  };
}
