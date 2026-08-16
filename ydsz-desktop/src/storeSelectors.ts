/**
 * @file Store 选择器模块
 * @description 提供稳定的 Zustand 选择器工厂，用于实体查找和轻量级侧边栏投影。
 *              导出的选择器供路由和侧边栏组件使用。
 */

import type { ProjectId, ThreadId } from "@ydsz-buddy/contracts";
import type { ProviderInteractionMode } from "@ydsz-buddy/contracts";

import type { AppState } from "./store";
import { getThreadFromState, getThreadsFromState } from "./threadDerivation";
import type { Project, SidebarThreadSummary, Thread } from "./types";

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

export function createProjectSelector(
  projectId: ProjectId | null | undefined,
): (state: AppState) => Project | undefined {
  return createStableEntitySelector((state) => state.projects, projectId);
}

export function createThreadSelector(
  threadId: ThreadId | null | undefined,
): (state: AppState) => Thread | undefined {
  return (state) =>
    threadId
      ? (getThreadFromState(state, threadId) ??
        state.threads.find((thread) => thread.id === threadId))
      : undefined;
}

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

export function createThreadProjectIdSelector(
  threadId: ThreadId | null | undefined,
): (state: AppState) => ProjectId | null {
  const selectThread = createThreadSelector(threadId);
  return (state) => selectThread(state)?.projectId ?? null;
}

export function createThreadExistsSelector(
  threadId: ThreadId | null | undefined,
): (state: AppState) => boolean {
  const selectThread = createThreadSelector(threadId);
  return (state) => selectThread(state) !== undefined;
}

/**
 * 创建线程交互模式选择器
 * @description 返回当前线程的 interactionMode（用于 Review 模式布局判定等）
 * @param threadId - 线程 ID
 * @returns 选择器函数，若线程不存在则返回 null
 */
export function createThreadInteractionModeSelector(
  threadId: ThreadId | null | undefined,
): (state: AppState) => ProviderInteractionMode | null {
  const selectThread = createThreadSelector(threadId);
  return (state) => selectThread(state)?.interactionMode ?? null;
}

export function createSidebarThreadSummarySelector(
  threadId: ThreadId | null | undefined,
): (state: AppState) => SidebarThreadSummary | undefined {
  return (state) => (threadId ? state.sidebarThreadSummaryById[threadId] : undefined);
}

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
