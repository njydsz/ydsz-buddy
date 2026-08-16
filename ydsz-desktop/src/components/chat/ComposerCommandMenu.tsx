/**
 * @file Composer 命令菜单组件
 *
 * 本组件实现 Composer 中输入 `/` 或 `@` 时弹出的命令/提及菜单。
 *
 * ## 核心职责
 *
 * - **多源数据聚合**：合并 Agent 提及、Provider 技能、命令、插件、本地文件夹、文件提及
 * - **模糊搜索**：基于 `normalizeProviderDiscoveryText` 的子串匹配
 * - **键盘导航**：方向键 / Enter / Tab / Esc
 * - **状态分组**：按"最近使用"与"全部"分组展示
 *
 * ## 数据源
 *
 * - Agent 提及（@alias）
 * - Provider 技能（/skill）
 * - Provider 命令（/command）
 * - Provider 插件
 * - 本地文件夹提及（@folder）
 * - 文件提及（@file）
 *
 * ## 使用场景
 *
 * - Composer 菜单渲染
 * - 跨 Provider 的统一命令入口
 * - 助手/工具快速选择
 *
 * ## 注意事项
 *
 * - 菜单项按优先级排序（最近使用 > 收藏 > 字母序）
 * - 搜索使用简单的子串匹配，性能良好
 * - 插件与技能需要先安装才显示
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
  TbFileText,
  TbClock,
  TbWorld,
  TbCode,
  TbSearch,
  TbBook,
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

function humanizeProviderCommandName(command: string): string {
  return command
    .split(/[-_]/g)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

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

  // Wiki 检索结果:右侧展示符号数量,辅助用户判断条目规模
  if (item.type === "wiki-result") {
    return item.symbols.length > 0
      ? `${item.symbols.length} symbols`
      : "wiki";
  }

  // Right-align the parent path so many same-named entries (e.g. worktrees) stay
  // distinguishable without crowding the name column.
  if (item.type === "path") {
    return item.description.length > 0 ? item.description : null;
  }

  return null;
}

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
    }
  | {
      /**
       * 项目 Wiki 检索结果。
       *
       * 由 Composer 中输入 `@wiki ` 或 `@wiki<query>` 触发,
       * 后端 `repo_wiki_search` 返回的搜索条目。
       *
       * 选中后会在消息中插入 `@wiki "<module>"` 形式的内联 token,
       * 并在后续消息上下文(通过 `selectedComposerMentions`)中携带
       * 实际 Wiki 内容,供后端 Provider 加载。
       */
      id: string;
      type: "wiki-result";
      module: string;
      title: string;
      symbols: string[];
      /** 完整 Markdown 内容,选中后会随消息一起发送给 Provider */
      context: string;
      label: string;
      description: string;
    }
  | {
      /**
       * 项目 Wiki 搜索的占位/空状态项。
       *
       * 用于在用户刚刚输入 `@wiki` 还未输入查询、或者 Wiki 服务
       * 暂时不可用时,给出一个引导条目。
       */
      id: string;
      type: "wiki-hint";
      label: string;
      description: string;
    }
  | {
      /**
       * 项目 Wiki 加载失败/无数据的提示条目(仅展示,不可选中)。
       *
       * 与 `wiki-hint` 区别在于此条目不会被键盘导航选中,只用于
       * 解释为何搜索结果为空。
       */
      id: string;
      type: "wiki-empty";
      label: string;
      description: string;
    }
  | {
      /**
       * AST-Grep 结构化搜索结果。
       *
       * 由 Composer 中输入 `@ast-grep<pattern>` 或 `@ast-grep kind:<node_kind>` 触发,
       * 后端 `indexer_ast_grep_search` 返回的命中节点。
       *
       * 选中后会在消息中插入 `@ast-grep "<file>:<line>"` 形式的内联 token,
       * 并在消息上下文中携带命中的代码片段,供后端 Provider 直接编辑/分析。
       */
      id: string;
      type: "ast-grep-result";
      file: string;
      line: number;
      kind: string;
      text: string;
      /** 原始查询(pattern 或 node-kind),供 Provider 上下文参考 */
      context: string;
      label: string;
      description: string;
    }
  | {
      /**
       * AST-Grep 搜索的占位/空状态项。
       *
       * 用于在用户刚刚输入 `@ast-grep` 还未输入查询、或者后端服务
       * 暂时不可用时,给出一个引导条目。
       */
      id: string;
      type: "ast-grep-hint";
      label: string;
      description: string;
    }
  | {
      /**
       * AST-Grep 加载失败/无数据的提示条目(仅展示,不可选中)。
       */
      id: string;
      type: "ast-grep-empty";
      label: string;
      description: string;
    }
  | {
      /**
       * Codebase 符号/文本搜索结果。
       *
       * 由 Composer 中输入 `@codebase<query>` 触发,
       * 后端 `codebase_search` 返回的命中节点(符号或文本片段)。
       *
       * 选中后会在消息中插入 `@codebase "<file>:<line>"` 形式的内联 token,
       * 并在消息上下文中携带符号元信息,供后端 Provider 直接分析/编辑。
       */
      id: string;
      type: "codebase-result";
      file: string;
      line: number;
      column?: number;
      kind: string;
      text: string;
      /** 原始查询关键词,供 Provider 上下文参考 */
      context: string;
      label: string;
      description: string;
    }
  | {
      /**
       * Codebase 搜索的占位/空状态项。
       *
       * 用于在用户刚刚输入 `@codebase` 还未输入查询、或者后端服务
       * 暂时不可用时,给出一个引导条目。
       */
      id: string;
      type: "codebase-hint";
      label: string;
      description: string;
    }
  | {
      /**
       * Codebase 加载失败/无数据的提示条目(仅展示,不可选中)。
       */
      id: string;
      type: "codebase-empty";
      label: string;
      description: string;
    }
  | {
      /**
       * Office 文档读取结果(选中的 .docx / .xlsx / .pdf 已被读取)。
       *
       * 由 Composer 中输入 `@docx` / `@xlsx` / `@pdf` 触发,选择文件后
       * 后端 `office_docx_read` / `office_xlsx_read` / `office_pdf_extract`
       * 返回的内容片段。
       *
       * 选中后会在消息中插入 `@<kind> "<file>"` 形式的内联 token,
       * 并在消息上下文中携带文档内容,供后端 Provider 引用。
       */
      id: string;
      type: "office-result";
      officeKind: "docx" | "xlsx" | "pdf";
      kind: "docx" | "xlsx" | "pdf";
      file: string;
      /** 原始文件内容(节选) */
      context: string;
      label: string;
      description: string;
    }
  | {
      /**
       * Office 文档选择的占位/空状态项。
       *
       * 用于在用户刚刚输入 `@docx` / `@xlsx` / `@pdf` 还未选择文件时,
       * 给出一个引导条目,提示用户去选择本地文件。
       */
      id: string;
      type: "office-hint";
      officeKind: "docx" | "xlsx" | "pdf";
      label: string;
      description: string;
    }
  | {
      /**
       * Office 文档读取失败/无数据的提示条目(仅展示,不可选中)。
       */
      id: string;
      type: "office-empty";
      officeKind: "docx" | "xlsx" | "pdf";
      label: string;
      description: string;
    }
  | {
      /**
       * 浏览器标签页条目(由 `@browser<query>` 触发)。
       *
       * 由 Composer 中输入 `@browser` 或 `@browser <query>` 触发,
       * 后端 `browser_get_state` 返回当前线程的标签页列表。
       * `active` 标记当前活动 tab,`title` 用于主标签,`url` 用于副描述。
       *
       * 选中后会在消息中插入 `@browser "<tabId>"` 形式的内联 token,
       * 让 Provider 知晓后续需要操作哪个标签页(截图/导航/提取等)。
       */
      id: string;
      type: "browser-result";
      tabId: string;
      title: string;
      url: string;
      active: boolean;
      label: string;
      description: string;
    }
  | {
      /**
       * 浏览器加载/搜索的占位提示条目(仅展示,不可选中)。
       */
      id: string;
      type: "browser-hint";
      label: string;
      description: string;
    }
  | {
      /**
       * 浏览器加载失败/无数据的提示条目(仅展示,不可选中)。
       */
      id: string;
      type: "browser-empty";
      label: string;
      description: string;
    }
  | {
      /**
       * LSP 预设条目(由 `@lsp<query>` 触发)。
       *
       * 由 Composer 中输入 `@lsp` 或 `@lsp <query>` 触发,
       * 后端 `lsp_list_presets` 返回 4 个内置语言服务器
       * (typescript / python / rust / go) 以及 active 状态.
       *
       * 选中后会在消息中插入 `@lsp "<language>"` 形式的内联 token,
       * 让 Provider 知晓后续需要引用 / 启动哪种语言的 LSP 服务.
       */
      id: string;
      type: "lsp-result";
      language: string;
      displayName: string;
      fileExtensions: string[];
      active: boolean;
      label: string;
      description: string;
    }
  | {
      /**
       * LSP 加载/搜索的占位提示条目(仅展示,不可选中)。
       */
      id: string;
      type: "lsp-hint";
      label: string;
      description: string;
    }
  | {
      /**
       * LSP 加载失败/无数据的提示条目(仅展示,不可选中)。
       */
      id: string;
      type: "lsp-empty";
      label: string;
      description: string;
    }
  | {
      /**
       * 定时任务条目(由 `@scheduler<query>` 触发)。
       *
       * 由 Composer 中输入 `@scheduler` 或 `@scheduler <query>` 触发,
       * 后端 `scheduler_task_list` 返回当前线程的定时任务列表。
       *
       * 选中后会在消息中插入 `@scheduler "<taskId>"` 形式的内联 token,
       * 让 Provider 知晓后续需要引用 / 编辑 / 触发哪个任务。
       */
      id: string;
      type: "scheduler-result";
      taskId: string;
      cron: string;
      enabled: boolean;
      prompt: string;
      label: string;
      description: string;
    }
  | {
      /**
       * 定时任务搜索的占位/空状态项。
       */
      id: string;
      type: "scheduler-hint";
      label: string;
      description: string;
    }
  | {
      /**
       * 定时任务加载失败/无数据的提示条目(仅展示,不可选中)。
       */
      id: string;
      type: "scheduler-empty";
      label: string;
      description: string;
    }
  | {
      /**
       * 索引符号条目(由 `@indexer<query>` 触发)。
       *
       * 由 Composer 中输入 `@indexer` 或 `@indexer <query>` 触发,
       * 后端 `indexer_search_symbols` 返回已构建索引的符号定义。
       * `kind` 是符号种类(function / class / interface / trait / ...),
       * `file` + `line` 指向符号定义位置。
       *
       * 选中后会在消息中插入 `@indexer "<file>:<line>"` 形式的内联 token,
       * 并在消息上下文中携带符号元信息,供后端 Provider 直接
       * 跳转 / 分析 / 编辑目标符号。
       */
      id: string;
      type: "indexer-result";
      kind: string;
      file: string;
      line: number;
      column?: number;
      text: string;
      /** 原始查询关键词,供 Provider 上下文参考 */
      context: string;
      label: string;
      description: string;
    }
  | {
      /**
       * 索引检索的占位/空状态项。
       *
       * 用于在用户刚刚输入 `@indexer` 还未输入查询、或者工作区未打开
       * 时,给出一个引导条目。
       */
      id: string;
      type: "indexer-hint";
      label: string;
      description: string;
    }
  | {
      /**
       * 索引加载失败/无数据的提示条目(仅展示,不可选中)。
       *
       * 与 `indexer-hint` 区别在于此条目不会被键盘导航选中,只用于
       * 解释为何搜索结果为空(例如索引未构建、后端报错、无匹配)。
       */
      id: string;
      type: "indexer-empty";
      label: string;
      description: string;
    };

