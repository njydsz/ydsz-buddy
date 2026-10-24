export const CHAT_HISTORY_RAIL_ID = "ydsz-chat-history-rail";

/** Open mobile/desktop nav on the minimal-mode records pane. */
export const OPEN_NAV_RECORDS_EVENT = "ydsz:open-nav-records";

/** Notify listeners that per-user navigation preferences changed (e.g. saved from NavigationConfig). */
export const NAV_PREFS_CHANGED_EVENT = "ydsz:nav-prefs-changed";

export function isChatPath(pathname: string): boolean {
  return pathname === "/chat" || pathname.startsWith("/chat/");
}

export { isGroupedNavKey as isSettingsPaneNavKey } from "./sidebarNav";
