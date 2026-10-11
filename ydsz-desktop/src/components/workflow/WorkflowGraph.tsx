/**
 * @file WorkflowGraph
 * @description DAG 工作流可视化组件
 *
 * 每个步骤节点显示：名称、状态、耗时、重试次数。
 * 支持点击节点查看详情（输入/输出预览面板）。
 * 实时显示运行中节点的进度动画。
 */

import { useMemo } from "react";
import type { WorkflowStep, StepResult, StepStatus } from "../../workflowsStore";
import {
  STEP_STATUS_LABELS,
  STEP_TYPE_LABELS,
} from "../../contracts/workflow";

// =====================================================================
// Types
// =====================================================================

interface WorkflowGraphProps {
  steps: WorkflowStep[];
  stepResults: Record<string, StepResult>;
  currentSteps?: string[];
  onNodeClick?: (stepId: string) => void;
  selectedNodeId?: string;
}

interface LayoutNode {
  id: string;
  name: string;
  type: string;
  status: StepStatus;
  level: number;
  indexInLevel: number;
  durationMs?: number;
  error?: string;
  retries?: number;
  dependsOn: string[];
  input?: unknown;
  output?: unknown;
}

// =====================================================================
// Layout Engine (simplified: position by topological level)
// =====================================================================

function computeLayout(
  steps: WorkflowStep[],
  results: Record<string, StepResult>,
): LayoutNode[] {
  // 1. Compute level (depth from entry nodes)
  const levelMap = new Map<string, number>();
  const idSet = new Set(steps.map((s) => s.id));

  const computeLevel = (stepId: string, visited: Set<string>): number => {
    if (levelMap.has(stepId)) return levelMap.get(stepId)!;
    if (visited.has(stepId)) return 0; // cycle protection
    visited.add(stepId);

    const step = steps.find((s) => s.id === stepId);
    if (!step) return 0;

    const deps = (step.depends_on ?? []).filter((d) => idSet.has(d));
    if (deps.length === 0) {
      levelMap.set(stepId, 0);
      return 0;
    }

    const maxDepLevel = Math.max(...deps.map((d) => computeLevel(d, visited)));
    const level = maxDepLevel + 1;
    levelMap.set(stepId, level);
    return level;
  };

  for (const step of steps) {
    computeLevel(step.id, new Set());
  }

  // 2. Group by level
  const levelGroups = new Map<number, LayoutNode[]>();
  for (const step of steps) {
    const level = levelMap.get(step.id) ?? 0;
    const result = results[step.id];
    const node: LayoutNode = {
      id: step.id,
      name: step.name,
      type: step.type,
      status: result?.status ?? "pending",
      level,
      indexInLevel: 0,
      durationMs: result?.duration_ms,
      error: result?.error,
      retries: result?.retries,
      dependsOn: step.depends_on ?? [],
      input: step.config,
      output: result?.output,
    };
    if (!levelGroups.has(level)) levelGroups.set(level, []);
    levelGroups.get(level)!.push(node);
  }

  // 3. Assign index in level
  for (const [, nodes] of levelGroups) {
    nodes.forEach((n, i) => {
      n.indexInLevel = i;
    });
  }

  return steps
    .map((s) => {
      const level = levelMap.get(s.id) ?? 0;
      const group = levelGroups.get(level)!;
      return group.find((n) => n.id === s.id)!;
    })
    .filter(Boolean);
}

// =====================================================================
// Status color mapping
// =====================================================================

function getNodeColor(status: StepStatus): string {
  switch (status) {
    case "completed":
      return "bg-green-500/15 border-green-500/50 text-green-600";
    case "running":
      return "bg-blue-500/15 border-blue-500/50 text-blue-600";
    case "failed":
      return "bg-red-500/15 border-red-500/50 text-red-600";
    case "skipped":
      return "bg-gray-500/10 border-gray-400/30 text-gray-400";
    case "cancelled":
      return "bg-yellow-500/15 border-yellow-500/50 text-yellow-600";
    default:
      return "bg-muted border-border text-muted-foreground";
  }
}

function getConnectorColor(fromStatus: StepStatus): string {
  switch (fromStatus) {
    case "completed":
      return "stroke-green-500/60";
    case "running":
      return "stroke-blue-500/60";
    case "failed":
      return "stroke-red-500/60";
    default:
      return "stroke-border";
  }
}

