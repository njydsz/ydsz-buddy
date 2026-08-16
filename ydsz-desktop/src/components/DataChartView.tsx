/**
 * @file DataChartView.tsx
 * @description 纯 SVG 图表渲染组件（无外部依赖）
 *
 * 支持的图表类型：
 * - 柱状图 (bar): 单系列/多系列柱状图
 * - 折线图 (line): 单系列/多系列折线图
 * - 面积图 (area): 带填充的折线图
 * - 饼图 (pie): 环形饼图
 * - 散点图 (scatter): 散点分布图
 */

import { memo } from "react";

// ============================================================================
// 类型定义
// ============================================================================

export type ChartType = "bar" | "line" | "pie" | "scatter" | "area";

export interface ChartPoint {
  x: string;
  y: number;
}

export interface ChartSeries {
  name: string;
  points: ChartPoint[];
}

export interface ChartData {
  chart_type: ChartType;
  title: string;
  x_label: string;
  y_label: string;
  series: ChartSeries[];
  categories: string[];
  y_max: number;
  y_min: number;
}

// ============================================================================
// 颜色调色板（Tailwind 友好的配色）
// ============================================================================

const COLORS = [
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#06b6d4", // cyan-500
  "#f97316", // orange-500
];

// ============================================================================
// 辅助函数
// ============================================================================

const getColor = (index: number) => COLORS[index % COLORS.length];

const formatNumber = (n: number) => {
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toFixed(1);
};

// ============================================================================
// 子组件：柱状图
// ============================================================================

const BarChart = memo(({ data, width, height }: { data: ChartData; width: number; height: number }) => {
  const padding = { top: 40, right: 40, bottom: 60, left: 80 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const { series, categories, y_max, y_min } = data;
  const numCategories = categories.length;
  const barWidth = Math.max(2, (chartWidth / numCategories) * 0.7);
  // const groupGap = Math.max(2, (chartWidth / numCategories) * 0.15);

  const yScale = (val: number) => {
    const range = y_max - y_min || 1;
    return chartHeight - ((val - y_min) / range) * chartHeight;
  };

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* 标题 */}
      <text
        x={width / 2}
        y={20}
        textAnchor="middle"
        className="text-sm font-semibold fill-foreground"
      >
        {data.title}
      </text>

      {/* Y 轴网格线 */}
      {Array.from({ length: 5 }).map((_, i) => {
        const val = y_min + ((y_max - y_min) * i) / 4;
        const y = padding.top + yScale(val);
        return (
          <g key={`grid-${i}`}>
            <line
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke="currentColor"
              strokeWidth={1}
              className="stroke-border/30"
            />
            <text
              x={padding.left - 10}
              y={y + 4}
              textAnchor="end"
              className="text-[10px] fill-muted-foreground"
            >
              {formatNumber(val)}
            </text>
          </g>
        );
      })}

      {/* X 轴标签 */}
      {categories.map((cat, i) => {
        const x = padding.left + (i * chartWidth) / numCategories + chartWidth / numCategories / 2;
        return (
          <text
            key={`x-label-${i}`}
            x={x}
            y={height - padding.bottom + 20}
            textAnchor="middle"
            className="text-[10px] fill-muted-foreground"
          >
            {cat.length > 10 ? `${cat.slice(0, 10)}...` : cat}
          </text>
        );
      })}

      {/* 柱子 */}
      {series.map((s, seriesIdx) => {
        const color = getColor(seriesIdx);
        return s.points.map((point, pointIdx) => {
          const catIdx = categories.indexOf(point.x);
          if (catIdx === -1) return null;

          const groupWidth = chartWidth / numCategories;
          const barCount = series.length;
          const barOffset = ((pointIdx - (barCount - 1) / 2) * barWidth) / barCount;

          const x = padding.left + catIdx * groupWidth + groupWidth / 2 + barOffset;
          const barH = Math.max(1, yScale(y_min) - yScale(point.y));
          const y = padding.top + yScale(point.y);

          return (
            <rect
              key={`${seriesIdx}-${pointIdx}`}
              x={x - barWidth / 2}
              y={y}
              width={barWidth}
              height={barH}
              fill={color}
              opacity={0.85}
              rx={2}
            />
          );
        });
      })}

      {/* 图例 */}
      {series.length > 1 && (
        <g transform={`translate(${width - padding.right - 10}, ${padding.top + 10})`}>
          {series.map((s, i) => {
            const y = i * 20;
            return (
              <g key={i}>
                <rect x={0} y={y - 8} width={12} height={12} fill={getColor(i)} rx={2} />
                <text x={18} y={y + 2} className="text-[10px] fill-foreground">
                  {s.name}
                </text>
              </g>
            );
          })}
        </g>
      )}

      {/* 轴标签 */}
      <text
        x={width / 2}
        y={height - 10}
        textAnchor="middle"
        className="text-[10px] fill-muted-foreground"
      >
        {data.x_label}
      </text>
      <text
        x={20}
        y={height / 2}
        textAnchor="middle"
        transform={`rotate(-90, ${20}, ${height / 2})`}
        className="text-[10px] fill-muted-foreground"
      >
        {data.y_label}
      </text>
    </svg>
  );
});
BarChart.displayName = "BarChart";

