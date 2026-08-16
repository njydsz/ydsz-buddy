/**
 * @file Goal Mode 组件
 * @description 目标模式 UI 组件,支持用户设定长期目标,AI 自主推进并汇报进度
 * @layer 组件层
 *
 * ## 多端兼容
 *
 * 通过 `ensureNativeApi()` 统一调用入口，自动适配：
 * - Tauri 桌面端（直接走原生桥）
 * - Web/远端驱动（通过 WebSocket RPC）
 *
 * 后端 status 序列化为 PascalCase (`Running`/`Achieved`/`Aborted`)，
 * 组件内统一归一化为小写，再映射到 UI 状态。
 */

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Target, Play, Pause, X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { ensureNativeApi } from "../../nativeApi";
import { toastManager } from "../ui/toast";
import { cn } from "../../lib/utils";
import { monitor } from "../../lib/monitor";
import {
  goalModeTelemetry,
  measureGoalApi,
  recordGoalLifecycle,
} from "../../lib/goalModeTelemetry";

/** 前端展示用的归一化目标状态（统一小写） */
export type GoalStatus = "running" | "achieved" | "aborted";

/** 目标上下文（与后端 `GoalContextView` 一致，status 已归一化） */
export interface GoalContext {
  goal_id: string;
  thread_id: string;
  description: string;
  status: GoalStatus;
  progress_percent: number;
  current_task: string | null;
  completed_tasks: string[];
  started_at: string;
  updated_at: string;
}

/** 将后端 PascalCase 状态归一化为前端小写 */
function normalizeGoalStatus(raw: unknown): GoalStatus {
  if (typeof raw !== "string") return "running";
  const lower = raw.toLowerCase();
  if (lower === "achieved") return "achieved";
  if (lower === "aborted") return "aborted";
  return "running";
}

/** 兼容 PascalCase 状态的 GoalContext 原始形态 */
interface RawGoalContext {
  goal_id: string;
  thread_id: string;
  description: string;
  status: unknown;
  progress_percent: number;
  current_task: string | null;
  completed_tasks: string[];
  started_at: string;
  updated_at: string;
}

function toGoalContext(raw: RawGoalContext): GoalContext {
  return {
    ...raw,
    status: normalizeGoalStatus(raw.status),
  };
}

interface GoalModeProps {
  /** 当前线程 ID */
  threadId: string;
  /** 是否显示 */
  visible?: boolean;
  /** 关闭回调 */
  onClose?: () => void;
}

/**
 * Goal Mode 组件
 *
 * 支持用户设定长期目标,AI 自主推进并汇报进度
 */
