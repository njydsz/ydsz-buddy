/**
 * @file TerminalLayout.ts
 * @description 终端面板标签页、面板树和视觉标识的纯布局解析逻辑。
 * 负责将终端分组、布局节点和视觉状态解析为可渲染的布局结构。
 * 属于终端视图模型辅助层。
 */

import {
  type TerminalVisualState,
  resolveTerminalVisualIdentity,
  type ResolvedTerminalVisualIdentity,
  type TerminalCliKind,
} from "~/shared/terminalThreads";

import {
  collectTerminalIdsFromLayout,
  findFirstTerminalIdInLayout,
  normalizeTerminalPaneGroup,
} from "../../terminalPaneLayout";
import {
  DEFAULT_THREAD_TERMINAL_ID,
  MAX_TERMINALS_PER_GROUP,
  type ThreadTerminalGroup,
  type ThreadTerminalLayoutNode,
} from "../../types";

/**
 * 已解析的终端分组布局，描述一个终端分组在 UI 中的完整布局结构。
 */
export interface ResolvedTerminalGroupLayout {
  /** 分组唯一标识 */
  id: string;
  /** 分组内当前活跃的终端 ID */
  activeTerminalId: string;
  /** 分组的布局节点树 */
  layout: ThreadTerminalLayoutNode;
  /** 分组内所有终端 ID 列表 */
  terminalIds: string[];
}

/**
 * 已解析的线程终端布局，描述一个线程下所有终端的完整布局解析结果。
 * 包含分组信息、活跃终端、可见终端、视觉标识等。
 */
export interface ResolvedThreadTerminalLayout {
  /** 归一化后的所有终端 ID 列表（去重、去空、保序） */
  normalizedTerminalIds: string[];
  /** 最终解析的活跃终端 ID */
  resolvedActiveTerminalId: string;
  /** 最终解析的活跃分组 ID */
  resolvedActiveGroupId: string;
  /** 所有已解析的终端分组布局列表 */
  resolvedTerminalGroups: ResolvedTerminalGroupLayout[];
  /** 活跃分组的布局节点树 */
  activeGroupLayout: ThreadTerminalLayoutNode;
  /** 当前可见的终端 ID 列表（即活跃分组内的终端） */
  visibleTerminalIds: string[];
  /** 是否显示终端侧边栏 */
  hasTerminalSidebar: boolean;
  /** 是否为分屏视图（活跃分组内有多个终端） */
  isSplitView: boolean;
  /** 是否显示分组标题栏 */
  showGroupHeaders: boolean;
  /** 是否已达到分屏上限 */
  hasReachedSplitLimit: boolean;
  /** 终端 ID 到视觉标识的映射 */
  terminalVisualIdentityById: ReadonlyMap<string, ResolvedTerminalVisualIdentity>;
}

/**
 * 为分组 ID 分配唯一标识。如果 ID 已被使用，则追加数字后缀直到唯一。
 *
 * @param groupId - 期望的分组 ID
 * @param usedGroupIds - 已使用的分组 ID 集合
 * @returns 唯一的分组 ID
 */
function assignUniqueGroupId(groupId: string, usedGroupIds: Set<string>): string {
  if (!usedGroupIds.has(groupId)) {
    usedGroupIds.add(groupId);
    return groupId;
  }
  let suffix = 2;
  while (usedGroupIds.has(`${groupId}-${suffix}`)) {
    suffix += 1;
  }
  const uniqueGroupId = `${groupId}-${suffix}`;
  usedGroupIds.add(uniqueGroupId);
  return uniqueGroupId;
}

/**
 * 归一化终端 ID 列表。去重、去除空白项，若结果为空则返回默认终端 ID。
 *
 * @param terminalIds - 原始终端 ID 列表
 * @returns 归一化后的终端 ID 列表
 */
function normalizeTerminalIds(terminalIds: string[]): string[] {
  const cleaned = [...new Set(terminalIds.map((id) => id.trim()).filter((id) => id.length > 0))];
  return cleaned.length > 0 ? cleaned : [DEFAULT_THREAD_TERMINAL_ID];
}

/**
 * 解析终端分组布局。将原始分组配置与归一化终端 ID 列表结合，
 * 处理终端 ID 的分配去重，并为未分配的终端创建默认分组。
 *
 * @param input.normalizedTerminalIds - 归一化后的终端 ID 列表
 * @param input.terminalGroups - 原始终端分组配置列表
 * @returns 已解析的终端分组布局列表
 */
