/**
 * @file 设置页面导航
 *
 * 定义设置页面的分区分类体系，在主侧边栏和设置页面之间共享。
 * 包含分区 ID、导航项定义、分组信息和搜索标准化等工具。
 * 支持国际化（i18n）的导航项构建。
 */

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

/** 设置页面的分区 ID 列表，按显示顺序排列 */
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

/** 设置分区 ID 类型 */
export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number];
/** 设置导航分组 ID：app（应用级）和 remicode（Remi Code 专属） */
export type SettingsNavGroupId = "app" | "remicode";

/**
 * 设置导航项，包含分区 ID、分组、标签、描述和图标。
 */
export type SettingsNavItem = {
  /** 分区 ID */
  id: SettingsSectionId;
  /** 所属分组 */
  group: SettingsNavGroupId;
  /** 显示标签 */
  label: string;
  /** 功能描述 */
  description: string;
  /** 图标组件 */
  icon: LucideIcon;
  /** 眉标文字（分组标题下的小标签） */
  eyebrow: string;
};

/** 内部使用的导航项规格，使用 i18n 键引用标签和描述 */
type SettingsNavItemSpec = {
  id: SettingsSectionId;
  group: SettingsNavGroupId;
  icon: LucideIcon;
  eyebrow: string;
  labelKey: keyof Messages["settings"]["nav"];
  descriptionKey: keyof Messages["settings"]["nav"];
};

/** 内部导航项规格列表，定义各设置分区的元数据 */
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
    group: "remicode",
    icon: BrainIcon,
    eyebrow: "AI configuration",
    labelKey: "models",
    descriptionKey: "models",
  },
  {
    id: "providers",
    group: "remicode",
    icon: PlugIcon,
    eyebrow: "Picker visibility",
    labelKey: "providers",
    descriptionKey: "providers",
  },
  {
    id: "advanced",
    group: "remicode",
    icon: WrenchIcon,
    eyebrow: "System tools",
    labelKey: "advanced",
    descriptionKey: "advanced",
  },
] as const;

/**
 * 根据国际化消息构建设置导航项列表。
 *
 * @param messages - 国际化消息对象
 * @returns 导航项数组
 */
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

/**
 * 根据国际化消息构建设置导航分组列表。
 *
 * @param messages - 国际化消息对象
 * @returns 分组列表
 */
export function buildSettingsNavGroups(messages: Messages): ReadonlyArray<{
  id: SettingsNavGroupId;
  label: string;
}> {
  return [
    { id: "app", label: messages.settings.groups.app },
    { id: "remicode", label: messages.settings.groups.peakcode },
  ];
}

/** React Hook：获取国际化后的设置导航项列表 */
export function useSettingsNavItems(): readonly SettingsNavItem[] {
  const messages = useMessages();
  return buildSettingsNavItems(messages);
}

/** React Hook：获取国际化后的设置导航分组列表 */
export function useSettingsNavGroups(): ReadonlyArray<{
  id: SettingsNavGroupId;
  label: string;
}> {
  const messages = useMessages();
  return buildSettingsNavGroups(messages);
}

/** 静态的设置导航分组列表（无国际化，用于非 React 上下文） */
export const SETTINGS_NAV_GROUPS: ReadonlyArray<{
  id: SettingsNavGroupId;
  label: string;
}> = [
  { id: "app", label: "App" },
  { id: "remicode", label: "Remi Code" },
] as const;

/** 静态的设置导航项列表（无国际化，用于非 React 上下文） */
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
    description: "Review and clean up the worktrees created by Remi Code.",
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
    group: "remicode",
    label: "Models",
    description: "Git writing defaults and custom model slugs.",
    icon: BrainIcon,
    eyebrow: "AI configuration",
  },
  {
    id: "providers",
    group: "remicode",
    label: "Providers",
    description: "Choose visible providers, review CLI installs, and update provider tools.",
    icon: PlugIcon,
    eyebrow: "Picker visibility",
  },
  {
    id: "advanced",
    group: "remicode",
    label: "Advanced",
    description: "Keybindings, recovery, and version info.",
    icon: WrenchIcon,
    eyebrow: "System tools",
  },
] as const;

/**
 * 标准化设置分区值。无效值回退为 "general"。
 *
 * @param value - 待标准化的值
 * @returns 有效的设置分区 ID
 */
export function normalizeSettingsSection(value: unknown): SettingsSectionId {
  if (typeof value !== "string") {
    return "general";
  }
  return SETTINGS_SECTION_IDS.find((candidate) => candidate === value) ?? "general";
}
