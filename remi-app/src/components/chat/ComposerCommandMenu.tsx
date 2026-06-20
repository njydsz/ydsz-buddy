/**
 * @file ComposerCommandMenu.tsx
 * @description 聊天编辑器的命令菜单组件，支持斜杠命令、@提及、插件、技能、子代理等多种命令类型的搜索和选择。
 * 提供命令分组、高亮追踪和自动滚动等交互功能。
 */

import {
  type ProjectEntry,
  type ModelSlug,
  type ProviderNativeCommandDescriptor,
  type ProviderMentionReference,
  type ProviderKind,
  type ProviderPluginDescriptor,
  type ProviderSkillDescriptor,
} from "~/contracts";
import { memo, useEffect, useMemo, useRef } from "react";
import { RiRobot3Line } from "react-icons/ri";
import { type ComposerTriggerKind } from "../../composer-logic";
import { type ComposerSlashCommand } from "../../composerSlashCommands";
import { ListTodoIcon, PlugIcon } from "~/lib/icons";
import {
  TbEraser,
  TbBrain,
  TbBolt,
  TbDeviceLaptop,
  TbMessage,
  TbBug,
  TbChartBar,
  TbUsers,
  TbGitCompare,
  TbTerminal2,
} from "react-icons/tb";
import { GoRepoForked } from "react-icons/go";
import { formatSkillScope } from "~/lib/providerDiscovery";
import { cn } from "~/lib/utils";
import { Badge } from "../ui/badge";
import {
  Command,
  CommandGroup,
  CommandGroupLabel,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "../ui/command";
import { FileEntryIcon } from "./FileEntryIcon";

/** 技能立方体图标组件 */
function SkillCubeIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m3.3 7 8.7 5 8.7-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 22V12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * 将提供者命令名称转换为人类可读的标题格式
 * @param command - 原始命令名称（可能包含连字符或下划线）
 * @returns 格式化后的标题字符串
 */
function humanizeProviderCommandName(command: string): string {
  return command
    .split(/[-_]/g)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * 获取斜杠命令或提供者原生命令的菜单显示标题
 * @param item - 命令项（斜杠命令或提供者原生命令）
 * @returns 命令的显示标题
 */
function commandMenuTitle(
  item: Extract<ComposerCommandItem, { type: "slash-command" | "provider-native-command" }>,
): string {
  switch (item.command) {
    case "clear":
      return "Clear";
    case "compact":
      return "Compact Context";
    case "model":
      return "Model";
    case "fast":
      return "Fast Mode";
    case "plan":
      return "Plan Mode";
    case "default":
      return "Default Mode";
    case "review":
      return "Code Review";
    case "fork":
      return "Fork";
    case "side":
      return "Sidechat";
    case "status":
      return "Status";
    case "subagents":
      return "Subagents";
    default:
      return humanizeProviderCommandName(item.command);
  }
}

/**
 * 获取命令项的尾部元数据文本（右对齐显示）
 * @param item - 命令项
 * @returns 尾部元数据文本，无则返回 null
 */
function commandMenuTrailingMeta(item: ComposerCommandItem): string | null {
  if (item.type === "agent") {
    return "delegate task to subagent";
  }

  if (item.type === "plugin") {
    return "Plugin";
  }

  if (item.type === "local-root") {
    return "Local";
  }

  if (item.type === "skill") {
    return formatSkillScope(item.skill.scope);
  }

  if (item.type === "slash-command" || item.type === "provider-native-command") {
    return `/${item.command}`;
  }

  // Right-align the parent path so many same-named entries (e.g. worktrees) stay
  // distinguishable without crowding the name column.
  if (item.type === "path") {
    return item.description.length > 0 ? item.description : null;
  }

  return null;
}

/**
 * 获取命令项的次要描述文本
 * @param item - 命令项
 * @returns 次要描述文本，无则返回 null
 */
function commandMenuSecondaryText(item: ComposerCommandItem): string | null {
  if (item.type === "slash-command" || item.type === "provider-native-command") {
    return item.description;
  }

  if (item.type === "agent") {
    return item.description;
  }

  if (item.type === "plugin" || item.type === "skill" || item.type === "local-root") {
    return item.description;
  }

  return null;
}

/**
 * 编辑器命令项联合类型，涵盖路径、本地根目录、斜杠命令、提供者原生命令、
 * 分叉目标、审查目标、模型、插件、技能和子代理等命令类型
 */
export type ComposerCommandItem =
  | {
      id: string;
      type: "path";
      path: string;
      pathKind: ProjectEntry["kind"];
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "local-root";
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "slash-command";
      command: ComposerSlashCommand;
      label: string;
      description: string;
      source: "app" | "shared";
    }
  | {
      id: string;
      type: "provider-native-command";
      provider: ProviderKind;
      command: ProviderNativeCommandDescriptor["name"];
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "fork-target";
      target: "local" | "worktree";
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "review-target";
      target: "changes" | "base-branch";
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "model";
      provider: ProviderKind;
      model: ModelSlug;
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "plugin";
      plugin: ProviderPluginDescriptor;
      mention: ProviderMentionReference;
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "skill";
      skill: ProviderSkillDescriptor;
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "agent";
      provider: ProviderKind;
      alias: string;
      color: string;
      label: string;
      description: string;
    };

/** 命令分组模型，包含分组 ID、标签和命令项列表 */
type ComposerCommandGroupModel = {
  id: string;
  label: string | null;
  items: ComposerCommandItem[];
};

const COMPOSER_COMMAND_GROUP_LABEL_CLASSNAME =
  "px-2 pt-1.5 pb-1 text-[11px] font-normal text-muted-foreground/60";

/**
 * 将命令项按触发类型分组
 * @param items - 待分组的命令项列表
 * @param triggerKind - 触发类型（提及、斜杠命令等）
 * @param groupSlashCommandSections - 是否将斜杠命令按内置/提供者分组
 * @returns 分组后的命令组模型数组
 */
export function groupCommandItems(
  items: ComposerCommandItem[],
  triggerKind: ComposerTriggerKind | null,
  groupSlashCommandSections: boolean,
): ComposerCommandGroupModel[] {
  if (triggerKind === "mention") {
    const pluginItems = items.filter((item) => item.type === "plugin");
    const localItems = items.filter((item) => item.type === "local-root" || item.type === "path");
    const agentItems = items.filter((item) => item.type === "agent");
    const otherItems = items.filter(
      (item) =>
        item.type !== "plugin" &&
        item.type !== "local-root" &&
        item.type !== "path" &&
        item.type !== "agent",
    );

    const groups: ComposerCommandGroupModel[] = [];
    if (pluginItems.length > 0) {
      groups.push({ id: "plugins", label: "Plugins", items: pluginItems });
    }
    if (localItems.length > 0) {
      groups.push({ id: "local", label: "Local", items: localItems });
    }
    if (agentItems.length > 0) {
      groups.push({ id: "subagents", label: "Subagents", items: agentItems });
    }
    if (otherItems.length > 0) {
      groups.push({ id: "other", label: null, items: otherItems });
    }
    return groups;
  }

  if (triggerKind !== "slash-command" || !groupSlashCommandSections) {
    return [{ id: "default", label: null, items }];
  }

  const builtInItems = items.filter((item) => item.type === "slash-command");
  const providerItems = items.filter((item) => item.type === "provider-native-command");
  const otherItems = items.filter(
    (item) => item.type !== "slash-command" && item.type !== "provider-native-command",
  );

  const groups: ComposerCommandGroupModel[] = [];
  if (builtInItems.length > 0) {
    groups.push({ id: "built-in", label: "Built-in", items: builtInItems });
  }
  if (providerItems.length > 0) {
    groups.push({ id: "provider", label: "Provider", items: providerItems });
  }
  if (otherItems.length > 0) {
    groups.push({ id: "other", label: null, items: otherItems });
  }
  return groups;
}

/**
 * ComposerCommandMenu 组件
 * @description 编辑器命令菜单，支持斜杠命令、@提及、插件、技能等多种命令类型的搜索和选择
 * @param props.items - 可选的命令项列表
 * @param props.resolvedTheme - 当前主题（亮色/暗色）
 * @param props.isLoading - 是否正在加载命令
 * @param props.triggerKind - 触发类型
 * @param props.groupSlashCommandSections - 是否将斜杠命令分组显示
 * @param props.emptyStateText - 空状态提示文本
 * @param props.activeItemId - 当前高亮的命令项 ID
 * @param props.onHighlightedItemChange - 高亮项变更回调
 * @param props.onSelect - 命令项选中回调
 */
export const ComposerCommandMenu = memo(function ComposerCommandMenu(props: {
  items: ComposerCommandItem[];
  resolvedTheme: "light" | "dark";
  isLoading: boolean;
  triggerKind: ComposerTriggerKind | null;
  groupSlashCommandSections?: boolean;
  emptyStateText?: string;
  activeItemId: string | null;
  onHighlightedItemChange: (itemId: string | null) => void;
  onSelect: (item: ComposerCommandItem) => void;
}) {
  const itemRefs = useRef<Record<string, HTMLElement | null>>({});
  const groups = useMemo(
    () =>
      groupCommandItems(props.items, props.triggerKind, props.groupSlashCommandSections ?? true),
    [props.groupSlashCommandSections, props.items, props.triggerKind],
  );

  useEffect(() => {
    if (!props.activeItemId) {
      return;
    }

    itemRefs.current[props.activeItemId]?.scrollIntoView({
      block: "nearest",
    });
  }, [props.activeItemId]);

  return (
    <Command
      autoHighlight={false}
      mode="none"
      onItemHighlighted={(highlightedValue) => {
        props.onHighlightedItemChange(
          typeof highlightedValue === "string" ? highlightedValue : null,
        );
      }}
    >
      <div className="chat-composer-surface relative overflow-hidden rounded-xl border border-[color:var(--color-border-light)] bg-[var(--color-background-surface-under)] shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]">
        <CommandList className="max-h-72 py-0.5">
          {groups.map((group, groupIndex) => (
            <div key={group.id}>
              {groupIndex > 0 ? <CommandSeparator className="my-0.5" /> : null}
              <CommandGroup>
                {group.label ? (
                  <CommandGroupLabel className={COMPOSER_COMMAND_GROUP_LABEL_CLASSNAME}>
                    {group.label}
                  </CommandGroupLabel>
                ) : null}
                {group.items.map((item) => (
                  <ComposerCommandMenuItem
                    key={item.id}
                    item={item}
                    resolvedTheme={props.resolvedTheme}
                    isActive={props.activeItemId === item.id}
                    itemRef={(node) => {
                      itemRefs.current[item.id] = node;
                    }}
                    onHighlight={props.onHighlightedItemChange}
                    onSelect={props.onSelect}
                  />
                ))}
              </CommandGroup>
            </div>
          ))}
          {props.triggerKind === "mention" ? (
            <>
              {groups.length > 0 ? <CommandSeparator className="my-0.5" /> : null}
              {/* This footer is informational copy, not a selectable result group. */}
              <div className="pt-0.5 pb-2">
                <p
                  className={cn(
                    COMPOSER_COMMAND_GROUP_LABEL_CLASSNAME,
                    "px-2 py-0 font-medium text-muted-foreground text-xs",
                  )}
                >
                  Files
                </p>
                <p className="px-2 pt-0.5 text-[11px] text-muted-foreground/55">
                  Type to search for files
                </p>
              </div>
            </>
          ) : null}
        </CommandList>
        {props.items.length === 0 && (
          <p className="px-2 py-1.5 text-muted-foreground/50 text-[11px]">
            {props.isLoading
              ? props.triggerKind === "mention"
                ? "Searching mentions..."
                : props.triggerKind === "skill"
                  ? "Loading skills..."
                  : "Loading commands..."
              : (props.emptyStateText ??
                (props.triggerKind === "mention"
                  ? "No matching plugin or file."
                  : props.triggerKind === "skill"
                    ? "No matching skill."
                    : "No matching command."))}
          </p>
        )}
      </div>
    </Command>
  );
});

/** 命令菜单项子组件，渲染单个命令项的图标、标题和描述 */
const ComposerCommandMenuItem = memo(function ComposerCommandMenuItem(props: {
  item: ComposerCommandItem;
  resolvedTheme: "light" | "dark";
  isActive: boolean;
  itemRef: (node: HTMLElement | null) => void;
  onHighlight: (itemId: string | null) => void;
  onSelect: (item: ComposerCommandItem) => void;
}) {
  const secondaryText = commandMenuSecondaryText(props.item);
  const trailingMeta = commandMenuTrailingMeta(props.item);

  return (
    <CommandItem
      ref={props.itemRef}
      value={props.item.id}
      className={cn(
        "cursor-pointer select-none gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-[var(--color-background-elevated-secondary)] data-highlighted:bg-[var(--color-background-elevated-secondary)]",
        props.isActive &&
          "bg-[var(--color-background-elevated-secondary)] text-[var(--color-text-foreground)]",
      )}
      onMouseMove={() => {
        if (!props.isActive) props.onHighlight(props.item.id);
      }}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={() => {
        props.onSelect(props.item);
      }}
    >
      {props.item.type === "path" ? (
        <FileEntryIcon
          pathValue={props.item.path}
          kind={props.item.pathKind}
          theme={props.resolvedTheme}
        />
      ) : null}
      {props.item.type === "local-root" ? (
        <TbDeviceLaptop className="size-3.5 text-muted-foreground/60" />
      ) : null}
      {props.item.type === "fork-target" ? (
        props.item.target === "local" ? (
          <TbDeviceLaptop className="size-3.5 text-muted-foreground/60" />
        ) : (
          <GoRepoForked className="size-3.5 text-muted-foreground/60" />
        )
      ) : null}
      {props.item.type === "review-target" ? (
        props.item.target === "changes" ? (
          <TbBug className="size-3.5 text-muted-foreground/60" />
        ) : (
          <TbGitCompare className="size-3.5 text-muted-foreground/60" />
        )
      ) : null}
      {props.item.type === "slash-command" || props.item.type === "provider-native-command"
        ? (() => {
            const cls = "size-3.5 text-muted-foreground/60";
            switch (props.item.command) {
              case "clear":
                return <TbEraser className={cls} />;
              case "model":
                return <TbBrain className={cls} />;
              case "fast":
                return <TbBolt className={cls} />;
              case "plan":
                return <ListTodoIcon className={cls} />;
              case "default":
                return <TbMessage className={cls} />;
              case "review":
                return <TbBug className={cls} />;
              case "status":
                return <TbChartBar className={cls} />;
              case "subagents":
                return <TbUsers className={cls} />;
              case "fork":
                return <GoRepoForked className={cls} />;
              case "side":
                return <TbMessage className={cls} />;
              default:
                return <TbTerminal2 className={cls} />;
            }
          })()
        : null}
      {props.item.type === "model" ? (
        <Badge variant="outline" className="px-1 py-0 text-[9px]">
          model
        </Badge>
      ) : null}
      {props.item.type === "agent" ? (
        <RiRobot3Line className="size-3.5 text-muted-foreground/60" />
      ) : null}
      {props.item.type === "plugin" || props.item.type === "skill" ? (
        <div
          className={cn(
            "flex size-3.5 shrink-0 items-center justify-center text-muted-foreground/50",
            props.isActive && "text-foreground/60",
          )}
        >
          {props.item.type === "skill" ? (
            <SkillCubeIcon className="size-3" />
          ) : (
            <PlugIcon className="size-3" />
          )}
        </div>
      ) : null}
      <div className="min-w-0 flex flex-1 items-center gap-3">
        <div className="min-w-0 flex flex-1 items-center gap-1.5 overflow-hidden">
          <span
            className={cn(
              "shrink-0 text-[11.5px] font-medium text-foreground/80",
              (props.item.type === "plugin" || props.item.type === "skill") && "font-semibold",
            )}
          >
            {props.item.type === "slash-command" || props.item.type === "provider-native-command"
              ? commandMenuTitle(props.item)
              : props.item.label}
          </span>
          {secondaryText ? (
            <span className="truncate text-[11px] text-muted-foreground/55">{secondaryText}</span>
          ) : null}
        </div>
        {trailingMeta ? (
          <span className="shrink-0 pl-2 text-right text-[10.5px] text-muted-foreground/42">
            {trailingMeta}
          </span>
        ) : null}
      </div>
    </CommandItem>
  );
});
