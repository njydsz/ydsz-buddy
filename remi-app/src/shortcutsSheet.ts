/**
 * @file 快捷键参考面板
 *
 * 构建快捷键参考面板中显示的快捷键分区和条目。
 * 根据当前上下文（终端工作区模式、桌面模式等）动态生成可用的快捷键列表，
 * 包括当前可用快捷键、交替上下文快捷键和项目脚本快捷键。
 */

import type { KeybindingCommand, ResolvedKeybindingsConfig } from "@remi-code/contracts";
import { isMacPlatform } from "./lib/utils";
import { shortcutLabelForCommand } from "./keybindings";
import { commandForProjectScript } from "./projectScripts";
import type { ProjectScript } from "./types";

/**
 * 快捷键面板的上下文环境，用于决定哪些快捷键当前可用。
 */
export interface ShortcutSheetContext {
  /** 终端是否获得焦点 */
  terminalFocus: boolean;
  /** 终端是否打开 */
  terminalOpen: boolean;
  /** 终端工作区是否打开 */
  terminalWorkspaceOpen: boolean;
  /** 其他自定义上下文条件 */
  [key: string]: boolean;
}

/**
 * 快捷键面板中的单个条目，描述一个快捷键的显示信息。
 */
export interface ShortcutSheetEntry {
  /** 条目唯一 ID */
  id: string;
  /** 快捷键名称 */
  label: string;
  /** 快捷键功能描述 */
  description: string;
  /** 格式化后的快捷键标签（如 "⌘N"、"Ctrl+Shift+N"） */
  shortcutLabel: string;
}

/**
 * 快捷键面板中的分区，包含一组相关的快捷键条目。
 */
export interface ShortcutSheetSection {
  /** 分区唯一 ID */
  id: string;
  /** 分区标题 */
  title: string;
  /** 分区描述 */
  description: string;
  /** 分区视觉色调，"muted" 表示次要信息 */
  tone?: "default" | "muted";
  /** 分区内的快捷键条目列表 */
  entries: ShortcutSheetEntry[];
}

/** 构建快捷键面板分区的配置选项 */
interface BuildShortcutSheetSectionsOptions {
  /** 快捷键配置列表 */
  keybindings: ResolvedKeybindingsConfig;
  /** 项目脚本列表 */
  projectScripts: ReadonlyArray<ProjectScript>;
  /** 运行平台 */
  platform: string;
  /** 当前上下文环境 */
  context: ShortcutSheetContext;
  /** 是否为桌面应用 */
  isDesktop: boolean;
}

/** 快捷键定义，关联命令与显示信息 */
interface ShortcutDefinition {
  command: KeybindingCommand | readonly KeybindingCommand[];
  label: string;
  description: string;
}

/** 当前可用的快捷键定义列表（侧边栏、聊天、终端等通用操作） */
const AVAILABLE_NOW_DEFINITIONS: readonly ShortcutDefinition[] = [
  {
    command: "sidebar.addProject",
    label: "Add project",
    description: "Open the folder picker to import a local project into the sidebar.",
  },
  {
    command: "sidebar.search",
    label: "Search projects and threads",
    description: "Open the sidebar search palette from anywhere in the app.",
  },
  {
    command: "sidebar.importThread",
    label: "Import thread",
    description: "Bring an existing conversation into the current workspace.",
  },
  {
    command: "chat.new",
    label: "New thread",
    description: "Start a fresh thread in the current project.",
  },
  {
    command: "chat.newLatestProject",
    label: "New thread in latest project",
    description: "Jump back into the most recently used project with a new thread.",
  },
  {
    command: ["chat.newChat", "chat.newLocal"],
    label: "New chat",
    description: "Open the empty chat landing view.",
  },
  {
    command: "chat.newTerminal",
    label: "New terminal thread",
    description: "Create a thread that opens directly into terminal mode.",
  },
  {
    command: "chat.newClaude",
    label: "New Claude thread",
    description: "Start a fresh thread with Claude selected.",
  },
  {
    command: "chat.newCodex",
    label: "New Codex thread",
    description: "Start a fresh thread with Codex selected.",
  },
  {
    command: "chat.newCursor",
    label: "New Cursor thread",
    description: "Start a fresh thread with Cursor selected.",
  },
  {
    command: "chat.newGemini",
    label: "New Gemini thread",
    description: "Start a fresh thread with Gemini selected.",
  },
  {
    command: "chat.split",
    label: "Split chat",
    description: "Open the current conversation in a second pane.",
  },
  {
    command: "terminal.toggle",
    label: "Toggle terminal",
    description: "Show or hide the terminal surface for the active thread.",
  },
  {
    command: "diff.toggle",
    label: "Toggle diff",
    description: "Open or close the working tree diff panel.",
  },
  {
    command: "browser.toggle",
    label: "Toggle browser",
    description: "Reveal the built-in browser panel for the active thread.",
  },
  {
    command: "chat.visible.previous",
    label: "Previous visible thread",
    description: "Cycle to the previous thread that is currently visible in the sidebar.",
  },
  {
    command: "chat.visible.next",
    label: "Next visible thread",
    description: "Cycle to the next thread that is currently visible in the sidebar.",
  },
  {
    command: "editor.openFavorite",
    label: "Open in favorite editor",
    description: "Send the current thread or workspace target to your preferred editor.",
  },
] as const;

