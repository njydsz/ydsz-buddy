/**
 * @file Dynamic Workflow Engine 契约模块
 *
 * 本模块定义了动态工作流引擎的所有契约，涵盖工作流定义、触发器、
 * 步骤类型、运行状态等。对标 ZCode 的 dynamic-workflow 体系。
 *
 * ## 核心契约
 *
 * - `WorkflowDefinition`：YAML 工作流定义（含触发器、变量、DAG 步骤）
 * - `WorkflowStep`：DAG 中的一个步骤（agent/tool/shell/condition/parallel/wait/subworkflow）
 * - `WorkflowRun`：运行中的工作流实例状态
 * - `StepResult`：单个步骤的执行结果
 *
 * ## 设计原则
 *
 * - 前端驱动执行：运行时在前端解析 DAG，并发执行无依赖步骤
 * - Tauri 命令协作：每步通过调用现有 Tauri 命令完成
 * - 状态回调驱动：进度通过状态回调推送到 UI
 */

import { Schema } from "effect";
import { TrimmedNonEmptyString } from "./baseSchemas";

// =====================================================================
// 触发器类型
// =====================================================================

export const WorkflowTriggerType = Schema.Literal(
  "manual",
  "schedule",
  "event",
  "hook",
);
export type WorkflowTriggerType = typeof WorkflowTriggerType.Type;

export const WorkflowTrigger = Schema.Struct({
  type: WorkflowTriggerType,
  // schedule: CRON 表达式
  cron: Schema.optional(Schema.String),
  // event: 事件名称（如 "git:push", "file:changed"）
  event_name: Schema.optional(Schema.String),
  // hook: Hook ID
  hook_id: Schema.optional(Schema.String),
  // 触发器描述
  description: Schema.optional(Schema.String),
});
export type WorkflowTrigger = typeof WorkflowTrigger.Type;

// =====================================================================
// 输入参数定义
// =====================================================================

export const WorkflowVariable = Schema.Struct({
  name: TrimmedNonEmptyString,
  description: Schema.optional(Schema.String),
  // string / number / boolean / path / enum
  var_type: Schema.optional(Schema.Literal("string", "number", "boolean", "path", "enum")),
  required: Schema.optional(Schema.Boolean),
  default_value: Schema.optional(Schema.String),
  enum_values: Schema.optional(Schema.Array(Schema.String)),
});
export type WorkflowVariable = typeof WorkflowVariable.Type;

// =====================================================================
// 步骤类型与配置
// =====================================================================

export const WorkflowStepType = Schema.Literal(
  "agent",
  "tool",
  "shell",
  "condition",
  "parallel",
  "wait",
  "subworkflow",
);
export type WorkflowStepType = typeof WorkflowStepType.Type;

export const WorkflowStep = Schema.Struct({
  id: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  type: WorkflowStepType,
  config: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  depends_on: Schema.optional(Schema.Array(Schema.String)),
  retry_policy: Schema.optional(
    Schema.Struct({
      max_retries: Schema.Number,
      backoff_secs: Schema.Number,
    }),
  ),
  timeout_secs: Schema.optional(Schema.String.pipe(Schema.brand("PositiveInt") as unknown as Schema.Schema<number, string>)),
  // 条件分支专用：condition 类型的条件表达式
  condition_expression: Schema.optional(Schema.String),
  // 并行分支专用：parallel 类型的子步骤
  branches: Schema.optional(Schema.Array(Schema.Any)),
});
export type WorkflowStep = typeof WorkflowStep.Type;

// =====================================================================
// 错误处理策略
// =====================================================================

export const WorkflowErrorHandler = Schema.Struct({
  on_failure: Schema.optional(Schema.Literal("abort", "continue", "retry", "fallback")),
  fallback_step: Schema.optional(Schema.String),
  notify: Schema.optional(Schema.Boolean),
});
export type WorkflowErrorHandler = typeof WorkflowErrorHandler.Type;

// =====================================================================
// 工作流定义
// =====================================================================

export const WorkflowDefinition = Schema.Struct({
  name: TrimmedNonEmptyString,
  description: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  triggers: Schema.optional(Schema.Array(WorkflowTrigger)),
  variables: Schema.optional(Schema.Array(WorkflowVariable)),
  steps: Schema.Array(WorkflowStep),
  error_handling: Schema.optional(WorkflowErrorHandler),
});
export type WorkflowDefinition = typeof WorkflowDefinition.Type;

// =====================================================================
// 步骤执行结果
// =====================================================================

export const StepStatus = Schema.Literal(
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
  "cancelled",
);
export type StepStatus = typeof StepStatus.Type;

export const StepResult = Schema.Struct({
  status: StepStatus,
  output: Schema.optional(Schema.Unknown),
  error: Schema.optional(Schema.String),
  started_at: Schema.optional(Schema.String),
  finished_at: Schema.optional(Schema.String),
  duration_ms: Schema.optional(Schema.Number),
  // 重试次数
  retries: Schema.optional(Schema.Number),
});
export type StepResult = typeof StepResult.Type;

// =====================================================================
// 工作流运行状态
// =====================================================================

export const WorkflowRunStatus = Schema.Literal(
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
);
export type WorkflowRunStatus = typeof WorkflowRunStatus.Type;

export const WorkflowRun = Schema.Struct({
  id: TrimmedNonEmptyString,
  workflow_name: TrimmedNonEmptyString,
  status: WorkflowRunStatus,
  current_steps: Schema.Array(Schema.String),
  step_results: Schema.Record({ key: Schema.String, value: StepResult }),
  started_at: Schema.String,
  variables: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  finished_at: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
});
export type WorkflowRun = typeof WorkflowRun.Type;

// =====================================================================
// 便捷类型（无需 Schema 校验的场景）
// =====================================================================

/** 运行状态标签映射（中文 UI） */
export const WORKFLOW_RUN_STATUS_LABELS: Record<string, string> = {
  pending: "待执行",
  running: "运行中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

export const STEP_STATUS_LABELS: Record<string, string> = {
  pending: "待执行",
  running: "运行中",
  completed: "已完成",
  failed: "失败",
  skipped: "已跳过",
  cancelled: "已取消",
};

export const STEP_TYPE_LABELS: Record<string, string> = {
  agent: "智能体",
  tool: "工具",
  shell: "命令",
  condition: "条件",
  parallel: "并行",
  wait: "等待",
  subworkflow: "子工作流",
};
