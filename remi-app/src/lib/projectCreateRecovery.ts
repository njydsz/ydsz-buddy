/**
 * @file 项目创建恢复模块
 *
 * 本模块处理 `project.create` 命令的失败恢复逻辑：项目数据已写入数据库但编排响应失败时，
 * 通过"孤儿子线程 ID"识别这些项目，并在前端 store 中补全项目 ID 引用。
 *
 * ## 核心导出
 *
 * - `recoverCreatedProjectsFromOrphanThreads`：从孤儿子线程中恢复已创建的项目
 * - `getOrphanCreatedProjectIds`：获取孤儿子线程关联的项目 ID 列表
 * - `linkOrphanProjectsToProjectIds`：将项目 ID 关联到 store
 *
 * ## 使用场景
 *
 * - 应用启动时扫描数据库中的孤儿项目
 * - 解决网络异常导致的部分写入
 * - 数据迁移/备份恢复
 *
 * ## 注意事项
 *
 * - 孤儿项目可能重复出现，按 createdAt 去重
 * - 仅在数据校验通过后展示给用户
 * - 恢复操作幂等，可重复执行
 */

import type { OrchestrationReadModel } from "~/contracts";
import { workspaceRootsEqual } from "~/shared/threadWorkspace";

/** 闁插秴顦叉い鍦窗閸掓稑缂撻柨娆掝嚖濞戝牊浼呴惃鍕缂傗偓 */
const DUPLICATE_PROJECT_CREATE_ERROR_PREFIX =
  "Orchestration command invariant failed (project.create): Project '";
/** 姒涙顓婚張鈧径褎浠径宥夊櫢鐠囨洘顐奸弫?*/
const DEFAULT_RECOVERY_MAX_ATTEMPTS = 6;
/** 姒涙顓婚柌宥堢槸闂傛挳娈ч敍鍫燁嚑缁夋帪绱?*/
const DEFAULT_RECOVERY_DELAY_MS = 50;

/** 閸欘垱浠径宥囨畱妞ゅ湱娲伴崐娆撯偓澶婎嚠鐠炩槄绱濋崠鍛儓 ID閵嗕胶琚崹瀣ㄢ偓浣镐紣娴ｆ粌灏弽纭呯熅瀵板嫬寮烽崚鐘绘珟閺冨爼妫?*/
export interface DuplicateProjectCreateRecoveryCandidate {
  /** 妞ゅ湱娲?ID */
  readonly id: string;
  /** 妞ゅ湱娲扮猾璇茬€烽敍宀勭帛鐠併倓璐?"project" */
  readonly kind?: string | undefined;
  /** 瀹搞儰缍旈崠鐑樼壌鐠侯垰绶?*/
  readonly workspaceRoot: string;
  /** 妞ゅ湱娲伴崚鐘绘珟閺冨爼妫块敍灞炬弓閸掔娀娅庨崚娆庤礋 null */
  readonly deletedAt?: string | null | undefined;
}

/** 閸栧懎鎯堟い鍦窗閸掓銆冮惃鍕彥閻撗呯波閺?*/
interface SnapshotWithProjects<T extends DuplicateProjectCreateRecoveryCandidate> {
  readonly projects: readonly T[];
}

/** 妞ゅ湱娲伴弻銉﹀鏉堟挸鍙嗛崣鍌涙殶 */
interface ProjectLookupInput {
  /** 妞ゅ湱娲?ID */
  readonly projectId?: string | null | undefined;
  /** 瀹搞儰缍旈崠鐑樼壌鐠侯垰绶?*/
  readonly workspaceRoot?: string | null | undefined;
}

/** 閸掋倖鏌囨い鍦窗缁鐎烽弰顖氭儊閸欘垱浠径宥忕礄娴?"project" 缁鐎烽崣顖涗划婢跺稄绱?*/
function isRecoverableProjectKind(kind: string | undefined): boolean {
  return (kind ?? "project") === "project";
}

/** 閸掋倖鏌囨い鍦窗閺勵垰鎯佹稉鍝勫讲閹垹顦查惃鍕た鐠哄啴銆嶉惄顕嗙礄閺堫亜鍨归梽銈勭瑬缁鐎烽崣顖涗划婢跺稄绱?*/
function isRecoverableActiveProject(project: DuplicateProjectCreateRecoveryCandidate): boolean {
  return (project.deletedAt ?? null) === null && isRecoverableProjectKind(project.kind);
}

/** 缁涘绶熼幐鍥х暰濮ｎ偆顫楅弫?*/
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 閸掋倖鏌囬柨娆掝嚖濞戝牊浼呴弰顖氭儊娑撴椽鍣告径宥夈€嶉惄顔煎灡瀵ゆ椽鏁婄拠? *
 * @param message - 闁挎瑨顕ゅ☉鍫熶紖鐎涙顑佹稉? * @returns 閺勵垰鎯佹稉娲櫢婢跺秹銆嶉惄顔煎灡瀵ゆ椽鏁婄拠? */
export function isDuplicateProjectCreateError(message: string): boolean {
  if (!message.startsWith(DUPLICATE_PROJECT_CREATE_ERROR_PREFIX)) {
    return false;
  }

  const duplicateMarkerIndex = message.indexOf("' already uses workspace root '");
  return duplicateMarkerIndex > DUPLICATE_PROJECT_CREATE_ERROR_PREFIX.length;
}

/**
 * 娴犲酣鍣告径宥夈€嶉惄顔煎灡瀵ゆ椽鏁婄拠顖涚Х閹垯鑵戦幓鎰絿妞ゅ湱娲?ID
 *
 * @param message - 闁挎瑨顕ゅ☉鍫熶紖鐎涙顑佹稉? * @returns 閹绘劕褰囬崚鎵畱妞ゅ湱娲?ID閿涘矁瀚㈠☉鍫熶紖閺嶇厧绱℃稉宥呭爱闁板秴鍨潻鏂挎礀 null
 */
