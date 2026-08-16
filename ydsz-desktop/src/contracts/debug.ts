// Debug (DAP) 契约：与 ydsz-code/src/debug/types.rs 对齐。
//
// 命名约定：
// - Rust 端 `#[serde(rename_all = "camelCase")]` → TS 端 camelCase
// - 类型名：PascalCase

import { getSharedWsTransport } from "../wsTransport";

// ===== 共享类型 =====

export interface StartDebuggingParams {
  language: string;
  workspaceRoot: string;
  program: string;
  args?: string[];
  env?: Record<string, string>;
  launch: boolean;
  breakpoints?: DebugBreakpoint[];
}

export interface DebugBreakpoint {
  filePath: string;
  line: number;
  condition?: string;
  logMessage?: string;
  enabled: boolean;
}

export interface DebugThread {
  id: number;
  name: string;
}

export interface DebugStackFrame {
  id: number;
  name: string;
  source?: string;
  line: number;
  column: number;
  module?: string;
}

export interface DebugVariable {
  name: string;
  value: string;
  typeName?: string;
  variablesReference?: number;
}

export interface DebugSession {
  id: string;
  language: string;
  workspaceRoot: string;
  program: string;
  state: DebugSessionState;
  breakpoints: DebugBreakpoint[];
  threads: DebugThread[];
  stackFrames: DebugStackFrame[];
  createdAt: string;
}

export type DebugSessionState =
  | "created"
  | "configured"
  | "running"
  | "paused"
  | "terminated"
  | "failed";

export interface DebugAdapterConfig {
  language: string;
  displayName: string;
  command: string;
  args: string[];
  capabilities: DebugAdapterCapabilities;
}

export interface DebugAdapterCapabilities {
  supportsConditionalBreakpoints: boolean;
  supportsLogPoints: boolean;
  supportsFunctionBreakpoints: boolean;
  supportsExceptionBreakpoints: boolean;
  supportsStepBack: boolean;
  supportsEvaluate: boolean;
  supportsHover: boolean;
  supportsWatch: boolean;
}

// ===== RPC 调用封装 =====

/** 创建调试会话 */
export async function startDebugging(
  input: StartDebuggingParams,
): Promise<DebugSession> {
  const transport = getSharedWsTransport();
  return await transport.request<DebugSession>("debug.start", input);
}

/** 终止调试会话 */
export async function terminateDebugSession(
  sessionId: string,
): Promise<void> {
  const transport = getSharedWsTransport();
  await transport.request<void>("debug.terminate", { sessionId });
}

/** 列出所有调试会话 */
export async function listDebugSessions(): Promise<DebugSession[]> {
  const transport = getSharedWsTransport();
  return await transport.request<DebugSession[]>("debug.listSessions");
}

/** 设置断点 */
export async function setBreakpoints(
  sessionId: string,
  breakpoints: DebugBreakpoint[],
): Promise<void> {
  const transport = getSharedWsTransport();
  await transport.request<void>("debug.setBreakpoints", {
    sessionId,
    breakpoints,
  });
}

/** 继续（恢复运行） */
export async function continueDebug(sessionId: string): Promise<void> {
  const transport = getSharedWsTransport();
  await transport.request<void>("debug.continue", { sessionId });
}

/** 步过 */
export async function stepOver(sessionId: string): Promise<void> {
  const transport = getSharedWsTransport();
  await transport.request<void>("debug.stepOver", { sessionId });
}

/** 步入 */
export async function stepInto(sessionId: string): Promise<void> {
  const transport = getSharedWsTransport();
  await transport.request<void>("debug.stepInto", { sessionId });
}

/** 步出 */
export async function stepOut(sessionId: string): Promise<void> {
  const transport = getSharedWsTransport();
  await transport.request<void>("debug.stepOut", { sessionId });
}

/** 暂停 */
export async function pauseDebug(sessionId: string): Promise<void> {
  const transport = getSharedWsTransport();
  await transport.request<void>("debug.pause", { sessionId });
}

/** 求值表达式（REPL） */
export async function evaluateExpression(
  sessionId: string,
  expression: string,
  frameId?: number,
): Promise<string> {
  const transport = getSharedWsTransport();
  return await transport.request<string>("debug.evaluate", {
    sessionId,
    expression,
    frameId,
  });
}

/** 列出可用的调试适配器 */
export async function listDebugAdapters(): Promise<DebugAdapterConfig[]> {
  const transport = getSharedWsTransport();
  return await transport.request<DebugAdapterConfig[]>("debug.listAdapters");
}
