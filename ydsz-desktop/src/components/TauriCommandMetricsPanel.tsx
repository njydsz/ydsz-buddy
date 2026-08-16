/**
 * @file TauriCommandMetricsPanel.tsx
 * @description Tauri 命令 P99 监控面板 - 展示 Tauri 命令的实时 P50/P95/P99 指标和阈值告警
 * @module components/TauriCommandMetricsPanel
 *
 * ## 设计目标
 *
 * 1. 实时显示 Tauri 命令的 P99 监控数据
 * 2. 阈值告警可视化（P99 > 500ms 警告，> 1500ms 严重）
 * 3. 排序和筛选：按 P99、调用次数、严重程度排序
 * 4. 支持清空采样和导出快照
 *
 * ## 使用方式
 *
 * 集成到 PerformanceDashboard 内部，或作为独立诊断面板使用。
 *
 * @example
 * ```tsx
 * <TauriCommandMetricsPanel />
 * ```
 */

import { memo, useCallback, useMemo, useState } from "react";
import {
  PiArrowClockwise,
  PiDownload,
  PiTrash,
  PiWarning,
  PiCheckCircle,
  PiXCircle,
  PiSortAscending,
  PiSortDescending,
} from "react-icons/pi";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { cn } from "~/lib/utils";
import { toastManager } from "./ui/toast";
import {
  clearAllTauriCommandMetrics,
  TAURI_P99_CRITICAL_THRESHOLD_MS,
  TAURI_P99_WARNING_THRESHOLD_MS,
  TauriCommandMetrics,
  useAllTauriCommandMetrics,
} from "~/lib/tauriMetrics";

/**
 * 排序字段
 */
type SortField = "p99Ms" | "p95Ms" | "avgMs" | "count" | "severity";

/**
 * 格式化毫秒
 */
