/**
 * @file Zustand 稳定选择器工�? * @description 为实体查找和侧边栏轻量投影提供引用稳定的 Zustand 选择器，
 * 避免�?store 更新导致无关组件重新渲染�? * 导出的选择器工厂被路由和侧边栏组件广泛使用�? */

import type { ProjectId, ThreadId } from "~/contracts";

import type { AppState } from "./store";
import { getThreadFromState, getThreadsFromState } from "./threadDerivation";
import type { Project, SidebarThreadSummary, Thread } from "./types";

/**
 * 创建引用稳定的实体选择�? *
 * @description 通过闭包缓存上一次的列表引用和匹配结果，仅当列表引用变化时重新查找，
 * 从而保证同一实体在列表未变时返回相同引用，避免不必要的重渲染�? *
 * @typeParam T - 实体类型，必须包�?id 属�? * @param selectItems - �?store 中选取实体列表的函�? * @param id - 要查找的实体 ID，为 null/undefined 时始终返�?undefined
 * @returns 一个稳定的选择器函�? */
function createStableEntitySelector<T extends { id: string }>(
  selectItems: (state: AppState) => readonly T[],
  id: string | null | undefined,
): (state: AppState) => T | undefined {
  let previousItems: readonly T[] | undefined;
  let previousMatch: T | undefined;

  return (state) => {
    if (!id) {
      return undefined;
    }

    const items = selectItems(state);
    if (items === previousItems) {
      return previousMatch;
    }

    previousItems = items;
    previousMatch = items.find((item) => item.id === id);
    return previousMatch;
  };
}

/**
 * 创建项目选择�? *
 * @param projectId - 项目 ID，为 null/undefined 时选择器始终返�?undefined
 * @returns 稳定的项目选择器函�? */
export function createProjectSelector(
  projectId: ProjectId | null | undefined,
): (state: AppState) => Project | undefined {
  return createStableEntitySelector((state) => state.projects, projectId);
}

/**
 * 创建线程选择�? *
 * @description 优先�?threadDerivation 获取线程（基于归一化切片重建）�? * 回退�?store.threads 数组中查找�? *
 * @param threadId - 线程 ID，为 null/undefined 时选择器始终返�?undefined
 * @returns 稳定的线程选择器函�? */
export function createThreadSelector(
  threadId: ThreadId | null | undefined,
): (state: AppState) => Thread | undefined {
  return (state) =>
    threadId
      ? (getThreadFromState(state, threadId) ??
        state.threads.find((thread) => thread.id === threadId))
      : undefined;
}

/**
 * 创建全量线程列表选择�? *
 * @description 监控 store 中所有线程相关的归一化切片引用，仅当任一切片变化�? * 才重新从 threadDerivation 重建线程列表，保证引用稳定性�? *
 * @returns 稳定的全量线程列表选择器函�? */
export function createAllThreadsSelector(): (state: AppState) => readonly Thread[] {
  let previousThreadIds: readonly ThreadId[] | undefined;
  let previousThreadShellById = {} as AppState["threadShellById"];
  let previousThreadSessionById = {} as AppState["threadSessionById"];
  let previousThreadTurnStateById = {} as AppState["threadTurnStateById"];
  let previousMessageIdsByThreadId = {} as AppState["messageIdsByThreadId"];
  let previousMessageByThreadId = {} as AppState["messageByThreadId"];
  let previousActivityIdsByThreadId = {} as AppState["activityIdsByThreadId"];
  let previousActivityByThreadId = {} as AppState["activityByThreadId"];
  let previousProposedPlanIdsByThreadId = {} as AppState["proposedPlanIdsByThreadId"];
  let previousProposedPlanByThreadId = {} as AppState["proposedPlanByThreadId"];
  let previousTurnDiffIdsByThreadId = {} as AppState["turnDiffIdsByThreadId"];
  let previousTurnDiffSummaryByThreadId = {} as AppState["turnDiffSummaryByThreadId"];
  let previousThreads: readonly Thread[] = [];

  return (state) => {
    if (
      previousThreadIds === state.threadIds &&
      previousThreadShellById === state.threadShellById &&
      previousThreadSessionById === state.threadSessionById &&
      previousThreadTurnStateById === state.threadTurnStateById &&
      previousMessageIdsByThreadId === state.messageIdsByThreadId &&
      previousMessageByThreadId === state.messageByThreadId &&
      previousActivityIdsByThreadId === state.activityIdsByThreadId &&
      previousActivityByThreadId === state.activityByThreadId &&
      previousProposedPlanIdsByThreadId === state.proposedPlanIdsByThreadId &&
      previousProposedPlanByThreadId === state.proposedPlanByThreadId &&
      previousTurnDiffIdsByThreadId === state.turnDiffIdsByThreadId &&
      previousTurnDiffSummaryByThreadId === state.turnDiffSummaryByThreadId
    ) {
      return previousThreads;
    }

    previousThreadIds = state.threadIds;
    previousThreadShellById = state.threadShellById;
    previousThreadSessionById = state.threadSessionById;
    previousThreadTurnStateById = state.threadTurnStateById;
    previousMessageIdsByThreadId = state.messageIdsByThreadId;
    previousMessageByThreadId = state.messageByThreadId;
    previousActivityIdsByThreadId = state.activityIdsByThreadId;
    previousActivityByThreadId = state.activityByThreadId;
    previousProposedPlanIdsByThreadId = state.proposedPlanIdsByThreadId;
    previousProposedPlanByThreadId = state.proposedPlanByThreadId;
    previousTurnDiffIdsByThreadId = state.turnDiffIdsByThreadId;
    previousTurnDiffSummaryByThreadId = state.turnDiffSummaryByThreadId;
    previousThreads = getThreadsFromState(state);
    return previousThreads;
  };
}