// =====================================================================
// Step Detail Panel
// =====================================================================

interface StepDetailPanelProps {
  step: WorkflowStep | undefined;
  result: StepResult | undefined;
  onClose: () => void;
}

function StepDetailPanel({ step, result, onClose }: StepDetailPanelProps) {
  if (!step) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        点击工作流节点查看详情
      </div>
    );
  }

  const formatJson = (value: unknown): string => {
    if (value === undefined || value === null) return "—";
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  };

  return (
    <div className="border rounded-lg bg-card p-4 text-sm">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium">{step.name}</h4>
        <button
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          关闭
        </button>
      </div>

      {/* 基本信息 */}
      <div className="space-y-2 mb-3">
        <div className="flex justify-between">
          <span className="text-muted-foreground">类型</span>
          <span>{STEP_TYPE_LABELS[step.type] ?? step.type}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">状态</span>
          <span>{STEP_STATUS_LABELS[result?.status ?? "pending"] ?? result?.status ?? "待执行"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">超时</span>
          <span>{step.timeout_secs ? `${step.timeout_secs}s` : "未设置"}</span>
        </div>
        {step.retry_policy && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">重试策略</span>
            <span>最多 {step.retry_policy.max_retries} 次，退避 {step.retry_policy.backoff_secs}s</span>
          </div>
        )}
        {result?.retries !== undefined && result.retries > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">已重试</span>
            <span>{result.retries} 次</span>
          </div>
        )}
        {result?.duration_ms !== undefined && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">耗时</span>
            <span>{(result.duration_ms / 1000).toFixed(1)}s</span>
          </div>
        )}
        {result?.started_at && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">开始时间</span>
            <span className="text-xs">{new Date(result.started_at).toLocaleTimeString()}</span>
          </div>
        )}
        {result?.finished_at && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">结束时间</span>
            <span className="text-xs">{new Date(result.finished_at).toLocaleTimeString()}</span>
          </div>
        )}
      </div>

      {/* 错误信息 */}
      {result?.error && (
        <div className="mb-3 p-2 rounded bg-red-500/10 border border-red-500/30">
          <div className="text-xs text-red-500 font-medium mb-1">错误</div>
          <div className="text-xs text-red-400 whitespace-pre-wrap break-all">
            {result.error}
          </div>
        </div>
      )}

      {/* 输出预览 */}
      {result?.output !== undefined && (
        <div className="mb-2">
          <div className="text-xs text-muted-foreground mb-1 font-medium">输出</div>
          <pre className="text-xs bg-muted/50 rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap break-all">
            {formatJson(result.output)}
          </pre>
        </div>
      )}

      {/* 输入预览（步骤配置） */}
      <div>
        <div className="text-xs text-muted-foreground mb-1 font-medium">配置</div>
        <pre className="text-xs bg-muted/50 rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap break-all">
          {formatJson(step.config)}
        </pre>
      </div>
    </div>
  );
}

// =====================================================================
// Main Component
// =====================================================================

const NODE_WIDTH = 180;
const NODE_HEIGHT = 64;
const LEVEL_GAP = 80;
const NODE_GAP = 24;

