/**
 * @file 首次发送消息模块
 *
 * 本模块提供线程（Thread）首次发送消息时的处理工具：
 *
 * - **默认模型解析**：根据 Provider 选择合适的默认模型
 * - **工作区根比较**：判断是否需要切换工作区
 * - **环境模式确认**：决定使用 local 还是 worktree 模式
 * - **线程创建**：必要时创建新线程
 *
 * ## 核心导出
 *
 * - `prepareFirstSend`：准备首次发送所需的全部参数
 * - `resolveInitialModelSelection`：解析初始模型选择
 * - `shouldSwitchWorkspaceForFirstSend`：判断首次发送是否需要切换工作区
 *
 * ## 使用场景
 *
 * - 用户在空线程中发送第一条消息
 * - 切换项目后第一次发送
 * - 从模板创建线程
 *
 * ## 注意事项
 *
 * - 首次发送时如果线程未创建，会触发创建流程
 * - 默认模型来自 `DEFAULT_MODEL_BY_PROVIDER` 全局配置
 * - 工作区模式继承自用户设置
 */

import { DEFAULT_MODEL_BY_PROVIDER, type ModelSelection } from "@ydsz-buddy/contracts";
import { workspaceRootsEqual } from "@njydsz/shared/threadWorkspace";

import type { Project } from "../types";

export interface FirstSendProjectTarget {
  targetProjectId: Project["id"];
  targetProjectKind: Project["kind"];
  targetProjectCwd: string;
  targetProjectScripts: Project["scripts"];
  targetProjectDefaultModelSelection: ModelSelection | null;
}

export interface FirstSendProjectCreation {
  workspaceRoot: string;
  title: string;
  defaultModelSelection: ModelSelection;
}

export type FirstSendTargetResolution =
  | { kind: "current"; target: FirstSendProjectTarget }
  | { kind: "existing-project"; target: FirstSendProjectTarget }
  | { kind: "create-project"; creation: FirstSendProjectCreation };

function buildProjectTarget(project: Project): FirstSendProjectTarget {
  return {
    targetProjectId: project.id,
    targetProjectKind: project.kind,
    targetProjectCwd: project.cwd,
    targetProjectScripts: project.kind === "project" ? project.scripts : [],
    targetProjectDefaultModelSelection: project.defaultModelSelection ?? null,
  };
}

function buildProjectTitleFromWorkspaceRoot(workspaceRoot: string): string {
  return workspaceRoot.split(/[/\\]/).findLast((segment) => segment.length > 0) ?? workspaceRoot;
}

export function resolveFirstSendTarget(input: {
  activeProject: Project;
  isFirstMessage: boolean;
  isHomeChatContainer: boolean;
  projects: readonly Project[];
  selectedWorkspaceRoot: string | null;
}): FirstSendTargetResolution {
  const { activeProject, isFirstMessage, isHomeChatContainer, projects, selectedWorkspaceRoot } =
    input;

  if (!isFirstMessage || !isHomeChatContainer || !selectedWorkspaceRoot) {
    return {
      kind: "current",
      target: buildProjectTarget(activeProject),
    };
  }

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
