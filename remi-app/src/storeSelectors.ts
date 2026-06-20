/**
 * @file Zustand 缁嬪啿鐣鹃柅澶嬪閸ｃ劌浼愰崢? * @description 娑撳搫鐤勬担鎾寸叀閹垫儳鎷版笟褑绔熼弽蹇氫氦闁插繑濮囪ぐ杈ㄥ絹娓氭稑绱╅悽銊旂€规氨娈?Zustand 闁瀚ㄩ崳顭掔礉
 * 闁灝鍘ら崶?store 閺囧瓨鏌婄€佃壈鍤ч弮鐘插彠缂佸嫪娆㈤柌宥嗘煀濞撳弶鐓嬮妴? * 鐎电厧鍤惃鍕偓澶嬪閸ｃ劌浼愰崢鍌濐潶鐠侯垳鏁遍崪灞兼櫠鏉堣鐖紒鍕楠炴寧纭炬担璺ㄦ暏閵? */

import type { ProjectId, ThreadId } from "~/contracts";

import type { AppState } from "./store";
import { getThreadFromState, getThreadsFromState } from "./threadDerivation";
import type { Project, SidebarThreadSummary, Thread } from "./types";

/**
 * 閸掓稑缂撳鏇犳暏缁嬪啿鐣鹃惃鍕杽娴ｆ捇鈧瀚ㄩ崳? *
 * @description 闁俺绻冮梻顓炲瘶缂傛挸鐡ㄦ稉濠佺濞嗭紕娈戦崚妤勩€冨鏇犳暏閸滃苯灏柊宥囩波閺嬫粣绱濇禒鍛秼閸掓銆冨鏇犳暏閸欐ê瀵查弮鍫曞櫢閺傜増鐓￠幍鎾呯礉
 * 娴犲氦鈧奔绻氱拠浣告倱娑撯偓鐎圭偘缍嬮崷銊ュ灙鐞涖劍婀崣妯绘鏉╂柨娲栭惄绋挎倱瀵洜鏁ら敍宀勪缉閸忓秳绗夎箛鍛邦洣閻ㄥ嫰鍣稿〒鍙夌厠閵? *
 * @typeParam T - 鐎圭偘缍嬬猾璇茬€烽敍灞界箑妞よ瀵橀崥?id 鐏炵偞鈧? * @param selectItems - 娴?store 娑擃參鈧褰囩€圭偘缍嬮崚妤勩€冮惃鍕毐閺? * @param id - 鐟曚焦鐓￠幍鍓ф畱鐎圭偘缍?ID閿涘奔璐?null/undefined 閺冭泛顫愮紒鍫ｇ箲閸?undefined
 * @returns 娑撯偓娑擃亞菙鐎规氨娈戦柅澶嬪閸ｃ劌鍤遍弫? */
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
 * 閸掓稑缂撴い鍦窗闁瀚ㄩ崳? *
 * @param projectId - 妞ゅ湱娲?ID閿涘奔璐?null/undefined 閺冨爼鈧瀚ㄩ崳銊ヮ潗缂佸牐绻戦崶?undefined
 * @returns 缁嬪啿鐣鹃惃鍕€嶉惄顕€鈧瀚ㄩ崳銊ュ毐閺? */
export function createProjectSelector(
  projectId: ProjectId | null | undefined,
): (state: AppState) => Project | undefined {
  return createStableEntitySelector((state) => state.projects, projectId);
}

/**
 * 閸掓稑缂撶痪璺ㄢ柤闁瀚ㄩ崳? *
 * @description 娴兼ê鍘涙禒?threadDerivation 閼惧嘲褰囩痪璺ㄢ柤閿涘牆鐔€娴滃骸缍婃稉鈧崠鏍у瀼閻楀洭鍣稿鐚寸礆閿? * 閸ョ偤鈧偓閸?store.threads 閺佹壆绮嶆稉顓熺叀閹典勘鈧? *
 * @param threadId - 缁捐法鈻?ID閿涘奔璐?null/undefined 閺冨爼鈧瀚ㄩ崳銊ヮ潗缂佸牐绻戦崶?undefined
 * @returns 缁嬪啿鐣鹃惃鍕殠缁嬪鈧瀚ㄩ崳銊ュ毐閺? */
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
 * 閸掓稑缂撻崗銊╁櫤缁捐法鈻奸崚妤勩€冮柅澶嬪閸? *
 * @description 閻╂垶甯?store 娑擃厽澧嶉張澶屽殠缁嬪娴夐崗宕囨畱瑜版帊绔撮崠鏍у瀼閻楀洤绱╅悽顭掔礉娴犲懎缍嬫禒璁崇閸掑洨澧栭崣妯哄閺? * 閹靛秹鍣搁弬棰佺矤 threadDerivation 闁插秴缂撶痪璺ㄢ柤閸掓銆冮敍灞肩箽鐠囦礁绱╅悽銊旂€规碍鈧佲偓? *
 * @returns 缁嬪啿鐣鹃惃鍕弿闁插繒鍤庣粙瀣灙鐞涖劑鈧瀚ㄩ崳銊ュ毐閺? */
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
 * 閸掓稑缂撶痪璺ㄢ柤閹碘偓鐏炵偤銆嶉惄?ID 闁瀚ㄩ崳? *
 * @param threadId - 缁捐法鈻?ID
 * @returns 鏉╂柨娲栫拠銉у殠缁嬪澧嶇仦鐐恒€嶉惄?ID 閻ㄥ嫰鈧瀚ㄩ崳顭掔礉缁捐法鈻兼稉宥呯摠閸︺劍妞傛潻鏂挎礀 null
 */
