/**
 * @file splitView.logic.ts
 * @description 分屏视图面板树的纯函数辅助模块�? * 提供面板查找、替换、删除、深度计算、分割可行性判断等功能�? * 以及旧版分屏视图的迁移支持。不依赖 DOM �?React�? */

import type { ProjectId, ThreadId } from "~/contracts";
import type {
  LeafPane,
  Pane,
  PaneId,
  SplitDirection,
  SplitNode,
  SplitViewPanePanelState,
} from "./splitViewStore";

/**
 * 清除面板的右侧面板状态（关闭面板、清除差异信息）
 *
 * @param panelState - 当前面板状�? * @returns 重置后的面板状�? */
export function clearSplitViewPanePanelState(
  panelState: SplitViewPanePanelState,
): SplitViewPanePanelState {
  return {
    ...panelState,
    panel: null,
    diffTurnId: null,
    diffFilePath: null,
  };
}

// --- pane lookup ---

/**
 * 在面板树中按 ID 查找面板节点
 *
 * @param root - 面板树根节点
 * @param paneId - 目标面板 ID
 * @returns 找到的面板节点，未找到时返回 null
 */
export function findPaneById(root: Pane, paneId: PaneId): Pane | null {
  if (root.id === paneId) {
    return root;
  }
  if (root.kind === "leaf") {
    return null;
  }
  return findPaneById(root.first, paneId) ?? findPaneById(root.second, paneId);
}

/**
 * 在面板树中按 ID 查找叶子面板
 *
 * @param root - 面板树根节点
 * @param paneId - 目标面板 ID
 * @returns 找到的叶子面板，未找到或非叶子节点时返回 null
 */
export function findLeafPaneById(root: Pane, paneId: PaneId): LeafPane | null {
  const found = findPaneById(root, paneId);
  return found?.kind === "leaf" ? found : null;
}

/**
 * 在面板树中按 ID 查找分割节点
 *
 * @param root - 面板树根节点
 * @param paneId - 目标面板 ID
 * @returns 找到的分割节点，未找到或非分割节点时返回 null
 */
export function findSplitNodeById(root: Pane, paneId: PaneId): SplitNode | null {
  const found = findPaneById(root, paneId);
  return found?.kind === "split" ? found : null;
}

/**
 * 查找直接包含指定面板的父分割节点�? * 如果面板 ID 是根节点，返�?null�? *
 * @param root - 面板树根节点
 * @param paneId - 目标面板 ID
 * @returns 父分割节点，面板为根节点时返�?null
 */
export function findParentSplitNode(root: Pane, paneId: PaneId): SplitNode | null {
  if (root.kind === "leaf") {
    return null;
  }
  if (root.first.id === paneId || root.second.id === paneId) {
    return root;
  }
  return findParentSplitNode(root.first, paneId) ?? findParentSplitNode(root.second, paneId);
}

/**
 * 计算面板在树中的深度（根节点深度�?0�? *
 * @param root - 面板树根节点
 * @param paneId - 目标面板 ID
 * @returns 面板深度，未找到时返�?null
 */
export function findPaneDepth(root: Pane, paneId: PaneId): number | null {
  if (root.id === paneId) {
    return 0;
  }
  if (root.kind === "leaf") {
    return null;
  }
  const firstDepth = findPaneDepth(root.first, paneId);
  if (firstDepth !== null) {
    return firstDepth + 1;
  }
  const secondDepth = findPaneDepth(root.second, paneId);
  return secondDepth === null ? null : secondDepth + 1;
}

/**
 * 收集面板树中的所有叶子面�? *
 * @param root - 面板树根节点
 * @returns 叶子面板数组
 */
export function collectLeaves(root: Pane): LeafPane[] {
  if (root.kind === "leaf") {
    return [root];
  }
  return [...collectLeaves(root.first), ...collectLeaves(root.second)];
}

// --- pane mutation (immutable) ---

/**
 * 在面板树中替换指定面板节点（不可变操作）�? * 如果没有实际变更，返回原树引用以保持引用相等性�? *
 * @param root - 面板树根节点
 * @param paneId - 要替换的面板 ID
 * @param replacement - 替换面板
 * @returns 替换后的新面板树
 */
export function replacePaneInTree(root: Pane, paneId: PaneId, replacement: Pane): Pane {
  if (root.id === paneId) {
    return replacement;
  }
  if (root.kind === "leaf") {
    return root;
  }
  const first = replacePaneInTree(root.first, paneId, replacement);
  const second = replacePaneInTree(root.second, paneId, replacement);
  if (first === root.first && second === root.second) {
    return root;
  }
  return { ...root, first, second };
}

/**
 * 删除叶子面板的结果，包含新树根和被移除的叶子 ID 列表
 */
export interface RemoveLeafResult {
  /** 删除后的新树根，所有叶子被移除时为 null */
  nextRoot: Pane | null;
  /** 被移除的叶子面板 ID 列表 */
  removedLeafIds: PaneId[];
}

/**
 * 从面板树中移除所有匹配指定线�?ID 的叶子面板�? * 失去所有叶子的子树会折叠为 null，仅剩一侧子树的分割节点会折叠为该子树�? *
 * @param root - 面板树根节点
 * @param threadId - 要移除的线程 ID
 * @returns 删除结果
 */
