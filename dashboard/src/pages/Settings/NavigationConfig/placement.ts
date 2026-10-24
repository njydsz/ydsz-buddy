export type NavZone = "sidebar" | "settings";
export type SettingsGroup = "basic" | "settings" | "control" | "admin";

export interface NavPlacementItem {
  /** Unique nav key. */
  key: string;
  /** i18n label key (e.g. "nav.chat"). */
  labelKey: string;
  /** Which zone this item lands in by default. */
  defaultZone: NavZone;
  /** Default group inside the settings zone. Ignored for the sidebar zone. */
  defaultGroup: SettingsGroup | null;
  /**
   * Fixed items are always rendered in the sidebar zone and cannot be dragged
   * away from it. They are still sortable within the sidebar.
   */
  fixed?: boolean;
}

/**
 * Master list of all nav items surfaced in the Navigation Configuration panel.
 *
 * The sidebar zone renders **every** item whose current `nav_zones` value is
 * `sidebar` — fixed items (chat / experts / tasks) are locked there and never
 * appear in the settings zone.
 *
 * The settings zone groups items by `defaultGroup` on first load. Users can
 * reorder groups and items freely.
 */
export const ALL_NAV_ITEMS: NavPlacementItem[] = [
  // ── Fixed sidebar presence items ──────────────────────────────────────────
  // These always live in the main sidebar and cannot be moved to settings.
  { key: "chat",    labelKey: "nav.chat",    defaultZone: "sidebar", defaultGroup: null, fixed: true },
  { key: "experts", labelKey: "nav.experts", defaultZone: "sidebar", defaultGroup: null, fixed: true },
  { key: "tasks",   labelKey: "nav.tasks",   defaultZone: "sidebar", defaultGroup: null, fixed: true },

  // ── Movable items (default to sidebar) ───────────────────────────────────
  { key: "skill-packages",  labelKey: "nav.skillPackages",  defaultZone: "sidebar", defaultGroup: null },
  { key: "connectors",      labelKey: "nav.connectors",     defaultZone: "sidebar", defaultGroup: null },
  { key: "knowledge-bases", labelKey: "nav.knowledgeBases", defaultZone: "sidebar", defaultGroup: null },

  // ── Movable items (default to settings) ──────────────────────────────────
  { key: "models",          labelKey: "nav.models",          defaultZone: "settings", defaultGroup: "basic" },
  { key: "token-usage",     labelKey: "nav.tokenUsage",     defaultZone: "settings", defaultGroup: "basic" },
  { key: "personalization", labelKey: "nav.personalization", defaultZone: "settings", defaultGroup: "settings" },
  { key: "channels",        labelKey: "nav.channels",        defaultZone: "settings", defaultGroup: "settings" },
  { key: "cloud-collab",    labelKey: "nav.cloudCollab",     defaultZone: "settings", defaultGroup: "settings" },
  { key: "workbench",       labelKey: "nav.workbench",       defaultZone: "settings", defaultGroup: "control" },
  { key: "remote-desktop",  labelKey: "nav.remoteDesktop",   defaultZone: "settings", defaultGroup: "control" },
  { key: "acp",             labelKey: "nav.acp",             defaultZone: "settings", defaultGroup: "control" },
  { key: "admin-users",     labelKey: "nav.adminUsers",      defaultZone: "settings", defaultGroup: "admin" },
  { key: "admin-storage",   labelKey: "nav.adminStorage",    defaultZone: "settings", defaultGroup: "admin" },
  { key: "admin-plugins",   labelKey: "nav.adminPlugins",    defaultZone: "settings", defaultGroup: "admin" },
  { key: "admin-security",  labelKey: "nav.security",        defaultZone: "settings", defaultGroup: "admin" },
  { key: "admin-advanced",  labelKey: "nav.adminAdvanced",   defaultZone: "settings", defaultGroup: "admin" },
];

/** Subset of items that the user may drag between zones. */
export const MOVABLE_PLACEMENT_ITEMS: NavPlacementItem[] = ALL_NAV_ITEMS.filter((it) => !it.fixed);

/** Sidebar keys that are fixed (never moveto settings). */
export const FIXED_SIDEBAR_KEYS: ReadonlySet<string> = new Set(
  ALL_NAV_ITEMS.filter((it) => it.fixed).map((it) => it.key),
);

export function isFixedNavKey(key: string): boolean {
  return FIXED_SIDEBAR_KEYS.has(key);
}
