/**
 * @file 项目操作纯函数
 *
 * 从 store.ts 中提取的项目状态转换函数。
 * 这些函数不依赖 store 实例,接收 AppState 返回新的 AppState,
 * 便于独立测试和 tree-shaking。
 */

import type { AppState } from "../store";
import type { Project } from "../types";

/**
 * 切换项目展开/折叠状态
 */
export function toggleProject(state: AppState, projectId: Project["id"]): AppState {
  return {
    ...state,
    projects: state.projects.map((p) =>
      p.id === projectId ? { ...p, expanded: !p.expanded } : p,
    ),
  };
}

/**
 * 设置项目展开状态（仅当状态变化时返回新对象）
 */
export function setProjectExpanded(
  state: AppState,
  projectId: Project["id"],
  expanded: boolean,
): AppState {
  let changed = false;
  const projects = state.projects.map((p) => {
    if (p.id !== projectId || p.expanded === expanded) return p;
    changed = true;
    return { ...p, expanded };
  });
  return changed ? { ...state, projects } : state;
}

/**
 * 批量设置所有项目的展开状态
 */
export function setAllProjectsExpanded(state: AppState, expanded: boolean): AppState {
  let changed = false;
  const projects = state.projects.map((project) => {
    if (project.expanded === expanded) return project;
    changed = true;
    return { ...project, expanded };
  });
  return changed ? { ...state, projects } : state;
}

/**
 * 折叠除指定项目外的所有项目,保持当前活跃聊天上下文可见
 */
export function collapseProjectsExcept(
  state: AppState,
  activeProjectId: Project["id"] | null,
): AppState {
  let changed = false;
  const projects = state.projects.map((project) => {
    const nextExpanded = activeProjectId !== null && project.id === activeProjectId;
    if (project.expanded === nextExpanded) return project;
    changed = true;
    return { ...project, expanded: nextExpanded };
  });
  return changed ? { ...state, projects } : state;
}

/**
 * 拖拽排序项目
 */
export function reorderProjects(
  state: AppState,
  draggedProjectId: Project["id"],
  targetProjectId: Project["id"],
): AppState {
  if (draggedProjectId === targetProjectId) return state;
  const draggedIndex = state.projects.findIndex((project) => project.id === draggedProjectId);
  const targetIndex = state.projects.findIndex((project) => project.id === targetProjectId);
  if (draggedIndex < 0 || targetIndex < 0) return state;
  const projects = [...state.projects];
  const [draggedProject] = projects.splice(draggedIndex, 1);
  if (!draggedProject) return state;
  projects.splice(targetIndex, 0, draggedProject);
  return { ...state, projects };
}

/**
 * 本地重命名项目（不触发后端请求）
 *
 * 处理 localName/remoteName/name 三个字段的联动：
 * - localName 为用户自定义名称,null 表示使用远程名称
 * - name 为最终显示名称,优先使用 localName,否则使用 remoteName
 */
export function renameProjectLocally(
  state: AppState,
  projectId: Project["id"],
  name: string | null,
): AppState {
  const normalizedName = name?.trim() ?? null;
  let changed = false;
  const projects = state.projects.map((project) => {
    if (project.id !== projectId) {
      return project;
    }
    const nextLocalName = normalizedName && normalizedName.length > 0 ? normalizedName : null;
    const nextName = nextLocalName ?? project.remoteName;
    if (project.localName === nextLocalName && project.name === nextName) {
      return project;
    }
    changed = true;
    return {
      ...project,
      name: nextName,
      localName: nextLocalName,
    };
  });
  return changed ? { ...state, projects } : state;
}
