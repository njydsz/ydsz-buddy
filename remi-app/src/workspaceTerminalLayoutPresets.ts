/**
 * @file workspaceTerminalLayoutPresets.ts
 * @description 定义可复用的工作区终端布局预设，并将其映射到面板树结构。
 *
 * 布局预设定义了终端面板的排列方式（单栏、双栏、四宫格等），
 * 每个预设指定了终端槽位数量和对应的布局树构建逻辑。
 */

import {
  DEFAULT_THREAD_TERMINAL_ID,
  type ThreadTerminalGroup,
  type ThreadTerminalLayoutNode,
} from "./types";

/**
 * 工作区终端布局预设 ID 类型。
 * - "single"：单个终端
 * - "two-columns"：两列并排
 * - "two-rows"：两行堆叠
 * - "top-main"：上方大面板 + 下方两个小面板
 * - "left-main"：左侧大面板 + 右侧两个堆叠面板
 * - "quad"：四宫格
 */
export type WorkspaceLayoutPresetId =
  | "single"
  | "two-columns"
  | "two-rows"
  | "top-main"
  | "left-main"
  | "quad";

/**
 * 工作区终端布局预设定义。
 */
export interface WorkspaceLayoutPresetDefinition {
  /** 预设唯一标识 */
  id: WorkspaceLayoutPresetId;
  /** 预设显示标题 */
  title: string;
  /** 预设描述 */
  description: string;
  /** 该预设需要的终端槽位数量 */
  slotCount: number;
}

/** 默认布局预设 ID */
export const DEFAULT_WORKSPACE_LAYOUT_PRESET_ID: WorkspaceLayoutPresetId = "single";

/** 所有可用的布局预设定义列表 */
export const WORKSPACE_LAYOUT_PRESETS: readonly WorkspaceLayoutPresetDefinition[] = [
  {
    id: "single",
    title: "Single",
    description: "One focused terminal.",
    slotCount: 1,
  },
  {
    id: "two-columns",
    title: "Two Columns",
    description: "Two terminals side by side.",
    slotCount: 2,
  },
  {
    id: "two-rows",
    title: "Two Rows",
    description: "Two terminals stacked vertically.",
    slotCount: 2,
  },
  {
    id: "top-main",
    title: "Top + Bottom",
    description: "One large terminal above two smaller panes.",
    slotCount: 3,
  },
  {
    id: "left-main",
    title: "Left + Stack",
    description: "One large pane on the left and two stacked on the right.",
    slotCount: 3,
  },
  {
    id: "quad",
    title: "Quad",
    description: "Four equally visible terminals.",
    slotCount: 4,
  },
] as const;

function normalizeTerminalIds(terminalIds: readonly string[]): string[] {
  const ids = [...new Set(terminalIds.map((terminalId) => terminalId.trim()).filter(Boolean))];
  return ids.length > 0 ? ids : [DEFAULT_THREAD_TERMINAL_ID];
}

function createTerminalLeaf(
  terminalIds: readonly string[],
  paneId: string,
  activeTerminalId: string,
): ThreadTerminalLayoutNode {
  const normalizedTerminalIds = normalizeTerminalIds(terminalIds);
  const resolvedActiveTerminalId = normalizedTerminalIds.includes(activeTerminalId)
    ? activeTerminalId
    : (normalizedTerminalIds[0] ?? DEFAULT_THREAD_TERMINAL_ID);
  return {
    type: "terminal",
    paneId,
    terminalIds: normalizedTerminalIds,
    activeTerminalId: resolvedActiveTerminalId,
  };
}

function createSplit(
  id: string,
  direction: "horizontal" | "vertical",
  children: readonly ThreadTerminalLayoutNode[],
): ThreadTerminalLayoutNode {
  return {
    type: "split",
    id,
    direction,
    children: [...children],
    weights: children.map(() => 1),
  };
}

function normalizePresetId(presetId: WorkspaceLayoutPresetId | string): WorkspaceLayoutPresetId {
  return (
    WORKSPACE_LAYOUT_PRESETS.find((preset) => preset.id === presetId)?.id ??
    DEFAULT_WORKSPACE_LAYOUT_PRESET_ID
  );
}

/**
 * 获取指定 ID 的布局预设定义。
 * 若 ID 无效则返回默认的 "single" 预设。
 *
 * @param presetId - 预设 ID（可以是字符串）
 * @returns 匹配的预设定义，或默认预设
 */
export function getWorkspaceLayoutPreset(
  presetId: WorkspaceLayoutPresetId | string,
): WorkspaceLayoutPresetDefinition {
  const normalizedPresetId = normalizePresetId(presetId);
  const preset = WORKSPACE_LAYOUT_PRESETS.find((entry) => entry.id === normalizedPresetId);
  if (preset) {
    return preset;
  }
  return {
    id: DEFAULT_WORKSPACE_LAYOUT_PRESET_ID,
    title: "Single",
    description: "One focused terminal.",
    slotCount: 1,
  };
}

/**
 * 获取指定预设的终端槽位数量。
 *
 * @param presetId - 预设 ID
 * @returns 该预设需要的终端数量
 */
export function getWorkspaceLayoutPresetSlotCount(
  presetId: WorkspaceLayoutPresetId | string,
): number {
  return getWorkspaceLayoutPreset(presetId).slotCount;
}

