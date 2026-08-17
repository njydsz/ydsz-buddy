/**
 * @file 设置页面导航
 *
 * 定义设置页面的分区分类体系，在主侧边栏和设置页面之间共享?? * 包含分区 ID、导航项定义、分组信息和搜索标准化等工具?? * 支持国际化（i18n）的导航项构建?? */

import {
  AdjustmentsIcon,
  ArchiveIcon,
  BellIcon,
  BookIcon,
  BotIcon,
  BrainIcon,
  Code2Icon,
  CoinIcon,
  FileTextIcon,
  GlobeIcon,
  type LucideIcon,
  McpIcon,
  MessageCircleIcon,
  MessageSquareIcon,
  PaletteIcon,
  SparklesIcon,
  SettingsIcon,
  WrenchIcon,
  WorktreeIcon,
  ImageIcon,
  SmartphoneIcon,
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
  "budget",
  "agent",
  "mcp",
  "cue",
  "models",
  "conversationFlow",
  "browser",
  "indexer",
  "skills",
  "rules",
  "imageGen",
  "im",
  "mobile",
  "advanced",
  "push",
] as const;

/** 设置分区 ID 类型 */
export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number];
/** 设置导航分组 ID：app（应用级）和 ydszBuddy（ydsz-buddy 专属??*/
export type SettingsNavGroupId = "app" | "ydszBuddy";

/**
 * 设置导航项，包含分区 ID、分组、标签、描述和图标?? */
export type SettingsNavItem = {
  /** 分区 ID */
  id: SettingsSectionId;
  /** 所属分??*/
  group: SettingsNavGroupId;
  /** 显示标签 */
  label: string;
  /** 功能描述 */
  description: string;
  /** 图标组件 */
  icon: LucideIcon;
  /** 眉标文字（分组标题下的小标签??*/
  eyebrow: string;
};

/** 内部使用的导航项规格，使??i18n 键引用标签和描述 */
type SettingsNavItemSpec = {
  id: SettingsSectionId;
  group: SettingsNavGroupId;
  icon: LucideIcon;
  eyebrow: string;
  labelKey: keyof Messages["settings"]["nav"];
  descriptionKey: keyof Messages["settings"]["nav"];
};

/** 内部导航项规格列表，定义各设置分区的元数??*/
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
    id: "budget",
    group: "app",
    icon: CoinIcon,
    eyebrow: "AI cost control",
    labelKey: "budget",
    descriptionKey: "budget",
  },
  {
    id: "agent",
    group: "ydszBuddy",
    icon: BotIcon,
    eyebrow: "AI agent",
    labelKey: "agent",
    descriptionKey: "agent",
  },
  {
    id: "mcp",
    group: "ydszBuddy",
    icon: McpIcon,
    eyebrow: "Model Context Protocol",
    labelKey: "mcp",
    descriptionKey: "mcp",
  },
  {
    id: "cue",
    group: "ydszBuddy",
    icon: SparklesIcon,
    eyebrow: "Prompt engineering",
    labelKey: "cue",
    descriptionKey: "cue",
  },
  {
    id: "models",
    group: "ydszBuddy",
    icon: BrainIcon,
    eyebrow: "AI configuration",
    labelKey: "models",
    descriptionKey: "models",
  },
  {
    id: "conversationFlow",
    group: "ydszBuddy",
    icon: MessageCircleIcon,
    eyebrow: "Dialog management",
    labelKey: "conversationFlow",
    descriptionKey: "conversationFlow",
  },
  {
    id: "browser",
    group: "ydszBuddy",
    icon: GlobeIcon,
    eyebrow: "Web automation",
    labelKey: "browser",
    descriptionKey: "browser",
  },
  {
    id: "indexer",
    group: "ydszBuddy",
    icon: FileTextIcon,
    eyebrow: "Code indexing",
    labelKey: "indexer",
    descriptionKey: "indexer",
  },
  {
    id: "skills",
    group: "ydszBuddy",
    icon: Code2Icon,
    eyebrow: "Commands & skills",
    labelKey: "skills",
    descriptionKey: "skills",
  },
  {
    id: "rules",
    group: "ydszBuddy",
    icon: BookIcon,
    eyebrow: "Rules & memory",
    labelKey: "rules",
    descriptionKey: "rules",
  },
  {
    id: "imageGen",
    group: "ydszBuddy",
    icon: ImageIcon,
    eyebrow: "Image generation",
    labelKey: "imageGen",
    descriptionKey: "imageGen",
  },
  {
    id: "im",
    group: "ydszBuddy",
    icon: MessageSquareIcon,
    eyebrow: "IM integration",
    labelKey: "im",
    descriptionKey: "im",
  },
  {
    id: "mobile",
    group: "ydszBuddy",
    icon: SmartphoneIcon,
    eyebrow: "Mobile remote",
    labelKey: "mobile",
    descriptionKey: "mobile",
  },
  {
    id: "advanced",
    group: "ydszBuddy",
    icon: WrenchIcon,
    eyebrow: "System tools",
    labelKey: "advanced",
    descriptionKey: "advanced",
  },
  {
    id: "push",
    group: "ydszBuddy",
    icon: BellIcon,
    eyebrow: "Mobile notifications",
    labelKey: "push",
    descriptionKey: "push",
  },
] as const;

