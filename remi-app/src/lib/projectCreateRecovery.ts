/**
 * @file projectCreateRecovery.ts
 * @description 闆嗕腑澶勭悊 project.create 閲嶅閿欒鐨勮В鏋愪笌鎭㈠閫昏緫銆? * 鎻愪緵閲嶅鍒涘缓閿欒妫€娴嬨€侀」鐩?ID 鎻愬彇銆佸揩鐓у尮閰嶅強閲嶈瘯绛夊緟绛夋仮澶嶅伐鍏峰嚱鏁般€? */

import type { OrchestrationReadModel } from "~/contracts";
import { workspaceRootsEqual } from "~/shared/threadWorkspace";

/** 閲嶅椤圭洰鍒涘缓閿欒娑堟伅鐨勫墠缂€ */
const DUPLICATE_PROJECT_CREATE_ERROR_PREFIX =
  "Orchestration command invariant failed (project.create): Project '";
/** 榛樿鏈€澶ф仮澶嶉噸璇曟鏁?*/
const DEFAULT_RECOVERY_MAX_ATTEMPTS = 6;
/** 榛樿閲嶈瘯闂撮殧锛堟绉掞級 */
const DEFAULT_RECOVERY_DELAY_MS = 50;

/** 鍙仮澶嶇殑椤圭洰鍊欓€夊璞★紝鍖呭惈 ID銆佺被鍨嬨€佸伐浣滃尯鏍硅矾寰勫強鍒犻櫎鏃堕棿 */
export interface DuplicateProjectCreateRecoveryCandidate {
  /** 椤圭洰 ID */
  readonly id: string;
  /** 椤圭洰绫诲瀷锛岄粯璁や负 "project" */
  readonly kind?: string | undefined;
  /** 宸ヤ綔鍖烘牴璺緞 */
  readonly workspaceRoot: string;
  /** 椤圭洰鍒犻櫎鏃堕棿锛屾湭鍒犻櫎鍒欎负 null */
  readonly deletedAt?: string | null | undefined;
}

/** 鍖呭惈椤圭洰鍒楄〃鐨勫揩鐓х粨鏋?*/
interface SnapshotWithProjects<T extends DuplicateProjectCreateRecoveryCandidate> {
  readonly projects: readonly T[];
}

/** 椤圭洰鏌ユ壘杈撳叆鍙傛暟 */
interface ProjectLookupInput {
  /** 椤圭洰 ID */
  readonly projectId?: string | null | undefined;
  /** 宸ヤ綔鍖烘牴璺緞 */
  readonly workspaceRoot?: string | null | undefined;
}

/** 鍒ゆ柇椤圭洰绫诲瀷鏄惁鍙仮澶嶏紙浠?"project" 绫诲瀷鍙仮澶嶏級 */
function isRecoverableProjectKind(kind: string | undefined): boolean {
  return (kind ?? "project") === "project";
}

/** 鍒ゆ柇椤圭洰鏄惁涓哄彲鎭㈠鐨勬椿璺冮」鐩紙鏈垹闄や笖绫诲瀷鍙仮澶嶏級 */
function isRecoverableActiveProject(project: DuplicateProjectCreateRecoveryCandidate): boolean {
  return (project.deletedAt ?? null) === null && isRecoverableProjectKind(project.kind);
}

/** 绛夊緟鎸囧畾姣鏁?*/
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 鍒ゆ柇閿欒娑堟伅鏄惁涓洪噸澶嶉」鐩垱寤洪敊璇? *
 * @param message - 閿欒娑堟伅瀛楃涓? * @returns 鏄惁涓洪噸澶嶉」鐩垱寤洪敊璇? */
export function isDuplicateProjectCreateError(message: string): boolean {
  if (!message.startsWith(DUPLICATE_PROJECT_CREATE_ERROR_PREFIX)) {
    return false;
  }

  const duplicateMarkerIndex = message.indexOf("' already uses workspace root '");
  return duplicateMarkerIndex > DUPLICATE_PROJECT_CREATE_ERROR_PREFIX.length;
}

