/**
 * @file 閼卞﹤銇夋い鍦窗缁狅紕鎮婂Ο鈥虫健
 * @description 婢跺秶鏁ら梾鎰閻ㄥ嫰顩绘い鍏哥稊閻劌鐓欓懕濠傘亯妞ゅ湱娲版担婊€璐熼懕濠傘亯鐞涘瞼娈戦崥搴″酱鐎圭懓娅掗妴? *              閹绘劒绶垫＃鏍€夐懕濠傘亯妞ゅ湱娲伴惃鍕叀閹典勘鈧礁鍨卞鎭掆偓浣锋叏婢跺秶鐡戦崝鐔诲厴閵? */

import { type ProjectId } from "~/contracts";
import type { Project } from "../types";
import { readNativeApi } from "../nativeApi";
import { useStore } from "../store";
import { getThreadFromState } from "../threadDerivation";
import { newCommandId, newProjectId } from "./utils";

/** 閹稿顩绘い鐢垫窗瑜版洜绱︾€涙娈戝鍛灡瀵ゆ椽顩绘い浣冧喊婢垛晠銆嶉惄?Promise */
const pendingHomeChatCreationByHomeDir = new Map<string, Promise<ProjectId | null>>();
/** 閹稿顩绘い鐢垫窗瑜版洜绱︾€涙娈戝鍛叏婢跺秹顩绘い浣冧喊婢垛晠銆嶉惄?Promise */
const pendingHomeChatFixupByHomeDir = new Map<string, Promise<void>>();

/**
 * 閸︺劑銆嶉惄顔昏厬閺屻儲澹樻＃鏍€夐懕濠傘亯鐎圭懓娅掓い鍦窗
 * @param projects - 妞ゅ湱娲伴崚妤勩€? * @param homeDir - 妫ｆ牠銆夐惄顔肩秿鐠侯垰绶? * @returns 閸栧綊鍘ら惃鍕浕妞や絻浜版径鈺侇啇閸ｃ劑銆嶉惄顕嗙礉婵″倹鐏夐張顏呭閸掓澘鍨潻鏂挎礀 null
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
 * 閺屻儲澹樼憴鍕瘱閻ㄥ嫰顩绘い鐢搞€嶉惄顕嗙礄閸愬懘鍎撮崙鑺ユ殶閿? * 鐠囧棗鍩嗙憴鍕瘱妞ゅ湱娲伴崪宀勫櫢婢跺秹銆嶉惄顕嗙礉濡偓濞村妲搁崥锕傛付鐟曚椒鎱ㄦ径宥夈€嶉惄顔捐閸? * @param homeDir - 妫ｆ牠銆夐惄顔肩秿鐠侯垰绶? * @returns 閸栧懎鎯堢憴鍕瘱妞ゅ湱娲癐D閵嗕線鍣告径宥夈€嶉惄鐢€D閸掓銆冮崪灞炬Ц閸氾箓娓剁憰浣锋叏婢跺秶琚崹瀣畱鐎电钖? */
function findCanonicalHomeProject(homeDir: string): {
  canonicalProjectId: ProjectId | null;
  duplicateProjectIds: ProjectId[];
  needsKindFixup: boolean;
} {
  const state = useStore.getState();
  const homeProjects = state.projects.filter((project) =>
    isHomeChatContainerProject(project, homeDir),
  );
  // 娴兼ê鍘涢柅澶嬪缁鐎锋稉?"chat" 閻ㄥ嫰銆嶉惄顔荤稊娑撻缚顫夐懠鍐€嶉惄?  const canonicalProject =
    homeProjects.find((project) => project.kind === "chat") ?? homeProjects[0];
  if (!canonicalProject) {
    return {
      canonicalProjectId: null,
      duplicateProjectIds: [],
      needsKindFixup: false,
    };
  }

  // 閺屻儲澹橀柌宥咁槻妞ゅ湱娲伴敍鍫滅矌瑜版挻鐥呴張澶婂彠閼辨梻鍤庣粙瀣閹靛秴褰查崚鐘绘珟閿?  const duplicateProjectIds = homeProjects
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
 * 娣囶喖顦叉＃鏍€夐懕濠傘亯妞ゅ湱娲伴敍鍫濆敶闁劌鍤遍弫甯礆
 * 娣囶喖顦叉い鍦窗缁鐎烽崪灞剧閻炲棝鍣告径宥夈€嶉惄? * @param homeDir - 妫ｆ牠銆夐惄顔肩秿鐠侯垰绶? */
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

  // 娣囶喖顦叉い鍦窗缁鐎?  if (needsKindFixup) {
    await api.orchestration.dispatchCommand({
      type: "project.meta.update",
      commandId: newCommandId(),
      projectId: canonicalProjectId,
      kind: "chat",
      title: "Home",
      workspaceRoot: homeDir,
    });
  }

  // 閸掔娀娅庨柌宥咁槻妞ゅ湱娲?  for (const duplicateProjectId of duplicateProjectIds) {
    await api.orchestration.dispatchCommand({
      type: "project.delete",
      commandId: newCommandId(),
      projectId: duplicateProjectId,
    });
  }
}

/**
 * 鐠嬪啫瀹虫＃鏍€夐懕濠傘亯妞ゅ湱娲版穱顔碱槻閿涘牆鍞撮柈銊ュ毐閺佸府绱? * 娴ｈ法鏁ょ紓鎾崇摠闁灝鍘ら柌宥咁槻娣囶喖顦? * @param homeDir - 妫ｆ牠銆夐惄顔肩秿鐠侯垰绶? */
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
 * 绾喕绻氭＃鏍€夐懕濠傘亯妞ゅ湱娲扮€涙ê婀? * 婵″倹鐏夋稉宥呯摠閸︺劌鍨崚娑樼紦閿涘苯顩ч弸婊冪摠閸︺劌鍨拫鍐ㄥ娣囶喖顦? * @param homeDir - 妫ｆ牠銆夐惄顔肩秿鐠侯垰绶? * @returns 妫ｆ牠銆夐懕濠傘亯妞ゅ湱娲?ID閿涘苯顩ч弸?API 娑撳秴褰查悽銊ュ灟鏉╂柨娲?null
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

  // 濡偓閺屻儲妲搁崥锕€鍑￠張澶婄窡閸掓稑缂撻惃?Promise
  const pendingCreation = pendingHomeChatCreationByHomeDir.get(homeDir);
  if (pendingCreation) {
    return pendingCreation;
  }

  // 閸掓稑缂撻弬鎵畱妫ｆ牠銆夐懕濠傘亯妞ゅ湱娲?  const creationPromise = (async () => {
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
 * 妫板嫮鍎规＃鏍€夐懕濠傘亯妞ゅ湱娲? * 瀵倹顒炵憴锕€褰傛い鍦窗閸掓稑缂撻敍灞肩瑝缁涘绶熺紒鎾寸亯
 * @param homeDir - 妫ｆ牠銆夐惄顔肩秿鐠侯垰绶? */
export function prewarmHomeChatProject(homeDir: string): void {
  void ensureHomeChatProject(homeDir);
}

/**
 * 閸掋倖鏌囨い鍦窗閺勵垰鎯佹稉娲浕妞や絻浜版径鈺侇啇閸ｃ劑銆嶉惄? * @param project - 妞ゅ湱娲扮€电钖? * @param homeDir - 妫ｆ牠銆夐惄顔肩秿鐠侯垰绶? * @returns 閺勵垰鎯佹稉娲浕妞や絻浜版径鈺侇啇閸ｃ劑銆嶉惄? */
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
