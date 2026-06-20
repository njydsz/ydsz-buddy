/**
 * @file terminalActivity.ts
 * @description 缁堢娲诲姩鐘舵€佽浆鎹㈠櫒銆? * 灏嗗悗绔帹閫佺殑 TerminalEvent 杞崲涓哄墠绔娇鐢ㄧ殑 TerminalActivityUpdate锛? * 鎻愬彇 Agent 鐘舵€佸拰瀛愯繘绋嬭繍琛屼俊鎭紝鐢ㄤ簬缁堢 UI 鐨勬椿鍔ㄦ寚绀哄櫒灞曠ず銆? */

import type { TerminalEvent } from "~/contracts";
import type { TerminalActivityState } from "~/shared/terminalThreads";

/**
 * 缁堢娲诲姩鐘舵€佹洿鏂版暟鎹紝鍖呭惈 Agent 杩愯鐘舵€佸拰瀛愯繘绋嬩俊鎭€? */
export interface TerminalActivityUpdate {
  /** Agent 褰撳墠娲诲姩鐘舵€侊紝涓?null 琛ㄧず鏃犳椿鍔?*/
  agentState: TerminalActivityState | null;
  /** 鏄惁鏈夋鍦ㄨ繍琛岀殑瀛愯繘绋?*/
  hasRunningSubprocess: boolean;
}

/**
 * 浠庣粓绔簨浠朵腑鎻愬彇娲诲姩鐘舵€佹洿鏂般€? * 浠呭鐞?"activity" 绫诲瀷鐨勪簨浠讹紝鍏朵粬绫诲瀷锛坰tarted/restarted/exited锛夎繑鍥為噸缃姸鎬併€? *
 * @param event - 鍚庣鎺ㄩ€佺殑缁堢浜嬩欢
 * @returns 娲诲姩鐘舵€佹洿鏂版暟鎹紝鑻ヤ簨浠剁被鍨嬫棤娉曟槧灏勫垯杩斿洖 null
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
