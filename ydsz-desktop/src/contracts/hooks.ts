/**
 * @file Workspace Hooks 契约模块
 *
 * 本模块定义了工作区生命周期钩子（Workspace Hooks）系统的所有契约，
 * 涵盖 Hook 事件枚举、Handler 类型、Hook 实体定义以及 Hook 执行上下文。
 *
 * ## 核心契约
 *
 * - `HookEvent`：支持的 Hook 事件名称（workspace:opened / session:started 等）
 * - `HookHandlerType`：处理方式类型（script / skill）
 * - `HookErrorPolicy`：错误策略（continue / abort）
 * - `WorkspaceHook`：Hook 完整定义
 * - `HookExecutionContext`：Hook 执行时的上下文信息
 * - `HookExecutionResult`：Hook 执行结果
 *
 * ## Hook 事件生命周期
 *
 * - `workspace:opened`：工作区打开后触发
 * - `workspace:closed`：工作区关闭前触发
 * - `session:started`：新会话创建时触发
 * - `session:ended`：会话结束时触发（达到终态）
 * - `file:changed`：工作区内文件变更时触发（防抖后）
 * - `command:before_exec`：危险命令执行前触发
 * - `command:after_exec`：命令执行完成后触发
 *
 * ## 使用场景
 *
 * - 自动化工作流（打开工作区时自动拉取最新代码）
 * - 会话管理（新会话时自动加载上下文）
 * - 文件变更响应（保存时自动格式化或 lint）
 * - 命令审计（记录所有执行的命令）
 */

import { Schema } from "effect";
import { TrimmedNonEmptyString, PositiveInt } from "./baseSchemas";

// ===== Hook 事件枚举 =====

export const HOOK_EVENT_NAMES = [
  "workspace:opened",
  "workspace:closed",
  "session:started",
  "session:ended",
  "file:changed",
  "command:before_exec",
  "command:after_exec",
] as const;

export const HookEvent = Schema.Literal(...HOOK_EVENT_NAMES);
export type HookEvent = typeof HookEvent.Type;

// ===== Handler 类型 =====

export const HookHandlerType = Schema.Literal("script", "skill");
export type HookHandlerType = typeof HookHandlerType.Type;

// ===== 错误策略 =====

export const HookErrorPolicy = Schema.Literal("continue", "abort");
export type HookErrorPolicy = typeof HookErrorPolicy.Type;

// ===== 默认值常量 =====

export const HOOK_DEFAULT_TIMEOUT_SECS = 30;
export const HOOK_SCRIPT_CONTENT_MAX_LENGTH = 65536; // 64KB
export const HOOK_NAME_MAX_LENGTH = 128;
export const HOOKS_MAX_COUNT = 100;

// ===== Hook 实体定义 =====

export const WorkspaceHook = Schema.Struct({
  id: TrimmedNonEmptyString,
  event: HookEvent,
  name: TrimmedNonEmptyString.pipe(Schema.maxLength(HOOK_NAME_MAX_LENGTH)),
  enabled: Schema.Boolean,
  handlerType: HookHandlerType,
  scriptContent: Schema.optional(
    Schema.String.pipe(Schema.maxLength(HOOK_SCRIPT_CONTENT_MAX_LENGTH)),
  ),
  skillId: Schema.optional(TrimmedNonEmptyString),
  timeoutSecs: PositiveInt.pipe(Schema.lessThanOrEqualTo(300)).pipe(
    Schema.withDecodingDefault(() => HOOK_DEFAULT_TIMEOUT_SECS),
  ),
  errorPolicy: HookErrorPolicy.pipe(
    Schema.withDecodingDefault(() => "continue" as const),
  ),
  createdAt: Schema.optional(Schema.String),
  updatedAt: Schema.optional(Schema.String),
});
export type WorkspaceHook = typeof WorkspaceHook.Type;

// ===== Hook 执行上下文 =====

export const HookExecutionContext = Schema.Struct({
  event: HookEvent,
  workspaceId: Schema.optional(TrimmedNonEmptyString),
  workspacePath: Schema.optional(Schema.String),
  sessionId: Schema.optional(TrimmedNonEmptyString),
  filePath: Schema.optional(Schema.String),
  command: Schema.optional(Schema.String),
  triggerId: TrimmedNonEmptyString,
  timestamp: Schema.String,
});
export type HookExecutionContext = typeof HookExecutionContext.Type;

// ===== Hook 执行结果 =====

export const HookExecutionStatus = Schema.Literal(
  "success",
  "error",
  "timeout",
  "skipped",
);
export type HookExecutionStatus = typeof HookExecutionStatus.Type;

export const HookExecutionResult = Schema.Struct({
  hookId: TrimmedNonEmptyString,
  hookName: TrimmedNonEmptyString,
  event: HookEvent,
  status: HookExecutionStatus,
  durationMs: Schema.Number,
  stdout: Schema.optional(Schema.String),
  stderr: Schema.optional(Schema.String),
  errorMessage: Schema.optional(Schema.String),
});
export type HookExecutionResult = typeof HookExecutionResult.Type;

// ===== 便捷类型导出（用于纯类型场景） =====

/** Hook 创建输入（不含自动生成的字段） */
export type WorkspaceHookInput = {
  event: HookEvent;
  name: string;
  enabled?: boolean;
  handlerType: HookHandlerType;
  scriptContent?: string;
  skillId?: string;
  timeoutSecs?: number;
  errorPolicy?: HookErrorPolicy;
};

/** 事件可读标签映射 */
export const HOOK_EVENT_LABELS: Record<HookEvent, string> = {
  "workspace:opened": "工作区打开",
  "workspace:closed": "工作区关闭",
  "session:started": "会话开始",
  "session:ended": "会话结束",
  "file:changed": "文件变更",
  "command:before_exec": "命令执行前",
  "command:after_exec": "命令执行后",
};

/** 事件分组（用于 UI 分类展示） */
export const HOOK_EVENT_GROUPS: Record<
  string,
  { label: string; events: HookEvent[] }
> = {
  workspace: {
    label: "工作区",
    events: ["workspace:opened", "workspace:closed"],
  },
  session: {
    label: "会话",
    events: ["session:started", "session:ended"],
  },
  file: {
    label: "文件",
    events: ["file:changed"],
  },
  command: {
    label: "命令",
    events: ["command:before_exec", "command:after_exec"],
  },
};
