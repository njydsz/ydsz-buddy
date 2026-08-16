/**
 * @file GoalModePerformancePanel.tsx
 * @description Goal Mode 性能面板 - 在性能仪表板中展示 24h 长跑关键指标
 * @module components/GoalModePerformancePanel
 *
 * ## 展示内容
 *
 * - 当前活跃目标分布(running / achieved / aborted)
 * - session 统计:启动/中止成功失败计数
 * - listActive 失败率与连续失败计数
 * - session 持续时间
 * - 导出 session 报告按钮(供 e2e / 长跑任务回传)
 */

import { memo, useCallback, useEffect, useState } from "react";
import { PiDownload, PiTarget, PiWarning } from "react-icons/pi";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { cn } from "~/lib/utils";
import { goalModeTelemetry, type GoalSessionMetrics } from "~/lib/goalModeTelemetry";
import { toastManager } from "./ui/toast";

/**
 * 格式化毫秒为可读时长
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/**
 * 工具函数:计算成功率(0..1),处理分母为 0
 */
function successRate(success: number, total: number): number {
  if (total === 0) return 1;
  return success / total;
}

/**
 * 严重程度配色
 */
function getRateColor(rate: number): string {
  if (rate >= 0.95) return "text-green-600";
  if (rate >= 0.8) return "text-yellow-600";
  return "text-red-600";
}

/**
 * GoalModePerformancePanel
 */
export const GoalModePerformancePanel = memo(function GoalModePerformancePanel() {
  const [session, setSession] = useState<GoalSessionMetrics>(() =>
    goalModeTelemetry.getSessionMetrics(),
  );

  // 每 2s 刷新一次 session 快照(用于 24h 长跑实时观察)
  useEffect(() => {
    const refresh = () => {
      setSession(goalModeTelemetry.getSessionMetrics());
    };
    refresh();
    const intervalId = setInterval(refresh, 2000);
    return () => clearInterval(intervalId);
  }, []);

  // 订阅 session_report 事件(由 GoalMode 卸载时触发)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string") {
        // eslint-disable-next-line no-console
        console.log("[GoalModePerformancePanel] session_report:", detail);
      }
    };
    window.addEventListener("goal_mode:session_report", handler);
    return () => window.removeEventListener("goal_mode:session_report", handler);
  }, []);

  const handleExport = useCallback(() => {
    try {
      const json = goalModeTelemetry.exportSessionReport();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `goal-mode-session-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toastManager.add({ type: "success", title: "Goal Mode 报告已导出" });
    } catch (err) {
      toastManager.add({
        type: "error",
        title: "导出失败",
        description: err instanceof Error ? err.message : "未知错误",
      });
    }
  }, []);

  const sessionDuration = Date.now() - session.sessionStart;
  const startRate = successRate(session.startSuccess, session.startCount);
  const abortRate = successRate(session.abortSuccess, session.abortCount);
  const listFailureRate = session.listCount === 0
    ? 0
    : session.listFailure / session.listCount;
  const hasDegradation = session.consecutiveListFailures >= 5;
  const totalActive = session.activeRunning + session.activeAchieved + session.activeAborted;

  return (
    <Card data-testid="goal-mode-performance-panel">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PiTarget className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm">Goal Mode 性能</CardTitle>
            {hasDegradation && (
              <Badge
                variant="outline"
                className="gap-1 border-red-500/20 bg-red-500/10 text-red-600"
                data-testid="goal-mode-degraded-badge"
              >
                <PiWarning className="size-3" />
                降级
              </Badge>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleExport} data-testid="goal-mode-export">
            <PiDownload className="mr-1 size-3" />
            导出报告
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* 当前活跃目标分布 */}
          <div
            className="grid grid-cols-3 gap-2"
            data-testid="goal-mode-active-distribution"
          >
            <div className="rounded-lg border border-border bg-card p-2 text-center">
              <div className="text-2xl font-semibold tabular-nums text-blue-500" data-testid="goal-active-running">
                {session.activeRunning}
              </div>
              <div className="text-xs text-muted-foreground">运行中</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-2 text-center">
              <div className="text-2xl font-semibold tabular-nums text-green-500" data-testid="goal-active-achieved">
                {session.activeAchieved}
              </div>
              <div className="text-xs text-muted-foreground">已达成</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-2 text-center">
              <div className="text-2xl font-semibold tabular-nums text-orange-500" data-testid="goal-active-aborted">
                {session.activeAborted}
              </div>
              <div className="text-xs text-muted-foreground">已中止</div>
            </div>
          </div>

          {/* 会话级指标 */}
          <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Session 持续</span>
              <span className="font-medium tabular-nums" data-testid="goal-session-duration">
                {formatDuration(sessionDuration)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">当前活跃目标</span>
              <span className="font-medium tabular-nums" data-testid="goal-active-total">
                {totalActive}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">listActive 调用</span>
              <span className="font-medium tabular-nums" data-testid="goal-list-count">
                {session.listCount} (失败 {session.listFailure})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">listActive 失败率</span>
              <span
                className={cn(
                  "font-medium tabular-nums",
                  getRateColor(1 - listFailureRate),
                )}
                data-testid="goal-list-failure-rate"
              >
                {(listFailureRate * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">连续失败</span>
              <span
                className={cn(
                  "font-medium tabular-nums",
                  session.consecutiveListFailures >= 5
                    ? "text-red-600"
                    : session.consecutiveListFailures > 0
                      ? "text-yellow-600"
                      : "text-green-600",
                )}
                data-testid="goal-consecutive-failures"
              >
                {session.consecutiveListFailures}
              </span>
            </div>
          </div>

          {/* 启动/中止成功率 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border bg-card p-2">
              <div className="text-xs text-muted-foreground">启动成功率</div>
              <div
                className={cn(
                  "text-lg font-semibold tabular-nums",
                  getRateColor(startRate),
                )}
                data-testid="goal-start-rate"
              >
                {(startRate * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {session.startSuccess} / {session.startCount}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-2">
              <div className="text-xs text-muted-foreground">中止成功率</div>
              <div
                className={cn(
                  "text-lg font-semibold tabular-nums",
                  getRateColor(abortRate),
                )}
                data-testid="goal-abort-rate"
              >
                {(abortRate * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {session.abortSuccess} / {session.abortCount}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
