/**
 * @file WorkflowView - Dynamic Workflow Engine UI
 * @description 工作流管理视图：定义列表、运行历史、DAG 可视化
 *
 * 使用 workflowsStore (Zustand + localStorage) 管理状态，
 * WorkflowGraph 渲染 DAG 拓扑图。
 */

import { useState, useEffect, useCallback } from "react";
import { useWorkflowsStore } from "../workflowsStore";
import { WorkflowGraph } from "./workflow/WorkflowGraph";
import {
  WORKFLOW_RUN_STATUS_LABELS,
  STEP_STATUS_LABELS,
} from "../contracts/workflow";
import type {
  WorkflowDefinition,
  WorkflowRun,
  WorkflowStep,
  StepResult,
} from "../contracts/workflow";

// =====================================================================
// Main Component
// =====================================================================

export function WorkflowView() {
  const store = useWorkflowsStore();

  // 初始化内置模板
  useEffect(() => {
    store.seedBuiltinWorkflows();
  }, [store.seedBuiltinWorkflows]);

  const [activeTab, setActiveTab] = useState<"definitions" | "runs">("definitions");
  const [selectedDefinition, setSelectedDefinition] = useState<WorkflowDefinition | null>(null);
  const [selectedRun, setSelectedRun] = useState<WorkflowRun | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(undefined);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);

  const definitions = store.listDefinitions();
  const runs = store.listRuns();

  const handleRunWorkflow = useCallback(
    (def: WorkflowDefinition) => {
      const run = store.createRun(def);
      setSelectedRun(run);
      setActiveTab("runs");
    },
    [store.createRun],
  );

  const handleSelectRun = useCallback((run: WorkflowRun) => {
    setSelectedRun(run);
    setSelectedNodeId(undefined);
    setDetailPanelOpen(true);
  }, []);

  const handleCancelRun = useCallback(
    (runId: string) => {
      store.cancelRun(runId);
    },
    [store.cancelRun],
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b">
        <h1 className="text-lg font-semibold">动态工作流引擎</h1>
        <div className="flex gap-1 ml-auto">
          <button
            onClick={() => setActiveTab("definitions")}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              activeTab === "definitions"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary hover:bg-secondary/80"
            }`}
          >
            工作流定义 ({definitions.length})
          </button>
          <button
            onClick={() => setActiveTab("runs")}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              activeTab === "runs"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary hover:bg-secondary/80"
            }`}
          >
            运行历史 ({runs.length})
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === "definitions" && (
          <DefinitionList
            definitions={definitions}
            onSelect={setSelectedDefinition}
            onRun={handleRunWorkflow}
            onDelete={(name) => store.removeDefinition(name)}
          />
        )}
        {activeTab === "runs" && (
          <RunList runs={runs} onSelect={handleSelectRun} onCancel={handleCancelRun} />
        )}
      </div>

      {/* Detail Panels */}
      {detailPanelOpen && selectedRun && (
        <RunDetailPanel
          run={selectedRun}
          definitionName={selected_run.workflow_name}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          onClose={() => {
            setDetailPanelOpen(false);
            setSelectedNodeId(undefined);
          }}
        />
      )}
      {selectedDefinition && (
        <DefinitionDetailPanel
          definition={selectedDefinition}
          onClose={() => setSelectedDefinition(null)}
          onRun={handleRunWorkflow}
        />
      )}
    </div>
  );
}

// =====================================================================
// Definition List
// =====================================================================

