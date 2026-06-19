/**
 * @file 聊天首次发送目标解析模块
 * @description 解析首次消息发送时的目标项目，支持当前项目、已有项目或创建新项目三种场景。
 */

import { DEFAULT_MODEL_BY_PROVIDER, type ModelSelection } from "@remi-code/contracts";
import { workspaceRootsEqual } from "@remi-code/shared/threadWorkspace";

import type { Project } from "../types";

/**
 * 首次发送的项目目标接口
 */
export interface FirstSendProjectTarget {
  /** 目标项目 ID */
  targetProjectId: Project["id"];
  /** 目标项目类型 */
  targetProjectKind: Project["kind"];
  /** 目标项目工作目录 */
  targetProjectCwd: string;
  /** 目标项目脚本列表 */
  targetProjectScripts: Project["scripts"];
  /** 目标项目默认模型选择 */
  targetProjectDefaultModelSelection: ModelSelection | null;
}

/**
 * 首次发送时创建新项目的参数接口
 */
export interface FirstSendProjectCreation {
  /** 工作区根目录 */
  workspaceRoot: string;
  /** 项目标题 */
  title: string;
  /** 默认模型选择 */
  defaultModelSelection: ModelSelection;
}

/**
 * 首次发送目标解析结果类型
 * - "current": 使用当前活跃项目
 * - "existing-project": 使用已有项目
 * - "create-project": 创建新项目
 */
export type FirstSendTargetResolution =
  | { kind: "current"; target: FirstSendProjectTarget }
  | { kind: "existing-project"; target: FirstSendProjectTarget }
  | { kind: "create-project"; creation: FirstSendProjectCreation };

/**
 * 从项目对象构建项目目标（内部函数）
 * @param project - 项目对象
 * @returns 项目目标对象
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
 * 从工作区根目录构建项目标题（内部函数）
 * @param workspaceRoot - 工作区根目录路径
 * @returns 项目标题（取路径最后一段）
 */
function buildProjectTitleFromWorkspaceRoot(workspaceRoot: string): string {
  return workspaceRoot.split(/[/\\]/).findLast((segment) => segment.length > 0) ?? workspaceRoot;
}

/**
 * 解析首次发送的目标项目
 * @param input - 输入参数
 * @param input.activeProject - 当前活跃项目
 * @param input.isFirstMessage - 是否为首次消息
 * @param input.isHomeChatContainer - 是否在主页聊天容器
 * @param input.projects - 所有项目列表
 * @param input.selectedWorkspaceRoot - 选中的工作区根目录
 * @returns 首次发送目标解析结果
 */
export function resolveFirstSendTarget(input: {
  activeProject: Project;
  isFirstMessage: boolean;
  isHomeChatContainer: boolean;
  projects: readonly Project[];
  selectedWorkspaceRoot: string | null;
}): FirstSendTargetResolution {
  const { activeProject, isFirstMessage, isHomeChatContainer, projects, selectedWorkspaceRoot } =
    input;

  // 如果不是首次消息或不在主页聊天容器，直接使用当前项目
  if (!isFirstMessage || !isHomeChatContainer || !selectedWorkspaceRoot) {
    return {
      kind: "current",
      target: buildProjectTarget(activeProject),
    };
  }

  // 查找是否已存在匹配的项目
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

  // 需要创建新项目
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
