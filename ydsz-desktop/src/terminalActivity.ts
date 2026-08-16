/**
 * @file 终端活动状态模块
 * @description 从终端事件推导终端活动状态，包括代理状态和子进程运行状态。
 */

import type { TerminalEvent } from "@ydsz-buddy/contracts";
import type { TerminalActivityState } from "@njydsz/shared/terminalThreads";

export interface TerminalActivityUpdate {
  agentState: TerminalActivityState | null;
  hasRunningSubprocess: boolean;
}

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
