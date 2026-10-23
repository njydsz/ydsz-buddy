import type { ReactNode } from "react";
import {
  Activity,
  Cloudy,
  Cpu,
  Database,
  HardDrive,
  Link2,
  Monitor,
  Package,
  PanelsTopLeft,
  Puzzle,
  RefreshCw,
  Share2,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Users as UsersIcon,
  Variable,
  Waypoints,
} from "lucide-react";
import type { YdszUser } from "../../api/modules/auth";
import { navAllowed, userCan } from "../../utils/permissions";

const iconSize = 16;
const iconStroke = 1.8;

export type SettingsWindowKey =
  | "models"
  | "admin-users"
  | "admin-storage"
  | "channels"
  | "admin-plugins"
  | "personalization"
  | "bridge"
  | "admin-security"
  | "admin-advanced"
  | "remote-desktop"
  | "token-usage"
  | "updates"
  | "environments"
  | "connectors"
  | "skill-packages"
  | "knowledge-bases"
  | "workbench"
  | "acp";

export interface SettingsNavItem {
  key: SettingsWindowKey;
  icon: ReactNode;
  labelKey: string;
  badge?: string;
}

export interface SettingsNavGroup {
  groupKey: string;
  items: SettingsNavItem[];
}

/**
 * Ordered settings groups for the SettingsWindow left nav.
 *
 * Structure mirrors the main sidebar so the settings window exposes the same
 * surface. Some workbench-style items intentionally live under the settings
 * pane: connectors, skill-packages and knowledge-bases also have related
 * personalization controls, so they are discoverable from settings too.
 */
export function buildSettingsNavGroups(
  user: YdszUser | null,
): SettingsNavGroup[] {
  // ── Top-level (ungrouped) ──────────────────────────────────────────────
  const mainItems: SettingsNavItem[] = [];
  if (navAllowed(user, "models")) {
    mainItems.push({
      key: "models",
      icon: <Cpu size={iconSize} strokeWidth={iconStroke} />,
      labelKey: "nav.models",
    });
  }
  if (navAllowed(user, "token-usage")) {
    mainItems.push({
      key: "token-usage",
      icon: <Activity size={iconSize} strokeWidth={iconStroke} />,
      labelKey: "nav.tokenUsage",
    });
  }

  // ── 设置 (Settings) ───────────────────────────────────────────────────
  const settingsItems: SettingsNavItem[] = [];
  if (navAllowed(user, "personalization")) {
    settingsItems.push({
      key: "personalization",
      icon: <Sparkles size={iconSize} strokeWidth={iconStroke} />,
      labelKey: "nav.personalization",
    });
  }
  if (navAllowed(user, "channels")) {
    settingsItems.push({
      key: "channels",
      icon: <Waypoints size={iconSize} strokeWidth={iconStroke} />,
      labelKey: "nav.channels",
    });
  }
  if (navAllowed(user, "connectors")) {
    settingsItems.push({
      key: "connectors",
      icon: <Link2 size={iconSize} strokeWidth={iconStroke} />,
      labelKey: "nav.connectors",
    });
  }
  if (navAllowed(user, "skill-packages")) {
    settingsItems.push({
      key: "skill-packages",
      icon: <Package size={iconSize} strokeWidth={iconStroke} />,
      labelKey: "nav.skillPackages",
    });
  }
  if (navAllowed(user, "knowledge-bases")) {
    settingsItems.push({
      key: "knowledge-bases",
      icon: <Database size={iconSize} strokeWidth={iconStroke} />,
      labelKey: "nav.knowledgeBases",
    });
  }
  // bridge (cloud sync) — always available, no module permission gate.
  settingsItems.push({
    key: "bridge",
    icon: <Cloudy size={iconSize} strokeWidth={iconStroke} />,
    labelKey: "nav.bridge",
    badge: "Beta",
  });

  // ── 运维 (Control) ────────────────────────────────────────────────────
  const controlItems: SettingsNavItem[] = [];
  if (navAllowed(user, "workbench")) {
    controlItems.push({
      key: "workbench",
      icon: <PanelsTopLeft size={iconSize} strokeWidth={iconStroke} />,
      labelKey: "nav.workbench",
    });
  }
  if (userCan(user, "desktop") || userCan(user, "mobile")) {
    controlItems.push({
      key: "remote-desktop",
      icon: <Monitor size={iconSize} strokeWidth={iconStroke} />,
      labelKey: "nav.remoteDesktop",
    });
  }
  if (navAllowed(user, "acp")) {
    controlItems.push({
      key: "acp",
      icon: <Share2 size={iconSize} strokeWidth={iconStroke} />,
      labelKey: "nav.acp",
    });
  }

  // ── 管理 (Admin) ──────────────────────────────────────────────────────
  const adminItems: SettingsNavItem[] = [];
  if (navAllowed(user, "admin-users")) {
    adminItems.push({
      key: "admin-users",
      icon: <UsersIcon size={iconSize} strokeWidth={iconStroke} />,
      labelKey: "nav.adminUsers",
    });
  }
  if (navAllowed(user, "admin-storage")) {
    adminItems.push({
      key: "admin-storage",
      icon: <HardDrive size={iconSize} strokeWidth={iconStroke} />,
      labelKey: "nav.adminStorage",
    });
  }
  if (navAllowed(user, "admin-plugins")) {
    adminItems.push({
      key: "admin-plugins",
      icon: <Puzzle size={iconSize} strokeWidth={iconStroke} />,
      labelKey: "nav.adminPlugins",
    });
  }
  if (navAllowed(user, "admin-security")) {
    adminItems.push({
      key: "admin-security",
      icon: <Shield size={iconSize} strokeWidth={iconStroke} />,
      labelKey: "nav.security",
    });
  }
  if (navAllowed(user, "admin-advanced")) {
    adminItems.push({
      key: "admin-advanced",
      icon: <SlidersHorizontal size={iconSize} strokeWidth={iconStroke} />,
      labelKey: "nav.adminAdvanced",
    });
  }
  if (navAllowed(user, "admin-advanced")) {
    adminItems.push({
      key: "updates",
      icon: <RefreshCw size={iconSize} strokeWidth={iconStroke} />,
      labelKey: "nav.checkUpdates",
    });
  }
  if (navAllowed(user, "admin-advanced")) {
    adminItems.push({
      key: "environments",
      icon: <Variable size={iconSize} strokeWidth={iconStroke} />,
      labelKey: "nav.environments",
    });
  }

  // Assemble in sidebar order.
  const groups: SettingsNavGroup[] = [];
  if (mainItems.length > 0) {
    groups.push({ groupKey: "settingsWindow.group.main", items: mainItems });
  }
  if (settingsItems.length > 0) {
    groups.push({
      groupKey: "nav.settings",
      items: settingsItems,
    });
  }
  if (controlItems.length > 0) {
    groups.push({ groupKey: "nav.control", items: controlItems });
  }
  if (adminItems.length > 0) {
    groups.push({ groupKey: "nav.admin", items: adminItems });
  }
  return groups;
}
