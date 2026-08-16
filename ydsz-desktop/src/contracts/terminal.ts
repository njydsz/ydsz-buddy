/**
 * @file 终端会话契约模块
 *
 * 本模块定义了 ydsz 工作区中终端（Terminal）会话管理的所有契约，
 * 涵盖终端的创建、写入、调整大小、清除、重启、关闭等操作及事件。
 *
 * ## 核心契约
 *
 * - `DEFAULT_TERMINAL_ID`：默认终端 ID
 * - `TerminalThreadInput`：线程级别的终端输入（仅需 threadId）
 * - `TerminalSessionInput`：会话级别终端输入（threadId + terminalId）
 * - `TerminalOpenInput`：打开终端的输入
 * - `TerminalWriteInput`：向终端写入数据的输入
 * - `TerminalResizeInput`：调整终端大小的输入
 * - `TerminalClearInput`：清除终端内容的输入
 * - `TerminalRestartInput`：重启终端的输入
 * - `TerminalCloseInput`：关闭终端的输入
 * - `TerminalSessionStatus`：终端会话状态枚举
 * - `TerminalSessionSnapshot`：终端会话完整快照
 * - `TerminalEvent`：终端事件联合类型（started / output / exited / error / cleared / restarted / activity）
 *
 * ## 协议设计
 *
 * - **会话隔离**：每个终端会话由 threadId + terminalId 唯一标识
 * - **事件流**：终端输出通过 WebSocket 实时推送
 * - **环境变量**：支持通过 `env` 参数注入自定义环境变量
 * - **尺寸约束**：终端列数 20-400，行数 5-200
 *
 * ## 使用场景
 *
 * - IDE 集成终端面板
 * - Agent 执行命令的实时输出
 * - 交互式 CLI 工具
 *
 * ## 注意事项
 *
 * - 环境变量 key 必须符合 `^[A-Za-z_][A-Za-z0-9_]*$` 格式
 * - 每个终端最多 128 个环境变量
 * - 写入数据长度限制 1-65536 字符
 */

import { Schema } from "effect";
import { TrimmedNonEmptyString } from "./baseSchemas";

/** 默认终端 ID，当请求中未指定 terminalId 时使用 */
export const DEFAULT_TERMINAL_ID = "default";

const TrimmedNonEmptyStringSchema = TrimmedNonEmptyString;
const TerminalColsSchema = Schema.Int.pipe(
  Schema.greaterThanOrEqualTo(20),
  Schema.lessThanOrEqualTo(400),
);
const TerminalRowsSchema = Schema.Int.pipe(
  Schema.greaterThanOrEqualTo(5),
  Schema.lessThanOrEqualTo(200),
);
const TerminalIdSchema = TrimmedNonEmptyStringSchema.pipe(Schema.maxLength(128));
const TerminalEnvKeySchema = Schema.String.pipe(
  Schema.pattern(/^[A-Za-z_][A-Za-z0-9_]*$/),
  Schema.maxLength(128),
);
const TerminalEnvValueSchema = Schema.String.pipe(Schema.maxLength(8_192));
const TerminalEnvSchema = Schema.Record({
  key: TerminalEnvKeySchema,
  value: TerminalEnvValueSchema,
}).pipe(Schema.filter((env) => Object.keys(env).length <= 128));

const TerminalIdWithDefaultSchema = Schema.optional(TerminalIdSchema).pipe(
  Schema.withDecodingDefault(() => DEFAULT_TERMINAL_ID),
);

/**
 * 线程级别的终端输入，仅包含 threadId。
 * 用于只需要线程上下文、不需要特定终端 ID 的操作。
 */
export const TerminalThreadInput = Schema.Struct({
  threadId: TrimmedNonEmptyStringSchema,
});
export type TerminalThreadInput = typeof TerminalThreadInput.Encoded;

/**
 * 会话级别的终端输入，包含 threadId 和可选的 terminalId。
 * terminalId 省略时默认为 "default"。
 */
const TerminalSessionInput = Schema.Struct({
  ...TerminalThreadInput.fields,
  terminalId: TerminalIdWithDefaultSchema,
});
export type TerminalSessionInput = typeof TerminalSessionInput.Encoded;

/** 打开新终端的输入参数 */
export const TerminalOpenInput = Schema.Struct({
  ...TerminalSessionInput.fields,
  cwd: TrimmedNonEmptyStringSchema,
  cols: Schema.optional(TerminalColsSchema),
  rows: Schema.optional(TerminalRowsSchema),
  env: Schema.optional(TerminalEnvSchema),
});
export type TerminalOpenInput = typeof TerminalOpenInput.Encoded;

/** 向终端写入数据的输入参数 */
export const TerminalWriteInput = Schema.Struct({
  ...TerminalSessionInput.fields,
  data: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(65_536)),
});
export type TerminalWriteInput = typeof TerminalWriteInput.Encoded;

/** 调整终端尺寸的输入参数 */
export const TerminalResizeInput = Schema.Struct({
  ...TerminalSessionInput.fields,
  cols: TerminalColsSchema,
  rows: TerminalRowsSchema,
});
export type TerminalResizeInput = typeof TerminalResizeInput.Encoded;