export function extractDuplicateProjectCreateProjectId(message: string): string | null {
  if (!isDuplicateProjectCreateError(message)) {
    return null;
  }

  const duplicateMarkerIndex = message.indexOf("' already uses workspace root '");
  return message.slice(DUPLICATE_PROJECT_CREATE_ERROR_PREFIX.length, duplicateMarkerIndex) || null;
}

/**
 * 閸︺劑銆嶉惄顔煎灙鐞涖劋鑵戦弻銉﹀閸欘垱浠径宥囨畱濞叉槒绌い鍦窗
 *
 * @typeParam T - 妞ゅ湱娲伴崐娆撯偓澶岃閸? * @param input - 閺屻儲澹樻潏鎾冲弳閿涘苯瀵橀崥顐︺€嶉惄顔煎灙鐞涖劌寮烽崣顖炩偓澶屾畱 projectId/workspaceRoot
 * @returns 閸栧綊鍘ら崚鎵畱妞ゅ湱娲伴敍宀冨閺堫亝澹橀崚鏉垮灟鏉╂柨娲?null
 *
 * @remarks 娴兼ê鍘涢幐?projectId 缁墽鈥橀崠褰掑帳閿涘苯鍙惧▎鈩冨瘻 workspaceRoot 濡紕纭﹂崠褰掑帳
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
 * 娴犲酣鍣告径宥呭灡瀵ゆ椽鏁婄拠顖涚Х閹垯鑵戦弻銉﹀閸欘垱浠径宥囨畱妞ゅ湱娲? *
 * @typeParam T - 妞ゅ湱娲伴崐娆撯偓澶岃閸? * @param input - 閸栧懎鎯堥柨娆掝嚖濞戝牊浼呴妴渚€銆嶉惄顔煎灙鐞涖劌鎷板銉ょ稊閸栫儤鐗寸捄顖氱窞閻ㄥ嫯绶崗? * @returns 閸栧綊鍘ら崚鎵畱閸欘垱浠径宥夈€嶉惄顕嗙礉閼汇儲婀幍鎯у煂閸掓瑨绻戦崶?null
 *
 * @remarks 娴兼ê鍘涙担璺ㄦ暏闁挎瑨顕ゅ☉鍫熶紖娑擃厽褰侀崣鏍畱闁插秴顦叉い鍦窗 ID閿涘苯娲栭柅鈧崚鏉夸紣娴ｆ粌灏弽纭呯熅瀵板嫬灏柊? */
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
 * 閸︺劏顕板Ο鈥崇€锋稉顓＄枂鐠囥垻鐡戝鍛讲閹垹顦查惃鍕€嶉惄顔煎毉閻? *
 * @typeParam TSnapshot - 韫囶偆鍙庣猾璇茬€烽敍宀勬付閸栧懎鎯?projects 閺佹壆绮? * @param input - 閸栧懎鎯堣箛顐ゅ弾閸旂姾娴囬崙鑺ユ殶閵嗕焦鐓￠幍鎯у棘閺佹澘寮烽崣顖炩偓澶屾畱闁插秷鐦?娣囶喖顦查柊宥囩枂
 * @returns 閹垫儳鍩岄惃鍕€嶉惄顔煎挤閺堚偓閺傛澘鎻╅悡褝绱濋懟銉ㄧТ閺冭埖婀幍鎯у煂閸掓瑩銆嶉惄顔昏礋 null
 *
 * @remarks 閸忓牐绻樼悰灞炬箒闂勬劖顐奸柌宥堢槸鏉烆喛顕楅敍宀冨娴犲秴銇戠拹銉ュ灟鐏忔繆鐦拫鍐暏 repairSnapshot 娣囶喖顦茶箛顐ゅ弾閸氬骸鍟€濞嗏剝鐓￠幍? */
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
 * 闁藉牆顕柌宥咁槻妞ゅ湱娲伴崚娑樼紦闁挎瑨顕ら敍宀冪枂鐠囥垻鐡戝鍛讲閹垹顦查惃鍕€嶉惄顔煎毉閻? *
 * @typeParam TSnapshot - 韫囶偆鍙庣猾璇茬€烽敍宀勬付閸栧懎鎯?projects 閺佹壆绮? * @param input - 閸栧懎鎯堥柨娆掝嚖濞戝牊浼呴妴浣镐紣娴ｆ粌灏弽纭呯熅瀵板嫨鈧礁鎻╅悡褍濮炴潪钘夊毐閺佹澘寮烽崣顖炩偓澶屾畱闁插秷鐦?娣囶喖顦查柊宥囩枂
 * @returns 閹垫儳鍩岄惃鍕€嶉惄顔煎挤閺堚偓閺傛澘鎻╅悡褝绱濋懟銉ㄧТ閺冭埖婀幍鎯у煂閸掓瑩銆嶉惄顔昏礋 null
 *
 * @remarks 閸忓牐绻樼悰灞炬箒闂勬劖顐奸柌宥堢槸鏉烆喛顕楅敍宀冨娴犲秴銇戠拹銉ュ灟鐏忔繆鐦拫鍐暏 repairSnapshot 娣囶喖顦茶箛顐ゅ弾閸氬骸鍟€濞嗏剝鐓￠幍淇扁偓? * 闁倻鏁ゆ禍搴浕濞嗏€冲絺闁焦绁︾粙瀣╄厬闂団偓鐟曚礁顦查悽銊ュ灠閹垹顦查惃鍕€嶉惄顔兼簚閺咁垬鈧? */
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