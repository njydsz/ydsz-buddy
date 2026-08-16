/**
 * @file DataSandboxPanel.tsx
 * @description 数据分析沙箱面板组件
 *
 * 功能：
 * - CSV/JSON 数据文件加载与分析
 * - 数据转换（过滤、排序、聚合、选择列、限制行数）
 * - 图表生成（柱状/折线/饼图/散点/面积）
 * - 图表预览与导出 SVG
 */

import { memo, useCallback, useState } from "react";
import {
  PiChartBar,
  PiChartLine,
  PiChartPie,
  PiChartScatter,
  // PiChartArea,
  // PiUpload,
  PiPlay,
  PiDownload,
  PiFunnel,
  // PiArrowsDownUp,
  PiStack,
  PiEye,
  PiX,
  // PiCode,
} from "react-icons/pi";
import { ChevronDownIcon, ChevronUpIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import { DataChartView, ChartData } from "./DataChartView";

// ============================================================================
// Tauri Invoke 动态加载
// ============================================================================

interface TauriInvokeModule {
  invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

let tauriModulePromise: Promise<TauriInvokeModule | null> | null = null;

async function loadTauriInvoke(): Promise<TauriInvokeModule | null> {
  if (tauriModulePromise) return tauriModulePromise;
  tauriModulePromise = (async () => {
    try {
      const mod = await import("@tauri-apps/api/core");
      return mod as TauriInvokeModule;
    } catch {
      return null;
    }
  })();
  return tauriModulePromise;
}

// ============================================================================
// 类型定义
// ============================================================================

type ChartType = "bar" | "line" | "pie" | "scatter" | "area";

interface ColumnStatsDto {
  name: string;
  column_type: string;
  count: number;
  null_count: number;
  unique_count: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
  std_dev: number | null;
  mode: string | null;
}

interface CsvAnalysisDto {
  source: string;
  row_count: number;
  column_count: number;
  columns: ColumnStatsDto[];
  preview: Array<Record<string, string>>;
}

interface TransformOpDto {
  op: string;
  column?: string;
  operator?: string;
  value?: string;
  descending?: boolean;
  group_by?: string;
  agg_column?: string;
  agg_func?: string;
  columns?: string[];
  count?: number;
}

interface TransformResultDto {
  row_count: number;
  rows: Array<Record<string, unknown>>;
}

interface ChartSpecDto {
  chart_type: string;
  title: string;
  x_column: string;
  y_column: string;
  group_column: string | null;
  agg_func: string | null;
}

// ============================================================================
// 配置常量
// ============================================================================

const CHART_TYPES: Array<{ value: ChartType; label: string; icon: typeof PiChartBar }> = [
  { value: "bar", label: "柱状图", icon: PiChartBar },
  { value: "line", label: "折线图", icon: PiChartLine },
  { value: "pie", label: "饼图", icon: PiChartPie },
  { value: "scatter", label: "散点图", icon: PiChartScatter },
  // { value: "area", label: "面积图", icon: PiChartArea },
];

const AGG_FUNCS = [
  { value: "sum", label: "求和" },
  { value: "avg", label: "平均值" },
  { value: "min", label: "最小值" },
  { value: "max", label: "最大值" },
  { value: "count", label: "计数" },
];

// ============================================================================
// DataSandboxPanel 组件
// ============================================================================

function DataSandboxPanelInner() {
  // 状态
  const [expanded, setExpanded] = useState(true);
  const [csvContent, setCsvContent] = useState("");
  // const [csvSource, setCsvSource] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<CsvAnalysisDto | null>(null);
  const [transformedData, setTransformedData] = useState<TransformResultDto | null>(null);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 图表配置
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [chartTitle, setChartTitle] = useState("");
  const [xColumn, setXColumn] = useState("");
  const [yColumn, setYColumn] = useState("");
  const [groupColumn, setGroupColumn] = useState("");
  const [aggFunc, setAggFunc] = useState("");

  // 转换操作配置
  const [transformOps, setTransformOps] = useState<TransformOpDto[]>([]);

  // 分析 CSV 内容
  const handleAnalyze = useCallback(async () => {
    if (!csvContent.trim()) return;
    const tauri = await loadTauriInvoke();
    if (!tauri) {
      setError("Tauri API 不可用");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await tauri.invoke<CsvAnalysisDto>("sandbox_analyze_csv_content", {
        content: csvContent,
      });
      setAnalysis(result);
      // setCsvSource(result.source);
      setTransformedData(null);
      setChartData(null);
      // 自动选择默认列
      const numericColumns = result.columns.filter((c) =>
        c.column_type === "integer" || c.column_type === "float"
      );
      if (result.columns.length > 0 && !xColumn) {
        setXColumn(result.columns[0].name);
      }
      if (numericColumns.length > 0 && !yColumn) {
        setYColumn(numericColumns[0].name);
      }
      if (!chartTitle) {
        setChartTitle("数据可视化");
      }
    } catch (e) {
      setError(String(e));
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, [csvContent, xColumn, yColumn, chartTitle]);

  // 应用转换
  const handleTransform = useCallback(async () => {
    if (!csvContent.trim() || transformOps.length === 0) return;
    const tauri = await loadTauriInvoke();
    if (!tauri) {
      setError("Tauri API 不可用");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await tauri.invoke<TransformResultDto>("sandbox_transform_csv", {
        content: csvContent,
        ops: transformOps,
      });
      setTransformedData(result);
      setChartData(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [csvContent, transformOps]);

  // 生成图表
  const handleGenerateChart = useCallback(async () => {
    const contentToUse = transformedData
      ? transformedData.rows.map((r) => Object.values(r).join(",")).join("\n")
      : csvContent;

    const headers = analysis?.columns.map((c) => c.name).join(",") || "";
    const fullContent = headers + "\n" + contentToUse;

    const tauri = await loadTauriInvoke();
    if (!tauri) {
      setError("Tauri API 不可用");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const spec: ChartSpecDto = {
        chart_type: chartType,
        title: chartTitle || "数据可视化",
        x_column: xColumn,
        y_column: yColumn,
        group_column: groupColumn || null,
        agg_func: aggFunc || null,
      };
      const result = await tauri.invoke<ChartData>("sandbox_generate_chart", {
        content: fullContent,
        spec,
      });
      setChartData(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [csvContent, transformedData, analysis, chartType, chartTitle, xColumn, yColumn, groupColumn, aggFunc]);

  // 导出图表 SVG
  const handleExportSvg = useCallback(() => {
    const svgEl = document.querySelector('[data-chart-id="main"]') as SVGSVGElement;
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([svgData], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${chartTitle || "chart"}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [chartTitle]);

  // 添加转换操作
  const addTransformOp = useCallback((op: TransformOpDto) => {
    setTransformOps((prev) => [...prev, op]);
  }, []);

  // 删除转换操作
  const removeTransformOp = useCallback((idx: number) => {
    setTransformOps((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  return (
    <div className="rounded-lg border border-border/60 bg-card/80 backdrop-blur shadow-sm">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <PiStack className="text-lg text-purple-500" />
          <span className="text-sm font-semibold text-foreground">
            Data Sandbox
          </span>
          {analysis && (
            <span className="text-xs px-1.5 py-0.5 rounded-md bg-purple-500/15 text-purple-500">
              {analysis.row_count} 行 × {analysis.column_count} 列
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUpIcon className="text-muted-foreground" />
        ) : (
          <ChevronDownIcon className="text-muted-foreground" />
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* CSV 内容输入 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-foreground">
                CSV 数据
              </label>
              <button
                onClick={handleAnalyze}
                disabled={loading || !csvContent.trim()}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50"
              >
                <PiEye />
                分析
              </button>
            </div>
            <textarea
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
              placeholder="粘贴 CSV 数据（含表头），例如：
城市,销售额
北京,1000
上海,1500
深圳,1200"
              rows={4}
              className="w-full px-3 py-2 text-xs font-mono rounded-md bg-background/60 border border-border/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/40 resize-y"
            />
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="px-3 py-2 text-xs text-red-500 bg-red-500/10 rounded-md">
              {error}
            </div>
          )}

          {/* 数据预览 */}
          {analysis && (
            <div>
              <label className="text-xs font-medium text-foreground mb-2 block">
                列统计
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {analysis.columns.map((col) => (
                  <div key={col.name} className="p-2 rounded-md bg-muted/50">
                    <div className="font-medium text-foreground">{col.name}</div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="capitalize">{col.column_type}</span>
                      <span>•</span>
                      <span>非空: {col.count}</span>
                      <span>•</span>
                      <span>唯一: {col.unique_count}</span>
                    </div>
                    {col.min !== null && (
                      <div className="text-muted-foreground">
                        min: {col.min?.toFixed(2)} / max: {col.max?.toFixed(2)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 转换操作 */}
          {analysis && (
            <div>
              <label className="text-xs font-medium text-foreground mb-2 block">
                数据转换
              </label>
              <div className="flex gap-2 mb-2">
                <select
                  className="px-2 py-1.5 text-xs rounded-md bg-background border border-border/40 text-foreground"
                  onChange={(e) => {
                    const op = e.target.value;
                    if (op === "filter") {
                      const column = analysis.columns[0].name;
                      addTransformOp({ op: "filter", column, operator: "eq", value: "" });
                    } else if (op === "sort") {
                      const column = analysis.columns[0].name;
                      addTransformOp({ op: "sort", column, descending: false });
                    } else if (op === "aggregate") {
                      const numericCol = analysis.columns.find((c) =>
                        c.column_type === "integer" || c.column_type === "float"
                      );
                      addTransformOp({
                        op: "aggregate",
                        group_by: analysis.columns[0].name,
                        agg_column: numericCol?.name || analysis.columns[0].name,
                        agg_func: "sum",
                      });
                    }
                    e.target.value = "";
                  }}
                >
                  <option value="">+ 添加操作...</option>
                  <option value="filter">过滤行</option>
                  <option value="sort">排序</option>
                  <option value="aggregate">聚合</option>
                </select>
                <button
                  onClick={handleTransform}
                  disabled={transformOps.length === 0}
                  className="flex items-center gap-1 px-2 py-1.5 text-xs rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
                >
                  <PiFunnel />
                  应用转换
                </button>
              </div>
              {transformOps.length > 0 && (
                <div className="space-y-1">
                  {transformOps.map((op, idx) => (
                    <div key={idx} className="flex items-center gap-2 px-2 py-1 text-xs rounded-md bg-muted/50">
                      <code className="bg-background px-1 rounded">{op.op}</code>
                      {op.column && <span>{op.column}</span>}
                      {op.operator && <span>{op.operator} {op.value}</span>}
                      {op.descending !== undefined && <span>{op.descending ? "↓" : "↑"}</span>}
                      {op.agg_column && <span>{op.agg_func}({op.agg_column}) by {op.group_by}</span>}
                      <button
                        onClick={() => removeTransformOp(idx)}
                        className="ml-auto text-muted-foreground hover:text-foreground"
                      >
                        <PiX />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {transformedData && (
                <div className="text-xs text-muted-foreground mt-2">
                  转换后: {transformedData.row_count} 行
                </div>
              )}
            </div>
          )}

          {/* 图表配置 */}
          {analysis && (
            <div className="space-y-3">
              <label className="text-xs font-medium text-foreground block">
                图表配置
              </label>

              {/* 图表类型 */}
              <div className="flex gap-1">
                {CHART_TYPES.map((ct) => {
                  const Icon = ct.icon;
                  const active = chartType === ct.value;
                  return (
                    <button
                      key={ct.value}
                      onClick={() => setChartType(ct.value)}
                      className={cn(
                        "flex items-center gap-1 px-2 py-1.5 text-xs rounded-md border transition-colors",
                        active
                          ? "border-purple-500/50 bg-purple-500/10 text-purple-500"
                          : "border-border/40 text-muted-foreground hover:bg-muted/50",
                      )}
                    >
                      <Icon />
                      {ct.label}
                    </button>
                  );
                })}
              </div>

              {/* 列选择 */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">X 轴（类别）</label>
                  <select
                    value={xColumn}
                    onChange={(e) => setXColumn(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs rounded-md bg-background border border-border/40 text-foreground"
                  >
                    {analysis.columns.map((col) => (
                      <option key={col.name} value={col.name}>
                        {col.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Y 轴（数值）</label>
                  <select
                    value={yColumn}
                    onChange={(e) => setYColumn(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs rounded-md bg-background border border-border/40 text-foreground"
                  >
                    {analysis.columns.map((col) => (
                      <option key={col.name} value={col.name}>
                        {col.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 分组与聚合 */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">分组列（可选）</label>
                  <select
                    value={groupColumn}
                    onChange={(e) => setGroupColumn(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs rounded-md bg-background border border-border/40 text-foreground"
                  >
                    <option value="">无</option>
                    {analysis.columns.map((col) => (
                      <option key={col.name} value={col.name}>
                        {col.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">聚合函数</label>
                  <select
                    value={aggFunc}
                    onChange={(e) => setAggFunc(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs rounded-md bg-background border border-border/40 text-foreground"
                  >
                    <option value="">默认</option>
                    {AGG_FUNCS.map((af) => (
                      <option key={af.value} value={af.value}>
                        {af.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 标题 */}
              <input
                type="text"
                value={chartTitle}
                onChange={(e) => setChartTitle(e.target.value)}
                placeholder="图表标题"
                className="w-full px-3 py-1.5 text-xs rounded-md bg-background/60 border border-border/40 text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/40"
              />

              {/* 生成按钮 */}
              <div className="flex gap-2">
                <button
                  onClick={handleGenerateChart}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs rounded-md bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50"
                >
                  <PiPlay />
                  生成图表
                </button>
                {chartData && (
                  <button
                    onClick={handleExportSvg}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-border text-foreground hover:bg-muted"
                  >
                    <PiDownload />
                    导出 SVG
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 图表预览 */}
          {chartData && (
            <div className="mt-4 p-4 rounded-md bg-background/50 border border-border/30">
              <DataChartView data={chartData} width={600} height={350} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const DataSandboxPanel = memo(DataSandboxPanelInner);