// ============================================================================
// 子组件：折线图 & 面积图
// ============================================================================

const LineAreaChart = memo(({ data, width, height, isArea }: { data: ChartData; width: number; height: number; isArea: boolean }) => {
  const padding = { top: 40, right: 40, bottom: 60, left: 80 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const { series, categories, y_max, y_min } = data;
  const numCategories = categories.length;

  const yScale = (val: number) => {
    const range = y_max - y_min || 1;
    return chartHeight - ((val - y_min) / range) * chartHeight;
  };

  const xScale = (idx: number) => (idx * chartWidth) / (numCategories - 1 || 1);

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* 标题 */}
      <text
        x={width / 2}
        y={20}
        textAnchor="middle"
        className="text-sm font-semibold fill-foreground"
      >
        {data.title}
      </text>

      {/* Y 轴网格线 */}
      {Array.from({ length: 5 }).map((_, i) => {
        const val = y_min + ((y_max - y_min) * i) / 4;
        const y = padding.top + yScale(val);
        return (
          <g key={`grid-${i}`}>
            <line
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke="currentColor"
              strokeWidth={1}
              className="stroke-border/30"
            />
            <text
              x={padding.left - 10}
              y={y + 4}
              textAnchor="end"
              className="text-[10px] fill-muted-foreground"
            >
              {formatNumber(val)}
            </text>
          </g>
        );
      })}

      {/* X 轴标签 */}
      {categories.map((cat, i) => {
        const x = padding.left + xScale(i);
        return (
          <text
            key={`x-label-${i}`}
            x={x}
            y={height - padding.bottom + 20}
            textAnchor="middle"
            className="text-[10px] fill-muted-foreground"
          >
            {cat.length > 10 ? `${cat.slice(0, 10)}...` : cat}
          </text>
        );
      })}

      {/* 数据线 */}
      {series.map((s, seriesIdx) => {
        const color = getColor(seriesIdx);
        const pathData = s.points
          .map((point, pointIdx) => {
            const catIdx = categories.indexOf(point.x);
            if (catIdx === -1) return "";
            const x = padding.left + xScale(catIdx);
            const y = padding.top + yScale(point.y);
            return `${pointIdx === 0 ? "M" : "L"} ${x} ${y}`;
          })
          .join(" ");

        // 面积图的填充区域
        const areaPath = `${pathData} L ${padding.left + xScale(s.points.length - 1)} ${padding.top + chartHeight} L ${padding.left} ${padding.top + chartHeight} Z`;

        return (
          <g key={seriesIdx}>
            {/* 面积填充 */}
            {isArea && <path d={areaPath} fill={color} opacity={0.15} />}
            {/* 折线 */}
            <path
              d={pathData}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* 数据点 */}
            {s.points.map((point, pointIdx) => {
              const catIdx = categories.indexOf(point.x);
              if (catIdx === -1) return null;
              const x = padding.left + xScale(catIdx);
              const y = padding.top + yScale(point.y);
              return (
                <circle key={pointIdx} cx={x} cy={y} r={4} fill={color} stroke="white" strokeWidth={2} />
              );
            })}
          </g>
        );
      })}

      {/* 图例 */}
      {series.length > 1 && (
        <g transform={`translate(${width - padding.right - 10}, ${padding.top + 10})`}>
          {series.map((s, i) => {
            const y = i * 20;
            const color = getColor(i);
            return (
              <g key={i}>
                <line x1={0} y1={y - 2} x2={16} y2={y - 2} stroke={color} strokeWidth={2} />
                <circle cx={8} cy={y - 2} r={3} fill={color} stroke="white" strokeWidth={1} />
                <text x={20} y={y + 2} className="text-[10px] fill-foreground">
                  {s.name}
                </text>
              </g>
            );
          })}
        </g>
      )}

      {/* 轴标签 */}
      <text
        x={width / 2}
        y={height - 10}
        textAnchor="middle"
        className="text-[10px] fill-muted-foreground"
      >
        {data.x_label}
      </text>
      <text
        x={20}
        y={height / 2}
        textAnchor="middle"
        transform={`rotate(-90, ${20}, ${height / 2})`}
        className="text-[10px] fill-muted-foreground"
      >
        {data.y_label}
      </text>
    </svg>
  );
});
LineAreaChart.displayName = "LineAreaChart";

