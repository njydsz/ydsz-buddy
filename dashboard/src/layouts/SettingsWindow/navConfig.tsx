import type { ReactNode } from "react";
import {
  Activity,
  Cloudy,
  Cpu,
  HardDrive,
  Monitor,
  Puzzle,
  RefreshCw,
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
  | "environments";

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
 * Mirrors the sidebar's settings/control/admin groups, filtered to entries
 * that make sense inside a focused settings window (excludes workbench, acp,
 * chat, experts, etc.).
 */
export function buildSettingsNavGroups(
  user: YdszUser | null,
): SettingsNavGroup[] {
  const modelItems: SettingsNavItem[] = [];
  if (navAllowed(user, "models")) {
    modelItems.push({
      key: "models",
      icon: <Cpu size={iconSize} strokeWidth={iconStroke} />,
      labelKey: "nav.models",
    });
  }

  const accountItems: SettingsNavItem[] = [];
  if (navAllowed(user, "admin-users")) {
    accountItems.push({
      key: "admin-users",
      icon: <UsersIcon size={iconSize} strokeWidth={iconStroke} />,
      labelKey: "nav.adminUsers",
    });
  }
  if (navAllowed(user, "admin-storage")) {
    accountItems.push({
      key: "admin-storage",
      icon: <HardDrive size={iconSize} strokeWidth={iconStroke} />,
      labelKey: "nav.adminStorage",
    });
  }
  if (navAllowed(user, "admin-security")) {
    accountItems.push({
      key: "admin-security",
      icon: <Shield size={iconSize} strokeWidth={iconStroke} />,
      labelKey: "nav.security",
    });
  }

  const integrationItems: SettingsNavItem[] = [];
  if (navAllowed(user, "personalization")) {
    integrationItems.push({
      key: "personalization",
      icon: <Sparkles size={iconSize} strokeWidth={iconStroke} />,
      labelKey: "nav.personalization",
    });
  }
  if (navAllowed(user, "channels")) {
    integrationItems.push({
      key: "channels",
      icon: <Waypoints size={iconSize} strokeWidth={iconStroke} />,
      labelKey: "nav.channels",
    });
  }
  integrationItems.push({
    key: "bridge",
    icon: <Cloudy size={iconSize} strokeWidth={iconStroke} />,
    labelKey: "nav.bridge",
    badge: "Beta",
  });

  const systemItems: SettingsNavItem[] = [];
  if (navAllowed(user, "admin-plugins")) {
    systemItems.push({
      key: "admin-plugins",
      icon: <Puzzle size={iconSize} strokeWidth={iconStroke} />,
      labelKey: "nav.adminPlugins",
    });
  }
  if (navAllowed(user, "admin-advanced")) {
    systemItems.push({
      key: "admin-advanced",
      icon: <SlidersHorizontal size={iconSize} strokeWidth={iconStroke} />,
      labelKey: "nav.adminAdvanced",
    });
  }
  if (navAllowed(user, "admin-advanced")) {
    systemItems.push({
      key: "updates",
      icon: <RefreshCw size={iconSize} strokeWidth={iconStroke} />,
      labelKey: "nav.checkUpdates",
    });
  }
  if (navAllowed(user, "admin-advanced")) {
    systemItems.push({
      key: "environments",
      icon: <Variable size={iconSize} strokeWidth={iconStroke} />,
      labelKey: "nav.environments",
    });
  }

  const remoteItems: SettingsNavItem[] = [];
  if (userCan(user, "desktop") || userCan(user, "mobile")) {
    remoteItems.push({
      key: "remote-desktop",
      icon: <Monitor size={iconSize} strokeWidth={iconStroke} />,
      labelKey: "nav.remoteDesktop",
    });
  }

  const analyticsItems: SettingsNavItem[] = [];
  if (navAllowed(user, "token-usage")) {
    analyticsItems.push({
      key: "token-usage",
      icon: <Activity size={iconSize} strokeWidth={iconStroke} />,
      labelKey: "nav.tokenUsage",
    });
  }

  const groups: SettingsNavGroup[] = [];
  if (modelItems.length > 0) {
    groups.push({ groupKey: "settingsWindow.group.models", items: modelItems });
  }
  if (accountItems.length > 0) {
    groups.push({
      groupKey: "settingsWindow.group.account",
      items: accountItems,
    });
  }
  if (integrationItems.length > 0) {
    groups.push({
      groupKey: "settingsWindow.group.integration",
      items: integrationItems,
    });
  }
  if (systemItems.length > 0) {
    groups.push({
      groupKey: "settingsWindow.group.system",
      items: systemItems,
    });
  }
  if (remoteItems.length > 0) {
    groups.push({
      groupKey: "settingsWindow.group.remote",
      items: remoteItems,
    });
  }
  if (analyticsItems.length > 0) {
    groups.push({
      groupKey: "settingsWindow.group.analytics",
      items: analyticsItems,
    });
  }
  return groups;
}