/**
 * 创建线程所属项�?ID 选择�? *
 * @param threadId - 线程 ID
 * @returns 返回该线程所属项�?ID 的选择器，线程不存在时返回 null
 */
export function createThreadProjectIdSelector(
  threadId: ThreadId | null | undefined,
): (state: AppState) => ProjectId | null {
  const selectThread = createThreadSelector(threadId);
  return (state) => selectThread(state)?.projectId ?? null;
}

/**
 * 创建线程是否存在选择�? *
 * @param threadId - 线程 ID
 * @returns 返回布尔值的选择器，指示线程是否存在�?store �? */
export function createThreadExistsSelector(
  threadId: ThreadId | null | undefined,
): (state: AppState) => boolean {
  const selectThread = createThreadSelector(threadId);
  return (state) => selectThread(state) !== undefined;
}

/**
 * 创建侧边栏线程摘要选择�? *
 * @param threadId - 线程 ID
 * @returns 返回侧边栏线程摘要的选择器，线程不存在时返回 undefined
 */
export function createSidebarThreadSummarySelector(
  threadId: ThreadId | null | undefined,
): (state: AppState) => SidebarThreadSummary | undefined {
  return (state) => (threadId ? state.sidebarThreadSummaryById[threadId] : undefined);
}

/**
 * 创建全量侧边栏线程摘要列表选择�? *
 * @description 监控 threadIds �?sidebarThreadSummaryById 引用�? * 仅当二者之一变化时才重建摘要列表�? *
 * @returns 稳定的侧边栏线程摘要列表选择器函�? */
export function createSidebarThreadSummariesSelector(): (
  state: AppState,
) => readonly SidebarThreadSummary[] {
  let previousThreadIds: readonly ThreadId[] | undefined;
  let previousSummaryById: Record<string, SidebarThreadSummary> | undefined;
  let previousSummaries: readonly SidebarThreadSummary[] = [];

  return (state) => {
    const threadIds = state.threadIds ?? state.threads.map((thread) => thread.id);
    if (threadIds === previousThreadIds && state.sidebarThreadSummaryById === previousSummaryById) {
      return previousSummaries;
    }

    previousThreadIds = threadIds;
    previousSummaryById = state.sidebarThreadSummaryById;
    previousSummaries = threadIds.flatMap((threadId) => {
      const summary = state.sidebarThreadSummaryById[threadId];
      return summary ? [summary] : [];
    });
    return previousSummaries;
  };
}

/**
 * 创建侧边栏展示线程选择�? *
 * @description 过滤掉有父线程的（子代理线程）和已归档的线程�? * 仅返回需要在侧边栏主列表中展示的线程摘要�? *
 * @returns 稳定的侧边栏展示线程列表选择器函�? */
export function createSidebarDisplayThreadsSelector(): (
  state: AppState,
) => readonly SidebarThreadSummary[] {
  const selectSidebarSummaries = createSidebarThreadSummariesSelector();
  let previousSummaries: readonly SidebarThreadSummary[] | undefined;
  let previousDisplaySummaries: readonly SidebarThreadSummary[] = [];

  return (state) => {
    const sidebarSummaries = selectSidebarSummaries(state);
    if (sidebarSummaries === previousSummaries) {
      return previousDisplaySummaries;
    }

    previousSummaries = sidebarSummaries;
    previousDisplaySummaries = sidebarSummaries.filter(
      (thread) => !thread.parentThreadId && thread.archivedAt == null,
    );
    return previousDisplaySummaries;
  };
}

/**
 * 创建第一个项目选择�? *
 * @description 返回项目列表中第一�?kind �?"project" 的项目，
 * 用于默认选中或回退场景�? *
 * @returns 稳定的第一个项目选择器函�? */
export function createFirstProjectSelector(): (state: AppState) => Project | undefined {
  let previousProjects: readonly Project[] | undefined;
  let previousFirstProject: Project | undefined;

  return (state) => {
    if (state.projects === previousProjects) {
      return previousFirstProject;
    }

    previousProjects = state.projects;
    previousFirstProject = state.projects.find((project) => project.kind === "project");
    return previousFirstProject;
  };
}

/**
 * 创建按类型筛选的项目选择�? *
 * @param kind - 项目类型（如 "project"�?folder" 等）
 * @returns 稳定的按类型筛选项目列表选择器函�? */
export function createProjectsByKindSelector(
  kind: Project["kind"],
): (state: AppState) => readonly Project[] {
  let previousProjects: readonly Project[] | undefined;
  let previousFiltered: readonly Project[] = [];

  return (state) => {
    if (state.projects === previousProjects) {
      return previousFiltered;
    }

    previousProjects = state.projects;
    previousFiltered = state.projects.filter((project) => project.kind === kind);
    return previousFiltered;
  };
}