function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)} μs`;
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * 获取严重程度配置
 */
function getSeverityConfig(severity: TauriCommandMetrics["severity"]) {
  switch (severity) {
    case "critical":
      return {
        label: "严重",
        className: "bg-red-500/10 text-red-600 border-red-500/20",
        icon: PiXCircle,
      };
    case "warning":
      return {
        label: "警告",
        className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
        icon: PiWarning,
      };
    default:
      return {
        label: "正常",
        className: "bg-green-500/10 text-green-600 border-green-500/20",
        icon: PiCheckCircle,
      };
  }
}

/**
 * 严重程度排序权重
 */
const SEVERITY_RANK: Record<TauriCommandMetrics["severity"], number> = {
  critical: 3,
  warning: 2,
  ok: 1,
};

/**
 * 单个命令指标行
 */
const CommandRow = memo(function CommandRow({
  metrics,
}: {
  metrics: TauriCommandMetrics;
}) {
  const severityConfig = getSeverityConfig(metrics.severity);
  const SeverityIcon = severityConfig.icon;
  const successPercent = (metrics.successRate * 100).toFixed(1);
  const isCritical = metrics.severity === "critical";

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        isCritical && "border-red-500/30 bg-red-500/5",
        metrics.severity === "warning" && "border-yellow-500/30 bg-yellow-500/5",
        metrics.severity === "ok" && "border-border bg-card",
      )}
      data-testid="tauri-command-row"
      data-command={metrics.command}
      data-severity={metrics.severity}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-xs font-medium">{metrics.command}</span>
        <Badge variant="outline" className={cn("text-[10px]", severityConfig.className)}>
          <SeverityIcon className="mr-1 size-3" />
          {severityConfig.label}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div>
          <div className="text-muted-foreground">P99</div>
          <div
            className={cn(
              "font-semibold tabular-nums",
              isCritical && "text-red-600",
              metrics.severity === "warning" && "text-yellow-600",
            )}
            data-testid="p99-value"
          >
            {formatMs(metrics.p99Ms)}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">P95</div>
          <div className="font-medium tabular-nums">{formatMs(metrics.p95Ms)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">平均</div>
          <div className="font-medium tabular-nums">{formatMs(metrics.avgMs)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">样本</div>
          <div className="font-medium tabular-nums">{metrics.count}</div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>
          成功率: <span className="font-medium tabular-nums">{successPercent}%</span>
        </span>
        <span>
          最小 {formatMs(metrics.minMs)} / 最大 {formatMs(metrics.maxMs)}
        </span>
      </div>
    </div>
  );
});

/**
 * 阈值说明卡片
 */
const ThresholdInfo = memo(function ThresholdInfo() {
  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-xs">
      <div className="mb-1 font-medium">阈值说明</div>
      <div className="grid grid-cols-2 gap-2 text-muted-foreground">
        <div className="flex items-center gap-2">
          <PiCheckCircle className="size-3 text-green-600" />
          <span>
            正常: P99 &lt; {TAURI_P99_WARNING_THRESHOLD_MS}ms
          </span>
        </div>
        <div className="flex items-center gap-2">
          <PiWarning className="size-3 text-yellow-600" />
          <span>
            警告: {TAURI_P99_WARNING_THRESHOLD_MS}ms ≤ P99 &lt; {TAURI_P99_CRITICAL_THRESHOLD_MS}ms
          </span>
        </div>
        <div className="flex items-center gap-2">
          <PiXCircle className="size-3 text-red-600" />
          <span>
            严重: P99 ≥ {TAURI_P99_CRITICAL_THRESHOLD_MS}ms
          </span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground/70">
          <span>采样窗口: 最近 1000 次</span>
        </div>
      </div>
    </div>
  );
});

/**
 * Tauri 命令 P99 监控面板
 */
export const TauriCommandMetricsPanel = memo(function TauriCommandMetricsPanel() {
  const allMetrics = useAllTauriCommandMetrics();
  const [sortField, setSortField] = useState<SortField>("severity");
  const [sortAsc, setSortAsc] = useState(false);
  const [filterTab, setFilterTab] = useState<"all" | "critical" | "warning" | "ok">("all");

  // 按筛选条件过滤
  const filteredMetrics = useMemo(() => {
    if (filterTab === "all") return allMetrics;
    return allMetrics.filter((m) => m.severity === filterTab);
  }, [allMetrics, filterTab]);

  // 排序
  const sortedMetrics = useMemo(() => {
    const sorted = [...filteredMetrics];
    sorted.sort((a, b) => {
      let diff = 0;
      switch (sortField) {
        case "p99Ms":
          diff = a.p99Ms - b.p99Ms;
          break;
        case "p95Ms":
          diff = a.p95Ms - b.p95Ms;
          break;
        case "avgMs":
          diff = a.avgMs - b.avgMs;
          break;
        case "count":
          diff = a.count - b.count;
          break;
        case "severity":
          diff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
          break;
      }
      return sortAsc ? diff : -diff;
    });
    return sorted;
  }, [filteredMetrics, sortField, sortAsc]);

  // 各严重程度的数量统计
  const stats = useMemo(() => {
    const result = { all: allMetrics.length, critical: 0, warning: 0, ok: 0 };
    for (const m of allMetrics) {
      result[m.severity]++;
    }
    return result;
  }, [allMetrics]);

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortAsc((v) => !v);
      } else {
        setSortField(field);
        setSortAsc(false);
      }
    },
    [sortField],
  );

  const handleClear = useCallback(() => {
    clearAllTauriCommandMetrics();
    toastManager.add({
      title: "已清空",
      description: "Tauri 命令 P99 采样数据已重置",
      type: "info",
    });
  }, []);

  const handleExport = useCallback(() => {
    const snapshot = {
      exportedAt: new Date().toISOString(),
      thresholds: {
        warning: TAURI_P99_WARNING_THRESHOLD_MS,
        critical: TAURI_P99_CRITICAL_THRESHOLD_MS,
      },
      commands: sortedMetrics,
    };
    const json = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tauri-p99-snapshot-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toastManager.add({
      title: "已导出",
      description: "P99 快照已下载到本地",
      type: "success",
    });
  }, [sortedMetrics]);

  return (
    <Card data-testid="tauri-command-metrics-panel">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Tauri 命令 P99 监控</CardTitle>
            <CardDescription>
              实时统计 Tauri invoke 命令的 P50/P95/P99 耗时，超过阈值时高亮告警
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={allMetrics.length === 0}
              data-testid="export-snapshot"
            >
              <PiDownload className="mr-1 size-3" />
              导出
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              disabled={allMetrics.length === 0}
              data-testid="clear-metrics"
            >
              <PiTrash className="mr-1 size-3" />
              清空
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <ThresholdInfo />

        <Tabs value={filterTab} onValueChange={(v) => setFilterTab(v as typeof filterTab)}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all" data-testid="tab-all">
              全部 ({stats.all})
            </TabsTrigger>
            <TabsTrigger value="critical" data-testid="tab-critical">
              严重 ({stats.critical})
            </TabsTrigger>
            <TabsTrigger value="warning" data-testid="tab-warning">
              警告 ({stats.warning})
            </TabsTrigger>
            <TabsTrigger value="ok" data-testid="tab-ok">
              正常 ({stats.ok})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={filterTab} className="mt-3 space-y-2">
            {sortedMetrics.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                {allMetrics.length === 0
                  ? "暂无 Tauri 命令采样数据。开始使用应用后会自动记录。"
                  : `当前筛选下没有 ${filterTab === "all" ? "" : filterTab} 的命令`}
              </div>
            ) : (
              <ScrollArea className="h-[400px] pr-3">
                <div className="space-y-2">
                  {sortedMetrics.map((m) => (
                    <CommandRow key={m.command} metrics={m} />
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>

        {allMetrics.length > 0 && (
          <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
            <span>排序：</span>
            <div className="flex items-center gap-1">
              {(["severity", "p99Ms", "p95Ms", "avgMs", "count"] as const).map((field) => (
                <Button
                  key={field}
                  variant={sortField === field ? "default" : "ghost"}
                  size="sm"
                  onClick={() => handleSort(field)}
                  className="h-7 px-2 text-xs"
                  data-testid={`sort-${field}`}
                >
                  {field === "severity" && "严重度"}
                  {field === "p99Ms" && "P99"}
                  {field === "p95Ms" && "P95"}
                  {field === "avgMs" && "平均"}
                  {field === "count" && "样本"}
                  {sortField === field &&
                    (sortAsc ? (
                      <PiSortAscending className="ml-1 size-3" />
                    ) : (
                      <PiSortDescending className="ml-1 size-3" />
                    ))}
                </Button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSortAsc((v) => !v)}
              className="h-7 px-2"
              data-testid="toggle-sort-direction"
            >
              <PiArrowClockwise className="size-3" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
