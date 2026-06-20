/**
 * @file terminalActivity.ts
 * @description 终端活动状态转换器。
 * 将后端推送的 TerminalEvent 转换为前端使用的 TerminalActivityUpdate，
 * 提取 Agent 状态和子进程运行信息，用于终端 UI 的活动指示器展示。
 */

import type { TerminalEvent } from "@remi-code/contracts";
import type { TerminalActivityState } from "@remi-code/shared/terminalThreads";

/**
 * 终端活动状态更新数据，包含 Agent 运行状态和子进程信息。
 */
export interface TerminalActivityUpdate {
  /** Agent 当前活动状态，为 null 表示无活动 */
  agentState: TerminalActivityState | null;
  /** 是否有正在运行的子进程 */
  hasRunningSubprocess: boolean;
}

/**
 * 从终端事件中提取活动状态更新。
 * 仅处理 "activity" 类型的事件，其他类型（started/restarted/exited）返回重置状态。
 *
 * @param event - 后端推送的终端事件
 * @returns 活动状态更新数据，若事件类型无法映射则返回 null
 *
 * @example
 * ```ts
 * const update = terminalActivityFromEvent({ type: "activity", agentState: "running", hasRunningSubprocess: true });
 * // => { agentState: "running", hasRunningSubprocess: true }
 *
 * const reset = terminalActivityFromEvent({ type: "exited" });
 * // => { agentState: null, hasRunningSubprocess: false }
 * ```
 */
export function terminalActivityFromEvent(event: TerminalEvent): TerminalActivityUpdate | null {
  switch (event.type) {
    case "activity":
      return {
        hasRunningSubprocess: event.hasRunningSubprocess,
        agentState: event.agentState,
      };
    case "started":
    case "restarted":
    case "exited":
      return {
        hasRunningSubprocess: false,
        agentState: null,
      };
    default:
      return null;
  }
}
