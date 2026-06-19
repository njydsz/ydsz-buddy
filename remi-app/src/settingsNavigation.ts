// FILE: settingsNavigation.ts
// Purpose: Share the settings topic taxonomy between the main sidebar and the settings screen.
// Layer: Route/UI support
// Exports: section ids, nav items, and search normalization helper

import {
  AdjustmentsIcon,
  ArchiveIcon,
  BellIcon,
  BrainIcon,
  type LucideIcon,
  PaletteIcon,
  PlugIcon,
  SettingsIcon,
  WrenchIcon,
  WorktreeIcon,
} from "./lib/icons";
import { useMessages, type Messages } from "./i18n";

export const SETTINGS_SECTION_IDS = [
  "general",
  "appearance",
  "notifications",
  "behavior",
  "worktrees",
  "archived",
  "models",
  "providers",
  "advanced",
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number];
export type SettingsNavGroupId = "app" | "peakcode";

export type SettingsNavItem = {
  id: SettingsSectionId;
  group: SettingsNavGroupId;
  label: string;
  description: string;
  icon: LucideIcon;
  eyebrow: string;
};

type SettingsNavItemSpec = {
  id: SettingsSectionId;
  group: SettingsNavGroupId;
  icon: LucideIcon;
  eyebrow: string;
  labelKey: keyof Messages["settings"]["nav"];
  descriptionKey: keyof Messages["settings"]["nav"];
};

const SETTINGS_NAV_ITEM_SPECS_INTERNAL: readonly SettingsNavItemSpec[] = [
  {
    id: "general",
    group: "app",
    icon: SettingsIcon,
    eyebrow: "Workflow defaults",
    labelKey: "general",
    descriptionKey: "general",
  },
  {
    id: "appearance",
    group: "app",
    icon: PaletteIcon,
    eyebrow: "Visual language",
    labelKey: "appearance",
    descriptionKey: "appearance",
  },
  {
    id: "notifications",
    group: "app",
    icon: BellIcon,
    eyebrow: "Alerts",
    labelKey: "notifications",
    descriptionKey: "notifications",
  },
  {
    id: "behavior",
    group: "app",
    icon: AdjustmentsIcon,
    eyebrow: "Interaction rules",
    labelKey: "behavior",
    descriptionKey: "behavior",
  },
  {
    id: "worktrees",
    group: "app",
    icon: WorktreeIcon,
    eyebrow: "Workspace management",
    labelKey: "worktrees",
    descriptionKey: "worktrees",
  },
  {
    id: "archived",
    group: "app",
    icon: ArchiveIcon,
    eyebrow: "Thread management",
    labelKey: "archived",
    descriptionKey: "archived",
  },
  {
    id: "models",
    group: "peakcode",
    icon: BrainIcon,
    eyebrow: "AI configuration",
    labelKey: "models",
    descriptionKey: "models",
  },
  {
    id: "providers",
    group: "peakcode",
    icon: PlugIcon,
    eyebrow: "Picker visibility",
    labelKey: "providers",
    descriptionKey: "providers",
  },
  {
    id: "advanced",
    group: "peakcode",
    icon: WrenchIcon,
    eyebrow: "System tools",
    labelKey: "advanced",
    descriptionKey: "advanced",
  },
] as const;

export function buildSettingsNavItems(messages: Messages): readonly SettingsNavItem[] {
  return SETTINGS_NAV_ITEM_SPECS_INTERNAL.map((spec) => {
    const entry = messages.settings.nav[spec.labelKey];
    return {
      id: spec.id,
      group: spec.group,
      icon: spec.icon,
      eyebrow: spec.eyebrow,
      label: entry.label,
      description: entry.description,
    };
  });
}

export function buildSettingsNavGroups(messages: Messages): ReadonlyArray<{
  id: SettingsNavGroupId;
  label: string;
}> {
  return [
    { id: "app", label: messages.settings.groups.app },
    { id: "peakcode", label: messages.settings.groups.peakcode },
  ];
}

export function useSettingsNavItems(): readonly SettingsNavItem[] {
  const messages = useMessages();
  return buildSettingsNavItems(messages);
}

export function useSettingsNavGroups(): ReadonlyArray<{
  id: SettingsNavGroupId;
  label: string;
}> {
  const messages = useMessages();
  return buildSettingsNavGroups(messages);
}

export const SETTINGS_NAV_GROUPS: ReadonlyArray<{
  id: SettingsNavGroupId;
  label: string;
}> = [
  { id: "app", label: "App" },
  { id: "peakcode", label: "Peak Code" },
] as const;

export const SETTINGS_NAV_ITEMS: readonly SettingsNavItem[] = [
  {
    id: "general",
    group: "app",
    label: "General",
    description: "Default provider, thread mode, and sidebar organization.",
    icon: SettingsIcon,
    eyebrow: "Workflow defaults",
  },
  {
    id: "appearance",
    group: "app",
    label: "Appearance",
    description: "Theme, typography, and timestamp formatting.",
    icon: PaletteIcon,
    eyebrow: "Visual language",
  },
  {
    id: "notifications",
    group: "app",
    label: "Notifications",
    description: "In-app toasts and desktop alerts.",
    icon: BellIcon,
    eyebrow: "Alerts",
  },
  {
    id: "behavior",
    group: "app",
    label: "Behavior",
    description: "Streaming, diff handling, and destructive confirmations.",
    icon: AdjustmentsIcon,
    eyebrow: "Interaction rules",
  },
  {
    id: "worktrees",
    group: "app",
    label: "Worktrees",
    description: "Review and clean up the worktrees created by Peak Code.",
    icon: WorktreeIcon,
    eyebrow: "Workspace management",
  },
  {
    id: "archived",
    group: "app",
    label: "Archived",
    description: "View and restore archived threads.",
    icon: ArchiveIcon,
    eyebrow: "Thread management",
  },
  {
    id: "models",
    group: "peakcode",
    label: "Models",
    description: "Git writing defaults and custom model slugs.",
    icon: BrainIcon,
    eyebrow: "AI configuration",
  },
  {
    id: "providers",
    group: "peakcode",
    label: "Providers",
    description: "Choose visible providers, review CLI installs, and update provider tools.",
    icon: PlugIcon,
    eyebrow: "Picker visibility",
  },
  {
    id: "advanced",
    group: "peakcode",
    label: "Advanced",
    description: "Keybindings, recovery, and version info.",
    icon: WrenchIcon,
    eyebrow: "System tools",
  },
] as const;

export function normalizeSettingsSection(value: unknown): SettingsSectionId {
  if (typeof value !== "string") {
    return "general";
  }
  return SETTINGS_SECTION_IDS.find((candidate) => candidate === value) ?? "general";
}
