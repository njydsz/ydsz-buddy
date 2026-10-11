/**
 * @file Workflow Runtime
 * @description 前端驱动的工作流执行引擎（简化版骨架）
 *
 * 解析 WorkflowDefinition 中的 DAG 依赖，并发执行无依赖的步骤。
 * 每一步通过调用现有 Tauri 命令完成（agent/shell/tool）。
 *
 * ## 设计说明
 *
 * - 这是骨架实现，实际执行逻辑通过回调让上层注入
 * - 核心职责是 DAG 拓扑排序 + 就绪状态计算 + 状态推进
 */

import type {
  WorkflowDefinition,
  WorkflowRun,
  WorkflowStep,
  StepResult,
  StepStatus,
} from "../contracts/workflow";

// =====================================================================
// DAG 调度器
// =====================================================================

/**
 * 从工作流定义中计算拓扑排序
 * 如果存在循环依赖，返回 null
 */
export function topologicalSort(steps: WorkflowStep[]): string[] | null {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  const idSet = new Set(steps.map((s) => s.id));

  // 初始化
  for (const step of steps) {
    inDegree.set(step.id, 0);
    if (!adj.has(step.id)) adj.set(step.id, []);
  }

  // 构建图
  for (const step of steps) {
    for (const dep of step.depends_on ?? []) {
      if (!idSet.has(dep)) continue; // 跳过不存在的依赖
      adj.set(dep, [...(adj.get(dep) ?? []), step.id]);
      inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1);
    }
  }

  // Kahn 算法
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const result: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    result.push(id);
    for (const neighbor of adj.get(id) ?? []) {
      const deg = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, deg);
      if (deg === 0) queue.push(neighbor);
    }
  }

  return result.length === steps.length ? result : null;
}

/**
 * 找到当前可执行的步骤（所有前置依赖已完成）
 */
export function findReadySteps(
  steps: WorkflowStep[],
  completedStepIds: Set<string>,
): string[] {
  return steps
    .filter((step) => {
      const deps = step.depends_on ?? [];
      return deps.length > 0 && deps.every((dep) => completedStepIds.has(dep));
    })
    .map((s) => s.id);
}

/**
 * 获取入口步骤（无依赖的第一步）
 */
export function findEntrySteps(steps: WorkflowStep[]): string[] {
  return steps
    .filter((s) => !s.depends_on || s.depends_on.length === 0)
    .map((s) => s.id);
}

/**
 * 检测循环依赖（DFS）
 */
export function detectCycle(steps: WorkflowStep[]): string[] | null {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const step of steps) {
    color.set(step.id, WHITE);
    if (!adj.has(step.id)) adj.set(step.id, []);
  }

  for (const step of steps) {
    for (const dep of step.depends_on ?? []) {
      adj.set(dep, [...(adj.get(dep) ?? []), step.id]);
    }
  }

  const dfs = (node: string, path: string[]): string[] | null => {
    color.set(node, GRAY);
    for (const neighbor of adj.get(node) ?? []) {
      if (color.get(neighbor) === GRAY) {
        return [...path, node, neighbor];
      }
      if (color.get(neighbor) === WHITE) {
        const result = dfs(neighbor, [...path, node]);
        if (result) return result;
      }
    }
    color.set(node, BLACK);
    return null;
  };

  for (const step of steps) {
    if (color.get(step.id) === WHITE) {
      const result = dfs(step.id, []);
      if (result) return result;
    }
  }
  return null;
}

// =====================================================================
// 步骤执行器接口
// =====================================================================

export type StepExecutor = (
  step: WorkflowStep,
  variables: Record<string, unknown>,
) => Promise<unknown>;

export interface RuntimeCallbacks {
  onStepStart?: (stepId: string, stepName: string) => void;
  onStepComplete?: (stepId: string, stepName: string, output: unknown) => void;
  onStepFail?: (stepId: string, stepName: string, error: string) => void;
  onRunComplete?: (runId: string) => void;
  onRunFail?: (runId: string, error: string) => void;
}

// =====================================================================
// 工作流运行时
// =====================================================================

export interface RuntimeHandle {
  runId: string;
  cancel: () => void;
  isCancelled: () => boolean;
}

/**
 * 执行工作流
 *
 * @param definition - 工作流定义
 * @param run - 运行实例
 * @param executor - 步骤执行器（注入）
 * @param callbacks - 状态回调
 */