// ============================================================================
// 子组件：饼图
// ============================================================================

const PieChart = memo(({ data, width, height }: { data: ChartData; width: number; height: number }) => {
  const padding = { top: 40, right: 40, bottom: 60, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const { series } = data;
  const singleSeries = series[0]?.points || [];
  const total = singleSeries.reduce((sum, p) => sum + p.y, 0);

  const cx = padding.left + chartWidth / 2;
  const cy = padding.top + chartHeight / 2;
  const radius = Math.min(chartWidth, chartHeight) / 2 - 20;

  let startAngle = 0;

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* 标题 */}
      <text
        x={width / 2}
        y={20}
        textAnchor="middle"
        className="text-sm font-semibold fill-foreground"
      >
        {data.title}
      </text>

      {/* 饼图扇区 */}
      {singleSeries.map((point, i) => {
        const sliceAngle = (point.y / total) * 2 * Math.PI;
        const endAngle = startAngle + sliceAngle;

        const x1 = cx + radius * Math.cos(startAngle);
        const y1 = cy + radius * Math.sin(startAngle);
        const x2 = cx + radius * Math.cos(endAngle);
        const y2 = cy + radius * Math.sin(endAngle);

        const largeArcFlag = sliceAngle > Math.PI ? 1 : 0;

        const pathData = [
          `M ${cx} ${cy}`,
          `L ${x1} ${y1}`,
          `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
          "Z",
        ].join(" ");

        startAngle = endAngle;

        const color = getColor(i);
        const midAngle = startAngle - sliceAngle / 2;
        const labelRadius = radius * 0.7;
        const lx = cx + labelRadius * Math.cos(midAngle);
        const ly = cy + labelRadius * Math.sin(midAngle);
        const percentage = ((point.y / total) * 100).toFixed(1);

        return (
          <g key={i}>
            <path d={pathData} fill={color} opacity={0.9} stroke="white" strokeWidth={2} />
            {/* 百分比标签 */}
            {point.y / total > 0.05 && (
              <text
                x={lx}
                y={ly + 4}
                textAnchor="middle"
                className="text-[10px] fill-white font-medium"
                pointerEvents="none"
              >
                {percentage}%
              </text>
            )}
          </g>
        );
      })}

      {/* 图例 */}
      {singleSeries.length > 0 && (
        <g transform={`translate(${width - padding.right - 10}, ${padding.top + 10})`}>
          {singleSeries.map((point, i) => {
            const y = i * 20;
            const color = getColor(i);
            const percentage = ((point.y / total) * 100).toFixed(1);
            return (
              <g key={i}>
                <rect x={0} y={y - 8} width={12} height={12} fill={color} rx={2} />
                <text x={18} y={y + 2} className="text-[10px] fill-foreground">
                  {point.x.length > 12 ? `${point.x.slice(0, 12)}...` : point.x} ({percentage}%)
                </text>
              </g>
            );
          })}
        </g>
      )}

      {/* 总计 */}
      <text
        x={cx}
        y={cy + 5}
        textAnchor="middle"
        className="text-lg font-bold fill-foreground"
      >
        {formatNumber(total)}
      </text>
      <text
        x={cx}
        y={cy + 20}
        textAnchor="middle"
        className="text-[10px] fill-muted-foreground"
      >
        总计
      </text>
    </svg>
  );
});
PieChart.displayName = "PieChart";

// ============================================================================
// 子组件：散点图
// ============================================================================

const ScatterChart = memo(({ data, width, height }: { data: ChartData; width: number; height: number }) => {
  const padding = { top: 40, right: 40, bottom: 60, left: 80 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const { series, categories, y_max, y_min } = data;
  const numCategories = categories.length;

  const yScale = (val: number) => {
    const range = y_max - y_min || 1;
    return chartHeight - ((val - y_min) / range) * chartHeight;
  };

  const xScale = (idx: number) => (idx * chartWidth) / (numCategories - 1 || 1);

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* 标题 */}
      <text
        x={width / 2}
        y={20}
        textAnchor="middle"
        className="text-sm font-semibold fill-foreground"
      >
        {data.title}
      </text>

      {/* Y 轴网格线 */}
      {Array.from({ length: 5 }).map((_, i) => {
        const val = y_min + ((y_max - y_min) * i) / 4;
        const y = padding.top + yScale(val);
        return (
          <g key={`grid-${i}`}>
            <line
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke="currentColor"
              strokeWidth={1}
              className="stroke-border/30"
            />
            <text
              x={padding.left - 10}
              y={y + 4}
              textAnchor="end"
              className="text-[10px] fill-muted-foreground"
            >
              {formatNumber(val)}
            </text>
          </g>
        );
      })}

      {/* X 轴标签 */}
      {categories.map((cat, i) => {
        const x = padding.left + xScale(i);
        return (
          <text
            key={`x-label-${i}`}
            x={x}
            y={height - padding.bottom + 20}
            textAnchor="middle"
            className="text-[10px] fill-muted-foreground"
          >
            {cat.length > 10 ? `${cat.slice(0, 10)}...` : cat}
          </text>
        );
      })}

      {/* 散点 */}
      {series.map((s, seriesIdx) => {
        const color = getColor(seriesIdx);
        return s.points.map((point, pointIdx) => {
          const catIdx = categories.indexOf(point.x);
          if (catIdx === -1) return null;
          const x = padding.left + xScale(catIdx);
          const y = padding.top + yScale(point.y);
          return (
            <circle
              key={`${seriesIdx}-${pointIdx}`}
              cx={x}
              cy={y}
              r={6}
              fill={color}
              opacity={0.8}
              stroke="white"
              strokeWidth={2}
            />
          );
        });
      })}

      {/* 图例 */}
      {series.length > 1 && (
        <g transform={`translate(${width - padding.right - 10}, ${padding.top + 10})`}>
          {series.map((s, i) => {
            const y = i * 20;
            return (
              <g key={i}>
                <circle cx={6} cy={y - 2} r={5} fill={getColor(i)} />
                <text x={16} y={y + 2} className="text-[10px] fill-foreground">
                  {s.name}
                </text>
              </g>
            );
          })}
        </g>
      )}

      {/* 轴标签 */}
      <text
        x={width / 2}
        y={height - 10}
        textAnchor="middle"
        className="text-[10px] fill-muted-foreground"
      >
        {data.x_label}
      </text>
      <text
        x={20}
        y={height / 2}
        textAnchor="middle"
        transform={`rotate(-90, ${20}, ${height / 2})`}
        className="text-[10px] fill-muted-foreground"
      >
        {data.y_label}
      </text>
    </svg>
  );
});
ScatterChart.displayName = "ScatterChart";

// ============================================================================
// 主组件：DataChartView
// ============================================================================

interface DataChartViewProps {
  data: ChartData;
  width?: number;
  height?: number;
  className?: string;
}

const DataChartViewInner = ({ data, width = 600, height = 400, className }: DataChartViewProps) => {
  const { chart_type } = data;

  const renderChart = () => {
    switch (chart_type) {
      case "bar":
        return <BarChart data={data} width={width} height={height} />;
      case "line":
        return <LineAreaChart data={data} width={width} height={height} isArea={false} />;
      case "area":
        return <LineAreaChart data={data} width={width} height={height} isArea={true} />;
      case "pie":
        return <PieChart data={data} width={width} height={height} />;
      case "scatter":
        return <ScatterChart data={data} width={width} height={height} />;
      default:
        return <div>不支持的图表类型: {chart_type}</div>;
    }
  };

  return (
    <div className={className} style={{ width: `${width}px`, height: `${height}px` }}>
      {renderChart()}
    </div>
  );
};

export const DataChartView = memo(DataChartViewInner);