export function createThreadProjectIdSelector(
  threadId: ThreadId | null | undefined,
): (state: AppState) => ProjectId | null {
  const selectThread = createThreadSelector(threadId);
  return (state) => selectThread(state)?.projectId ?? null;
}

/**
 * 閸掓稑缂撶痪璺ㄢ柤閺勵垰鎯佺€涙ê婀柅澶嬪閸? *
 * @param threadId - 缁捐法鈻?ID
 * @returns 鏉╂柨娲栫敮鍐ㄧ毜閸婅偐娈戦柅澶嬪閸ｎ煉绱濋幐鍥┿仛缁捐法鈻奸弰顖氭儊鐎涙ê婀禍?store 娑? */
export function createThreadExistsSelector(
  threadId: ThreadId | null | undefined,
): (state: AppState) => boolean {
  const selectThread = createThreadSelector(threadId);
  return (state) => selectThread(state) !== undefined;
}

/**
 * 閸掓稑缂撴笟褑绔熼弽蹇曞殠缁嬪鎲崇憰渚€鈧瀚ㄩ崳? *
 * @param threadId - 缁捐法鈻?ID
 * @returns 鏉╂柨娲栨笟褑绔熼弽蹇曞殠缁嬪鎲崇憰浣烘畱闁瀚ㄩ崳顭掔礉缁捐法鈻兼稉宥呯摠閸︺劍妞傛潻鏂挎礀 undefined
 */
export function createSidebarThreadSummarySelector(
  threadId: ThreadId | null | undefined,
): (state: AppState) => SidebarThreadSummary | undefined {
  return (state) => (threadId ? state.sidebarThreadSummaryById[threadId] : undefined);
}

/**
 * 閸掓稑缂撻崗銊╁櫤娓氀嗙珶閺嶅繒鍤庣粙瀣喅鐟曚礁鍨悰銊┾偓澶嬪閸? *
 * @description 閻╂垶甯?threadIds 閸?sidebarThreadSummaryById 瀵洜鏁ら敍? * 娴犲懎缍嬫禍宀冣偓鍛娑撯偓閸欐ê瀵查弮鑸靛闁插秴缂撻幗妯款洣閸掓銆冮妴? *
 * @returns 缁嬪啿鐣鹃惃鍕櫠鏉堣鐖痪璺ㄢ柤閹芥顩﹂崚妤勩€冮柅澶嬪閸ｃ劌鍤遍弫? */
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
 * 閸掓稑缂撴笟褑绔熼弽蹇撶潔缁€铏瑰殠缁嬪鈧瀚ㄩ崳? *
 * @description 鏉╁洦鎶ら幒澶嬫箒閻栧墎鍤庣粙瀣畱閿涘牆鐡欐禒锝囨倞缁捐法鈻奸敍澶婃嫲瀹告彃缍婂锝囨畱缁捐法鈻奸敍? * 娴犲懓绻戦崶鐐烘付鐟曚礁婀笟褑绔熼弽蹇庡瘜閸掓銆冩稉顓炵潔缁€铏规畱缁捐法鈻奸幗妯款洣閵? *
 * @returns 缁嬪啿鐣鹃惃鍕櫠鏉堣鐖仦鏇犮仛缁捐法鈻奸崚妤勩€冮柅澶嬪閸ｃ劌鍤遍弫? */
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
 * 閸掓稑缂撶粭顑跨娑擃亪銆嶉惄顕€鈧瀚ㄩ崳? *
 * @description 鏉╂柨娲栨い鍦窗閸掓銆冩稉顓狀儑娑撯偓娑?kind 娑?"project" 閻ㄥ嫰銆嶉惄顕嗙礉
 * 閻劋绨妯款吇闁鑵戦幋鏍ф礀闁偓閸︾儤娅欓妴? *
 * @returns 缁嬪啿鐣鹃惃鍕儑娑撯偓娑擃亪銆嶉惄顕€鈧瀚ㄩ崳銊ュ毐閺? */
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
 * 閸掓稑缂撻幐澶岃閸ㄥ鐡柅澶屾畱妞ゅ湱娲伴柅澶嬪閸? *
 * @param kind - 妞ゅ湱娲扮猾璇茬€烽敍鍫濐洤 "project"閵?folder" 缁涘绱? * @returns 缁嬪啿鐣鹃惃鍕瘻缁鐎风粵娑⑩偓澶愩€嶉惄顔煎灙鐞涖劑鈧瀚ㄩ崳銊ュ毐閺? */
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