function resolveTerminalGroups(input: {
  normalizedTerminalIds: string[];
  terminalGroups: ThreadTerminalGroup[];
}): ResolvedTerminalGroupLayout[] {
  const assignedTerminalIds = new Set<string>();
  const usedGroupIds = new Set<string>();
  const nextGroups: ResolvedTerminalGroupLayout[] = [];

  for (const terminalGroup of input.terminalGroups) {
    const normalizedGroup = normalizeTerminalPaneGroup(terminalGroup, input.normalizedTerminalIds);
    if (!normalizedGroup) continue;
    const groupTerminalIds = collectTerminalIdsFromLayout(normalizedGroup.layout).filter(
      (terminalId) => {
        if (assignedTerminalIds.has(terminalId)) return false;
        return true;
      },
    );
    if (groupTerminalIds.length === 0) continue;
    const filteredGroup = normalizeTerminalPaneGroup(normalizedGroup, groupTerminalIds);
    if (!filteredGroup) continue;
    const groupId = assignUniqueGroupId(filteredGroup.id, usedGroupIds);
    collectTerminalIdsFromLayout(filteredGroup.layout).forEach((terminalId) => {
      assignedTerminalIds.add(terminalId);
    });
    nextGroups.push({
      ...filteredGroup,
      id: groupId,
      terminalIds: collectTerminalIdsFromLayout(filteredGroup.layout),
    });
  }

  for (const terminalId of input.normalizedTerminalIds) {
    if (assignedTerminalIds.has(terminalId)) continue;
    const id = assignUniqueGroupId(`group-${terminalId}`, usedGroupIds);
    nextGroups.push({
      id,
      activeTerminalId: terminalId,
      layout: {
        type: "terminal",
        paneId: `pane-${terminalId}`,
        terminalIds: [terminalId],
        activeTerminalId: terminalId,
      },
      terminalIds: [terminalId],
    });
  }

  if (nextGroups.length > 0) {
    return nextGroups;
  }

  return [
    {
      id: `group-${DEFAULT_THREAD_TERMINAL_ID}`,
      activeTerminalId: DEFAULT_THREAD_TERMINAL_ID,
      layout: {
        type: "terminal",
        paneId: `pane-${DEFAULT_THREAD_TERMINAL_ID}`,
        terminalIds: [DEFAULT_THREAD_TERMINAL_ID],
        activeTerminalId: DEFAULT_THREAD_TERMINAL_ID,
      },
      terminalIds: [DEFAULT_THREAD_TERMINAL_ID],
    },
  ];
}

/**
 * 解析活跃分组。优先按分组 ID 匹配，其次按终端 ID 匹配，最后回退到第一个分组。
 *
 * @param input.activeTerminalGroupId - 期望的活跃分组 ID
 * @param input.activeTerminalId - 当前活跃终端 ID
 * @param input.resolvedTerminalGroups - 已解析的终端分组列表
 * @returns 匹配到的活跃分组布局
 */
function resolveActiveGroup(input: {
  activeTerminalGroupId: string;
  activeTerminalId: string;
  resolvedTerminalGroups: ResolvedTerminalGroupLayout[];
}): ResolvedTerminalGroupLayout {
  return (
    input.resolvedTerminalGroups.find(
      (terminalGroup) => terminalGroup.id === input.activeTerminalGroupId,
    ) ??
    input.resolvedTerminalGroups.find((terminalGroup) =>
      terminalGroup.terminalIds.includes(input.activeTerminalId),
    ) ??
    input.resolvedTerminalGroups[0] ?? {
      id: `group-${DEFAULT_THREAD_TERMINAL_ID}`,
      activeTerminalId: DEFAULT_THREAD_TERMINAL_ID,
      layout: {
        type: "terminal",
        paneId: `pane-${DEFAULT_THREAD_TERMINAL_ID}`,
        terminalIds: [DEFAULT_THREAD_TERMINAL_ID],
        activeTerminalId: DEFAULT_THREAD_TERMINAL_ID,
      },
      terminalIds: [DEFAULT_THREAD_TERMINAL_ID],
    }
  );
}

/**
 * 构建终端视觉标识映射。为每个终端 ID 解析其视觉状态（idle/running/attention/review）
 * 和显示信息（图标、标题），生成 ID 到视觉标识的只读映射。
 *
 * @param input.normalizedTerminalIds - 归一化后的终端 ID 列表
 * @param input.runningTerminalIds - 正在运行的终端 ID 列表
 * @param input.terminalAttentionStatesById - 终端注意力状态映射
 * @param input.terminalCliKindsById - 终端 CLI 类型映射
 * @param input.terminalLabelsById - 终端标签映射
 * @param input.terminalTitleOverridesById - 终端标题覆盖映射
 * @returns 终端 ID 到视觉标识的只读映射
 */