/**
 * 根据国际化消息构建设置导航项列表?? *
 * @param messages - 国际化消息对?? * @returns 导航项数?? */
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
 * 根据国际化消息构建设置导航分组列表?? *
 * @param messages - 国际化消息对?? * @returns 分组列表
 */
export function buildSettingsNavGroups(messages: Messages): ReadonlyArray<{
  id: SettingsNavGroupId;
  label: string;
}> {
  return [
    { id: "app", label: messages.settings.groups.app },
    { id: "ydszBuddy", label: messages.settings.groups.ydszBuddy },
  ];
}

/** React Hook：获取国际化后的设置导航项列??*/
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

/** 静态的设置导航分组列表（无国际化，用于??React 上下文） */
export const SETTINGS_NAV_GROUPS: ReadonlyArray<{
  id: SettingsNavGroupId;
  label: string;
}> = [
  { id: "app", label: "App" },
  { id: "ydszBuddy", label: "云顶数字 Buddy" },
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
    description: "Review and clean up the worktrees created by 云顶数字 Buddy.",
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
    id: "budget",
    group: "app",
    label: "Cost budget",
    description: "Set a daily or monthly cap on AI spend and choose what happens when it is exceeded.",
    icon: CoinIcon,
    eyebrow: "AI cost control",
  },
  {
    id: "agent",
    group: "ydszBuddy",
    label: "Agent",
    description: "Configure AI agent behavior, tool permissions, and sandbox settings.",
    icon: BotIcon,
    eyebrow: "AI agent",
  },
  {
    id: "mcp",
    group: "ydszBuddy",
    label: "MCP",
    description: "Manage Model Context Protocol servers and tool integrations.",
    icon: McpIcon,
    eyebrow: "Model Context Protocol",
  },
  {
    id: "cue",
    group: "ydszBuddy",
    label: "CUE",
    description: "Prompt engineering, structured cues, and response tuning.",
    icon: SparklesIcon,
    eyebrow: "Prompt engineering",
  },
  {
    id: "models",
    group: "ydszBuddy",
    label: "Models",
    description: "Git writing defaults and custom model slugs.",
    icon: BrainIcon,
    eyebrow: "AI configuration",
  },
  {
    id: "conversationFlow",
    group: "ydszBuddy",
    label: "Conversation Flow",
    description: "Dialog management, turn limits, and context window settings.",
    icon: MessageCircleIcon,
    eyebrow: "Dialog management",
  },
  {
    id: "browser",
    group: "ydszBuddy",
    label: "Browser",
    description: "Web automation, CDP integration, and browser tool configuration.",
    icon: GlobeIcon,
    eyebrow: "Web automation",
  },
  {
    id: "indexer",
    group: "ydszBuddy",
    label: "Index & Documents",
    description: "Code indexing, AST grep patterns, and document management.",
    icon: FileTextIcon,
    eyebrow: "Code indexing",
  },
  {
    id: "skills",
    group: "ydszBuddy",
    label: "Skills & Commands",
    description: "Custom skills, slash commands, and composer command menu.",
    icon: Code2Icon,
    eyebrow: "Commands & skills",
  },
  {
    id: "rules",
    group: "ydszBuddy",
    label: "Rules & Memory",
    description: "Project rules, team rules, and persistent memory configuration.",
    icon: BookIcon,
    eyebrow: "Rules & memory",
  },
  {
    id: "imageGen",
    group: "ydszBuddy",
    label: "Image Generation",
    description: "Configure AI image generation backends (DALL-E 3, FLUX, Stable Diffusion).",
    icon: ImageIcon,
    eyebrow: "Image generation",
  },
  {
    id: "im",
    group: "ydszBuddy",
    label: "IM Integration",
    description: "Connect WeChat Work, DingTalk, Feishu and other IM platforms.",
    icon: MessageSquareIcon,
    eyebrow: "IM integration",
  },
  {
    id: "mobile",
    group: "ydszBuddy",
    label: "Mobile Remote",
    description: "Push notifications, remote approval, and device pairing.",
    icon: SmartphoneIcon,
    eyebrow: "Mobile remote",
  },
  {
    id: "advanced",
    group: "ydszBuddy",
    label: "Advanced",
    description: "Keybindings, recovery, and version info.",
    icon: WrenchIcon,
    eyebrow: "System tools",
  },
  {
    id: "push",
    group: "ydszBuddy",
    label: "Push Channel",
    description: "Configure JPush / Umeng credentials and test mobile push delivery.",
    icon: BellIcon,
    eyebrow: "Mobile notifications",
  },
] as const;

/**
 * 标准化设置分区值。无效值回退??"general"?? *
 * @param value - 待标准化的?? * @returns 有效的设置分??ID
 */
export function normalizeSettingsSection(value: unknown): SettingsSectionId {
  if (typeof value !== "string") {
    return "general";
  }
  return SETTINGS_SECTION_IDS.find((candidate) => candidate === value) ?? "general";
}
