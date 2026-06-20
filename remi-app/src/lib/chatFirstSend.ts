/**
 * @file 鑱婂ぉ棣栨鍙戦€佺洰鏍囪В鏋愭ā鍧? * @description 瑙ｆ瀽棣栨娑堟伅鍙戦€佹椂鐨勭洰鏍囬」鐩紝鏀寔褰撳墠椤圭洰銆佸凡鏈夐」鐩垨鍒涘缓鏂伴」鐩笁绉嶅満鏅€? */

import { DEFAULT_MODEL_BY_PROVIDER, type ModelSelection } from "~/contracts";
import { workspaceRootsEqual } from "~/shared/threadWorkspace";

import type { Project } from "../types";

/**
 * 棣栨鍙戦€佺殑椤圭洰鐩爣鎺ュ彛
 */
export interface FirstSendProjectTarget {
  /** 鐩爣椤圭洰 ID */
  targetProjectId: Project["id"];
  /** 鐩爣椤圭洰绫诲瀷 */
  targetProjectKind: Project["kind"];
  /** 鐩爣椤圭洰宸ヤ綔鐩綍 */
  targetProjectCwd: string;
  /** 鐩爣椤圭洰鑴氭湰鍒楄〃 */
  targetProjectScripts: Project["scripts"];
  /** 鐩爣椤圭洰榛樿妯″瀷閫夋嫨 */
  targetProjectDefaultModelSelection: ModelSelection | null;
}

/**
 * 棣栨鍙戦€佹椂鍒涘缓鏂伴」鐩殑鍙傛暟鎺ュ彛
 */
export interface FirstSendProjectCreation {
  /** 宸ヤ綔鍖烘牴鐩綍 */
  workspaceRoot: string;
  /** 椤圭洰鏍囬 */
  title: string;
  /** 榛樿妯″瀷閫夋嫨 */
  defaultModelSelection: ModelSelection;
}

/**
 * 棣栨鍙戦€佺洰鏍囪В鏋愮粨鏋滅被鍨? * - "current": 浣跨敤褰撳墠娲昏穬椤圭洰
 * - "existing-project": 浣跨敤宸叉湁椤圭洰
 * - "create-project": 鍒涘缓鏂伴」鐩? */
export type FirstSendTargetResolution =
  | { kind: "current"; target: FirstSendProjectTarget }
  | { kind: "existing-project"; target: FirstSendProjectTarget }
  | { kind: "create-project"; creation: FirstSendProjectCreation };

/**
 * 浠庨」鐩璞℃瀯寤洪」鐩洰鏍囷紙鍐呴儴鍑芥暟锛? * @param project - 椤圭洰瀵硅薄
 * @returns 椤圭洰鐩爣瀵硅薄
 */
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
 * 浠庡伐浣滃尯鏍圭洰褰曟瀯寤洪」鐩爣棰橈紙鍐呴儴鍑芥暟锛? * @param workspaceRoot - 宸ヤ綔鍖烘牴鐩綍璺緞
 * @returns 椤圭洰鏍囬锛堝彇璺緞鏈€鍚庝竴娈碉級
 */
function buildProjectTitleFromWorkspaceRoot(workspaceRoot: string): string {
  return workspaceRoot.split(/[/\\]/).findLast((segment) => segment.length > 0) ?? workspaceRoot;
}

/**
 * 瑙ｆ瀽棣栨鍙戦€佺殑鐩爣椤圭洰
 * @param input - 杈撳叆鍙傛暟
 * @param input.activeProject - 褰撳墠娲昏穬椤圭洰
 * @param input.isFirstMessage - 鏄惁涓洪娆℃秷鎭? * @param input.isHomeChatContainer - 鏄惁鍦ㄤ富椤佃亰澶╁鍣? * @param input.projects - 鎵€鏈夐」鐩垪琛? * @param input.selectedWorkspaceRoot - 閫変腑鐨勫伐浣滃尯鏍圭洰褰? * @returns 棣栨鍙戦€佺洰鏍囪В鏋愮粨鏋? */
export function resolveFirstSendTarget(input: {
  activeProject: Project;
  isFirstMessage: boolean;
  isHomeChatContainer: boolean;
  projects: readonly Project[];
  selectedWorkspaceRoot: string | null;
}): FirstSendTargetResolution {
  const { activeProject, isFirstMessage, isHomeChatContainer, projects, selectedWorkspaceRoot } =
    input;

  // 濡傛灉涓嶆槸棣栨娑堟伅鎴栦笉鍦ㄤ富椤佃亰澶╁鍣紝鐩存帴浣跨敤褰撳墠椤圭洰
  if (!isFirstMessage || !isHomeChatContainer || !selectedWorkspaceRoot) {
    return {
      kind: "current",
      target: buildProjectTarget(activeProject),
    };
  }

  // 鏌ユ壘鏄惁宸插瓨鍦ㄥ尮閰嶇殑椤圭洰
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

  // 闇€瑕佸垱寤烘柊椤圭洰
  return {
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