function resolveTerminalVisualIdentityMap(input: {
  normalizedTerminalIds: string[];
  runningTerminalIds: string[];
  terminalAttentionStatesById: Record<string, "attention" | "review">;
  terminalCliKindsById: Record<string, TerminalCliKind>;
  terminalLabelsById: Record<string, string>;
  terminalTitleOverridesById: Record<string, string>;
}): ReadonlyMap<string, ResolvedTerminalVisualIdentity> {
  const terminalLabelsById = input.terminalLabelsById ?? {};
  const terminalTitleOverridesById = input.terminalTitleOverridesById ?? {};
  const runningTerminalIdSet = new Set(
    input.runningTerminalIds.map((id) => id.trim()).filter((id) => id.length > 0),
  );

  const resolveStateForTerminal = (terminalId: string): TerminalVisualState => {
    const attentionState = input.terminalAttentionStatesById[terminalId] ?? null;
    if (attentionState === "attention") {
      return "attention";
    }
    if (runningTerminalIdSet.has(terminalId)) {
      return "running";
    }
    if (attentionState === "review") {
      return "review";
    }
    return "idle";
  };

  return new Map(
    input.normalizedTerminalIds.map((terminalId, index) => [
      terminalId,
      resolveTerminalVisualIdentity({
        cliKind: input.terminalCliKindsById[terminalId] ?? null,
        fallbackTitle: `Terminal ${index + 1}`,
        state: resolveStateForTerminal(terminalId),
        title: terminalTitleOverridesById[terminalId] ?? terminalLabelsById[terminalId],
      }),
    ]),
  );
}

/**
 * 解析线程终端布局。将终端分组配置、活跃状态和视觉信息综合解析为完整的布局结构，
 * 包括归一化终端 ID、活跃分组、可见终端、分屏状态和视觉标识映射等。
 *
 * @param input.activeTerminalGroupId - 当前活跃分组 ID
 * @param input.activeTerminalId - 当前活跃终端 ID
 * @param input.runningTerminalIds - 正在运行的终端 ID 列表
 * @param input.terminalAttentionStatesById - 终端注意力状态映射
 * @param input.terminalCliKindsById - 终端 CLI 类型映射
 * @param input.terminalGroups - 终端分组配置列表
 * @param input.terminalIds - 所有终端 ID 列表
 * @param input.terminalLabelsById - 终端标签映射
 * @param input.terminalTitleOverridesById - 终端标题覆盖映射
 * @returns 完整的线程终端布局解析结果
 */
export function resolveThreadTerminalLayout(input: {
  activeTerminalGroupId: string;
  activeTerminalId: string;
  runningTerminalIds: string[];
  terminalAttentionStatesById: Record<string, "attention" | "review">;
  terminalCliKindsById: Record<string, TerminalCliKind>;
  terminalGroups: ThreadTerminalGroup[];
  terminalIds: string[];
  terminalLabelsById: Record<string, string>;
  terminalTitleOverridesById: Record<string, string>;
}): ResolvedThreadTerminalLayout {
  const normalizedTerminalIds = normalizeTerminalIds(input.terminalIds);
  const resolvedTerminalGroups = resolveTerminalGroups({
    normalizedTerminalIds,
    terminalGroups: input.terminalGroups,
  });
  const activeGroup = resolveActiveGroup({
    activeTerminalGroupId: input.activeTerminalGroupId,
    activeTerminalId: input.activeTerminalId,
    resolvedTerminalGroups,
  });
  const resolvedActiveTerminalId = activeGroup.terminalIds.includes(input.activeTerminalId)
    ? input.activeTerminalId
    : activeGroup.terminalIds.includes(activeGroup.activeTerminalId)
      ? activeGroup.activeTerminalId
      : findFirstTerminalIdInLayout(activeGroup.layout);
  const visibleTerminalIds = activeGroup.terminalIds;
  const hasTerminalSidebar = false;
  const isSplitView = visibleTerminalIds.length > 1;
  const showGroupHeaders =
    resolvedTerminalGroups.length > 1 ||
    resolvedTerminalGroups.some((terminalGroup) => terminalGroup.terminalIds.length > 1);
  const hasReachedSplitLimit = visibleTerminalIds.length >= MAX_TERMINALS_PER_GROUP;
  const terminalVisualIdentityById = resolveTerminalVisualIdentityMap({
    normalizedTerminalIds,
    runningTerminalIds: input.runningTerminalIds,
    terminalAttentionStatesById: input.terminalAttentionStatesById,
    terminalCliKindsById: input.terminalCliKindsById,
    terminalLabelsById: input.terminalLabelsById,
    terminalTitleOverridesById: input.terminalTitleOverridesById,
  });

  return {
    normalizedTerminalIds,
    resolvedActiveTerminalId,
    resolvedActiveGroupId: activeGroup.id,
    resolvedTerminalGroups,
    activeGroupLayout: activeGroup.layout,
    visibleTerminalIds,
    hasTerminalSidebar,
    isSplitView,
    showGroupHeaders,
    hasReachedSplitLimit,
    terminalVisualIdentityById,
  };
}
