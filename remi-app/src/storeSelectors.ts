/**
 * @file Zustand 绋冲畾閫夋嫨鍣ㄥ伐鍘? * @description 涓哄疄浣撴煡鎵惧拰渚ц竟鏍忚交閲忔姇褰辨彁渚涘紩鐢ㄧǔ瀹氱殑 Zustand 閫夋嫨鍣紝
 * 閬垮厤鍥?store 鏇存柊瀵艰嚧鏃犲叧缁勪欢閲嶆柊娓叉煋銆? * 瀵煎嚭鐨勯€夋嫨鍣ㄥ伐鍘傝璺敱鍜屼晶杈规爮缁勪欢骞挎硾浣跨敤銆? */

import type { ProjectId, ThreadId } from "~/contracts";

import type { AppState } from "./store";
import { getThreadFromState, getThreadsFromState } from "./threadDerivation";
import type { Project, SidebarThreadSummary, Thread } from "./types";

/**
 * 鍒涘缓寮曠敤绋冲畾鐨勫疄浣撻€夋嫨鍣? *
 * @description 閫氳繃闂寘缂撳瓨涓婁竴娆＄殑鍒楄〃寮曠敤鍜屽尮閰嶇粨鏋滐紝浠呭綋鍒楄〃寮曠敤鍙樺寲鏃堕噸鏂版煡鎵撅紝
 * 浠庤€屼繚璇佸悓涓€瀹炰綋鍦ㄥ垪琛ㄦ湭鍙樻椂杩斿洖鐩稿悓寮曠敤锛岄伩鍏嶄笉蹇呰鐨勯噸娓叉煋銆? *
 * @typeParam T - 瀹炰綋绫诲瀷锛屽繀椤诲寘鍚?id 灞炴€? * @param selectItems - 浠?store 涓€夊彇瀹炰綋鍒楄〃鐨勫嚱鏁? * @param id - 瑕佹煡鎵剧殑瀹炰綋 ID锛屼负 null/undefined 鏃跺缁堣繑鍥?undefined
 * @returns 涓€涓ǔ瀹氱殑閫夋嫨鍣ㄥ嚱鏁? */
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
 * 鍒涘缓椤圭洰閫夋嫨鍣? *
 * @param projectId - 椤圭洰 ID锛屼负 null/undefined 鏃堕€夋嫨鍣ㄥ缁堣繑鍥?undefined
 * @returns 绋冲畾鐨勯」鐩€夋嫨鍣ㄥ嚱鏁? */
export function createProjectSelector(
  projectId: ProjectId | null | undefined,
): (state: AppState) => Project | undefined {
  return createStableEntitySelector((state) => state.projects, projectId);
}

/**
 * 鍒涘缓绾跨▼閫夋嫨鍣? *
 * @description 浼樺厛浠?threadDerivation 鑾峰彇绾跨▼锛堝熀浜庡綊涓€鍖栧垏鐗囬噸寤猴級锛? * 鍥為€€鍒?store.threads 鏁扮粍涓煡鎵俱€? *
 * @param threadId - 绾跨▼ ID锛屼负 null/undefined 鏃堕€夋嫨鍣ㄥ缁堣繑鍥?undefined
 * @returns 绋冲畾鐨勭嚎绋嬮€夋嫨鍣ㄥ嚱鏁? */
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
 * 鍒涘缓鍏ㄩ噺绾跨▼鍒楄〃閫夋嫨鍣? *
 * @description 鐩戞帶 store 涓墍鏈夌嚎绋嬬浉鍏崇殑褰掍竴鍖栧垏鐗囧紩鐢紝浠呭綋浠讳竴鍒囩墖鍙樺寲鏃? * 鎵嶉噸鏂颁粠 threadDerivation 閲嶅缓绾跨▼鍒楄〃锛屼繚璇佸紩鐢ㄧǔ瀹氭€с€? *
 * @returns 绋冲畾鐨勫叏閲忕嚎绋嬪垪琛ㄩ€夋嫨鍣ㄥ嚱鏁? */
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
 * 鍒涘缓绾跨▼鎵€灞為」鐩?ID 閫夋嫨鍣? *
 * @param threadId - 绾跨▼ ID
 * @returns 杩斿洖璇ョ嚎绋嬫墍灞為」鐩?ID 鐨勯€夋嫨鍣紝绾跨▼涓嶅瓨鍦ㄦ椂杩斿洖 null
 */
