import { useEffect, useState } from "react";
import { ydszSettingsApi } from "../api/modules/settings";

/** Whether tool-approval UI should show (HITL or command-guard require_approval). */
export function useHitlEnabled(agentId?: string | null): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void ydszSettingsApi
      .hitl(agentId)
      .then((data) => {
        if (!cancelled) setEnabled(Boolean(data.show_approval_ui));
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  return enabled;
}