export function removeLeafByThreadId(root: Pane, threadId: ThreadId): RemoveLeafResult {
  if (root.kind === "leaf") {
    if (root.threadId === threadId) {
      return { nextRoot: null, removedLeafIds: [root.id] };
    }
    return { nextRoot: root, removedLeafIds: [] };
  }

  const firstResult = removeLeafByThreadId(root.first, threadId);
  const secondResult = removeLeafByThreadId(root.second, threadId);
  const removedLeafIds = [...firstResult.removedLeafIds, ...secondResult.removedLeafIds];

  if (removedLeafIds.length === 0) {
    return { nextRoot: root, removedLeafIds };
  }

  if (firstResult.nextRoot && secondResult.nextRoot) {
    return {
      nextRoot: { ...root, first: firstResult.nextRoot, second: secondResult.nextRoot },
      removedLeafIds,
    };
  }
  if (firstResult.nextRoot) {
    return { nextRoot: firstResult.nextRoot, removedLeafIds };
  }
  if (secondResult.nextRoot) {
    return { nextRoot: secondResult.nextRoot, removedLeafIds };
  }
  return { nextRoot: null, removedLeafIds };
}

/**
 * 从面板树中移除指定面�?ID 的叶子面板�? * 失去所有叶子的子树会折叠为 null，仅剩一侧子树的分割节点会折叠为该子树，
 * 使剩余面板自动调整大小�? *
 * @param root - 面板树根节点
 * @param paneId - 要移除的叶子面板 ID
 * @returns 删除结果
 */
export function removeLeafByPaneId(root: Pane, paneId: PaneId): RemoveLeafResult {
  if (root.kind === "leaf") {
    if (root.id === paneId) {
      return { nextRoot: null, removedLeafIds: [root.id] };
    }
    return { nextRoot: root, removedLeafIds: [] };
  }

  const firstResult = removeLeafByPaneId(root.first, paneId);
  const secondResult = removeLeafByPaneId(root.second, paneId);
  const removedLeafIds = [...firstResult.removedLeafIds, ...secondResult.removedLeafIds];

  if (removedLeafIds.length === 0) {
    return { nextRoot: root, removedLeafIds };
  }

  if (firstResult.nextRoot && secondResult.nextRoot) {
    return {
      nextRoot: { ...root, first: firstResult.nextRoot, second: secondResult.nextRoot },
      removedLeafIds,
    };
  }
  if (firstResult.nextRoot) {
    return { nextRoot: firstResult.nextRoot, removedLeafIds };
  }
  if (secondResult.nextRoot) {
    return { nextRoot: secondResult.nextRoot, removedLeafIds };
  }
  return { nextRoot: null, removedLeafIds };
}

// --- structural rules ---

/**
 * 判断叶子面板是否可以在指定方向上分割，不超过深度上限 2�? * 当父节点方向�?null（根级叶子）时，任何方向都允许�? * 深度上限确保最多形�?2×2 的网格布局�? *
 * @param parentDirection - 父分割节点的方向，根级为 null
 * @param requestedDirection - 请求的分割方�? * @returns 是否可以分割
 */
export function canSubdivide(
  parentDirection: SplitDirection | null,
  requestedDirection: SplitDirection,
): boolean {
  if (parentDirection === null) {
    return true;
  }
  return parentDirection !== requestedDirection;
}

/**
 * 判断面板树中指定叶子面板是否可以在指定方向上分割�? * 综合检查面板存在性、深度限制和方向限制�? *
 * @param root - 面板树根节点
 * @param targetPaneId - 目标叶子面板 ID
 * @param requestedDirection - 请求的分割方�? * @returns 是否可以分割
 */
export function canSubdividePane(
  root: Pane,
  targetPaneId: PaneId,
  requestedDirection: SplitDirection,
): boolean {
  if (!findLeafPaneById(root, targetPaneId)) {
    return false;
  }
  const targetDepth = findPaneDepth(root, targetPaneId);
  if (targetDepth === null || targetDepth >= 2) {
    return false;
  }
  const parent = findParentSplitNode(root, targetPaneId);
  return canSubdivide(parent?.direction ?? null, requestedDirection);
}

/**
 * 解析默认聚焦的叶子面�?ID（DFS 序列中的第一个叶子）�? * 如果没有叶子，回退到根节点 ID�? *
 * @param root - 面板树根节点
 * @returns 默认聚焦的叶子面�?ID
 */
export function resolveDefaultFocusLeafId(root: Pane): PaneId {
  const leaves = collectLeaves(root);
  return leaves[0]?.id ?? root.id;
}

// --- legacy split-view migration ---

/**
 * 旧版分屏视图结构（左右两面板的扁平结构），用于迁移到新的树形结构
 */
export interface LegacySplitViewLike {
  id: string;
  sourceThreadId: ThreadId;
  ownerProjectId: ProjectId;
  leftThreadId: ThreadId | null;
  rightThreadId: ThreadId | null;
  focusedPane: "left" | "right";
  ratio: number;
  leftPanel: SplitViewPanePanelState;
  rightPanel: SplitViewPanePanelState;
  createdAt: string;
  updatedAt: string;
}

/**
 * 判断给定值是否为旧版分屏视图结构
 *
 * @param value - 待判断的�? * @returns 是否为旧版分屏视图结构（类型守卫�? */
export function isLegacySplitViewLike(value: unknown): value is LegacySplitViewLike {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.sourceThreadId === "string" &&
    "leftThreadId" in candidate &&
    "rightThreadId" in candidate &&
    typeof candidate.focusedPane === "string"
  );
}
