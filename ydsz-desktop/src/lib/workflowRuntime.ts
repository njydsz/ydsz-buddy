/**
 * @file Workflow Runtime
 * @description 前端驱动的工作流执行引擎
 *
 * 解析 WorkflowDefinition 中的 DAG 依赖，并发执行无依赖的步骤。
 * 每一步通过调用现有 Tauri 命令完成（agent/shell/tool）。
 *
 * ## 错误恢复增强
 *
 * - 重试：步骤失败后按 retry_policy 自动重试（带指数退避）
 * - 超时：步骤执行超时时自动中断并标记失败
 * - 取消：支持实时中断正在执行的步骤（取消令牌）
 * - 持久化：每次步骤结果保存到 store
 * - 并行步骤错误聚合：收集所有并行分支的错误并聚合报告
 */

import type {
  WorkflowDefinition,
  WorkflowRun,
  WorkflowStep,
  StepResult,
} from "../workflowsStore";

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
  runningStepIds: Set<string>,
): string[] {
  return steps
    .filter((step) => {
      if (completedStepIds.has(step.id)) return false;
      if (runningStepIds.has(step.id)) return false;
      const deps = step.depends_on ?? [];
      return deps.length > 0 && deps.every((dep) => completedStepIds.has(dep));
    })
    .map((s) => s.id);
}

/**
 * 找到当前可执行的步骤（含入口步骤）
 */
export function findReadyStepsWithEntry(
  steps: WorkflowStep[],
  completedStepIds: Set<string>,
  runningStepIds: Set<string>,
): string[] {
  const ready = steps
    .filter((step) => {
      if (completedStepIds.has(step.id) || runningStepIds.has(step.id)) return false;
      const deps = step.depends_on ?? [];
      return deps.every((dep) => completedStepIds.has(dep));
    })
    .map((s) => s.id);
  return ready;
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
  onStepFail?: (stepId: string, stepName: string, error: string, retriesLeft: number) => void;
  onStepRetry?: (stepId: string, stepName: string, attempt: number, maxRetries: number) => void;
  onRunComplete?: (runId: string) => void;
  onRunFail?: (runId: string, error: string) => void;
  /** 步骤结果持久化回调（每次步骤完成后调用） */
  onStepPersist?: (runId: string, stepId: string, result: StepResult) => void;
}

// =====================================================================
// 取消令牌
// =====================================================================

/**
 * 取消令牌 - 支持实时中断正在执行的步骤
 */
export class CancellationToken {
  private _cancelled = false;
  private _listeners: Array<() => void> = [];

  get isCancelled(): boolean {
    return this._cancelled;
  }

  cancel(): void {
    if (!this._cancelled) {
      this._cancelled = true;
      for (const listener of this._listeners) {
        listener();
      }
    }
  }

  onCancel(listener: () => void): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== listener);
    };
  }
}

// =====================================================================
// 超时处理工具
// =====================================================================

/**
 * 带超时的 Promise 包装
 * 超时时抛出 TimeoutError
 */
class TimeoutError extends Error {
  constructor(stepId: string, timeoutSecs: number) {
    super(`步骤 ${stepId} 执行超时（${timeoutSecs}s）`);
    this.name = "TimeoutError";
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutSecs: number,
  stepId: string,
  cancellationToken?: CancellationToken,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cancellationToken?.cancel();
        reject(new TimeoutError(stepId, timeoutSecs));
      }
    }, timeoutSecs * 1000);

    promise.then(
      (result) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(result);
        }
      },
      (error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(error);
        }
      },
    );
  });
}

// =====================================================================
// 重试策略
// =====================================================================

/**
 * 执行带重试的步骤
 * 按 retry_policy 配置进行重试，支持指数退避
 */