export function WorkflowGraph({
  steps,
  stepResults,
  currentSteps = [],
  onNodeClick,
  selectedNodeId,
}: WorkflowGraphProps) {
  const layout = useMemo(
    () => computeLayout(steps, stepResults),
    [steps, stepResults],
  );

  // Calculate SVG dimensions
  const levels = new Map<number, number>();
  for (const node of layout) {
    levels.set(node.level, (levels.get(node.level) ?? 0) + 1);
  }

  const maxLevel = Math.max(0, ...Array.from(levels.keys()));
  const maxNodesInLevel = Math.max(1, ...Array.from(levels.values()));

  const svgWidth = (maxLevel + 1) * (NODE_WIDTH + LEVEL_GAP) + LEVEL_GAP;
  const svgHeight = Math.max(200, maxNodesInLevel * (NODE_HEIGHT + NODE_GAP) + NODE_GAP);

  // Node positions
  const nodePositions = new Map<string, { x: number; y: number }>();
  const levelCounters = new Map<number, number>();
  for (const node of layout) {
    const count = levelCounters.get(node.level) ?? 0;
    levelCounters.set(node.level, count + 1);

    const totalInLevel = levels.get(node.level) ?? 1;
    const yOffset = ((count + 1) / (totalInLevel + 1)) * svgHeight;

    nodePositions.set(node.id, {
      x: LEVEL_GAP + node.level * (NODE_WIDTH + LEVEL_GAP),
      y: yOffset - NODE_HEIGHT / 2,
    });
  }

  // 选中节点的详情
  const selectedStep = selectedNodeId ? steps.find((s) => s.id === selectedNodeId) : undefined;
  const selectedResult = selectedNodeId ? stepResults[selectedNodeId] : undefined;

  return (
    <div className="flex gap-3">
      {/* 图表区域 */}
      <div className="flex-1 relative w-full overflow-auto rounded-lg border bg-muted/20 p-4" style={{ minHeight: svgHeight + 20 }}>
        <svg
          width={svgWidth}
          height={svgHeight}
          className="absolute inset-0 pointer-events-none"
          style={{ minWidth: svgWidth, minHeight: svgHeight }}
        >
          {/* Draw connectors (arrows) */}
          {layout.map((node) =>
            node.dependsOn.map((depId) => {
              const from = nodePositions.get(depId);
              const to = nodePositions.get(node.id);
              if (!from || !to) return null;

              const fromX = from.x + NODE_WIDTH;
              const fromY = from.y + NODE_HEIGHT / 2;
              const toX = to.x;
              const toY = to.y + NODE_HEIGHT / 2;

              // Bezier curve
              const midX = (fromX + toX) / 2;
              const path = `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;

              const status = stepResults[depId]?.status ?? "pending";

              return (
                <path
                  key={`${depId}-${node.id}`}
                  d={path}
                  fill="none"
                  strokeWidth={2}
                  className={`${getConnectorColor(status)} transition-colors duration-300`}
                  markerEnd="url(#arrowhead)"
                />
              );
            }),
          )}

          {/* Arrow marker definition */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="8"
              markerHeight="6"
              refX="8"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="currentColor" className="text-muted-foreground/50" />
            </marker>
          </defs>
        </svg>

        {/* Draw nodes (HTML overlay for interactivity) */}
        {layout.map((node) => {
          const pos = nodePositions.get(node.id);
          if (!pos) return null;

          const isSelected = selectedNodeId === node.id;
          const isRunning = node.status === "running";
          const isCurrent = currentSteps.includes(node.id);

          return (
            <div
              key={node.id}
              className={`
                absolute rounded-lg border p-3 cursor-pointer select-none
                transition-all duration-200 hover:scale-105 hover:shadow-lg
                ${getNodeColor(node.status)}
                ${isSelected ? "ring-2 ring-primary ring-offset-2" : ""}
                ${isCurrent && !isRunning ? "ring-1 ring-primary/30" : ""}
                ${isRunning ? "animate-pulse" : ""}
              `}
              style={{
                left: pos.x,
                top: pos.y,
                width: NODE_WIDTH,
                height: NODE_HEIGHT,
              }}
              onClick={() => onNodeClick?.(node.id)}
              title={node.error ?? node.name}
            >
              {/* Node header */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono opacity-60 truncate">
                  {STEP_TYPE_LABELS[node.type] ?? node.type}
                </span>
              </div>

              {/* Node name */}
              <div className="mt-1 text-sm font-medium truncate">{node.name}</div>

              {/* Status + duration + retries */}
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[10px] opacity-70">
                  {STEP_STATUS_LABELS[node.status] ?? node.status}
                </span>
                <div className="flex items-center gap-1">
                  {node.retries !== undefined && node.retries > 0 && (
                    <span className="text-[9px] opacity-40">x{node.retries}</span>
                  )}
                  {node.durationMs !== undefined && (
                    <span className="text-[10px] opacity-50">
                      {(node.durationMs / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
              </div>

              {node.status === "failed" && node.error && (
                <div className="mt-0.5 text-[9px] text-red-500 truncate" title={node.error}>
                  {node.error}
                </div>
              )}
            </div>
          );
        })}

        {layout.length === 0 && (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            暂无步骤
          </div>
        )}
      </div>

      {/* 步骤详情面板 */}
      {selectedNodeId && (
        <div className="w-72 flex-shrink-0">
          <StepDetailPanel
            step={selectedStep}
            result={selectedResult}
            onClose={() => onNodeClick?.("")}
          />
        </div>
      )}
    </div>
  );
}