export async function executeWorkflow(
  definition: WorkflowDefinition,
  run: WorkflowRun,
  executor: StepExecutor,
  callbacks: RuntimeCallbacks = {},
): Promise<RuntimeHandle> {
  let cancelled = false;

  const handle: RuntimeHandle = {
    runId: run.id,
    cancel: () => {
      cancelled = true;
    },
    isCancelled: () => cancelled,
  };

  // 验证 DAG 无环
  const cycle = detectCycle(definition.steps);
  if (cycle) {
    callbacks.onRunFail?.(run.id, `检测到循环依赖: ${cycle.join(" -> ")}`);
    return handle;
  }

  // 初始化步骤状态
  const stepResults = new Map<string, StepResult>();
  const completedIds = new Set<string>();
  const failedIds = new Set<string>();

  // 初始化所有步骤为 pending
  for (const step of definition.steps) {
    stepResults.set(step.id, { status: "pending" });
  }

  // 异步执行
  (async () => {
    try {
      // 获取拓扑排序决定执行顺序
      const topoOrder = topologicalSort(definition.steps);
      if (!topoOrder) {
        callbacks.onRunFail?.(run.id, "DAG 拓扑排序失败");
        return;
      }

      // 就绪队列
      const runningTasks = new Map<string, Promise<unknown>>();

      const tryRunReadySteps = () => {
        const ready = definition.steps.filter((step) => {
          if (completedIds.has(step.id) || failedIds.has(step.id)) return false;
          if (runningTasks.has(step.id)) return false;
          const deps = step.depends_on ?? [];
          return deps.every((dep) => completedIds.has(dep));
        });

        for (const step of ready) {
          if (cancelled) break;
          if (runningTasks.size >= 3) break; // 最大并发数=3

          stepResults.set(step.id, {
            status: "running",
            started_at: new Date().toISOString(),
          });
          callbacks.onStepStart?.(step.id, step.name);

          const task = executor(step, run.variables ?? {})
            .then((output) => {
              if (cancelled) return;
              const result: StepResult = {
                status: "completed",
                output,
                finished_at: new Date().toISOString(),
                duration_ms: stepResults.get(step.id)?.started_at
                  ? Date.now() - new Date(stepResults.get(step.id)!.started_at!).getTime()
                  : undefined,
              };
              stepResults.set(step.id, result);
              completedIds.add(step.id);
              runningTasks.delete(step.id);
              callbacks.onStepComplete?.(step.id, step.name, output);
              // 递归尝试启动更多
              tryRunReadySteps();
            })
            .catch((err: unknown) => {
              if (cancelled) return;
              const errorMsg = err instanceof Error ? err.message : String(err);
              stepResults.set(step.id, {
                status: "failed",
                error: errorMsg,
                finished_at: new Date().toISOString(),
              });
              failedIds.add(step.id);
              runningTasks.delete(step.id);
              callbacks.onStepFail?.(step.id, step.name, errorMsg);
              // 检查是否全部完成或失败
              checkAllDone();
            });

          runningTasks.set(step.id, task);
        }
      };

      const checkAllDone = () => {
        const allTerminal = definition.steps.every(
          (s) => completedIds.has(s.id) || failedIds.has(s.id),
        );
        if (allTerminal && runningTasks.size === 0) {
          const hasFailed = failedIds.size > 0;
          if (hasFailed) {
            callbacks.onRunFail?.(run.id, `${failedIds.size} 个步骤执行失败`);
          } else {
            callbacks.onRunComplete?.(run.id);
          }
        }
      };

      // 启动入口步骤
      tryRunReadySteps();

      // 等待所有任务完成
      while (runningTasks.size > 0 && !cancelled) {
        await Promise.race(runningTasks.values());
        if (cancelled) break;
        checkAllDone();
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      callbacks.onRunFail?.(run.id, errorMsg);
    }
  })();

  return handle;
}

// =====================================================================
// 变量替换工具
// =====================================================================

/**
 * 替换模板变量
 * 支持 {{variable_name}} 语法
 */
export function interpolateTemplate(
  template: string,
  variables: Record<string, unknown>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, varName: string) => {
    const val = variables[varName];
    return val !== undefined ? String(val) : `{{${varName}}}`;
  });
}