/** 线程跳转快捷键定义列表（1-9 号线程快速跳转） */
const THREAD_JUMP_DEFINITIONS: readonly ShortcutDefinition[] = Array.from(
  { length: 9 },
  (_, index) => ({
    command: `thread.jump.${index + 1}` as KeybindingCommand,
    label: `Jump to visible thread ${index + 1}`,
    description: "Focus a visible thread directly from the sidebar number row.",
  }),
);

/** 终端工作区快捷键定义列表（全屏终端、标签切换、关闭面板） */
const WORKSPACE_DEFINITIONS: readonly ShortcutDefinition[] = [
  {
    command: "terminal.workspace.newFullWidth",
    label: "Open full-width terminal workspace",
    description: "Expand the active thread into the workspace terminal layout.",
  },
  {
    command: "terminal.workspace.terminal",
    label: "Focus terminal tab",
    description: "Switch the workspace to the terminal tab.",
  },
  {
    command: "terminal.workspace.chat",
    label: "Focus chat tab",
    description: "Switch the workspace back to the chat tab.",
  },
  {
    command: "terminal.workspace.closeActive",
    label: "Close active workspace panel",
    description: "Close the currently focused workspace panel or tab.",
  },
] as const;

/**
 * 生成 Mod+/ 快捷键的显示标签。
 * macOS 显示 "⌘/"，其他平台显示 "Ctrl+/"。
 *
 * @param platform - 运行平台
 * @returns 快捷键标签字符串
 */
function modSlashLabel(platform: string): string {
  return isMacPlatform(platform) ? "�?" : "Ctrl+/";
}

/**
 * 将快捷键定义转换为面板条目。支持多个候选命令，返回第一个匹配的快捷键标签。
 *
 * @param definition - 快捷键定义
 * @param keybindings - 快捷键配置列表
 * @param platform - 运行平台
 * @param context - 上下文环境
 * @returns 面板条目，无匹配快捷键时返回 null
 */
function definitionToEntry(
  definition: ShortcutDefinition,
  keybindings: ResolvedKeybindingsConfig,
  platform: string,
  context: ShortcutSheetContext,
): ShortcutSheetEntry | null {
  const commands = Array.isArray(definition.command) ? definition.command : [definition.command];
  const shortcutLabel = commands.reduce<string | null>((resolved, command) => {
    if (resolved) return resolved;
    return shortcutLabelForCommand(keybindings, command, {
      platform,
      context,
    });
  }, null);
  if (!shortcutLabel) return null;
  return {
    id: commands[0] ?? definition.label,
    label: definition.label,
    description: definition.description,
    shortcutLabel,
  };
}

/**
 * 批量将快捷键定义转换为面板条目，过滤掉无匹配快捷键的条目。
 *
 * @param definitions - 快捷键定义列表
 * @param keybindings - 快捷键配置列表
 * @param platform - 运行平台
 * @param context - 上下文环境
 * @returns 面板条目数组
 */