function DefinitionList({
  definitions,
  onSelect,
  onRun,
  onDelete,
}: {
  definitions: WorkflowDefinition[];
  onSelect: (d: WorkflowDefinition) => void;
  onRun: (d: WorkflowDefinition) => void;
  onDelete: (name: string) => void;
}) {
  if (definitions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <p>暂无工作流定义</p>
        <p className="text-sm mt-1">初始化后会自动加载内置模板</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {definitions.map((def) => (
        <div
          key={def.name}
          className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => onSelect(def)}
        >
          <div className="flex items-start justify-between">
            <h3 className="font-medium">{def.name}</h3>
            <span className="text-xs bg-secondary px-2 py-0.5 rounded">
              v{def.version}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
            {def.description}
          </p>
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <span>{def.steps.length} 步骤</span>
            <span>
              {def.triggers.map((t) => t.type).join(", ") || "手动"}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button
              className="text-xs bg-primary text-primary-foreground px-3 py-1 rounded"
              onClick={(e) => {
                e.stopPropagation();
                onRun(def);
              }}
            >
              运行
            </button>
            <button
              className="text-xs border px-3 py-1 rounded hover:bg-secondary"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(def.name);
              }}
            >
              删除
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// =====================================================================
// Run List
// =====================================================================

function RunList({
  runs,
  onSelect,
  onCancel,
}: {
  runs: WorkflowRun[];
  onSelect: (r: WorkflowRun) => void;
  onCancel: (id: string) => void;
}) {
  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <p>暂无运行记录</p>
        <p className="text-sm mt-1">选择一个工作流定义开始运行</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {runs.map((run) => {
        const completedCount = Object.values(run.step_results).filter(
          (r: StepResult) => r.status === "completed",
        ).length;
        const totalCount = run.current_steps.length + completedCount;

        return (
          <div
            key={run.id}
            className={`border rounded-lg p-4 cursor-pointer transition-shadow hover:shadow-sm ${
              run.status === "running" ? "border-primary/30 bg-primary/5" : ""
            }`}
            onClick={() => onSelect(run)}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">{run.workflow_name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(run.started_at).toLocaleString("zh-CN")} · {run.id.slice(0, 8)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={run.status} />
                <span className="text-xs text-muted-foreground">
                  {completedCount}/{totalCount}
                </span>
                {(run.status === "running" || run.status === "pending") && (
                  <button
                    className="text-xs text-red-500 hover:text-red-700 px-2 py-0.5 border border-red-300 rounded"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCancel(run.id);
                    }}
                  >
                    取消
                  </button>
                )}
              </div>
            </div>
            {run.error && (
              <p className="text-xs text-red-500 mt-2">{run.error}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// =====================================================================
// Run Detail Panel (with DAG visualization)
// =====================================================================

function RunDetailPanel({
  run,
  definitionName,
  selectedNodeId,
  onSelectNode,
  onClose,
}: {
  run: WorkflowRun;
  definitionName: string;
  selectedNodeId?: string;
  onSelectNode: (id: string) => void;
  onClose: () => void;
}) {
  // Find the definition to get steps
  const store = useWorkflowsStore();
  const definition = store.listDefinitions().find((d) => d.name === definitionName);
  const steps = definition?.steps ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-auto p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">{run.workflow_name}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {run.id.slice(0, 8)} · <StatusBadge status={run.status} />
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xl leading-none"
          >
            x
          </button>
        </div>

        {/* DAG Graph */}
        <div className="mt-4">
          <h3 className="text-sm font-medium mb-2">DAG 拓扑图</h3>
          <WorkflowGraph
            steps={steps}
            stepResults={run.step_results}
            currentSteps={run.current_steps}
            onNodeClick={onSelectNode}
            selectedNodeId={selectedNodeId}
          />
        </div>

        {/* Selected Node Detail */}
        {selectedNodeId && (
          <StepDetail
            step={steps.find((s: WorkflowStep) => s.id === selectedNodeId)}
            result={run.step_results[selectedNodeId]}
          />
        )}

        {/* Summary */}
        <div className="mt-4 grid grid-cols-4 gap-3 text-center">
          <SummaryCard
            label="总计"
            value={steps.length}
            className="text-foreground"
          />
          <SummaryCard
            label="已完成"
            value={Object.values(run.step_results).filter((r: StepResult) => r.status === "completed").length}
            className="text-green-500"
          />
          <SummaryCard
            label="运行中"
            value={Object.values(run.step_results).filter((r: StepResult) => r.status === "running").length}
            className="text-blue-500"
          />
          <SummaryCard
            label="失败"
            value={Object.values(run.step_results).filter((r: StepResult) => r.status === "failed").length}
            className="text-red-500"
          />
        </div>

        <div className="flex justify-end mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border rounded hover:bg-secondary"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Definition Detail Panel
// =====================================================================

function DefinitionDetailPanel({
  definition,
  onClose,
  onRun,
}: {
  definition: WorkflowDefinition;
  onClose: () => void;
  onRun: (d: WorkflowDefinition) => void;
}) {
  const [showGraph, setShowGraph] = useState(true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-auto p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{definition.name}</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xl leading-none"
          >
            x
          </button>
        </div>
        <p className="text-muted-foreground mt-2">{definition.description}</p>

        {/* Triggers & Variables summary */}
        <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
          <span>
            触发: {definition.triggers.map((t) => t.type).join(", ") || "手动"}
          </span>
          {definition.variables && definition.variables.length > 0 && (
            <span>变量: {definition.variables.length}</span>
          )}
        </div>

        {/* Toggle DAG view */}
        <div className="mt-4">
          <button
            onClick={() => setShowGraph(!showGraph)}
            className="text-xs text-primary hover:underline"
          >
            {showGraph ? "隐藏 DAG 图" : "显示 DAG 图"}
          </button>
        </div>

        {showGraph && (
          <div className="mt-2">
            <WorkflowGraph
              steps={definition.steps}
              stepResults={{}}
            />
          </div>
        )}

        {/* Steps List */}
        <h3 className="font-medium mt-4">步骤列表</h3>
        <div className="mt-2 space-y-2">
          {definition.steps.map((step, i) => (
            <div key={step.id} className="flex items-center gap-3 p-2 rounded bg-secondary/50">
              <span className="text-xs bg-secondary rounded-full w-6 h-6 flex items-center justify-center">
                {i + 1}
              </span>
              <span className="text-sm flex-1">{step.name}</span>
              <span className="text-xs text-muted-foreground">
                {step.type}
              </span>
              {step.depends_on && step.depends_on.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  依赖: {step.depends_on.join(", ")}
                </span>
              )}
              {step.timeout_secs && (
                <span className="text-xs text-muted-foreground">
                  {step.timeout_secs}s
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Variables */}
        {definition.variables && definition.variables.length > 0 && (
          <>
            <h3 className="font-medium mt-4">输入变量</h3>
            <div className="mt-2 space-y-1">
              {definition.variables.map((v) => (
                <div key={v.name} className="flex items-center gap-2 text-sm">
                  <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">
                    {v.name}
                  </code>
                  <span className="text-muted-foreground">
                    {v.description ?? v.name}
                  </span>
                  {v.required && (
                    <span className="text-xs text-red-500">*必填</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border rounded hover:bg-secondary"
          >
            关闭
          </button>
          <button
            onClick={() => onRun(definition)}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded"
          >
            运行工作流
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Sub-components
// =====================================================================

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    pending: "bg-gray-100 text-gray-600",
    running: "bg-blue-100 text-blue-600",
    completed: "bg-green-100 text-green-600",
    failed: "bg-red-100 text-red-600",
    cancelled: "bg-yellow-100 text-yellow-600",
  };

  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded ${
        colorMap[status] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {WORKFLOW_RUN_STATUS_LABELS[status] ?? STEP_STATUS_LABELS[status] ?? status}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className="border rounded-lg p-3">
      <div className={`text-2xl font-bold ${className}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function StepDetail({
  step,
  result,
}: {
  step?: WorkflowStep;
  result?: StepResult;
}) {
  if (!step) return null;

  return (
    <div className="mt-4 p-4 rounded-lg border bg-secondary/20">
      <div className="flex items-center gap-2">
        <h4 className="font-medium">{step.name}</h4>
        {result && (
          <StatusBadge status={result.status} />
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        类型: {step.type} · ID: {step.id}
      </p>
      {step.depends_on && step.depends_on.length > 0 && (
        <p className="text-xs text-muted-foreground mt-1">
          依赖: {step.depends_on.join(", ")}
        </p>
      )}
      {result?.error && (
        <p className="text-xs text-red-500 mt-2">{result.error}</p>
      )}
      {result?.output !== undefined && (
        <pre className="text-xs mt-2 p-2 rounded bg-background/50 overflow-auto max-h-32">
          {typeof result.output === "string"
            ? result.output
            : JSON.stringify(result.output, null, 2)}
        </pre>
      )}
    </div>
  );
}