/** 清除终端内容的输入参数 */
export const TerminalClearInput = TerminalSessionInput;
export type TerminalClearInput = typeof TerminalClearInput.Encoded;

/** 重启终端的输入参数 */
export const TerminalRestartInput = Schema.Struct({
  ...TerminalSessionInput.fields,
  cwd: TrimmedNonEmptyStringSchema,
  cols: TerminalColsSchema,
  rows: TerminalRowsSchema,
  env: Schema.optional(TerminalEnvSchema),
});
export type TerminalRestartInput = typeof TerminalRestartInput.Encoded;

/** 关闭终端的输入参数 */
export const TerminalCloseInput = Schema.Struct({
  ...TerminalThreadInput.fields,
  terminalId: Schema.optional(TerminalIdSchema),
  deleteHistory: Schema.optional(Schema.Boolean),
});
export type TerminalCloseInput = typeof TerminalCloseInput.Encoded;

/** 终端会话状态枚举 */
export const TerminalSessionStatus = Schema.Literal("starting", "running", "exited", "error");
export type TerminalSessionStatus = typeof TerminalSessionStatus.Type;

/**
 * 终端会话完整快照，包含会话的实时状态、历史记录和进程信息。
 * 用于在 UI 中渲染终端面板或持久化会话状态。
 */
export const TerminalSessionSnapshot = Schema.Struct({
  threadId: Schema.String.pipe(Schema.minLength(1)),
  terminalId: Schema.String.pipe(Schema.minLength(1)),
  cwd: Schema.String.pipe(Schema.minLength(1)),
  status: TerminalSessionStatus,
  pid: Schema.NullOr(Schema.Int.pipe(Schema.greaterThan(0))),
  history: Schema.String,
  exitCode: Schema.NullOr(Schema.Int),
  exitSignal: Schema.NullOr(Schema.Int),
  updatedAt: Schema.String,
});
export type TerminalSessionSnapshot = typeof TerminalSessionSnapshot.Type;

const TerminalEventBaseSchema = Schema.Struct({
  threadId: Schema.String.pipe(Schema.minLength(1)),
  terminalId: Schema.String.pipe(Schema.minLength(1)),
  createdAt: Schema.String,
});

/** 终端启动事件 */
const TerminalStartedEvent = Schema.Struct({
  ...TerminalEventBaseSchema.fields,
  type: Schema.Literal("started"),
  snapshot: TerminalSessionSnapshot,
});

/** 终端输出事件 */
const TerminalOutputEvent = Schema.Struct({
  ...TerminalEventBaseSchema.fields,
  type: Schema.Literal("output"),
  data: Schema.String,
});

/** 终端退出事件 */
const TerminalExitedEvent = Schema.Struct({
  ...TerminalEventBaseSchema.fields,
  type: Schema.Literal("exited"),
  exitCode: Schema.NullOr(Schema.Int),
  exitSignal: Schema.NullOr(Schema.Int),
});

/** 终端错误事件 */
const TerminalErrorEvent = Schema.Struct({
  ...TerminalEventBaseSchema.fields,
  type: Schema.Literal("error"),
  message: Schema.String.pipe(Schema.minLength(1)),
});

/** 终端清除事件 */
const TerminalClearedEvent = Schema.Struct({
  ...TerminalEventBaseSchema.fields,
  type: Schema.Literal("cleared"),
});

/** 终端重启事件 */
const TerminalRestartedEvent = Schema.Struct({
  ...TerminalEventBaseSchema.fields,
  type: Schema.Literal("restarted"),
  snapshot: TerminalSessionSnapshot,
});

/**
 * 终端活动事件，反映 Agent 在终端中的状态变化。
 * - `cliKind`：当前运行的 CLI 类型（codex / claude）
 * - `agentState`：Agent 状态（running / attention / review）
 */
const TerminalActivityEvent = Schema.Struct({
  ...TerminalEventBaseSchema.fields,
  type: Schema.Literal("activity"),
  hasRunningSubprocess: Schema.Boolean,
  cliKind: Schema.NullOr(
    Schema.Union(Schema.Literal("codex"), Schema.Literal("claude")),
  ),
  agentState: Schema.NullOr(
    Schema.Union(
      Schema.Literal("running"),
      Schema.Literal("attention"),
      Schema.Literal("review"),
    ),
  ),
});

/**
 * 终端事件联合类型，涵盖终端生命周期中所有可能的事件。
 * - `started`：终端启动成功
 * - `output`：终端输出数据
 * - `exited`：终端进程退出
 * - `error`：终端发生错误
 * - `cleared`：终端内容被清除
 * - `restarted`：终端被重启
 * - `activity`：终端活动状态变化
 */
export const TerminalEvent = Schema.Union(
  TerminalStartedEvent,
  TerminalOutputEvent,
  TerminalExitedEvent,
  TerminalErrorEvent,
  TerminalClearedEvent,
  TerminalRestartedEvent,
  TerminalActivityEvent,
);
export type TerminalEvent = typeof TerminalEvent.Type;