function definitionsToEntries(
  definitions: ReadonlyArray<ShortcutDefinition>,
  keybindings: ResolvedKeybindingsConfig,
  platform: string,
  context: ShortcutSheetContext,
): ShortcutSheetEntry[] {
  return definitions
    .map((definition) => definitionToEntry(definition, keybindings, platform, context))
    .filter((entry): entry is ShortcutSheetEntry => entry !== null);
}

/**
 * 构建快捷键参考面板的完整分区列表。
 * 根据当前上下文生成三个分区：
 * 1. 当前可用快捷键（含导航快捷键）
 * 2. 交替上下文快捷键（工作区/非工作区模式的另一套快捷键）
 * 3. 项目脚本快捷键（如有）
 *
 * @param options - 构建配置选项
 * @returns 快捷键面板分区数组
 */
export function buildShortcutSheetSections(
  options: BuildShortcutSheetSectionsOptions,
): ShortcutSheetSection[] {
  const sections: ShortcutSheetSection[] = [];

  const currentEntries: ShortcutSheetEntry[] = [
    {
      id: "shortcuts.show",
      label: "Show keyboard shortcuts",
      description: "Open this sheet from anywhere without leaving your current context.",
      shortcutLabel: modSlashLabel(options.platform),
    },
    ...definitionsToEntries(
      AVAILABLE_NOW_DEFINITIONS,
      options.keybindings,
      options.platform,
      options.context,
    ),
  ];

  if (options.isDesktop) {
    const sidebarToggle = definitionToEntry(
      {
        command: "sidebar.toggle",
        label: "Toggle sidebar",
        description: "Collapse or reveal the desktop sidebar shell.",
      },
      options.keybindings,
      options.platform,
      options.context,
    );
    if (sidebarToggle) {
      currentEntries.splice(1, 0, sidebarToggle);
    }
  }

  const currentNavigationEntries = options.context.terminalWorkspaceOpen
    ? definitionsToEntries(
        WORKSPACE_DEFINITIONS,
        options.keybindings,
        options.platform,
        options.context,
      )
    : definitionsToEntries(
        THREAD_JUMP_DEFINITIONS,
        options.keybindings,
        options.platform,
        options.context,
      );

  sections.push({
    id: "available-now",
    title: "Available now",
    description: options.context.terminalWorkspaceOpen
      ? "These reflect the active workspace-terminal context."
      : "These reflect the current chat and sidebar context.",
    entries: [...currentEntries, ...currentNavigationEntries],
  });

  const alternateContext: ShortcutSheetContext = options.context.terminalWorkspaceOpen
    ? { ...options.context, terminalWorkspaceOpen: false }
    : {
        ...options.context,
        terminalOpen: true,
        terminalWorkspaceOpen: true,
      };
  const alternateDefinitions = options.context.terminalWorkspaceOpen
    ? THREAD_JUMP_DEFINITIONS
    : WORKSPACE_DEFINITIONS;
  const alternateEntries = definitionsToEntries(
    alternateDefinitions,
    options.keybindings,
    options.platform,
    alternateContext,
  );
  if (alternateEntries.length > 0) {
    sections.push({
      id: "alternate-context",
      title: options.context.terminalWorkspaceOpen ? "Outside workspace mode" : "In workspace mode",
      description: options.context.terminalWorkspaceOpen
        ? "Number-row jumps return when the terminal workspace is closed."
        : "These bindings take over when the terminal switches into workspace mode.",
      tone: "muted",
      entries: alternateEntries,
    });
  }

  const projectScriptEntries = options.projectScripts
    .map((script) => {
      const shortcutLabel = shortcutLabelForCommand(
        options.keybindings,
        commandForProjectScript(script.id),
        options.platform,
      );
      if (!shortcutLabel) return null;
      return {
        id: script.id,
        label: script.runOnWorktreeCreate ? `${script.name} setup script` : script.name,
        description: script.runOnWorktreeCreate
          ? "Run the project setup script directly from the keyboard."
          : "Run this project script without opening the scripts menu.",
        shortcutLabel,
      } satisfies ShortcutSheetEntry;
    })
    .filter((entry): entry is ShortcutSheetEntry => entry !== null);

  if (projectScriptEntries.length > 0) {
    sections.push({
      id: "project-scripts",
      title: "Project scripts",
      description: "Custom shortcuts defined for the active project's scripts.",
      entries: projectScriptEntries,
    });
  }

  return sections;
}
