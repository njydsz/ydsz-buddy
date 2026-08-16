/**
 * @file 崩溃恢复 Hook
 *
 * 实现任务中断后的自动恢复机制：
 * - 每个 Turn 启动时写入 Checkpoint（每 5s 一次）
 * - 重启后检测未完成 Turn → 弹窗提示恢复
 * - 恢复选项：继续 / 取消 / 查看断点
 * - 超过 7 天的未完成 Turn 自动清理
 *
 * ## 核心功能
 *
 * - **自动 Checkpoint**：定时保存任务状态
 * - **中断检测**：启动时检查未完成的任务
 * - **恢复对话框**：用户可选择继续/取消/查看
 * - **自动清理**：7 天前的旧 Checkpoint 自动删除
 *
 * ## 使用场景
 *
 * - 应用启动时检测中断任务
 * - 用户强制关闭后重启
 * - 断电/崩溃后恢复
 *
 * ## 注意事项
 *
 * - Checkpoint 存储在 SQLite
 * - 恢复前需要用户确认
 * - 超过 7 天的 Checkpoint 自动清理
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { readNativeApi } from "~/nativeApi";
import { isTauri } from "~/env";
import type { ThreadId, TurnId } from "~/contracts";

/** Checkpoint 任务状态（与后端 `CheckpointStatus` 6 态对齐） */
export type TurnCheckpointStatus =
  | "running"
  | "paused"
  | "failed"
  | "completed"
  | "cancelled"
  | "resuming";

/** Checkpoint 数据 */
export interface TurnCheckpoint {
  /** 线程 ID */
  threadId: ThreadId;
  /** Turn ID */
  turnId: TurnId;
  /** 创建时间 */
  createdAt: string;
  /** 最后更新时间 */
  updatedAt: string;
  /** 任务状态 */
  status: TurnCheckpointStatus;
  /** 最后一条消息 ID */
  lastMessageId?: string;
  /** 任务摘要 */
  summary?: string;
}

/** 恢复选项 */
export type RecoveryAction = "resume" | "cancel" | "inspect";

interface UseCrashRecoveryOptions {
  /** 是否启用 */
  enabled?: boolean;
  /** Checkpoint 间隔（毫秒） */
  checkpointIntervalMs?: number;
  /** 自动清理天数 */
  autoCleanupDays?: number;
}

interface UseCrashRecoveryResult {
  /** 未完成的任务列表 */
  pendingCheckpoints: TurnCheckpoint[];
  /** 是否有未完成的任务 */
  hasPendingRecovery: boolean;
  /** 开始监控一个 Turn（写入 Checkpoint） */
  startMonitoring: (threadId: ThreadId, turnId: TurnId) => void;
  /** 停止当前 Turn 的监控（写入完成状态） */
  stopMonitoring: () => void;
  /** 恢复任务 */
  resumeCheckpoint: (checkpoint: TurnCheckpoint) => Promise<void>;
  /** 取消任务 */
  cancelCheckpoint: (checkpoint: TurnCheckpoint) => Promise<void>;
  /** 查看断点 */
  inspectCheckpoint: (checkpoint: TurnCheckpoint) => Promise<void>;
  /** 清理旧 Checkpoint */
  cleanupOldCheckpoints: () => Promise<void>;
}

/**
 * 崩溃恢复 Hook
 */