/**
 * 浠庨噸澶嶉」鐩垱寤洪敊璇秷鎭腑鎻愬彇椤圭洰 ID
 *
 * @param message - 閿欒娑堟伅瀛楃涓? * @returns 鎻愬彇鍒扮殑椤圭洰 ID锛岃嫢娑堟伅鏍煎紡涓嶅尮閰嶅垯杩斿洖 null
 */
export function extractDuplicateProjectCreateProjectId(message: string): string | null {
  if (!isDuplicateProjectCreateError(message)) {
    return null;
  }

  const duplicateMarkerIndex = message.indexOf("' already uses workspace root '");
  return message.slice(DUPLICATE_PROJECT_CREATE_ERROR_PREFIX.length, duplicateMarkerIndex) || null;
}

/**
 * 鍦ㄩ」鐩垪琛ㄤ腑鏌ユ壘鍙仮澶嶇殑娲昏穬椤圭洰
 *
 * @typeParam T - 椤圭洰鍊欓€夌被鍨? * @param input - 鏌ユ壘杈撳叆锛屽寘鍚」鐩垪琛ㄥ強鍙€夌殑 projectId/workspaceRoot
 * @returns 鍖归厤鍒扮殑椤圭洰锛岃嫢鏈壘鍒板垯杩斿洖 null
 *
 * @remarks 浼樺厛鎸?projectId 绮剧‘鍖归厤锛屽叾娆℃寜 workspaceRoot 妯＄硦鍖归厤
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
 * 浠庨噸澶嶅垱寤洪敊璇秷鎭腑鏌ユ壘鍙仮澶嶇殑椤圭洰
 *
 * @typeParam T - 椤圭洰鍊欓€夌被鍨? * @param input - 鍖呭惈閿欒娑堟伅銆侀」鐩垪琛ㄥ拰宸ヤ綔鍖烘牴璺緞鐨勮緭鍏? * @returns 鍖归厤鍒扮殑鍙仮澶嶉」鐩紝鑻ユ湭鎵惧埌鍒欒繑鍥?null
 *
 * @remarks 浼樺厛浣跨敤閿欒娑堟伅涓彁鍙栫殑閲嶅椤圭洰 ID锛屽洖閫€鍒板伐浣滃尯鏍硅矾寰勫尮閰? */
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
 * 鍦ㄨ妯″瀷涓疆璇㈢瓑寰呭彲鎭㈠鐨勯」鐩嚭鐜? *
 * @typeParam TSnapshot - 蹇収绫诲瀷锛岄渶鍖呭惈 projects 鏁扮粍
 * @param input - 鍖呭惈蹇収鍔犺浇鍑芥暟銆佹煡鎵惧弬鏁板強鍙€夌殑閲嶈瘯/淇閰嶇疆
 * @returns 鎵惧埌鐨勯」鐩強鏈€鏂板揩鐓э紝鑻ヨ秴鏃舵湭鎵惧埌鍒欓」鐩负 null
 *
 * @remarks 鍏堣繘琛屾湁闄愭閲嶈瘯杞锛岃嫢浠嶅け璐ュ垯灏濊瘯璋冪敤 repairSnapshot 淇蹇収鍚庡啀娆℃煡鎵? */
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
 * 閽堝閲嶅椤圭洰鍒涘缓閿欒锛岃疆璇㈢瓑寰呭彲鎭㈠鐨勯」鐩嚭鐜? *
 * @typeParam TSnapshot - 蹇収绫诲瀷锛岄渶鍖呭惈 projects 鏁扮粍
 * @param input - 鍖呭惈閿欒娑堟伅銆佸伐浣滃尯鏍硅矾寰勩€佸揩鐓у姞杞藉嚱鏁板強鍙€夌殑閲嶈瘯/淇閰嶇疆
 * @returns 鎵惧埌鐨勯」鐩強鏈€鏂板揩鐓э紝鑻ヨ秴鏃舵湭鎵惧埌鍒欓」鐩负 null
 *
 * @remarks 鍏堣繘琛屾湁闄愭閲嶈瘯杞锛岃嫢浠嶅け璐ュ垯灏濊瘯璋冪敤 repairSnapshot 淇蹇収鍚庡啀娆℃煡鎵俱€? * 閫傜敤浜庨娆″彂閫佹祦绋嬩腑闇€瑕佸鐢ㄥ垰鎭㈠鐨勯」鐩満鏅€? */
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