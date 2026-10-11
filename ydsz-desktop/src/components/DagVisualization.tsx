/**
 * @file DAG 可视化组件
 * @description 绘制多 Agent 工作流的有向无环图（DAG），展示步骤节点和依赖连线
 */

import { useMemo, useState, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkflowStep {
  id: string;
  name: string;
  assignee: string;
  depends_on: string[];
  prompt_template: string;
}

interface TeamMember {
  agent_id: string;
  role: string;
  skills: string[];
}

interface StepResult {
  step_id: string;
  step_name: string;
  assignee: string;
  status: string;
  output: string;
}

interface DagVisualizationProps {
  workflow: WorkflowStep[];
  members: TeamMember[];
  executeResult?: {
    team_id: string;
    status: string;
    step_results: StepResult[];
  } | null;
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const NODE_WIDTH = 180;
const NODE_HEIGHT = 64;
const HORIZONTAL_GAP = 60;
const VERTICAL_GAP = 80;
const PADDING = 40;

// ---------------------------------------------------------------------------
// Color palette per member
// ---------------------------------------------------------------------------

const MEMBER_COLORS: Record<string, { bg: string; border: string; text: string }> = {};

const COLOR_PALETTE = [
  { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-500' },
  { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-500' },
  { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-500' },
  { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-500' },
  { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-500' },
  { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-500' },
  { bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', text: 'text-indigo-500' },
  { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-500' },
];

function getMemberColor(agentId: string) {
  if (MEMBER_COLORS[agentId]) return MEMBER_COLORS[agentId];
  const idx = Object.keys(MEMBER_COLORS).length % COLOR_PALETTE.length;
  MEMBER_COLORS[agentId] = COLOR_PALETTE[idx];
  return MEMBER_COLORS[agentId];
}

// ---------------------------------------------------------------------------
// Graph layout: topological level assignment with BFS
// ---------------------------------------------------------------------------

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  level: number;
  column: number;
}

function computeDagLayout(
  workflow: WorkflowStep[],
): { nodes: LayoutNode[]; width: number; height: number } {
  // Compute level (longest path from any root)
  const levels: Map<string, number> = new Map();
  const workflowMap: Map<string, WorkflowStep> = new Map();
  workflow.forEach((step) => workflowMap.set(step.id, step));

  function computeLevel(stepId: string, visited: Set<string>): number {
    if (levels.has(stepId)) return levels.get(stepId)!;
    if (visited.has(stepId)) return 0; // cycle protection
    visited.add(stepId);

    const step = workflowMap.get(stepId);
    if (!step || step.depends_on.length === 0) {
      levels.set(stepId, 0);
      return 0;
    }

    let maxDepLevel = -1;
    for (const depId of step.depends_on) {
      maxDepLevel = Math.max(maxDepLevel, computeLevel(depId, visited));
    }
    const level = maxDepLevel + 1;
    levels.set(stepId, level);
    return level;
  }

  // Compute all levels
  for (const step of workflow) {
    computeLevel(step.id, new Set());
  }

  // Group by level and assign columns
  const maxLevel = Math.max(0, ...Array.from(levels.values()));
  const columnsByLevel: Map<number, number> = new Map();

  const nodes: LayoutNode[] = workflow.map((step) => {
    const level = levels.get(step.id) ?? 0;
    const col = columnsByLevel.get(level) ?? 0;
    columnsByLevel.set(level, col + 1);

    return {
      id: step.id,
      x: PADDING + level * (NODE_WIDTH + HORIZONTAL_GAP),
      y: PADDING + col * (NODE_HEIGHT + VERTICAL_GAP),
      level,
      column: col,
    };
  });

  // Compute dimensions
  const width = PADDING * 2 + (maxLevel + 1) * (NODE_WIDTH + HORIZONTAL_GAP);
  const maxColAtLevel: Map<number, number> = new Map();
  nodes.forEach((node) => {
    const current = maxColAtLevel.get(node.level) ?? 0;
    maxColAtLevel.set(node.level, Math.max(current, node.column + 1));
  });
  const maxRows = Math.max(1, ...Array.from(maxColAtLevel.values()));
  const height = PADDING * 2 + maxRows * (NODE_HEIGHT + VERTICAL_GAP);

  return { nodes, width, height };
}

// ---------------------------------------------------------------------------
// SVG Edge path generator
// ---------------------------------------------------------------------------

function computeEdgePath(
  from: LayoutNode,
  to: LayoutNode,
): string {
  const fromX = from.x + NODE_WIDTH;
  const fromY = from.y + NODE_HEIGHT / 2;
  const toX = to.x;
  const toY = to.y + NODE_HEIGHT / 2;

  const midX = (fromX + toX) / 2;
  return `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DagVisualization({
  workflow,
  members,
  executeResult,
}: DagVisualizationProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);

  // Reset member colors when members change
  useMemo(() => {
    Object.keys(MEMBER_COLORS).forEach((key) => delete MEMBER_COLORS[key]);
  }, [members]);

  const { nodes, width, height } = useMemo(
    () => computeDagLayout(workflow),
    [workflow],
  );

  const nodeMap = useMemo(() => {
    const map: Map<string, LayoutNode> = new Map();
    nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [nodes]);

  const workflowMap = useMemo(() => {
    const map: Map<string, WorkflowStep> = new Map();
    workflow.forEach((s) => map.set(s.id, s));
    return map;
  }, [workflow]);

  // Build result lookup
  const resultMap = useMemo(() => {
    const map: Map<string, StepResult> = new Map();
    executeResult?.step_results.forEach((r) => map.set(r.step_id, r));
    return map;
  }, [executeResult]);

  return (
    <div className="relative overflow-auto rounded-xl border border-border/40 bg-background/40 p-4 min-h-[400px]">
      {/* Member legend */}
      <div className="absolute top-3 right-3 flex flex-wrap gap-2 z-10">
        {members.map((member) => {
          const color = getMemberColor(member.agent_id);
          return (
            <div
              key={member.agent_id}
              className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${color.bg} ${color.text}`}
            >
              <span className="font-medium">{member.role}</span>
            </div>
          );
        })}
      </div>

      {/* SVG Canvas */}
      <svg width={width} height={height} className="select-none">
        <defs>
          <marker
            id="arrowhead"
            markerWidth="8"
            markerHeight="6"
            refX="7"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="currentColor" className="text-border" />
          </marker>
          <marker
            id="arrowhead-active"
            markerWidth="8"
            markerHeight="6"
            refX="7"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="currentColor" className="text-primary" />
          </marker>
        </defs>

        {/* Edges */}
        {workflow.map((step) =>
          step.depends_on.map((depId) => {
            const fromNode = nodeMap.get(depId);
            const toNode = nodeMap.get(step.id);
            if (!fromNode || !toNode) return null;

            const isActive =
              hoveredNode === depId || hoveredNode === step.id;
            const hasResult =
              resultMap.has(depId) && resultMap.has(step.id);

            return (
              <path
                key={`${depId}-${step.id}`}
                d={computeEdgePath(fromNode, toNode)}
                fill="none"
                strokeWidth={isActive ? 2.5 : 1.5}
                className={
                  hasResult
                    ? 'stroke-green-500/60'
                    : isActive
                      ? 'stroke-primary/80'
                      : 'stroke-border'
                }
                markerEnd={
                  isActive
                    ? 'url(#arrowhead-active)'
                    : 'url(#arrowhead)'
                }
              />
            );
          }),
        )}

        {/* Nodes */}
        {workflow.map((step) => {
          const node = nodeMap.get(step.id);
          if (!node) return null;

          const member = members.find((m) => m.agent_id === step.assignee);
          const color = getMemberColor(step.assignee);
          const isHovered = hoveredNode === step.id;
          const result = resultMap.get(step.id);
          const nodeStatus = result?.status;

          return (
            <g
              key={step.id}
              transform={`translate(${node.x}, ${node.y})`}
              onMouseEnter={() => setHoveredNode(step.id)}
              onMouseLeave={() => setHoveredNode(null)}
              className="cursor-pointer"
            >
              {/* Node rectangle */}
              <rect
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={12}
                className={`
                  transition-all duration-150
                  ${color.bg}
                  ${isHovered ? 'stroke-[2.5]' : 'stroke-[1.5]'}
                  ${color.border}
                  ${nodeStatus === 'completed' ? 'stroke-green-500/60' : ''}
                  ${nodeStatus === 'skipped' ? 'stroke-yellow-500/60' : ''}
                `}
              />

              {/* Status indicator */}
              {nodeStatus && (
                <circle
                  cx={NODE_WIDTH - 12}
                  cy={12}
                  r={5}
                  className={
                    nodeStatus === 'completed'
                      ? 'fill-green-500'
                      : 'fill-yellow-500'
                  }
                />
              )}

              {/* Step name */}
              <text
                x={12}
                y={24}
                fontSize={12}
                fontWeight={500}
                className="fill-foreground pointer-events-none"
              >
                {step.name.length > 18
                  ? step.name.slice(0, 18) + '...'
                  : step.name}
              </text>

              {/* Assignee */}
              <text
                x={12}
                y={42}
                fontSize={10}
                className={`fill-muted-foreground pointer-events-none`}
              >
                {member?.role ?? step.assignee}
              </text>

              {/* Dependency count badge */}
              {step.depends_on.length > 0 && (
                <>
                  <rect
                    x={12}
                    y={48}
                    width={16}
                    height={14}
                    rx={7}
                    className="fill-muted/40"
                  />
                  <text
                    x={20}
                    y={58}
                    fontSize={9}
                    textAnchor="middle"
                    className="fill-muted-foreground pointer-events-none"
                  >
                    +{step.depends_on.length}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip for hovered node */}
      {hoveredNode && workflowMap.get(hoveredNode) && (
        <Tooltip
          step={workflowMap.get(hoveredNode)!}
          member={members.find((m) => m.agent_id === workflowMap.get(hoveredNode)!.assignee)}
          result={resultMap.get(hoveredNode)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

function Tooltip({
  step,
  member,
  result,
}: {
  step: WorkflowStep;
  member?: TeamMember;
  result?: StepResult;
}) {
  return (
    <div className="absolute bottom-4 left-4 right-4 rounded-lg border border-border/40 bg-background/95 backdrop-blur p-3 z-20">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium">{step.name}</span>
        {result && (
          <span
            className={`text-xs rounded-full px-2 py-0.5 ${
              result.status === 'completed'
                ? 'bg-green-500/10 text-green-500'
                : 'bg-yellow-500/10 text-yellow-500'
            }`}
          >
            {result.status}
          </span>
        )}
      </div>
      <div className="text-xs text-muted-foreground space-y-0.5">
        <div>
          <span className="font-medium">Assignee:</span>{' '}
          {member?.role ?? step.assignee}
          {member && (
            <span className="ml-2 text-xs">
              Skills: {member.skills.join(', ')}
            </span>
          )}
        </div>
        {step.depends_on.length > 0 && (
          <div>
            <span className="font-medium">Depends on:</span>{' '}
            {step.depends_on.join(', ')}
          </div>
        )}
        <div>
          <span className="font-medium">Prompt:</span>{' '}
          {step.prompt_template.length > 80
            ? step.prompt_template.slice(0, 80) + '...'
            : step.prompt_template}
        </div>
        {result && (
          <div className="mt-1 pt-1 border-t border-border/30">
            <span className="font-medium">Output:</span> {result.output.slice(0, 120)}
          </div>
        )}
      </div>
    </div>
  );
}
