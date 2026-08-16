/**
 * @file 启动阶段进度 Store
 * @description 集中管理应用启动过程中的阶段状态，便于启动屏展示分阶段进度。
 *
 * ## 阶段定义
 *
 * - `native-api`：原生 API（Tauri bridge / WebSocket 回退）就绪
 * - `server-welcome`：收到 server 端 welcome 消息
 * - `shell-snapshot`：shell snapshot 加载完成
 * - `settings`：用户设置 / 偏好加载完成
 * - `route-ready`：路由与首屏数据就绪
 * - `ui-ready`：UI 全部就绪
 *
 * ## 状态机
 *
 * - `pending`：未开始
 * - `in_progress`：进行中
 * - `done`：已完成
 * - `error`：出错（含 message）
 *
 * 总进度 = done 阶段数 / 总阶段数。
 *
 * @module shared/bootProgressStore
 */

import { create } from "zustand";

/** 启动阶段 ID */
export type BootStageId =
  | "native-api"
  | "server-welcome"
  | "shell-snapshot"
  | "settings"
  | "route-ready"
  | "ui-ready";

/** 启动阶段状态 */
export type BootStageStatus = "pending" | "in_progress" | "done" | "error";

/** 启动阶段记录 */
export interface BootStage {
  id: BootStageId;
  status: BootStageStatus;
  /** 阶段描述（可本地化键） */
  label: string;
  /** 可选错误信息（status=error 时） */
  errorMessage?: string | null;
  /** 错误分类（status=error 时） */
  errorType?: BootStageErrorType;
  /** 阶段开始时间（epoch ms） */
  startedAt?: number | null;
  /** 阶段结束时间（epoch ms） */
  completedAt?: number | null;
  /** 阶段失败时是否记录为 fatal（不可重试）。如：用户主动取消、致命配置错误。 */
  fatal?: boolean;
}

/**
 * 启动阶段错误分类。
 *
 * - `network`：网络/连接类问题（默认可重试）
 * - `timeout`：超时类问题（可重试）
 * - `config`：配置类问题（多数情况下需用户介入，通常不可重试）
 * - `permission`：权限类问题（不可重试，需用户授予权限）
 * - `cancelled`：用户主动取消（不可重试）
 * - `internal`：内部未知错误（默认可重试）
 * - `unknown`：未分类（默认可重试）
 */
export type BootStageErrorType =
  | "network"
  | "timeout"
  | "config"
  | "permission"
  | "cancelled"
  | "internal"
  | "unknown";

/** 不可重试的错误类型集合（fatal） */
export const FATAL_BOOT_STAGE_ERROR_TYPES: ReadonlySet<BootStageErrorType> = new Set([
  "config",
  "permission",
  "cancelled",
]);

/** 全部阶段 ID 列表（按启动顺序） */
export const BOOT_STAGE_IDS: readonly BootStageId[] = [
  "native-api",
  "server-welcome",
  "shell-snapshot",
  "settings",
  "route-ready",
  "ui-ready",
];

/** 阶段默认标签（中文） */
export const DEFAULT_BOOT_STAGE_LABELS: Record<BootStageId, string> = {
  "native-api": "初始化原生桥接",
  "server-welcome": "连接服务端",
  "shell-snapshot": "加载会话快照",
  "settings": "加载用户设置",
  "route-ready": "就绪首屏",
  "ui-ready": "完成启动",
};

interface BootProgressState {
  stages: Record<BootStageId, BootStage>;
  /** 是否全部完成 */
  isBootCompleted: boolean;
  /** 整体错误信息（如有） */
  bootError: string | null;
  /** 整体错误类型（与 bootError 配对） */
  bootErrorType: BootStageErrorType;
  /** 当前是否有 fatal 错误（不可重试） */
  hasFatalError: boolean;
}

interface BootProgressActions {
  /** 标记阶段开始 */
  startStage: (id: BootStageId, labelOverride?: string) => void;
  /** 标记阶段完成 */
  completeStage: (id: BootStageId) => void;
  /** 标记阶段错误 */
  failStage: (id: BootStageId, errorMessage: string, errorType?: BootStageErrorType) => void;
  /** 一次性设置多个阶段状态（用于恢复/重置） */
  resetStages: (labels?: Partial<Record<BootStageId, string>>) => void;
  /** 标记整体启动失败 */
  setBootError: (message: string | null, errorType?: BootStageErrorType) => void;
  /** 清除当前 fatal 错误状态（用于"重试"前） */
  clearFatalError: () => void;
}

export type BootProgressStore = BootProgressState & BootProgressActions;

function makeDefaultStage(id: BootStageId, label: string): BootStage {
  return {
    id,
    status: "pending",
    label,
    errorMessage: null,
    errorType: undefined,
    fatal: false,
    startedAt: null,
    completedAt: null,
  };
}

function makeInitialStages(labels?: Partial<Record<BootStageId, string>>): Record<BootStageId, BootStage> {
  const result = {} as Record<BootStageId, BootStage>;
  for (const id of BOOT_STAGE_IDS) {
    const label = labels?.[id] ?? DEFAULT_BOOT_STAGE_LABELS[id];
    result[id] = makeDefaultStage(id, label);
  }
  return result;
}