type ComposerCommandGroupModel = {
  id: string;
  label: string | null;
  items: ComposerCommandItem[];
};

const COMPOSER_COMMAND_GROUP_LABEL_CLASSNAME =
  "px-2 pt-1.5 pb-1 text-[11px] font-normal text-muted-foreground/60";

export function groupCommandItems(
  items: ComposerCommandItem[],
  triggerKind: ComposerTriggerKind | null,
  groupSlashCommandSections: boolean,
): ComposerCommandGroupModel[] {
  if (triggerKind === "mention") {
    const wikiItems = items.filter(
      (item) =>
        item.type === "wiki-result" ||
        item.type === "wiki-hint" ||
        item.type === "wiki-empty",
    );
    const astGrepItems = items.filter(
      (item) =>
        item.type === "ast-grep-result" ||
        item.type === "ast-grep-hint" ||
        item.type === "ast-grep-empty",
    );
    const codebaseItems = items.filter(
      (item) =>
        item.type === "codebase-result" ||
        item.type === "codebase-hint" ||
        item.type === "codebase-empty",
    );
    const schedulerItems = items.filter(
      (item) =>
        item.type === "scheduler-result" ||
        item.type === "scheduler-hint" ||
        item.type === "scheduler-empty",
    );
    const officeItems = items.filter(
      (item) =>
        item.type === "office-result" ||
        item.type === "office-hint" ||
        item.type === "office-empty",
    );
    const browserItems = items.filter(
      (item) =>
        item.type === "browser-result" ||
        item.type === "browser-hint" ||
        item.type === "browser-empty",
    );
    const lspItems = items.filter(
      (item) =>
        item.type === "lsp-result" ||
        item.type === "lsp-hint" ||
        item.type === "lsp-empty",
    );
    const indexerItems = items.filter(
      (item) =>
        item.type === "indexer-result" ||
        item.type === "indexer-hint" ||
        item.type === "indexer-empty",
    );
    const pluginItems = items.filter((item) => item.type === "plugin");
    const localItems = items.filter((item) => item.type === "local-root" || item.type === "path");
    const agentItems = items.filter((item) => item.type === "agent");
    const otherItems = items.filter(
      (item) =>
        item.type !== "plugin" &&
        item.type !== "local-root" &&
        item.type !== "path" &&
        item.type !== "agent" &&
        item.type !== "wiki-result" &&
        item.type !== "wiki-hint" &&
        item.type !== "wiki-empty" &&
        item.type !== "ast-grep-result" &&
        item.type !== "ast-grep-hint" &&
        item.type !== "ast-grep-empty" &&
        item.type !== "codebase-result" &&
        item.type !== "codebase-hint" &&
        item.type !== "codebase-empty" &&
        item.type !== "scheduler-result" &&
        item.type !== "scheduler-hint" &&
        item.type !== "scheduler-empty" &&
        item.type !== "office-result" &&
        item.type !== "office-hint" &&
        item.type !== "office-empty" &&
        item.type !== "browser-result" &&
        item.type !== "browser-hint" &&
        item.type !== "browser-empty" &&
        item.type !== "lsp-result" &&
        item.type !== "lsp-hint" &&
        item.type !== "lsp-empty",
    );

    const groups: ComposerCommandGroupModel[] = [];
    if (wikiItems.length > 0) {
      groups.push({ id: "wiki", label: "Wiki", items: wikiItems });
    }
    if (astGrepItems.length > 0) {
      groups.push({ id: "ast-grep", label: "AST-Grep", items: astGrepItems });
    }
    if (codebaseItems.length > 0) {
      groups.push({ id: "codebase", label: "Codebase", items: codebaseItems });
    }
    if (schedulerItems.length > 0) {
      groups.push({ id: "scheduler", label: "Scheduler", items: schedulerItems });
    }
    if (officeItems.length > 0) {
      groups.push({ id: "office", label: "Office", items: officeItems });
    }
    if (browserItems.length > 0) {
      groups.push({ id: "browser", label: "Browser", items: browserItems });
    }
    if (lspItems.length > 0) {
      groups.push({ id: "lsp", label: "LSP", items: lspItems });
    }
    if (indexerItems.length > 0) {
      groups.push({ id: "indexer", label: "Indexer", items: indexerItems });
    }
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
      <div className="chat-composer-surface relative overflow-hidden rounded-xl border border-(--color-border-light) bg-(--color-background-surface-under) shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]">
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
        "cursor-pointer select-none gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-(--color-background-elevated-secondary) data-highlighted:bg-(--color-background-elevated-secondary)",
        props.isActive &&
          "bg-(--color-background-elevated-secondary) text-(--color-text-foreground)",
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
      {props.item.type === "wiki-result" ||
      props.item.type === "wiki-hint" ||
      props.item.type === "wiki-empty" ? (
        <TbBook className="size-3.5 text-muted-foreground/60" />
      ) : null}
      {props.item.type === "ast-grep-result" ||
      props.item.type === "ast-grep-hint" ||
      props.item.type === "ast-grep-empty" ? (
        <TbCode className="size-3.5 text-muted-foreground/60" />
      ) : null}
      {props.item.type === "lsp-result" ||
      props.item.type === "lsp-hint" ||
      props.item.type === "lsp-empty" ? (
        <TbCode className="size-3.5 text-muted-foreground/60" />
      ) : null}
      {props.item.type === "indexer-result" ||
      props.item.type === "indexer-hint" ||
      props.item.type === "indexer-empty" ? (
        <TbSearch className="size-3.5 text-muted-foreground/60" />
      ) : null}
      {props.item.type === "plugin" || props.item.type === "skill" ? (
        <div
          className={cn(
            "flex size-3.5 shrink-0 items-center justify-center text-muted-foreground/50",
            props.isActive && "text-foreground/60",
          )}
        >
          {props.item.type === "skill" ? (
            (() => {
              // 检查是否为内置技能
              const isBuiltin = props.item.skill.path.startsWith("builtin://");
              const builtinSkillName = isBuiltin
                ? props.item.skill.path.replace("builtin://", "")
                : null;

              // 为不同内置技能显示不同图标
              if (isBuiltin && builtinSkillName) {
                const iconCls = "size-3";
                switch (builtinSkillName) {
                  case "office":
                    return <TbFileText className={iconCls} />;
                  case "scheduler":
                    return <TbClock className={iconCls} />;
                  case "browser":
                    return <TbWorld className={iconCls} />;
                  case "lsp":
                    return <TbCode className={iconCls} />;
                  case "indexer":
                    return <TbSearch className={iconCls} />;
                  default:
                    return <SkillCubeIcon className={iconCls} />;
                }
              }

              // 用户自定义技能使用默认图标
              return <SkillCubeIcon className="size-3" />;
            })()
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