/**
 * 确保终端 ID 列表满足指定预设的槽位数量要求。
 * 若终端数量不足，则通过 createTerminalId 回调生成新的终端 ID 补充。
 *
 * @param terminalIds - 现有的终端 ID 列表
 * @param presetId - 目标预设 ID
 * @param createTerminalId - 生成新终端 ID 的回调函数
 * @returns 满足预设槽位数量要求的终端 ID 列表
 */
export function ensureTerminalIdsForPreset(
  terminalIds: readonly string[],
  presetId: WorkspaceLayoutPresetId | string,
  createTerminalId: () => string,
): string[] {
  const normalizedTerminalIds = normalizeTerminalIds(terminalIds);
  const requiredSlotCount = getWorkspaceLayoutPresetSlotCount(presetId);
  const nextTerminalIds = [...normalizedTerminalIds];
  while (nextTerminalIds.length < requiredSlotCount) {
    const nextTerminalId = createTerminalId().trim();
    if (nextTerminalId.length === 0 || nextTerminalIds.includes(nextTerminalId)) {
      continue;
    }
    nextTerminalIds.push(nextTerminalId);
  }
  return nextTerminalIds;
}

function distributeTerminalIdsAcrossSlots(
  terminalIds: readonly string[],
  slotCount: number,
): string[][] {
  const normalizedTerminalIds = normalizeTerminalIds(terminalIds);
  const nextSlots = Array.from({ length: Math.max(1, slotCount) }, () => [] as string[]);

  normalizedTerminalIds.forEach((terminalId, index) => {
    const slotIndex = index < nextSlots.length ? index : index % nextSlots.length;
    nextSlots[slotIndex]?.push(terminalId);
  });

  return nextSlots.map((slotTerminalIds, index) =>
    slotTerminalIds.length > 0
      ? slotTerminalIds
      : [normalizedTerminalIds[index] ?? normalizedTerminalIds[0] ?? DEFAULT_THREAD_TERMINAL_ID],
  );
}

function buildPresetLayout(input: {
  presetId: WorkspaceLayoutPresetId;
  terminalIds: readonly string[];
  activeTerminalId: string;
}): ThreadTerminalLayoutNode {
  const slots = distributeTerminalIdsAcrossSlots(
    input.terminalIds,
    getWorkspaceLayoutPresetSlotCount(input.presetId),
  );
  const leaf = (slotIndex: number) =>
    createTerminalLeaf(
      slots[slotIndex] ?? [DEFAULT_THREAD_TERMINAL_ID],
      `pane-${input.presetId}-${slotIndex + 1}`,
      input.activeTerminalId,
    );

  switch (input.presetId) {
    case "two-columns":
      return createSplit(`workspace-${input.presetId}-root`, "horizontal", [leaf(0), leaf(1)]);
    case "two-rows":
      return createSplit(`workspace-${input.presetId}-root`, "vertical", [leaf(0), leaf(1)]);
    case "top-main":
      return createSplit(`workspace-${input.presetId}-root`, "vertical", [
        leaf(0),
        createSplit(`workspace-${input.presetId}-bottom`, "horizontal", [leaf(1), leaf(2)]),
      ]);
    case "left-main":
      return createSplit(`workspace-${input.presetId}-root`, "horizontal", [
        leaf(0),
        createSplit(`workspace-${input.presetId}-right`, "vertical", [leaf(1), leaf(2)]),
      ]);
    case "quad":
      return createSplit(`workspace-${input.presetId}-root`, "vertical", [
        createSplit(`workspace-${input.presetId}-top`, "horizontal", [leaf(0), leaf(1)]),
        createSplit(`workspace-${input.presetId}-bottom`, "horizontal", [leaf(2), leaf(3)]),
      ]);
    case "single":
    default:
      return leaf(0);
  }
}

/**
 * 根据布局预设创建终端面板组。
 * 将终端 ID 分配到预设的各个槽位中，并构建对应的布局树。
 *
 * @param input - 创建参数
 * @param input.presetId - 预设 ID
 * @param input.terminalIds - 终端 ID 列表
 * @param input.activeTerminalId - 活跃终端 ID（可选，默认取列表第一个）
 * @returns 构建好的终端面板组
 *
 * @example
 * ```ts
 * const group = createWorkspaceTerminalGroupFromPreset({
 *   presetId: "two-columns",
 *   terminalIds: ["term-1", "term-2"],
 *   activeTerminalId: "term-1",
 * });
 * ```
 */
export function createWorkspaceTerminalGroupFromPreset(input: {
  presetId: WorkspaceLayoutPresetId | string;
  terminalIds: readonly string[];
  activeTerminalId?: string | null | undefined;
}): ThreadTerminalGroup {
  const normalizedPresetId = normalizePresetId(input.presetId);
  const normalizedTerminalIds = normalizeTerminalIds(input.terminalIds);
  const resolvedActiveTerminalId = normalizedTerminalIds.includes(input.activeTerminalId ?? "")
    ? (input.activeTerminalId ?? normalizedTerminalIds[0] ?? DEFAULT_THREAD_TERMINAL_ID)
    : (normalizedTerminalIds[0] ?? DEFAULT_THREAD_TERMINAL_ID);

  return {
    id: `workspace-group-${normalizedPresetId}`,
    activeTerminalId: resolvedActiveTerminalId,
    layout: buildPresetLayout({
      presetId: normalizedPresetId,
      terminalIds: normalizedTerminalIds,
      activeTerminalId: resolvedActiveTerminalId,
    }),
  };
}