async function executeWithRetry(
  executor: StepExecutor,
  step: WorkflowStep,
  variables: Record<string, unknown>,
  cancellationToken: CancellationToken,
  onRetry?: (attempt: number, maxRetries: number) => void,
): Promise<{ output: unknown; retries: number }> {
  const maxRetries = step.retry_policy?.max_retries ?? 0;
  const backoffSecs = step.retry_policy?.backoff_secs ?? 1;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (cancellationToken.isCancelled) {
      throw new Error("工作流已取消");
    }

    // 通知重试
    if (attempt > 0) {
      onRetry?.(attempt, maxRetries);
      // 指数退避等待
      const waitMs = backoffSecs * Math.pow(2, attempt - 1) * 1000;
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
      if (cancellationToken.isCancelled) {
        throw new Error("工作流已取消（重试等待中）");
      }
    }

    const output = await executor(step, variables);
    return { output, retries: attempt };
  }

  // 所有重试耗尽
  throw lastError ?? new Error("未知执行错误");
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
  const cancellationToken = new CancellationToken();
  const handle: RuntimeHandle = {
    runId: run.id,
    cancel: () => {
      cancellationToken.cancel();
    },
    isCancelled: () => cancellationToken.isCancelled,
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

      // 就绪队列 + 运行中的任务
      const runningTasks = new Map<string, { promise: Promise<unknown>; stepId: string }>();

      const persistResult = (stepId: string) => {
        const result = stepResults.get(stepId);
        if (result) {
          callbacks.onStepPersist?.(run.id, stepId, result);
        }
      };

      const tryRunReadySteps = () => {
        const ready = definition.steps.filter((step) => {
          if (completedIds.has(step.id) || failedIds.has(step.id)) return false;
          if (runningTasks.has(step.id)) return false;
          const deps = step.depends_on ?? [];
          return deps.every((dep) => completedIds.has(dep));
        });

        for (const step of ready) {
          if (cancellationToken.isCancelled) break;
          if (runningTasks.size >= 3) break; // 最大并发数=3

          stepResults.set(step.id, {
            status: "running",
            started_at: new Date().toISOString(),
          });
          callbacks.onStepStart?.(step.id, step.name);
          persistResult(step.id);

          const task = executeStepWithRecovery(
            executor,
            step,
            run.variables ?? {},
            cancellationToken,
            (attempt, maxRetries) => {
              callbacks.onStepRetry?.(step.id, step.name, attempt, maxRetries);
            },
          )
            .then((output) => {
              if (cancellationToken.isCancelled) return;
              const startedAt = stepResults.get(step.id)?.started_at;
              const result: StepResult = {
                status: "completed",
                output,
                finished_at: new Date().toISOString(),
                duration_ms: startedAt
                  ? Date.now() - new Date(startedAt).getTime()
                  : undefined,
              };
              stepResults.set(step.id, result);
              completedIds.add(step.id);
              runningTasks.delete(step.id);
              callbacks.onStepComplete?.(step.id, step.name, output);
              persistResult(step.id);
              // 递归尝试启动更多
              tryRunReadySteps();
            })
            .catch((err: unknown) => {
              if (cancellationToken.isCancelled) return;
              const errorMsg = err instanceof Error ? err.message : String(err);
              const currentResult = stepResults.get(step.id);
              const startedAt = currentResult?.started_at;
              stepResults.set(step.id, {
                status: "failed",
                error: errorMsg,
                finished_at: new Date().toISOString(),
                duration_ms: startedAt
                  ? Date.now() - new Date(startedAt).getTime()
                  : undefined,
              });
              failedIds.add(step.id);
              runningTasks.delete(step.id);
              callbacks.onStepFail?.(step.id, step.name, errorMsg, 0);
              persistResult(step.id);
              // 检查是否全部完成或失败
              checkAllDone();
            });

          runningTasks.set(step.id, { promise: task, stepId: step.id });
        }
      };

      const checkAllDone = () => {
        const allTerminal = definition.steps.every(
          (s) => completedIds.has(s.id) || failedIds.has(s.id),
        );
        if (allTerminal && runningTasks.size === 0) {
          const hasFailed = failedIds.size > 0;
          if (hasFailed) {
            // 聚合并行步骤的错误信息
            const errors = definition.steps
              .filter((s) => failedIds.has(s.id))
              .map((s) => {
                const r = stepResults.get(s.id);
                return `  - ${s.name}: ${r?.error ?? "未知错误"}`;
              })
              .join("\n");
            const hasRunning = definition.steps.some(
              (s) => failedIds.has(s.id) || completedIds.has(s.id),
            );
            const errorMsg = hasRunning
              ? `${failedIds.size} 个步骤执行失败:\n${errors}`
              : "工作流执行失败";
            callbacks.onRunFail?.(run.id, errorMsg);
          } else {
            callbacks.onRunComplete?.(run.id);
          }
        }
      };

      // 启动入口步骤
      tryRunReadySteps();

      // 等待所有任务完成
      while (runningTasks.size > 0 && !cancellationToken.isCancelled) {
        const promises = Array.from(runningTasks.values()).map((t) => t.promise);
        await Promise.race(promises);
        if (cancellationToken.isCancelled) {
          // 将正在运行的步骤标记为 cancelled
          for (const [stepId, taskInfo] of runningTasks) {
            if (!completedIds.has(stepId) && !failedIds.has(stepId)) {
              stepResults.set(stepId, {
                status: "cancelled",
                finished_at: new Date().toISOString(),
                error: "工作流取消",
              });
              taskInfo.promise.catch(() => {}); // 防止 unhandled rejection
              persistResult(stepId);
            }
          }
          break;
        }
        checkAllDone();
      }

      // 处理取消后的剩余待执行步骤
      if (cancellationToken.isCancelled) {
        for (const step of definition.steps) {
          if (!completedIds.has(step.id) && !failedIds.has(step.id)) {
            const currentResult = stepResults.get(step.id);
            if (currentResult?.status !== "cancelled") {
              stepResults.set(step.id, { status: "cancelled" });
              persistResult(step.id);
            }
          }
        }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      callbacks.onRunFail?.(run.id, errorMsg);
    }
  })();

  return handle;
}