export function useCrashRecovery(
  options: UseCrashRecoveryOptions = {},
): UseCrashRecoveryResult {
  const {
    enabled = true,
    checkpointIntervalMs = 5000,
    autoCleanupDays = 7,
  } = options;

  const [pendingCheckpoints, setPendingCheckpoints] = useState<TurnCheckpoint[]>([]);
  const checkpointTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentTurnRef = useRef<{ threadId: ThreadId; turnId: TurnId } | null>(null);

  // 启动时检测未完成的任务
  useEffect(() => {
    if (!enabled || !isTauri) return;

    const loadPendingCheckpoints = async () => {
      try {
        const checkpoints = await invoke<TurnCheckpoint[]>("checkpoint_list_pending");
        setPendingCheckpoints(checkpoints);
      } catch (error) {
        console.error("Failed to load pending checkpoints:", error);
      }
    };

    void loadPendingCheckpoints();
  }, [enabled]);

  // 自动清理旧 Checkpoint
  useEffect(() => {
    if (!enabled || !isTauri) return;

    const cleanup = async () => {
      try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - autoCleanupDays);
        await invoke("checkpoint_cleanup_old", {
          params: {
            cutoffIso: cutoffDate.toISOString(),
          },
        });
      } catch (error) {
        console.error("Failed to cleanup old checkpoints:", error);
      }
    };

    void cleanup();
  }, [enabled, autoCleanupDays]);

  // 开始监控 Turn
  const startMonitoring = useCallback(
    (threadId: ThreadId, turnId: TurnId) => {
      if (!enabled || !isTauri) return;

      currentTurnRef.current = { threadId, turnId };

      // 创建初始 Checkpoint
      const createInitialCheckpoint = async () => {
        try {
          await invoke("checkpoint_save", {
            params: {
              threadId,
              turnId,
              status: "running",
            },
          });
        } catch (error) {
          console.error("Failed to create initial checkpoint:", error);
        }
      };

      void createInitialCheckpoint();

      // 定时更新 Checkpoint
      checkpointTimerRef.current = setInterval(async () => {
        if (!currentTurnRef.current) return;

        try {
          await invoke("checkpoint_update", {
            params: {
              threadId: currentTurnRef.current.threadId,
              turnId: currentTurnRef.current.turnId,
            },
          });
        } catch (error) {
          console.error("Failed to update checkpoint:", error);
        }
      }, checkpointIntervalMs);
    },
    [enabled, checkpointIntervalMs],
  );

  // 停止监控 Turn
  const stopMonitoring = useCallback(() => {
    if (checkpointTimerRef.current) {
      clearInterval(checkpointTimerRef.current);
      checkpointTimerRef.current = null;
    }

    if (currentTurnRef.current) {
      const completeCheckpoint = async () => {
        try {
          await invoke("checkpoint_complete", {
            params: {
              threadId: currentTurnRef.current!.threadId,
              turnId: currentTurnRef.current!.turnId,
            },
          });
        } catch (error) {
          console.error("Failed to complete checkpoint:", error);
        }
      };

      void completeCheckpoint();
      currentTurnRef.current = null;
    }
  }, []);

  // 恢复任务
  const resumeCheckpoint = useCallback(async (checkpoint: TurnCheckpoint) => {
    try {
      await invoke("checkpoint_resume", {
        params: {
          threadId: checkpoint.threadId,
          turnId: checkpoint.turnId,
        },
      });
      setPendingCheckpoints((prev) =>
        prev.filter((c) => c.turnId !== checkpoint.turnId),
      );
    } catch (error) {
      console.error("Failed to resume checkpoint:", error);
      throw error;
    }
  }, []);

  // 取消任务
  const cancelCheckpoint = useCallback(async (checkpoint: TurnCheckpoint) => {
    try {
      await invoke("checkpoint_cancel", {
        params: {
          threadId: checkpoint.threadId,
          turnId: checkpoint.turnId,
        },
      });
      setPendingCheckpoints((prev) =>
        prev.filter((c) => c.turnId !== checkpoint.turnId),
      );
    } catch (error) {
      console.error("Failed to cancel checkpoint:", error);
      throw error;
    }
  }, []);

  // 查看断点
  const inspectCheckpoint = useCallback(async (checkpoint: TurnCheckpoint) => {
    try {
      await invoke("checkpoint_inspect", {
        params: {
          threadId: checkpoint.threadId,
          turnId: checkpoint.turnId,
        },
      });
    } catch (error) {
      console.error("Failed to inspect checkpoint:", error);
      throw error;
    }
  }, []);

  // 清理旧 Checkpoint
  const cleanupOldCheckpoints = useCallback(async () => {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - autoCleanupDays);
      await invoke("checkpoint_cleanup_old", {
        params: {
          cutoffIso: cutoffDate.toISOString(),
        },
      });
      // 重新加载列表
      const checkpoints = await invoke<TurnCheckpoint[]>("checkpoint_list_pending");
      setPendingCheckpoints(checkpoints);
    } catch (error) {
      console.error("Failed to cleanup old checkpoints:", error);
      throw error;
    }
  }, [autoCleanupDays]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (checkpointTimerRef.current) {
        clearInterval(checkpointTimerRef.current);
      }
    };
  }, []);

  return {
    pendingCheckpoints,
    hasPendingRecovery: pendingCheckpoints.length > 0,
    startMonitoring,
    stopMonitoring,
    resumeCheckpoint,
    cancelCheckpoint,
    inspectCheckpoint,
    cleanupOldCheckpoints,
  };
}

/**
 * 监听 Turn 启动/完成，自动管理 Checkpoint
 */
export function useTurnCheckpointMonitor(threadId: ThreadId | null) {
  const { startMonitoring, stopMonitoring } = useCrashRecovery();
  const api = readNativeApi();

  useEffect(() => {
    if (!api || !threadId) return;

    // 监听 Turn 启动
    const unsubscribeStart = api.orchestration.onDomainEvent((event) => {
      if (event.aggregateId !== threadId) return;

      if (event.type === "thread.turn-started") {
        const payload = event.payload as { turnId: TurnId };
        startMonitoring(threadId, payload.turnId);
      } else if (
        event.type === "thread.turn-completed" ||
        event.type === "thread.turn-failed"
      ) {
        stopMonitoring();
      }
    });

    return () => {
      unsubscribeStart();
      stopMonitoring();
    };
  }, [api, threadId, startMonitoring, stopMonitoring]);
}
