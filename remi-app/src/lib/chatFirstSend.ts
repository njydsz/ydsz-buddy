/**
 * @file 閼卞﹤銇夋＃鏍偧閸欐垿鈧胶娲伴弽鍥掗弸鎰侀崸? * @description 鐟欙絾鐎芥＃鏍偧濞戝牊浼呴崣鎴︹偓浣规閻ㄥ嫮娲伴弽鍥€嶉惄顕嗙礉閺€顖涘瘮瑜版挸澧犳い鍦窗閵嗕礁鍑￠張澶愩€嶉惄顔藉灗閸掓稑缂撻弬浼淬€嶉惄顔荤瑏缁夊秴婧€閺咁垬鈧? */

import { DEFAULT_MODEL_BY_PROVIDER, type ModelSelection } from "~/contracts";
import { workspaceRootsEqual } from "~/shared/threadWorkspace";

import type { Project } from "../types";

/**
 * 妫ｆ牗顐奸崣鎴︹偓浣烘畱妞ゅ湱娲伴惄顔界垼閹恒儱褰? */
export interface FirstSendProjectTarget {
  /** 閻╊喗鐖ｆい鍦窗 ID */
  targetProjectId: Project["id"];
  /** 閻╊喗鐖ｆい鍦窗缁鐎?*/
  targetProjectKind: Project["kind"];
  /** 閻╊喗鐖ｆい鍦窗瀹搞儰缍旈惄顔肩秿 */
  targetProjectCwd: string;
  /** 閻╊喗鐖ｆい鍦窗閼存碍婀伴崚妤勩€?*/
  targetProjectScripts: Project["scripts"];
  /** 閻╊喗鐖ｆい鍦窗姒涙顓诲Ο鈥崇€烽柅澶嬪 */
  targetProjectDefaultModelSelection: ModelSelection | null;
}

/**
 * 妫ｆ牗顐奸崣鎴︹偓浣规閸掓稑缂撻弬浼淬€嶉惄顔炬畱閸欏倹鏆熼幒銉ュ經
 */
export interface FirstSendProjectCreation {
  /** 瀹搞儰缍旈崠鐑樼壌閻╊喖缍?*/
  workspaceRoot: string;
  /** 妞ゅ湱娲伴弽鍥暯 */
  title: string;
  /** 姒涙顓诲Ο鈥崇€烽柅澶嬪 */
  defaultModelSelection: ModelSelection;
}

/**
 * 妫ｆ牗顐奸崣鎴︹偓浣烘窗閺嶅洩袙閺嬫劗绮ㄩ弸婊呰閸? * - "current": 娴ｈ法鏁よぐ鎾冲濞叉槒绌い鍦窗
 * - "existing-project": 娴ｈ法鏁ゅ鍙夋箒妞ゅ湱娲? * - "create-project": 閸掓稑缂撻弬浼淬€嶉惄? */
export type FirstSendTargetResolution =
  | { kind: "current"; target: FirstSendProjectTarget }
  | { kind: "existing-project"; target: FirstSendProjectTarget }
  | { kind: "create-project"; creation: FirstSendProjectCreation };

/**
 * 娴犲酣銆嶉惄顔碱嚠鐠炩剝鐎娲€嶉惄顔炬窗閺嶅浄绱欓崘鍛村劥閸戣姤鏆熼敍? * @param project - 妞ゅ湱娲扮€电钖? * @returns 妞ゅ湱娲伴惄顔界垼鐎电钖? */
function buildProjectTarget(project: Project): FirstSendProjectTarget {
  return {
    targetProjectId: project.id,
    targetProjectKind: project.kind,
    targetProjectCwd: project.cwd,
    targetProjectScripts: project.kind === "project" ? project.scripts : [],
    targetProjectDefaultModelSelection: project.defaultModelSelection ?? null,
  };
}

/**
 * 娴犲骸浼愭担婊冨隘閺嶅湱娲拌ぐ鏇熺€娲€嶉惄顔界垼妫版﹫绱欓崘鍛村劥閸戣姤鏆熼敍? * @param workspaceRoot - 瀹搞儰缍旈崠鐑樼壌閻╊喖缍嶇捄顖氱窞
 * @returns 妞ゅ湱娲伴弽鍥暯閿涘牆褰囩捄顖氱窞閺堚偓閸氬簼绔村▓纰夌礆
 */
function buildProjectTitleFromWorkspaceRoot(workspaceRoot: string): string {
  return workspaceRoot.split(/[/\\]/).findLast((segment) => segment.length > 0) ?? workspaceRoot;
}

/**
 * 鐟欙絾鐎芥＃鏍偧閸欐垿鈧胶娈戦惄顔界垼妞ゅ湱娲? * @param input - 鏉堟挸鍙嗛崣鍌涙殶
 * @param input.activeProject - 瑜版挸澧犲ú鏄忕┈妞ゅ湱娲? * @param input.isFirstMessage - 閺勵垰鎯佹稉娲浕濞嗏剝绉烽幁? * @param input.isHomeChatContainer - 閺勵垰鎯侀崷銊ゅ瘜妞や絻浜版径鈺侇啇閸? * @param input.projects - 閹碘偓閺堝銆嶉惄顔煎灙鐞? * @param input.selectedWorkspaceRoot - 闁鑵戦惃鍕紣娴ｆ粌灏弽鍦窗瑜? * @returns 妫ｆ牗顐奸崣鎴︹偓浣烘窗閺嶅洩袙閺嬫劗绮ㄩ弸? */
export function resolveFirstSendTarget(input: {
  activeProject: Project;
  isFirstMessage: boolean;
  isHomeChatContainer: boolean;
  projects: readonly Project[];
  selectedWorkspaceRoot: string | null;
}): FirstSendTargetResolution {
  const { activeProject, isFirstMessage, isHomeChatContainer, projects, selectedWorkspaceRoot } =
    input;

  // 婵″倹鐏夋稉宥嗘Ц妫ｆ牗顐煎☉鍫熶紖閹存牔绗夐崷銊ゅ瘜妞や絻浜版径鈺侇啇閸ｎ煉绱濋惄瀛樺复娴ｈ法鏁よぐ鎾冲妞ゅ湱娲?  if (!isFirstMessage || !isHomeChatContainer || !selectedWorkspaceRoot) {
    return {
      kind: "current",
      target: buildProjectTarget(activeProject),
    };
  }

  // 閺屻儲澹橀弰顖氭儊瀹告彃鐡ㄩ崷銊ュ爱闁板秶娈戞い鍦窗
  const existingProject = projects.find(
    (project) =>
      project.kind === "project" && workspaceRootsEqual(project.cwd, selectedWorkspaceRoot),
  );
  if (existingProject) {
    return {
      kind: "existing-project",
      target: buildProjectTarget(existingProject),
    };
  }

  // 闂団偓鐟曚礁鍨卞鐑樻煀妞ゅ湱娲?  return {
    kind: "create-project",
    creation: {
      workspaceRoot: selectedWorkspaceRoot,
      title: buildProjectTitleFromWorkspaceRoot(selectedWorkspaceRoot),
      defaultModelSelection: {
        provider: "codex",
        model: DEFAULT_MODEL_BY_PROVIDER.codex,
      },
    },
  };
}
