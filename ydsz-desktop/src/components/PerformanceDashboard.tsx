/**
 * @file PerformanceDashboard.tsx
 * @description 性能仪表板组件 - 可视化展示性能数据、基线对比和退化检测
 * @module components/PerformanceDashboard
 */

import { memo, useCallback, useMemo } from "react";
import { PiDownload, PiTrash, PiChartLine, PiWarning, PiCheckCircle, PiXCircle } from "react-icons/pi";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { cn } from "~/lib/utils";
import { usePerformanceMonitor } from "~/hooks/usePerformanceMonitor";
import { toastManager } from "./ui/toast";
import { TauriCommandMetricsPanel } from "./TauriCommandMetricsPanel";
import { GoalModePerformancePanel } from "./GoalModePerformancePanel";
import type { MetricSummary, MetricType } from "~/lib/performanceMetrics";
import type { DegradationResult } from "~/lib/performanceBaseline";

/**
 * 性能仪表板属性
 */
interface PerformanceDashboardProps {
  /** 自定义类名 */
  className?: string;
}

/**
 * 格式化字节数
 */
function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "N/A";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * 格式化毫秒数
 */
function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(2)} μs`;
  if (ms < 1000) return `${ms.toFixed(2)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * 指标类型标签
 */
const METRIC_TYPE_LABELS: Record<MetricType, string> = {
  tauri_command: "Tauri 命令",
  provider_api: "Provider API",
  filesystem: "文件系统",
  memory: "内存",
  frame_rate: "帧率",
};

/**
 * 获取严重程度颜色
 */
function getSeverityColor(severity: DegradationResult["severity"]): string {
  switch (severity) {
    case "critical":
      return "bg-red-500/10 text-red-600 border-red-500/20";
    case "warning":
      return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
    default:
      return "bg-green-500/10 text-green-600 border-green-500/20";
  }
}

/**
 * 获取严重程度图标
 */
function getSeverityIcon(severity: DegradationResult["severity"]) {
  switch (severity) {
    case "critical":
      return <PiXCircle className="size-4" />;
    case "warning":
      return <PiWarning className="size-4" />;
    default:
      return <PiCheckCircle className="size-4" />;
  }
}

/**
 * 性能指标卡片
 */
const MetricCard = memo(function MetricCard({
  summary,
  baseline,
}: {
  summary: MetricSummary;
  baseline?: { avg: number; median: number; p95: number };
}) {
  const degradation = baseline
    ? ((summary.avg - baseline.avg) / baseline.avg) * 100
    : 0;
  const isDegraded = degradation > 20;
  const isWarning = degradation > 50;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        isWarning && "border-red-500/30 bg-red-500/5",
        isDegraded && !isWarning && "border-yellow-500/30 bg-yellow-500/5",
        !isDegraded && "border-border bg-card"
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {METRIC_TYPE_LABELS[summary.type]}
        </span>
        {isDegraded && (
          <Badge
            variant="outline"
            className={cn(
              "text-[10px]",
              isWarning
                ? "bg-red-500/10 text-red-600 border-red-500/20"
                : "bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
            )}
          >
            {isWarning ? "严重" : "警告"}
          </Badge>
        )}
      </div>

      <div className="mb-1 text-lg font-semibold tabular-nums">
        {formatMs(summary.avg)}
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <div className="flex justify-between">
          <span>最小值</span>
          <span className="tabular-nums">{formatMs(summary.min)}</span>
        </div>
        <div className="flex justify-between">
          <span>中位数</span>
          <span className="tabular-nums">{formatMs(summary.median)}</span>
        </div>
        <div className="flex justify-between">
          <span>P95</span>
          <span className="tabular-nums">{formatMs(summary.p95)}</span>
        </div>
        <div className="flex justify-between">
          <span>P99</span>
          <span className="tabular-nums">{formatMs(summary.p99)}</span>
        </div>
        <div className="flex justify-between">
          <span>样本数</span>
          <span className="tabular-nums">{summary.count}</span>
        </div>
      </div>

      {baseline && (
        <div className="mt-2 border-t border-border pt-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">vs 基线</span>
            <span
              className={cn(
                "font-medium tabular-nums",
                degradation > 50
                  ? "text-red-600"
                  : degradation > 20
                    ? "text-yellow-600"
                    : "text-green-600"
              )}
            >
              {degradation > 0 ? "+" : ""}
              {degradation.toFixed(1)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
});

/**
 * 退化检测列表项
 */
const DegradationItem = memo(function DegradationItem({
  degradation,
}: {
  degradation: DegradationResult;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border p-3",
        getSeverityColor(degradation.severity)
      )}
    >
      <div className="shrink-0">{getSeverityIcon(degradation.severity)}</div>
      <div className="flex-1 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            {METRIC_TYPE_LABELS[degradation.type]} - {degradation.name}
          </span>
          <Badge
            variant="outline"
            className={cn("text-[10px]", getSeverityColor(degradation.severity))}
          >
            {degradation.severity === "critical"
              ? "严重"
              : degradation.severity === "warning"
                ? "警告"
                : "正常"}
          </Badge>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>
            当前: <span className="font-medium tabular-nums">{formatMs(degradation.currentValue)}</span>
          </span>
          <span>
            基线: <span className="font-medium tabular-nums">{formatMs(degradation.baselineValue)}</span>
          </span>
          <span
            className={cn(
              "font-medium tabular-nums",
              degradation.degradationPercent > 50
                ? "text-red-600"
                : degradation.degradationPercent > 20
                  ? "text-yellow-600"
                  : "text-green-600"
            )}
          >
            {degradation.degradationPercent > 0 ? "+" : ""}
            {(degradation.degradationPercent * 100).toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
});

/**
 * 性能仪表板组件
 */
export const PerformanceDashboard = memo(function PerformanceDashboard({
  className,
}: PerformanceDashboardProps) {
  const {
    memoryUsage,
    memoryLimit,
    report,
    degradations,
    baseline,
    summaries,
    resetBaseline,
    buildBaseline,
    exportReport,
    clearMetrics,
  } = usePerformanceMonitor();

  // 按类型分组摘要
  const groupedSummaries = useMemo(() => {
    const groups: Record<MetricType, MetricSummary[]> = {
      tauri_command: [],
      provider_api: [],
      filesystem: [],
      memory: [],
      frame_rate: [],
    };
    for (const summary of summaries) {
      groups[summary.type].push(summary);
    }
    return groups;
  }, [summaries]);

  // 获取基线条目
  const baselineMap = useMemo(() => {
    const map = new Map<string, { avg: number; median: number; p95: number }>();
    if (baseline) {
      for (const entry of baseline.entries) {
        map.set(`${entry.type}:${entry.name}`, entry);
      }
    }
    return map;
  }, [baseline]);

  // 导出报告
  const handleExport = useCallback(() => {
    try {
      const json = exportReport();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `performance-report-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toastManager.add({
        type: "success",
        title: "报告已导出",
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "导出失败",
        description: error instanceof Error ? error.message : "未知错误",
      });
    }
  }, [exportReport]);

  // 重置基线
  const handleResetBaseline = useCallback(() => {
    resetBaseline();
    toastManager.add({
      type: "success",
      title: "基线已重置",
    });
  }, [resetBaseline]);

  // 构建基线
  const handleBuildBaseline = useCallback(() => {
    buildBaseline();
    toastManager.add({
      type: "success",
      title: "基线已构建",
    });
  }, [buildBaseline]);

  // 清空指标
  const handleClearMetrics = useCallback(() => {
    clearMetrics();
    toastManager.add({
      type: "success",
      title: "指标已清空",
    });
  }, [clearMetrics]);

  // 总体健康状态
  const overallHealth = report?.overallHealth ?? "healthy";
  const healthConfig = {
    healthy: { label: "健康", color: "text-green-600", icon: <PiCheckCircle className="size-5" /> },
    degraded: { label: "退化", color: "text-yellow-600", icon: <PiWarning className="size-5" /> },
    critical: { label: "严重", color: "text-red-600", icon: <PiXCircle className="size-5" /> },
  };

  return (
    <div className={cn("flex h-full flex-col", className)}>
      {/* 工具栏 */}
      <div className="flex items-center gap-2 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <PiChartLine className="size-5 text-muted-foreground" />
          <span className="text-sm font-medium">性能仪表板</span>
        </div>

        <div className="flex-1" />

        <Badge
          variant="outline"
          className={cn(
            "gap-1",
            overallHealth === "healthy" && "bg-green-500/10 text-green-600 border-green-500/20",
            overallHealth === "degraded" && "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
            overallHealth === "critical" && "bg-red-500/10 text-red-600 border-red-500/20"
          )}
        >
          {healthConfig[overallHealth].icon}
          {healthConfig[overallHealth].label}
        </Badge>

        <Button variant="outline" size="sm" onClick={handleBuildBaseline}>
          构建基线
        </Button>

        <Button variant="outline" size="sm" onClick={handleResetBaseline}>
          重置基线
        </Button>

        <Button variant="outline" size="sm" onClick={handleClearMetrics}>
          <PiTrash className="mr-1 size-3" />
          清空
        </Button>

        <Button variant="outline" size="sm" onClick={handleExport}>
          <PiDownload className="mr-1 size-3" />
          导出
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          {/* 内存使用情况 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">内存使用情况</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div>
                  <div className="text-2xl font-semibold tabular-nums">
                    {formatBytes(memoryUsage)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    已使用 / 上限: {formatBytes(memoryLimit)}
                  </div>
                </div>
                {memoryUsage && memoryLimit && (
                  <div className="flex-1">
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full transition-all",
                          memoryUsage / memoryLimit > 0.9
                            ? "bg-red-500"
                            : memoryUsage / memoryLimit > 0.7
                              ? "bg-yellow-500"
                              : "bg-green-500"
                        )}
                        style={{ width: `${Math.min(100, (memoryUsage / memoryLimit) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 性能退化 */}
          {degradations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">性能退化检测</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {degradations
                    .filter((d) => d.severity !== "ok")
                    .sort((a, b) => b.degradationPercent - a.degradationPercent)
                    .map((degradation, index) => (
                      <DegradationItem key={index} degradation={degradation} />
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tauri 命令 P99 监控 */}
          <TauriCommandMetricsPanel />

          {/* Goal Mode 24h 长跑指标 */}
          <GoalModePerformancePanel />

          {/* 指标摘要 */}
          {Object.entries(groupedSummaries).map(([type, typeSummaries]) =>
            typeSummaries.length > 0 ? (
              <Card key={type}>
                <CardHeader>
                  <CardTitle className="text-sm">
                    {METRIC_TYPE_LABELS[type as MetricType]}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {typeSummaries.map((summary, index) => {
                      const baselineEntry = baselineMap.get(
                        `${summary.type}:${summary.name}`
                      );
                      return (
                        <MetricCard
                          key={index}
                          summary={summary}
                          baseline={baselineEntry}
                        />
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ) : null
          )}

          {/* 基线信息 */}
          {baseline && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">基线信息</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">版本</span>
                    <span className="font-medium tabular-nums">v{baseline.version}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">创建时间</span>
                    <span className="font-medium">
                      {new Date(baseline.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">最后更新</span>
                    <span className="font-medium">
                      {new Date(baseline.updatedAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">样本数</span>
                    <span className="font-medium tabular-nums">
                      {baseline.entries.reduce((acc, e) => acc + e.sampleCount, 0)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 空状态 */}
          {summaries.length === 0 && !baseline && (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
              <PiChartLine className="size-12 opacity-50" />
              <p className="text-sm">暂无性能数据</p>
              <p className="text-xs">系统会自动收集性能指标并建立基线</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* 底部状态 */}
      <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
        <span>
          指标数: {summaries.reduce((acc, s) => acc + s.count, 0)} | 退化:{" "}
          {degradations.filter((d) => d.severity !== "ok").length}
        </span>
        <span>自动采样: 5s</span>
      </div>
    </div>
  );
});
