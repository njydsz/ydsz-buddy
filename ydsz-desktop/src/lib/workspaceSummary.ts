/**
 * @file workspaceSummary.ts
 * @description 多 Workspace 并行执行状态汇总工具。
 *
 * 关键概念：
 * - 同一个用户可能同时打开 N 个 Workspace，每个 Workspace 独立运行 Agent 任务
 * - 此模块提供轻量级纯函数,把"workspace 列表 + 每个 workspace 的运行状态"汇总成
 *   面向 UI 的统计信息（active count / total count / busy workspace 列表等）
 * - 不依赖 React 状态，可在任意渲染层安全使用
 */

export type WorkspaceActivityStatus =
  | "idle"
  | "starting"
  | "running"
  | "waiting"
  | "error";

/** 单个 workspace 的运行状态摘要 */
export interface WorkspaceActivity {
  workspaceId: string;
  status: WorkspaceActivityStatus;
  /** 可选的任务标题,显示在 busy 列表中 */
  taskTitle?: string | null;
}

/** 多 workspace 汇总统计 */
export interface WorkspaceSummary {
  /** workspace 总数 */
  total: number;
  /** 状态分布:idle / starting / running / waiting / error 各自的数量 */
  byStatus: Record<WorkspaceActivityStatus, number>;
  /** 正在执行（running/starting/waiting）的 workspace 列表 */
  busy: WorkspaceActivity[];
  /** 是否有任意 workspace 处于错误状态 */
  hasErrors: boolean;
  /** 是否有任意 workspace 处于等待状态(需要用户介入) */
  hasWaiting: boolean;
}

/** 汇总选项 */
export interface SummarizeWorkspacesInput {
  /** 已知的所有 workspace id 列表（来自 workspaceStore） */
  workspaceIds: ReadonlyArray<string>;
  /** 已知活跃的 workspace activity 列表（来自 activity / thread store） */
  activities: ReadonlyArray<WorkspaceActivity>;
}

const STATUSES: ReadonlyArray<WorkspaceActivityStatus> = [
  "idle",
  "starting",
  "running",
  "waiting",
  "error",
];

/**
 * 把 workspace id 列表和 activity 列表合并成汇总信息
 * @param input 汇总输入
 */
export function summarizeWorkspaces(input: SummarizeWorkspacesInput): WorkspaceSummary {
  const activityById = new Map<string, WorkspaceActivity>();
  for (const activity of input.activities) {
    activityById.set(activity.workspaceId, activity);
  }

  const byStatus: Record<WorkspaceActivityStatus, number> = {
    idle: 0,
    starting: 0,
    running: 0,
    waiting: 0,
    error: 0,
  };

  for (const id of input.workspaceIds) {
    const status = activityById.get(id)?.status ?? "idle";
    byStatus[status] += 1;
  }

  const busy = input.activities
    .filter((a) => a.status === "running" || a.status === "starting" || a.status === "waiting")
    .slice()
    .sort((a, b) => {
      // waiting 排在最前（需要用户注意） → running → starting
      const order: Record<WorkspaceActivityStatus, number> = {
        waiting: 0,
        running: 1,
        starting: 2,
        idle: 3,
        error: 3,
      };
      return order[a.status] - order[b.status];
    });

  return {
    total: input.workspaceIds.length,
    byStatus,
    busy,
    hasErrors: byStatus.error > 0,
    hasWaiting: byStatus.waiting > 0,
  };
}

/**
 * 判断一个状态是否算"活跃"(busy)
 */
export function isBusyStatus(status: WorkspaceActivityStatus): boolean {
  return status === "running" || status === "starting" || status === "waiting";
}

/**
 * 格式化 busy workspace 列表为一行可读文本(用于 tooltip)
 * @example formatBusyLine({busy: [{workspaceId: 'ws1', status: 'running'}], ...}) => '1 个 Workspace 正在执行'
 */
export function formatBusyLine(summary: WorkspaceSummary): string {
  if (summary.busy.length === 0) {
    return "无活跃 Workspace";
  }
  const parts: string[] = [];
  if (summary.byStatus.running > 0) parts.push(`${summary.byStatus.running} 运行中`);
  if (summary.byStatus.waiting > 0) parts.push(`${summary.byStatus.waiting} 等待中`);
  if (summary.byStatus.starting > 0) parts.push(`${summary.byStatus.starting} 启动中`);
  return parts.join(" · ");
}

/** 暴露状态集合,方便测试 */
export const ALL_WORKSPACE_STATUSES = STATUSES;