/**
 * 启动阶段进度 Store。
 *
 * 由 `__root.tsx` 启动流程驱动：每个关键节点调用 startStage / completeStage / failStage。
 * 启动屏可订阅 store 渲染分阶段进度。
 */
export const useBootProgressStore = create<BootProgressStore>((set) => ({
  stages: makeInitialStages(),
  isBootCompleted: false,
  bootError: null,
  bootErrorType: "unknown",
  hasFatalError: false,

  startStage: (id, labelOverride) => {
    set((state) => {
      const existing = state.stages[id];
      if (!existing) return state;
      if (existing.status === "in_progress" || existing.status === "done") return state;
      return {
        stages: {
          ...state.stages,
          [id]: {
            ...existing,
            label: labelOverride ?? existing.label,
            status: "in_progress",
            startedAt: Date.now(),
            errorMessage: null,
            errorType: undefined,
            fatal: false,
          },
        },
      };
    });
  },

  completeStage: (id) => {
    set((state) => {
      const existing = state.stages[id];
      if (!existing) return state;
      if (existing.status === "done") return state;
      const nextStages = {
        ...state.stages,
        [id]: {
          ...existing,
          status: "done" as const,
          completedAt: Date.now(),
          errorMessage: null,
          errorType: undefined,
          fatal: false,
        },
      };
      const isBootCompleted = BOOT_STAGE_IDS.every((stageId) => nextStages[stageId].status === "done");
      return { stages: nextStages, isBootCompleted };
    });
  },

  failStage: (id, errorMessage, errorType = "unknown") => {
    set((state) => {
      const existing = state.stages[id];
      if (!existing) return state;
      const fatal = FATAL_BOOT_STAGE_ERROR_TYPES.has(errorType);
      const nextStages = {
        ...state.stages,
        [id]: {
          ...existing,
          status: "error" as const,
          errorMessage,
          errorType,
          fatal,
          completedAt: Date.now(),
        },
      };
      // 重新计算 hasFatalError：当前是否还有任意 fatal 阶段
      const hasFatalError = BOOT_STAGE_IDS.some(
        (stageId) => nextStages[stageId].status === "error" && nextStages[stageId].fatal,
      );
      return {
        stages: nextStages,
        bootError: errorMessage,
        bootErrorType: errorType,
        hasFatalError,
      };
    });
  },

  resetStages: (labels) => {
    set({
      stages: makeInitialStages(labels),
      isBootCompleted: false,
      bootError: null,
      bootErrorType: "unknown",
      hasFatalError: false,
    });
  },

  setBootError: (message, errorType = "unknown") => {
    set((state) => {
      const fatal = FATAL_BOOT_STAGE_ERROR_TYPES.has(errorType);
      return {
        bootError: message,
        bootErrorType: errorType,
        hasFatalError: message ? fatal || state.hasFatalError : state.hasFatalError,
      };
    });
  },

  clearFatalError: () => {
    set((state) => {
      if (!state.hasFatalError) return state;
      // 同时清掉各阶段的 fatal 标记
      const nextStages = { ...state.stages };
      for (const id of BOOT_STAGE_IDS) {
        const stage = nextStages[id];
        if (stage?.fatal) {
          nextStages[id] = { ...stage, fatal: false };
        }
      }
      return { stages: nextStages, hasFatalError: false };
    });
  },
}));

/**
 * 判断指定错误类型是否 fatal（不可重试）。
 */
export function isFatalBootErrorType(type: BootStageErrorType): boolean {
  return FATAL_BOOT_STAGE_ERROR_TYPES.has(type);
}

/**
 * 从 Error 推断错误类型。简单的启发式：基于错误名 / 信息匹配。
 */
export function inferBootStageErrorType(error: unknown): BootStageErrorType {
  if (error == null) return "unknown";
  if (typeof error === "object" && "name" in (error as Record<string, unknown>)) {
    const name = String((error as { name: unknown }).name).toLowerCase();
    if (name.includes("abort") || name.includes("cancel")) return "cancelled";
    if (name.includes("timeout")) return "timeout";
    if (name.includes("permission") || name.includes("forbidden")) return "permission";
  }
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("permission") || message.includes("forbidden") || message.includes("denied")) {
    return "permission";
  }
  if (message.includes("config") || message.includes("invalid") || message.includes("malformed")) {
    return "config";
  }
  if (message.includes("timeout") || message.includes("timed out")) return "timeout";
  if (
    message.includes("network") ||
    message.includes("econnrefused") ||
    message.includes("disconnected") ||
    message.includes("offline")
  ) {
    return "network";
  }
  if (message.includes("cancel")) return "cancelled";
  return "unknown";
}

/** 计算总进度 0..1（done 阶段数 / 总阶段数） */
export function computeBootProgress(stages: Record<BootStageId, BootStage>): number {
  let done = 0;
  for (const id of BOOT_STAGE_IDS) {
    if (stages[id]?.status === "done") done++;
  }
  return done / BOOT_STAGE_IDS.length;
}

/**
 * 测试专用：重置 store 到初始状态。
 *
 * @internal
 */
export function __resetBootProgressStoreForTest(): void {
  useBootProgressStore.setState({
    stages: makeInitialStages(),
    isBootCompleted: false,
    bootError: null,
    bootErrorType: "unknown",
    hasFatalError: false,
  });
}