export function GoalMode({ threadId, visible = false, onClose }: GoalModeProps) {
  const queryClient = useQueryClient();
  const [goalDescription, setGoalDescription] = useState("");

  // 查询活跃目标
  const { data: activeGoals = [] } = useQuery({
    queryKey: ["goals", "active"],
    queryFn: async () => {
      try {
        const raw = await measureGoalApi("listActive", () =>
          ensureNativeApi().goal.listActive(),
        );
        const mapped = raw.map((item) =>
          toGoalContext(item as unknown as RawGoalContext),
        );
        // 上报当前活跃目标分布(供 24h 长跑监控聚合)
        goalModeTelemetry.updateActiveCounts({
          running: mapped.filter((g) => g.status === "running").length,
          achieved: mapped.filter((g) => g.status === "achieved").length,
          aborted: mapped.filter((g) => g.status === "aborted").length,
        });
        goalModeTelemetry.recordListSuccess();
        return mapped;
      } catch (error) {
        goalModeTelemetry.recordListFailure(
          error instanceof Error ? error.message : String(error),
        );
        monitor.captureError({
          type: "goal.listActive",
          message: "failed to load active goals",
          stack: error instanceof Error ? error.stack : undefined,
          context: {},
          level: "warning",
        });
        return [];
      }
    },
    refetchInterval: 5000, // 每 5 秒刷新一次
  });

  // 启动目标
  const startGoalMutation = useMutation({
    mutationFn: async (description: string) => {
      const start = performance.now();
      try {
        const goalId = await measureGoalApi("start", () =>
          ensureNativeApi().goal.start({ threadId, description }),
        );
        recordGoalLifecycle({
          event: "start",
          goalId: typeof goalId === "string" ? goalId : undefined,
          success: true,
          durationMs: performance.now() - start,
        });
        return goalId;
      } catch (err) {
        recordGoalLifecycle({
          event: "start",
          success: false,
          error: err instanceof Error ? err.message : String(err),
          durationMs: performance.now() - start,
        });
        throw err;
      }
    },
    onSuccess: (goalId) => {
      toastManager.add({
        type: "success",
        title: "目标已启动",
        description: `目标 ID: ${String(goalId).slice(0, 8)}...`,
        timeout: 3000,
      });
      setGoalDescription("");
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "启动目标失败",
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  // 中止目标
  const abortGoalMutation = useMutation({
    mutationFn: async ({ goalId, reason }: { goalId: string; reason: string }) => {
      const start = performance.now();
      try {
        const result = await measureGoalApi("abort", () =>
          ensureNativeApi().goal.abort({ goalId, reason }),
        );
        recordGoalLifecycle({
          event: "abort",
          goalId,
          success: true,
          durationMs: performance.now() - start,
        });
        return result;
      } catch (err) {
        recordGoalLifecycle({
          event: "abort",
          goalId,
          success: false,
          error: err instanceof Error ? err.message : String(err),
          durationMs: performance.now() - start,
        });
        throw err;
      }
    },
    onSuccess: () => {
      toastManager.add({
        type: "success",
        title: "目标已中止",
        timeout: 2000,
      });
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "中止目标失败",
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const handleStartGoal = useCallback(() => {
    if (!goalDescription.trim()) {
      toastManager.add({
        type: "warning",
        title: "请输入目标描述",
        timeout: 2000,
      });
      return;
    }
    startGoalMutation.mutate(goalDescription);
  }, [goalDescription, startGoalMutation]);

  const handleAbortGoal = useCallback(
    (goalId: string) => {
      abortGoalMutation.mutate({
        goalId,
        reason: "用户手动中止",
      });
    },
    [abortGoalMutation],
  );

  // 24h 长跑埋点:注册降级信号,卸载时导出 session 报告
  useEffect(() => {
    if (!visible) return;
    const unsubscribe = goalModeTelemetry.onDegradation((info) => {
      monitor.captureError({
        type: "goal_mode.degradation",
        message: info.message,
        stack: undefined,
        context: {
          reason: info.reason,
          session: JSON.stringify(info.metrics),
        },
        level: info.reason === "consecutive-failures" ? "error" : "warning",
      });
    });
    return () => {
      unsubscribe();
      // 卸载时导出 session 报告,便于 e2e 收集
      if (typeof window !== "undefined") {
        try {
          const report = goalModeTelemetry.exportSessionReport();
          window.dispatchEvent(
            new CustomEvent("goal_mode:session_report", { detail: report }),
          );
        } catch {
          // 静默失败
        }
      }
    };
  }, [visible]);

  if (!visible) return null;

  const currentThreadGoals = activeGoals.filter((g) => g.thread_id === threadId);
  const runningGoals = currentThreadGoals.filter((g) => g.status === "running");

  return (
    <div
      className="flex h-full flex-col border-l bg-background"
      data-testid="goal-mode-panel"
      data-thread-id={threadId}
      data-running-count={runningGoals.length}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Target className="size-5 text-primary" />
          <h2 className="text-sm font-semibold">目标模式</h2>
          {runningGoals.length > 0 && (
            <Badge variant="secondary" className="text-xs" data-testid="goal-running-count">
              {runningGoals.length} 个运行中
            </Badge>
          )}
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose} className="size-8 p-0">
            <X className="size-4" />
          </Button>
        )}
      </div>

      {/* 目标输入区 */}
      <div className="border-b p-4">
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            设定长期目标
          </label>
          <Textarea
            placeholder="描述你希望 AI 自主完成的目标,例如:重构整个认证模块,支持 OAuth2 和 JWT..."
            value={goalDescription}
            onChange={(e) => setGoalDescription(e.target.value)}
            className="min-h-[80px] resize-none"
            disabled={startGoalMutation.isPending}
            data-testid="goal-description-input"
          />
          <Button
            onClick={handleStartGoal}
            disabled={startGoalMutation.isPending || !goalDescription.trim()}
            className="w-full"
            size="sm"
            data-testid="goal-start-button"
          >
            {startGoalMutation.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                启动中...
              </>
            ) : (
              <>
                <Play className="mr-2 size-4" />
                启动目标
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 活跃目标列表 */}
      <ScrollArea className="flex-1">
        <div className="space-y-3 p-4">
          {currentThreadGoals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Target className="mb-3 size-12 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">暂无活跃目标</p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                设定一个长期目标,AI 将自主推进
              </p>
            </div>
          ) : (
            currentThreadGoals.map((goal) => (
              <GoalCard
                key={goal.goal_id}
                goal={goal}
                onAbort={() => handleAbortGoal(goal.goal_id)}
                isAborting={abortGoalMutation.isPending}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/** 单个目标卡片 */
function GoalCard({
  goal,
  onAbort,
  isAborting,
}: {
  goal: GoalContext;
  onAbort: () => void;
  isAborting: boolean;
}) {
  const statusConfig = {
    running: {
      icon: Loader2,
      label: "运行中",
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      animate: true,
    },
    achieved: {
      icon: CheckCircle2,
      label: "已达成",
      color: "text-green-500",
      bgColor: "bg-green-500/10",
      animate: false,
    },
    aborted: {
      icon: AlertCircle,
      label: "已中止",
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
      animate: false,
    },
  };

  const config = statusConfig[goal.status];
  const StatusIcon = config.icon;

  return (
    <div
      className="rounded-lg border bg-card p-4"
      data-testid="goal-card"
      data-goal-id={goal.goal_id}
      data-status={goal.status}
      data-progress={goal.progress_percent}
    >
      {/* 状态头 */}
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <StatusIcon
            className={cn("size-5", config.color, config.animate && "animate-spin")}
          />
          <Badge variant="outline" className={cn("text-xs", config.color)} data-testid="goal-status-badge">
            {config.label}
          </Badge>
        </div>
        {goal.status === "running" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onAbort}
            disabled={isAborting}
            className="h-7 px-2 text-xs"
            data-testid="goal-abort-button"
          >
            <Pause className="mr-1 size-3" />
            中止
          </Button>
        )}
      </div>

      {/* 目标描述 */}
      <div className="mb-3">
        <p className="text-sm font-medium">{goal.description}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          ID: {goal.goal_id.slice(0, 8)}...
        </p>
      </div>

      {/* 进度条 */}
      {goal.status === "running" && (
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">进度</span>
            <span className="font-medium">{goal.progress_percent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${goal.progress_percent}%` }}
            />
          </div>
        </div>
      )}

      {/* 当前任务 */}
      {goal.current_task && goal.status === "running" && (
        <div className="mb-2 rounded-md bg-muted/50 p-2">
          <p className="text-xs text-muted-foreground">当前任务</p>
          <p className="mt-0.5 text-sm">{goal.current_task}</p>
        </div>
      )}

      {/* 已完成任务 */}
      {goal.completed_tasks.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">
            已完成 ({goal.completed_tasks.length})
          </p>
          <ul className="space-y-1">
            {goal.completed_tasks.slice(-3).map((task, idx) => (
              <li key={idx} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="size-3 text-green-500" />
                <span className="truncate">{task}</span>
              </li>
            ))}
            {goal.completed_tasks.length > 3 && (
              <li className="text-xs text-muted-foreground/70">
                +{goal.completed_tasks.length - 3} 个更多任务
              </li>
            )}
          </ul>
        </div>
      )}

      {/* 时间信息 */}
      <div className="mt-3 flex items-center gap-3 border-t pt-2 text-xs text-muted-foreground">
        <span>启动: {new Date(goal.started_at).toLocaleTimeString()}</span>
        <span>更新: {new Date(goal.updated_at).toLocaleTimeString()}</span>
      </div>
    </div>
  );
}