export function createThreadProjectIdSelector(
  threadId: ThreadId | null | undefined,
): (state: AppState) => ProjectId | null {
  const selectThread = createThreadSelector(threadId);
  return (state) => selectThread(state)?.projectId ?? null;
}

/**
 * 鍒涘缓绾跨▼鏄惁瀛樺湪閫夋嫨鍣? *
 * @param threadId - 绾跨▼ ID
 * @returns 杩斿洖甯冨皵鍊肩殑閫夋嫨鍣紝鎸囩ず绾跨▼鏄惁瀛樺湪浜?store 涓? */
export function createThreadExistsSelector(
  threadId: ThreadId | null | undefined,
): (state: AppState) => boolean {
  const selectThread = createThreadSelector(threadId);
  return (state) => selectThread(state) !== undefined;
}

/**
 * 鍒涘缓渚ц竟鏍忕嚎绋嬫憳瑕侀€夋嫨鍣? *
 * @param threadId - 绾跨▼ ID
 * @returns 杩斿洖渚ц竟鏍忕嚎绋嬫憳瑕佺殑閫夋嫨鍣紝绾跨▼涓嶅瓨鍦ㄦ椂杩斿洖 undefined
 */
export function createSidebarThreadSummarySelector(
  threadId: ThreadId | null | undefined,
): (state: AppState) => SidebarThreadSummary | undefined {
  return (state) => (threadId ? state.sidebarThreadSummaryById[threadId] : undefined);
}

/**
 * 鍒涘缓鍏ㄩ噺渚ц竟鏍忕嚎绋嬫憳瑕佸垪琛ㄩ€夋嫨鍣? *
 * @description 鐩戞帶 threadIds 鍜?sidebarThreadSummaryById 寮曠敤锛? * 浠呭綋浜岃€呬箣涓€鍙樺寲鏃舵墠閲嶅缓鎽樿鍒楄〃銆? *
 * @returns 绋冲畾鐨勪晶杈规爮绾跨▼鎽樿鍒楄〃閫夋嫨鍣ㄥ嚱鏁? */
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
 * 鍒涘缓渚ц竟鏍忓睍绀虹嚎绋嬮€夋嫨鍣? *
 * @description 杩囨护鎺夋湁鐖剁嚎绋嬬殑锛堝瓙浠ｇ悊绾跨▼锛夊拰宸插綊妗ｇ殑绾跨▼锛? * 浠呰繑鍥為渶瑕佸湪渚ц竟鏍忎富鍒楄〃涓睍绀虹殑绾跨▼鎽樿銆? *
 * @returns 绋冲畾鐨勪晶杈规爮灞曠ず绾跨▼鍒楄〃閫夋嫨鍣ㄥ嚱鏁? */
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
 * 鍒涘缓绗竴涓」鐩€夋嫨鍣? *
 * @description 杩斿洖椤圭洰鍒楄〃涓涓€涓?kind 涓?"project" 鐨勯」鐩紝
 * 鐢ㄤ簬榛樿閫変腑鎴栧洖閫€鍦烘櫙銆? *
 * @returns 绋冲畾鐨勭涓€涓」鐩€夋嫨鍣ㄥ嚱鏁? */
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
 * 鍒涘缓鎸夌被鍨嬬瓫閫夌殑椤圭洰閫夋嫨鍣? *
 * @param kind - 椤圭洰绫诲瀷锛堝 "project"銆?folder" 绛夛級
 * @returns 绋冲畾鐨勬寜绫诲瀷绛涢€夐」鐩垪琛ㄩ€夋嫨鍣ㄥ嚱鏁? */
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
