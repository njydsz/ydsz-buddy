/**
 * @file terminal.ts
 * @description 终端操作相关的共享契约。定义了终端会话的输入参数、状态快照和事件类型的 Schema。
 * 支持终端的打开、写入、调整大小、清屏、重启、关闭等操作，以及终端事件的推送（启动、输出、退出、错误、清屏、重启、活动状态）。
 * 客户端和服务端共享使用，用于统一终端相关的类型定义和校验规则。
 */

import { Schema } from "effect";
import { TrimmedNonEmptyString } from "./baseSchemas";

/** 默认终端 ID，当未指定终端时使用此值 */
export const DEFAULT_TERMINAL_ID = "default";

/** 内部使用：非空字符串 Schema */
const TrimmedNonEmptyStringSchema = TrimmedNonEmptyString;
/** 终端列数 Schema，范围 20~400 */
const TerminalColsSchema = Schema.Int.check(Schema.isGreaterThanOrEqualTo(20)).check(
  Schema.isLessThanOrEqualTo(400),
);
/** 终端行数 Schema，范围 5~200 */
const TerminalRowsSchema = Schema.Int.check(Schema.isGreaterThanOrEqualTo(5)).check(
  Schema.isLessThanOrEqualTo(200),
);
/** 终端 ID Schema，最大长度 128 */
const TerminalIdSchema = TrimmedNonEmptyStringSchema.check(Schema.isMaxLength(128));
/** 终端环境变量键 Schema，需符合变量命名规则，最大长度 128 */
const TerminalEnvKeySchema = Schema.String.check(
  Schema.isPattern(/^[A-Za-z_][A-Za-z0-9_]*$/),
).check(Schema.isMaxLength(128));
/** 终端环境变量值 Schema，最大长度 8192 */
const TerminalEnvValueSchema = Schema.String.check(Schema.isMaxLength(8_192));
/** 终端环境变量 Schema，键值对记录，最多 128 个属性 */
const TerminalEnvSchema = Schema.Record(TerminalEnvKeySchema, TerminalEnvValueSchema).check(
  Schema.isMaxProperties(128),
);

/** 终端 ID Schema，未指定时默认使用 DEFAULT_TERMINAL_ID */
const TerminalIdWithDefaultSchema = TerminalIdSchema.pipe(
  Schema.withDecodingDefault(() => DEFAULT_TERMINAL_ID),
);

/** 终端会话输入的基础参数 Schema，仅需 threadId */
export const TerminalThreadInput = Schema.Struct({
  /** 会话线程 ID */
  threadId: TrimmedNonEmptyStringSchema,
});
export type TerminalThreadInput = Schema.Codec.Encoded<typeof TerminalThreadInput>;

/** 终端会话输入参数 Schema，包含 threadId 和 terminalId（可选，默认使用 DEFAULT_TERMINAL_ID） */
const TerminalSessionInput = Schema.Struct({
  ...TerminalThreadInput.fields,
  /** 终端 ID，未指定时使用默认值 */
  terminalId: TerminalIdWithDefaultSchema,
});
export type TerminalSessionInput = Schema.Codec.Encoded<typeof TerminalSessionInput>;

/** 打开终端的输入参数 Schema，包含工作目录、可选的列数、行数和环境变量 */
export const TerminalOpenInput = Schema.Struct({
  ...TerminalSessionInput.fields,
  /** 终端的工作目录（绝对路径） */
  cwd: TrimmedNonEmptyStringSchema,
  /** 终端列数（可选） */
  cols: Schema.optional(TerminalColsSchema),
  /** 终端行数（可选） */
  rows: Schema.optional(TerminalRowsSchema),
  /** 终端环境变量（可选） */
  env: Schema.optional(TerminalEnvSchema),
});
export type TerminalOpenInput = Schema.Codec.Encoded<typeof TerminalOpenInput>;

/** 向终端写入数据的输入参数 Schema，data 不能为空且最大长度 65536 */
export const TerminalWriteInput = Schema.Struct({
  ...TerminalSessionInput.fields,
  /** 要写入终端的数据 */
  data: Schema.String.check(Schema.isNonEmpty()).check(Schema.isMaxLength(65_536)),
});
export type TerminalWriteInput = Schema.Codec.Encoded<typeof TerminalWriteInput>;

/** 调整终端大小的输入参数 Schema，指定新的列数和行数 */
export const TerminalResizeInput = Schema.Struct({
  ...TerminalSessionInput.fields,
  /** 新的终端列数 */
  cols: TerminalColsSchema,
  /** 新的终端行数 */
  rows: TerminalRowsSchema,
});
export type TerminalResizeInput = Schema.Codec.Encoded<typeof TerminalResizeInput>;

/** 清屏终端的输入参数 Schema，复用 TerminalSessionInput */
export const TerminalClearInput = TerminalSessionInput;
export type TerminalClearInput = Schema.Codec.Encoded<typeof TerminalClearInput>;

/** 重启终端的输入参数 Schema，包含工作目录、列数、行数和可选的环境变量 */
export const TerminalRestartInput = Schema.Struct({
  ...TerminalSessionInput.fields,
  /** 重启后的工作目录 */
  cwd: TrimmedNonEmptyStringSchema,
  /** 终端列数 */
  cols: TerminalColsSchema,
  /** 终端行数 */
  rows: TerminalRowsSchema,
  /** 终端环境变量（可选） */
  env: Schema.optional(TerminalEnvSchema),
});
export type TerminalRestartInput = Schema.Codec.Encoded<typeof TerminalRestartInput>;

