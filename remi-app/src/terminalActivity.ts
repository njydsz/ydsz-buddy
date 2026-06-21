import type { TerminalEvent } from "@remi-claw/contracts";
import type { TerminalActivityState } from "@remi-claw/shared/terminalThreads";

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
