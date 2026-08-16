/**
 * @file Linear 集成契约模块
 *
 * 定义与 Linear (linear.app) 项目管理平台交互的所有 RPC 契约。
 *
 * ## 数据流
 *
 * 1. 前端 `LinearTaskBrowser` 组件调用 `nativeApi.linear.listTasks()`
 * 2. WebSocket RPC 到后端 `linear.listTasks`
 * 3. 后端调用 Linear GraphQL API (`https://api.linear.app/graphql`)
 * 4. 返回 `LinearTaskSummary[]`，前端渲染列表
 * 5. 用户选择任务 → 调用 `linear.createThreadFromTask`
 * 6. 后端创建 worktree + 分发 ThreadCreateCommand
 *
 * ## 认证
 *
 * - 用户通过 `linear.setApiKey` 设置 API Key
 * - 后端 `LinearApiKeyStore` 仅存进程内存,但前端会通过 `credentialVault.ts`
 *   把 key 持久化到 OS Keyring(或 localStorage XOR 混淆 / sessionStorage);
 *   应用启动时由 `loadLinearCredentialsOnBoot()` 自动恢复到后端 store。
 * - 用户在 `LinearTaskBrowser` setup 视图点击 "Disconnect" 会同时清除
 *   vault 和后端内存中的 key。
 * - API Key 从 Linear Settings → API 获取
 */

import { Schema } from "effect";
import { TrimmedNonEmptyString } from "./baseSchemas";

// ── 数据类型 ──────────────────────────────────────────────────────────

/** Linear 任务摘要（列表展示用） */
export const LinearTaskSummary = Schema.Struct({
  /** 任务 ID（Linear 内部 UUID） */
  id: TrimmedNonEmptyString,
  /** 任务标识符（如 "ENG-123"） */
  identifier: TrimmedNonEmptyString,
  /** 任务标题 */
  title: TrimmedNonEmptyString,
  /** 任务状态名称（如 "Backlog", "In Progress", "Done"） */
  stateName: Schema.String,
  /** 优先级（0-4，0 最低） */
  priority: Schema.Number,
  /** 团队名称 */
  teamName: Schema.String,
  /** 负责人名称 */
  assigneeName: Schema.optional(Schema.String),
  /** 任务 URL */
  url: Schema.String,
  /** 更新时间 */
  updatedAt: Schema.optional(Schema.String),
});
export type LinearTaskSummary = typeof LinearTaskSummary.Type;

/** Linear 任务详情 */
export const LinearTaskDetail = Schema.Struct({
  id: TrimmedNonEmptyString,
  identifier: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString,
  description: Schema.optional(Schema.String),
  stateName: Schema.String,
  priority: Schema.Number,
  teamName: Schema.String,
  teamKey: Schema.String,
  assigneeName: Schema.optional(Schema.String),
  creatorName: Schema.optional(Schema.String),
  labels: Schema.optional(Schema.Array(Schema.String)),
  url: Schema.String,
  createdAt: Schema.optional(Schema.String),
  updatedAt: Schema.optional(Schema.String),
});
export type LinearTaskDetail = typeof LinearTaskDetail.Type;

/** Linear 认证状态 */
export const LinearAuthStatus = Schema.Struct({
  set: Schema.Boolean,
});
export type LinearAuthStatus = typeof LinearAuthStatus.Type;

/** 设置 API Key 的结果 */
export const LinearSetApiKeyResult = Schema.Struct({
  valid: Schema.Boolean,
  viewerName: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
});
export type LinearSetApiKeyResult = typeof LinearSetApiKeyResult.Type;

/** 从 Linear task 创建线程的结果 */
export const LinearCreateThreadResult = Schema.Struct({
  threadId: TrimmedNonEmptyString,
  branch: Schema.String,
  worktreePath: Schema.String,
  taskDetail: LinearTaskDetail,
});
export type LinearCreateThreadResult = typeof LinearCreateThreadResult.Type;

/** 更新任务状态的结果 */
export const LinearUpdateTaskStatusResult = Schema.Struct({
  success: Schema.Boolean,
  newState: Schema.optional(Schema.String),
});
export type LinearUpdateTaskStatusResult = typeof LinearUpdateTaskStatusResult.Type;

// ── 请求参数 ──────────────────────────────────────────────────────────

/** `linear.setApiKey` 请求参数 */
export const LinearSetApiKeyInput = Schema.Struct({
  apiKey: TrimmedNonEmptyString,
});
export type LinearSetApiKeyInput = typeof LinearSetApiKeyInput.Type;

/** `linear.listTasks` 请求参数 */
export const LinearListTasksInput = Schema.Struct({
  state: Schema.optional(
    Schema.Literal("active", "backlog", "completed", "canceled", "all"),
  ),
  limit: Schema.optional(Schema.Number),
});
export type LinearListTasksInput = typeof LinearListTasksInput.Type;

/** `linear.searchTasks` 请求参数 */
export const LinearSearchTasksInput = Schema.Struct({
  query: TrimmedNonEmptyString,
  limit: Schema.optional(Schema.Number),
});
export type LinearSearchTasksInput = typeof LinearSearchTasksInput.Type;

/** `linear.getTask` 请求参数 */
export const LinearGetTaskInput = Schema.Struct({
  taskId: TrimmedNonEmptyString,
});
export type LinearGetTaskInput = typeof LinearGetTaskInput.Type;

/** `linear.createThreadFromTask` 请求参数 */
export const LinearCreateThreadFromTaskInput = Schema.Struct({
  taskId: TrimmedNonEmptyString,
  projectId: TrimmedNonEmptyString,
  cwd: TrimmedNonEmptyString,
  baseBranch: Schema.optional(Schema.String),
  autoStart: Schema.optional(Schema.Boolean),
});
export type LinearCreateThreadFromTaskInput = typeof LinearCreateThreadFromTaskInput.Type;

/** `linear.updateTaskStatus` 请求参数 */
export const LinearUpdateTaskStatusInput = Schema.Struct({
  taskId: TrimmedNonEmptyString,
  stateId: Schema.optional(Schema.String),
  stateName: Schema.optional(Schema.String),
});
export type LinearUpdateTaskStatusInput = typeof LinearUpdateTaskStatusInput.Type;