/** 关闭终端的输入参数 Schema，terminalId 和 deleteHistory 均可选 */
export const TerminalCloseInput = Schema.Struct({
  ...TerminalThreadInput.fields,
  /** 要关闭的终端 ID（可选，不指定则关闭该线程下所有终端） */
  terminalId: Schema.optional(TerminalIdSchema),
  /** 是否同时删除终端历史记录 */
  deleteHistory: Schema.optional(Schema.Boolean),
});
export type TerminalCloseInput = Schema.Codec.Encoded<typeof TerminalCloseInput>;

/** 终端会话状态枚举 Schema：starting（启动中）、running（运行中）、exited（已退出）、error（错误） */
export const TerminalSessionStatus = Schema.Literals(["starting", "running", "exited", "error"]);
export type TerminalSessionStatus = typeof TerminalSessionStatus.Type;

/** 终端会话快照 Schema，记录终端当前的完整状态信息 */
export const TerminalSessionSnapshot = Schema.Struct({
  /** 会话线程 ID */
  threadId: Schema.String.check(Schema.isNonEmpty()),
  /** 终端 ID */
  terminalId: Schema.String.check(Schema.isNonEmpty()),
  /** 工作目录 */
  cwd: Schema.String.check(Schema.isNonEmpty()),
  /** 终端状态 */
  status: TerminalSessionStatus,
  /** 终端进程 PID，未启动时为 null */
  pid: Schema.NullOr(Schema.Int.check(Schema.isGreaterThan(0))),
  /** 终端历史输出内容 */
  history: Schema.String,
  /** 进程退出码，未退出时为 null */
  exitCode: Schema.NullOr(Schema.Int),
  /** 进程退出信号，未退出时为 null */
  exitSignal: Schema.NullOr(Schema.Int),
  /** 状态更新时间戳 */
  updatedAt: Schema.String,
});
export type TerminalSessionSnapshot = typeof TerminalSessionSnapshot.Type;

/** 终端事件的基础字段 Schema，包含 threadId、terminalId 和 createdAt */
const TerminalEventBaseSchema = Schema.Struct({
  /** 会话线程 ID */
  threadId: Schema.String.check(Schema.isNonEmpty()),
  /** 终端 ID */
  terminalId: Schema.String.check(Schema.isNonEmpty()),
  /** 事件创建时间戳 */
  createdAt: Schema.String,
});

/** 终端启动事件，携带启动后的会话快照 */
const TerminalStartedEvent = Schema.Struct({
  ...TerminalEventBaseSchema.fields,
  type: Schema.Literal("started"),
  snapshot: TerminalSessionSnapshot,
});

/** 终端输出事件，携带输出的文本数据 */
const TerminalOutputEvent = Schema.Struct({
  ...TerminalEventBaseSchema.fields,
  type: Schema.Literal("output"),
  data: Schema.String,
});

/** 终端退出事件，携带退出码和退出信号 */
const TerminalExitedEvent = Schema.Struct({
  ...TerminalEventBaseSchema.fields,
  type: Schema.Literal("exited"),
  exitCode: Schema.NullOr(Schema.Int),
  exitSignal: Schema.NullOr(Schema.Int),
});

/** 终端错误事件，携带错误信息 */
const TerminalErrorEvent = Schema.Struct({
  ...TerminalEventBaseSchema.fields,
  type: Schema.Literal("error"),
  message: Schema.String.check(Schema.isNonEmpty()),
});

/** 终端清屏事件 */
const TerminalClearedEvent = Schema.Struct({
  ...TerminalEventBaseSchema.fields,
  type: Schema.Literal("cleared"),
});

/** 终端重启事件，携带重启后的会话快照 */
const TerminalRestartedEvent = Schema.Struct({
  ...TerminalEventBaseSchema.fields,
  type: Schema.Literal("restarted"),
  snapshot: TerminalSessionSnapshot,
});

/** 终端活动状态事件，用于上报终端内子进程和 AI Agent 的运行状态 */
const TerminalActivityEvent = Schema.Struct({
  ...TerminalEventBaseSchema.fields,
  type: Schema.Literal("activity"),
  /** 是否有正在运行的子进程 */
  hasRunningSubprocess: Schema.Boolean,
  /** CLI 工具类型：codex 或 claude，无则为 null */
  cliKind: Schema.NullOr(Schema.Union([Schema.Literal("codex"), Schema.Literal("claude")])),
  /** Agent 状态：running（运行中）、attention（需要关注）、review（待审核），无则为 null */
  agentState: Schema.NullOr(
    Schema.Union([
      Schema.Literal("running"),
      Schema.Literal("attention"),
      Schema.Literal("review"),
    ]),
  ),
});

/** 终端事件联合 Schema，包含所有可能的终端事件类型 */
export const TerminalEvent = Schema.Union([
  TerminalStartedEvent,
  TerminalOutputEvent,
  TerminalExitedEvent,
  TerminalErrorEvent,
  TerminalClearedEvent,
  TerminalRestartedEvent,
  TerminalActivityEvent,
]);
export type TerminalEvent = typeof TerminalEvent.Type;