/**
 * 执行单个步骤（含超时、重试、取消支持）
 */
async function executeStepWithRecovery(
  executor: StepExecutor,
  step: WorkflowStep,
  variables: Record<string, unknown>,
  cancellationToken: CancellationToken,
  onRetry?: (attempt: number, maxRetries: number) => Promise<void> | void,
): Promise<unknown> {
  // 包装执行器 + 重试
  const executeFn = async (): Promise<unknown> => {
    const result = await executeWithRetry(
      executor,
      step,
      variables,
      cancellationToken,
      onRetry,
    );
    return result.output;
  };

  // 如果配置了超时，加超时包装
  if (step.timeout_secs && step.timeout_secs > 0) {
    return withTimeout(
      executeFn(),
      step.timeout_secs,
      step.id,
      cancellationToken,
    );
  }

  return executeFn();
}

// =====================================================================
// 并行步骤执行器
// =====================================================================

/**
 * 并行步骤聚合器
 * 收集所有并行分支的结果，支持错误聚合
 */
export interface ParallelResult {
  outputs: Record<string, unknown>;
  errors: Record<string, string>;
  successCount: number;
  failureCount: number;
}

/**
 * 执行并行步骤，聚合结果
 */
export async function executeParallelSteps(
  steps: WorkflowStep[],
  executor: StepExecutor,
  variables: Record<string, unknown>,
  cancellationToken: CancellationToken,
): Promise<ParallelResult> {
  const result: ParallelResult = {
    outputs: {},
    errors: {},
    successCount: 0,
    failureCount: 0,
  };

  const promises = steps.map(async (step) => {
    try {
      const output = await executeStepWithRecovery(
        executor,
        step,
        variables,
        cancellationToken,
      );
      result.outputs[step.id] = output;
      result.successCount++;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      result.errors[step.id] = errorMsg;
      result.failureCount++;
    }
  });

  await Promise.allSettled(promises);
  return result;
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
