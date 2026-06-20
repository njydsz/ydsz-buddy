/**
 * @file terminal.ts
 * @description 终端操作相关的共享契约。定义了终端会话的输入参数、状态快照和事件类型的 Schema。
 * 支持终端的打开、写入、调整大小、清屏、重启、关闭等操作，以及终端事件的推送（启动、输出、退出、错误、清屏、重启、活动状态）。
 * 客户端和服务端共享使用，用于统一终端相关的类型定义和校验规则。
 */

import type { TrimmedNonEmptyString } from "./baseSchemas";

/** 默认终端 ID，当未指定终端时使用此值 */
export const DEFAULT_TERMINAL_ID = "default";

/** 终端会话输入的基础参数，仅需 threadId */
export interface TerminalThreadInput {
  /** 会话线程 ID */
  threadId: string;
}

/** 终端会话输入参数，包含 threadId 和 terminalId（可选，默认使用 DEFAULT_TERMINAL_ID） */
export interface TerminalSessionInput extends TerminalThreadInput {
  /** 终端 ID，未指定时使用默认值 */
  terminalId: string;
}

/** 打开终端的输入参数，包含工作目录、可选的列数、行数和环境变量 */
export interface TerminalOpenInput extends TerminalSessionInput {
  /** 终端的工作目录（绝对路径） */
  cwd: string;
  /** 终端列数（可选） */
  cols?: number;
  /** 终端行数（可选） */
  rows?: number;
  /** 终端环境变量（可选） */
  env?: Record<string, string>;
}

/** 向终端写入数据的输入参数，data 不能为空且最大长度 65536 */
export interface TerminalWriteInput extends TerminalSessionInput {
  /** 要写入终端的数据 */
  data: string;
}

/** 调整终端大小的输入参数，指定新的列数和行数 */
export interface TerminalResizeInput extends TerminalSessionInput {
  /** 新的终端列数 */
  cols: number;
  /** 新的终端行数 */
  rows: number;
}

/** 清屏终端的输入参数，复用 TerminalSessionInput */
export type TerminalClearInput = TerminalSessionInput;

/** 重启终端的输入参数，包含工作目录、列数、行数和可选的环境变量 */
export interface TerminalRestartInput extends TerminalSessionInput {
  /** 重启后的工作目录 */
  cwd: string;
  /** 终端列数 */
  cols: number;
  /** 终端行数 */
  rows: number;
  /** 终端环境变量（可选） */
  env?: Record<string, string>;
}

/** 关闭终端的输入参数，terminalId 和 deleteHistory 均可选 */
export interface TerminalCloseInput extends TerminalThreadInput {
  /** 要关闭的终端 ID（可选，不指定则关闭该线程下所有终端） */
  terminalId?: string;
  /** 是否同时删除终端历史记录 */
  deleteHistory?: boolean;
}

/** 终端会话状态枚举：starting（启动中）、running（运行中）、exited（已退出）、error（错误） */
export type TerminalSessionStatus = "starting" | "running" | "exited" | "error";

/** 终端会话快照，记录终端当前的完整状态信息 */
export interface TerminalSessionSnapshot {
  /** 会话线程 ID */
  threadId: string;
  /** 终端 ID */
  terminalId: string;
  /** 工作目录 */
  cwd: string;
  /** 终端状态 */
  status: TerminalSessionStatus;
  /** 终端进程 PID，未启动时为 null */
  pid: number | null;
  /** 终端历史输出内容 */
  history: string;
  /** 进程退出码，未退出时为 null */
  exitCode: number | null;
  /** 进程退出信号，未退出时为 null */
  exitSignal: number | null;
  /** 状态更新时间戳 */
  updatedAt: string;
}

interface TerminalEventBase {
  /** 会话线程 ID */
  threadId: string;
  /** 终端 ID */
  terminalId: string;
  /** 事件创建时间戳 */
  createdAt: string;
}

/** 终端启动事件，携带启动后的会话快照 */
interface TerminalStartedEvent extends TerminalEventBase {
  type: "started";
  snapshot: TerminalSessionSnapshot;
}

/** 终端输出事件，携带输出的文本数据 */
interface TerminalOutputEvent extends TerminalEventBase {
  type: "output";
  data: string;
}

/** 终端退出事件，携带退出码和退出信号 */
interface TerminalExitedEvent extends TerminalEventBase {
  type: "exited";
  exitCode: number | null;
  exitSignal: number | null;
}

/** 终端错误事件，携带错误信息 */
interface TerminalErrorEvent extends TerminalEventBase {
  type: "error";
  message: string;
}

/** 终端清屏事件 */
interface TerminalClearedEvent extends TerminalEventBase {
  type: "cleared";
}

/** 终端重启事件，携带重启后的会话快照 */
interface TerminalRestartedEvent extends TerminalEventBase {
  type: "restarted";
  snapshot: TerminalSessionSnapshot;
}

/** 终端活动状态事件，用于上报终端内子进程和 AI Agent 的运行状态 */
interface TerminalActivityEvent extends TerminalEventBase {
  type: "activity";
  /** 是否有正在运行的子进程 */
  hasRunningSubprocess: boolean;
  /** CLI 工具类型：codex 或 claude，无则为 null */
  cliKind: "codex" | "claude" | null;
  /** Agent 状态：running（运行中）、attention（需要关注）、review（待审核），无则为 null */
  agentState: "running" | "attention" | "review" | null;
}

/** 终端事件联合类型，包含所有可能的终端事件类型 */
export type TerminalEvent =
  | TerminalStartedEvent
  | TerminalOutputEvent
  | TerminalExitedEvent
  | TerminalErrorEvent
  | TerminalClearedEvent
  | TerminalRestartedEvent
  | TerminalActivityEvent;
