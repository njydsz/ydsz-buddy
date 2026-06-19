// React hook wrapping the global log bridge. Components that mount
// the bridge install console / Tauri log / window error capture.
// The bridge is idempotent — calling it multiple times is safe.

export { useLogBridge, log, recordLog, subscribeLog, getLogRing } from "@/lib/logger";
import { useLogBridge as _impl } from "@/lib/logger";

/** Convenience hook — same as `useLogBridge`, exposed for app-level
 * mounting. The bridge is also auto-installed by `<LogPanel />`. */
export function useLogBridgeAuto() {
  _impl();
}
