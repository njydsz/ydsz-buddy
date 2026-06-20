/**
 * @file 鑱婂ぉ椤圭洰绠＄悊妯″潡
 * @description 澶嶇敤闅愯棌鐨勯椤典綔鐢ㄥ煙鑱婂ぉ椤圭洰浣滀负鑱婂ぉ琛岀殑鍚庡彴瀹瑰櫒銆? *              鎻愪緵棣栭〉鑱婂ぉ椤圭洰鐨勬煡鎵俱€佸垱寤恒€佷慨澶嶇瓑鍔熻兘銆? */

import { type ProjectId } from "~/contracts";
import type { Project } from "../types";
import { readNativeApi } from "../nativeApi";
import { useStore } from "../store";
import { getThreadFromState } from "../threadDerivation";
import { newCommandId, newProjectId } from "./utils";

/** 鎸夐椤电洰褰曠紦瀛樼殑寰呭垱寤洪椤佃亰澶╅」鐩?Promise */
const pendingHomeChatCreationByHomeDir = new Map<string, Promise<ProjectId | null>>();
/** 鎸夐椤电洰褰曠紦瀛樼殑寰呬慨澶嶉椤佃亰澶╅」鐩?Promise */
const pendingHomeChatFixupByHomeDir = new Map<string, Promise<void>>();

/**
 * 鍦ㄩ」鐩腑鏌ユ壘棣栭〉鑱婂ぉ瀹瑰櫒椤圭洰
 * @param projects - 椤圭洰鍒楄〃
 * @param homeDir - 棣栭〉鐩綍璺緞
 * @returns 鍖归厤鐨勯椤佃亰澶╁鍣ㄩ」鐩紝濡傛灉鏈壘鍒板垯杩斿洖 null
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
 * 鏌ユ壘瑙勮寖鐨勯椤甸」鐩紙鍐呴儴鍑芥暟锛? * 璇嗗埆瑙勮寖椤圭洰鍜岄噸澶嶉」鐩紝妫€娴嬫槸鍚﹂渶瑕佷慨澶嶉」鐩被鍨? * @param homeDir - 棣栭〉鐩綍璺緞
 * @returns 鍖呭惈瑙勮寖椤圭洰ID銆侀噸澶嶉」鐩甀D鍒楄〃鍜屾槸鍚﹂渶瑕佷慨澶嶇被鍨嬬殑瀵硅薄
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
  // 浼樺厛閫夋嫨绫诲瀷涓?"chat" 鐨勯」鐩綔涓鸿鑼冮」鐩?  const canonicalProject =
    homeProjects.find((project) => project.kind === "chat") ?? homeProjects[0];
  if (!canonicalProject) {
    return {
      canonicalProjectId: null,
      duplicateProjectIds: [],
      needsKindFixup: false,
    };
  }

  // 鏌ユ壘閲嶅椤圭洰锛堜粎褰撴病鏈夊叧鑱旂嚎绋嬫椂鎵嶅彲鍒犻櫎锛?  const duplicateProjectIds = homeProjects
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
 * 淇棣栭〉鑱婂ぉ椤圭洰锛堝唴閮ㄥ嚱鏁帮級
 * 淇椤圭洰绫诲瀷鍜屾竻鐞嗛噸澶嶉」鐩? * @param homeDir - 棣栭〉鐩綍璺緞
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

  // 淇椤圭洰绫诲瀷
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

  // 鍒犻櫎閲嶅椤圭洰
  for (const duplicateProjectId of duplicateProjectIds) {
    await api.orchestration.dispatchCommand({
      type: "project.delete",
      commandId: newCommandId(),
      projectId: duplicateProjectId,
    });
  }
}

/**
 * 璋冨害棣栭〉鑱婂ぉ椤圭洰淇锛堝唴閮ㄥ嚱鏁帮級
 * 浣跨敤缂撳瓨閬垮厤閲嶅淇
 * @param homeDir - 棣栭〉鐩綍璺緞
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
 * 纭繚棣栭〉鑱婂ぉ椤圭洰瀛樺湪
 * 濡傛灉涓嶅瓨鍦ㄥ垯鍒涘缓锛屽鏋滃瓨鍦ㄥ垯璋冨害淇
 * @param homeDir - 棣栭〉鐩綍璺緞
 * @returns 棣栭〉鑱婂ぉ椤圭洰 ID锛屽鏋?API 涓嶅彲鐢ㄥ垯杩斿洖 null
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

  // 妫€鏌ユ槸鍚﹀凡鏈夊緟鍒涘缓鐨?Promise
  const pendingCreation = pendingHomeChatCreationByHomeDir.get(homeDir);
  if (pendingCreation) {
    return pendingCreation;
  }

  // 鍒涘缓鏂扮殑棣栭〉鑱婂ぉ椤圭洰
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
 * 棰勭儹棣栭〉鑱婂ぉ椤圭洰
 * 寮傛瑙﹀彂椤圭洰鍒涘缓锛屼笉绛夊緟缁撴灉
 * @param homeDir - 棣栭〉鐩綍璺緞
 */
export function prewarmHomeChatProject(homeDir: string): void {
  void ensureHomeChatProject(homeDir);
}

/**
 * 鍒ゆ柇椤圭洰鏄惁涓洪椤佃亰澶╁鍣ㄩ」鐩? * @param project - 椤圭洰瀵硅薄
 * @param homeDir - 棣栭〉鐩綍璺緞
 * @returns 鏄惁涓洪椤佃亰澶╁鍣ㄩ」鐩? */
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
