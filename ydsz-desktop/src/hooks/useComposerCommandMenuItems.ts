/**
 * @file Composer 命令菜单项 Hook
 *
 * 本 Hook 为 Composer 中输入 `/` 或 `@` 触发的命令菜单提供数据源，
 * 合并 Agent 提及、Provider 技能、命令、插件、本地文件夹等多源数据。
 *
 * ## 核心导出
 *
 * - `useComposerCommandMenuItems`：返回分组后的菜单项列表
 * - `useComposerCommandSearch`：根据输入文本过滤菜单项
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
 * - 模糊搜索与排序
 * - 跨 Provider 的统一菜单项
 *
 * ## 注意事项
 *
 * - 菜单项按优先级排序（最近使用 > 收藏 > 字母序）
 * - 搜索使用简单的子串匹配，性能良好
 * - 插件与技能需要先安装才显示
 */

import type {
  ProjectEntry,
  ProviderNativeCommandDescriptor,
  ProviderKind,
  ProviderMentionReference,
  ProviderPluginDescriptor,
  ProviderSkillDescriptor,
  RuntimeMode,
} from "@ydsz-buddy/contracts";
import { getAgentMentionAutocompleteAliases } from "@ydsz-buddy/contracts";
import { useMemo } from "react";
import {
  buildCommandSearchBlob,
  buildPluginSearchBlob,
  buildSkillSearchBlob,
  isInstalledProviderPlugin,
  normalizeProviderDiscoveryText,
} from "~/lib/providerDiscovery";
import {
  LOCAL_FOLDER_MENTION_NAME,
  matchesLocalFolderMentionShortcut,
} from "~/lib/localFolderMentions";
import { basenameOfPath } from "../file-icons";
import type { ComposerTrigger } from "../composer-logic";
import {
  filterComposerSlashCommands,
  getAvailableComposerSlashCommands,
  getProviderNativeSlashCommandSearchTerms,
  shouldHideProviderNativeCommandFromComposerMenu,
} from "../composerSlashCommands";
import type { ComposerCommandItem } from "../components/chat/ComposerCommandMenu";

type ComposerPluginSuggestion = {
  plugin: ProviderPluginDescriptor;
  mention: ProviderMentionReference;
};

type SearchableModelOption = {
  provider: ProviderKind;
  providerLabel: string;
  slug: string;
  name: string;
  searchSlug: string;
  searchName: string;
  searchProvider: string;
  searchUpstreamProvider: string;
};

export function useComposerCommandMenuItems(input: {
  composerTrigger: ComposerTrigger | null;
  provider: ProviderKind;
  providerPlugins: readonly ComposerPluginSuggestion[];
  providerNativeCommands: readonly ProviderNativeCommandDescriptor[];
  providerSkills: readonly ProviderSkillDescriptor[];
  workspaceEntries: readonly ProjectEntry[];
  searchableModelOptions: readonly SearchableModelOption[];
  supportsFastSlashCommand: boolean;
  canOfferCompactCommand: boolean;
  canOfferReviewCommand: boolean;
  canOfferForkCommand: boolean;
  canOfferSideCommand: boolean;
  dynamicAgents: readonly { name: string; displayName: string; description?: string }[];
  runtimeMode: RuntimeMode | null | undefined;
  /**
   * 由 `useComposerWikiSearch` 注入的 Wiki 检索条目。
   *
   * - 空数组:不强制展示 Wiki 列表
   * - 含 hint/empty:展示占位提示
   * - 含 wiki-result:可被选中插入到 Composer
   */
  wikiItems?: readonly ComposerCommandItem[];
  /** Wiki 搜索是否在加载中(防抖或后端响应中) */
  wikiLoading?: boolean;
  /**
   * 由 `useComposerAstGrepSearch` 注入的 AST-Grep 检索条目。
   *
   * - 空数组:不强制展示 AST-Grep 列表
   * - 含 hint/empty:展示占位提示
   * - 含 ast-grep-result:可被选中插入到 Composer
   */
  astGrepItems?: readonly ComposerCommandItem[];
  /** AST-Grep 搜索是否在加载中(防抖或后端响应中) */
  astGrepLoading?: boolean;
  /**
   * 由 `useComposerCodebaseSearch` 注入的 Codebase 检索条目。
   *
   * - 空数组:不强制展示 Codebase 列表
   * - 含 hint/empty:展示占位提示
   * - 含 codebase-result:可被选中插入到 Composer
   */
  codebaseItems?: readonly ComposerCommandItem[];
  /** Codebase 搜索是否在加载中(防抖或后端响应中) */
  codebaseLoading?: boolean;
  /**
   * 由 `useComposerSchedulerPick` 注入的定时任务检索条目。
   *
   * - 空数组:不强制展示 Scheduler 列表
   * - 含 hint/empty:展示占位提示
   * - 含 scheduler-result:可被选中插入到 Composer
   */
  schedulerItems?: readonly ComposerCommandItem[];
  /** Scheduler 列表是否在加载中(防抖或后端响应中) */
  schedulerLoading?: boolean;
  /**
   * 由 `useComposerOfficePick` 注入的 Office 文档检索条目。
   *
   * - 空数组:不强制展示 Office 列表
   * - 含 hint/empty:展示占位提示
   * - 含 office-result:可被选中插入到 Composer
   */
  officeItems?: readonly ComposerCommandItem[];
  /** Office 文档是否在加载中(用户刚选完文件,后端提取中) */
  officeLoading?: boolean;
  /**
   * 由 `useComposerBrowserPick` 注入的浏览器标签页检索条目。
   *
   * - 空数组:不强制展示 Browser 列表
   * - 含 hint/empty:展示占位提示
   * - 含 browser-result:可被选中插入到 Composer
   */
  browserItems?: readonly ComposerCommandItem[];
  /** Browser 列表是否在加载中(防抖或后端响应中) */
  browserLoading?: boolean;
  /**
   * 由 `useComposerLspPick` 注入的 LSP 预设检索条目。
   *
   * - 空数组:不强制展示 LSP 列表
   * - 含 hint/empty:展示占位提示
   * - 含 lsp-result:可被选中插入到 Composer
   */
  lspItems?: readonly ComposerCommandItem[];
  /** LSP 列表是否在加载中(防抖或后端响应中) */
  lspLoading?: boolean;
  /**
   * 由 `useComposerIndexerPick` 注入的索引符号检索条目。
   *
   * - 空数组:不强制展示 Indexer 列表
   * - 含 hint/empty:展示占位提示
   * - 含 indexer-result:可被选中插入到 Composer
   */
  indexerItems?: readonly ComposerCommandItem[];
  /** Indexer 列表是否在加载中(防抖或后端响应中) */
  indexerLoading?: boolean;
}): ComposerCommandItem[] {
  const {
    composerTrigger,
    provider,
    providerPlugins,
    providerNativeCommands,
    providerSkills,
    workspaceEntries,
    searchableModelOptions,
    supportsFastSlashCommand,
    canOfferCompactCommand,
    canOfferReviewCommand,
    canOfferForkCommand,
    canOfferSideCommand,
    dynamicAgents,
    wikiItems,
    wikiLoading,
    astGrepItems,
    astGrepLoading,
    codebaseItems,
    codebaseLoading,
    schedulerItems,
    schedulerLoading,
    officeItems,
    officeLoading,
    browserItems,
    browserLoading,
    lspItems,
    lspLoading,
    indexerItems,
    indexerLoading,
  } = input;

  return useMemo<ComposerCommandItem[]>(() => {
    if (!composerTrigger) return [];

    // Keep trigger-specific discovery outside ChatView so the view mostly orchestrates state.
    if (composerTrigger.kind === "mention") {
      const query = normalizeProviderDiscoveryText(composerTrigger.query);

      // 检测 @wiki 触发:
      // - `@wiki`(query === "wiki"):展示 hint,提示输入关键词
      // - `@wiki<query>`(query 以 "wiki " 开头):展示搜索结果
      // 注意:本 hook 不会执行实际的搜索动作,搜索结果由
      // `useComposerWikiSearch` 注入到 `wikiItems` 中。
      const WIKI_TRIGGER = "wiki";
      const isWikiMention = query === WIKI_TRIGGER;
      const isWikiQuery = query.startsWith(`${WIKI_TRIGGER} `);

      if (isWikiMention || isWikiQuery) {
        const safeWikiItems = wikiItems ?? [];
        if (safeWikiItems.length > 0) {
          return [...safeWikiItems];
        }
        if (wikiLoading) {
          return [
            {
              id: "wiki-hint:loading",
              type: "wiki-hint",
              label: "搜索 Wiki 中…",
              description: "正在检索项目文档",
            },
          ];
        }
        return [];
      }

      // 检测 @ast-grep 触发:
      // - `@ast-grep` / `@ast-grep<query>` / `@ast-grep kind:<node_kind>` 形式
      // 搜索结果由 `useComposerAstGrepSearch` 注入到 `astGrepItems` 中。
      const AST_GREP_TRIGGER = "ast-grep";
      const isAstGrepMention = query === AST_GREP_TRIGGER;
      const isAstGrepQuery =
        query.startsWith(`${AST_GREP_TRIGGER} `) ||
        query.startsWith(`${AST_GREP_TRIGGER}-`) ||
        query.startsWith(`${AST_GREP_TRIGGER}_`);
      if (isAstGrepMention || isAstGrepQuery) {
        const safeAstGrepItems = astGrepItems ?? [];
        if (safeAstGrepItems.length > 0) {
          return [...safeAstGrepItems];
        }
        if (astGrepLoading) {
          return [
            {
              id: "ast-grep-hint:loading",
              type: "ast-grep-hint",
              label: "搜索 AST-Grep 中…",
              description: "正在检索代码模式",
            },
          ];
        }
        return [];
      }

      // 检测 @codebase 触发:
      // - `@codebase`(query === "codebase"):展示 hint,提示输入关键词
      // - `@codebase <query>`(query 以 "codebase " 开头):展示搜索结果
      // 搜索结果由 `useComposerCodebaseSearch` 注入到 `codebaseItems` 中。
      const CODEBASE_TRIGGER = "codebase";
      const isCodebaseMention = query === CODEBASE_TRIGGER;
      const isCodebaseQuery =
        query.startsWith(`${CODEBASE_TRIGGER} `) ||
        query.startsWith(`${CODEBASE_TRIGGER}-`) ||
        query.startsWith(`${CODEBASE_TRIGGER}_`);
      if (isCodebaseMention || isCodebaseQuery) {
        const safeCodebaseItems = codebaseItems ?? [];
        if (safeCodebaseItems.length > 0) {
          return [...safeCodebaseItems];
        }
        if (codebaseLoading) {
          return [
            {
              id: "codebase-hint:loading",
              type: "codebase-hint",
              label: "搜索 Codebase 中…",
              description: "正在检索项目符号与文本",
            },
          ];
        }
        return [];
      }

      // 检测 @scheduler 触发:
      // - `@scheduler`(query === "scheduler"):列出当前线程的定时任务
      // - `@scheduler <query>`(query 以 "scheduler " 开头):按关键词过滤
      // 任务列表由 `useComposerSchedulerPick` 注入到 `schedulerItems` 中。
      const SCHEDULER_TRIGGER = "scheduler";
      const isSchedulerMention = query === SCHEDULER_TRIGGER;
      const isSchedulerQuery =
        query.startsWith(`${SCHEDULER_TRIGGER} `) ||
        query.startsWith(`${SCHEDULER_TRIGGER}-`) ||
        query.startsWith(`${SCHEDULER_TRIGGER}_`);
      if (isSchedulerMention || isSchedulerQuery) {
        const safeSchedulerItems = schedulerItems ?? [];
        if (safeSchedulerItems.length > 0) {
          return [...safeSchedulerItems];
        }
        if (schedulerLoading) {
          return [
            {
              id: "scheduler-hint:loading",
              type: "scheduler-hint",
              label: "加载定时任务中…",
              description: "正在获取当前线程的定时任务",
            },
          ];
        }
        return [];
      }

      // 检测 Office 文档触发器(@docx / @xlsx / @pdf):
      // - query 完全等于 "docx" / "xlsx" / "pdf" 时命中
      // - 命中后展示 hook 注入的 hint(empty)/empty/result 项
      // 实际选择文件 + 内容提取由 `useComposerOfficePick` 暴露的
      // `triggerPick()` 触发,这里只负责展示与回传。
      const OFFICE_TRIGGERS = ["docx", "xlsx", "pdf"] as const;
      const matchedOfficeKind = (OFFICE_TRIGGERS as readonly string[]).find(
        (kind) => query === kind,
      );
      if (matchedOfficeKind) {
        const safeOfficeItems = officeItems ?? [];
        if (safeOfficeItems.length > 0) {
          return [...safeOfficeItems];
        }
        if (officeLoading) {
          return [
            {
              id: `office-hint:${matchedOfficeKind}:loading`,
              type: "office-hint",
              officeKind: matchedOfficeKind as "docx" | "xlsx" | "pdf",
              label: `正在提取 ${matchedOfficeKind.toUpperCase()} 文档…`,
              description: "请稍候,正在读取文件内容",
            },
          ];
        }
        return [];
      }

      // 检测 @browser 触发:
      // - `@browser`(query === "browser"):列出当前线程的标签页
      // - `@browser <keywords>`(query 以 "browser " 开头):按关键词过滤
      // 标签页列表由 `useComposerBrowserPick` 注入到 `browserItems` 中.
      // 注意:只允许 `browser` 后跟空格才识别为 @browser 触发器,避免
      // `browser-foo` 等更长别名误匹配.
      const BROWSER_TRIGGER = "browser";
      const isBrowserMention = query === BROWSER_TRIGGER;
      const isBrowserQuery = query.startsWith(`${BROWSER_TRIGGER} `);
      if (isBrowserMention || isBrowserQuery) {
        const safeBrowserItems = browserItems ?? [];
        if (safeBrowserItems.length > 0) {
          return [...safeBrowserItems];
        }
        if (browserLoading) {
          return [
            {
              id: "browser-hint:loading",
              type: "browser-hint",
              label: "加载浏览器标签页中…",
              description: "正在拉取当前线程的标签页",
            },
          ];
        }
        return [];
      }

      // 检测 @lsp 触发:
      // - `@lsp`(query === "lsp"):列出所有语言服务器预设
      // - `@lsp <keywords>`(query 以 "lsp " 开头):按关键词过滤
      // 预设列表由 `useComposerLspPick` 注入到 `lspItems` 中.
      // 注意:只允许 `lsp` 后跟空格才识别为 @lsp 触发器,避免
      // `lsp-foo` 等更长别名误匹配.
      const LSP_TRIGGER = "lsp";
      const isLspMention = query === LSP_TRIGGER;
      const isLspQuery = query.startsWith(`${LSP_TRIGGER} `);
      if (isLspMention || isLspQuery) {
        const safeLspItems = lspItems ?? [];
        if (safeLspItems.length > 0) {
          return [...safeLspItems];
        }
        if (lspLoading) {
          return [
            {
              id: "lsp-hint:loading",
              type: "lsp-hint",
              label: "加载 LSP 预设中…",
              description: "正在拉取语言服务器列表",
            },
          ];
        }
        return [];
      }

      // 检测 @indexer 触发:
      // - `@indexer`(query === "indexer"):展示 hint,提示输入符号名
      // - `@indexer <query>`(query 以 "indexer " 开头):走 indexer_search_symbols 检索符号
      // 检索结果由 `useComposerIndexerPick` 注入到 `indexerItems` 中.
      // 与 @codebase 的差异:@indexer 主走符号索引(高亮 kind: function/class/trait),
      // 适合"按形态过滤"场景;@codebase 关注"在哪儿",全文+符号双路.
      const INDEXER_TRIGGER = "indexer";
      const isIndexerMention = query === INDEXER_TRIGGER;
      const isIndexerQuery =
        query.startsWith(`${INDEXER_TRIGGER} `) ||
        query.startsWith(`${INDEXER_TRIGGER}-`) ||
        query.startsWith(`${INDEXER_TRIGGER}_`);
      if (isIndexerMention || isIndexerQuery) {
        const safeIndexerItems = indexerItems ?? [];
        if (safeIndexerItems.length > 0) {
          return [...safeIndexerItems];
        }
        if (indexerLoading) {
          return [
            {
              id: "indexer-hint:loading",
              type: "indexer-hint",
              label: "搜索 Indexer 中…",
              description: "正在检索项目符号索引",
            },
          ];
        }
        return [];
      }

      // Check if this is a Skill mention trigger (@office, @ppt, @html)
      // 注意:@scheduler / @browser / @lsp / @indexer 已在前面早期返回,
      // 这里只匹配 @office / @ppt / @html 三个"无独立 hook"的 Skill 触发器,
      // 走 builtin://office / builtin://ppt / builtin://html 的 Skill 描述回退路径.
      const skillMentionKinds = ["office", "ppt", "html"] as const;
      const matchedSkillKind = skillMentionKinds.find((kind) => {
        return query === kind || query.startsWith(`${kind} `);
      });

      // If it's a Skill mention, return matching skills from providerSkills
      if (matchedSkillKind) {
        const skillItems: ComposerCommandItem[] = providerSkills
          .filter((skill) => {
            // Match builtin:// skills by name
            if (skill.path.startsWith(`builtin://${matchedSkillKind}`)) {
              return true;
            }
            // Also match by skill name
            return skill.name.toLowerCase() === matchedSkillKind;
          })
          .map((skill) => ({
            id: `skill:${skill.path}`,
            type: "skill" as const,
            skill,
            label: skill.interface?.displayName ?? skill.name,
            description: skill.interface?.shortDescription ?? skill.description ?? skill.path,
          }));

        // If we found matching skills, return them; otherwise fall through to normal mention handling
        if (skillItems.length > 0) {
          return skillItems;
        }
      }

      const agentItems: ComposerCommandItem[] = (() => {
        // Use dynamic agents when available, fallback to static
        if (dynamicAgents.length > 0) {
          return dynamicAgents
            .filter(({ name, displayName }) => {
              if (!query) return true;
              const searchBlob = `${name} ${displayName}`.toLowerCase();
              return searchBlob.includes(query);
            })
            .map(({ name, displayName }) => ({
              id: `agent:${provider}:${name}`,
              type: "agent" as const,
              provider,
              alias: name,
              color: "violet" as const,
              label: `@${name}`,
              description: displayName,
            }));
        }
        // Static fallback
        return getAgentMentionAutocompleteAliases(provider)
          .filter(({ alias, displayName }) => {
            if (!query) return true;
            const searchBlob = `${alias} ${displayName}`.toLowerCase();
            return searchBlob.includes(query);
          })
          .map(({ alias, displayName, color }) => ({
            id: `agent:${provider}:${alias}`,
            type: "agent" as const,
            provider,
            alias,
            color,
            label: `@${alias}`,
            description: displayName,
          }));
      })();

      const pluginItems = providerPlugins
        .filter(({ plugin }) => isInstalledProviderPlugin(plugin))
        .filter(({ plugin }) => {
          if (!query) return true;
          return buildPluginSearchBlob(plugin).includes(query);
        })
        .map(({ plugin, mention }) => ({
          id: `plugin:${plugin.id}`,
          type: "plugin" as const,
          plugin,
          mention,
          label: plugin.interface?.displayName ?? plugin.name,
          description: plugin.interface?.shortDescription ?? plugin.source.path,
        }));
      const localRootItems =
        matchesLocalFolderMentionShortcut(composerTrigger.query) && composerTrigger.query !== "/"
          ? [
              {
                id: "local-root",
                type: "local-root" as const,
                label: `@${LOCAL_FOLDER_MENTION_NAME}`,
                description: "Browse folders on this computer",
              },
            ]
          : [];
      const pathItems = workspaceEntries.map((entry) => ({
        id: `path:${entry.kind}:${entry.path}`,
        type: "path" as const,
        path: entry.path,
        pathKind: entry.kind,
        label: basenameOfPath(entry.path),
        description: entry.parentPath ?? "",
      }));
      // Keep mention suggestions ordered by primary intent: plugins first,
      // then local context, then subagent delegation targets.
      return [...pluginItems, ...localRootItems, ...pathItems, ...agentItems];
    }

    if (composerTrigger.kind === "slash-command") {
      const query = normalizeProviderDiscoveryText(composerTrigger.query);
      const availableCommands = getAvailableComposerSlashCommands({
        provider,
        supportsFastSlashCommand,
        canOfferCompactCommand,
        canOfferReviewCommand,
        canOfferForkCommand,
        canOfferSideCommand,
        providerNativeCommandNames: providerNativeCommands.map((command) => command.name),
        runtimeMode: input.runtimeMode,
      });
      const builtInItems = filterComposerSlashCommands(
        composerTrigger.query,
        availableCommands,
      ).map((definition) => ({
        id: `slash:${definition.command}`,
        type: "slash-command" as const,
        command: definition.command,
        label: definition.label,
        description: definition.description,
        source: definition.source,
      }));
      const providerCommandItems = providerNativeCommands
        .filter(
          (command) => !shouldHideProviderNativeCommandFromComposerMenu(provider, command.name),
        )
        .filter((command) => {
          if (!query) return true;
          return (
            buildCommandSearchBlob(command).includes(query) ||
            getProviderNativeSlashCommandSearchTerms(provider, command.name).some((term) =>
              term.includes(query),
            )
          );
        })
        .map((command) => ({
          id: `provider-command:${provider}:${command.name}`,
          type: "provider-native-command" as const,
          provider,
          command: command.name,
          label: `/${command.name}`,
          description: command.description ?? `Run ${provider} native command`,
        }));
      // For the Claude provider, skills use `/` prefix just like slash commands,
      // so merge them into the same dropdown.
      const skillItems: ComposerCommandItem[] =
        provider === "claudeAgent"
          ? providerSkills
              .filter((skill) => {
                if (!query) return true;
                return buildSkillSearchBlob(skill).includes(query);
              })
              .map((skill) => ({
                id: `skill:${skill.path}`,
                type: "skill" as const,
                skill,
                label: skill.interface?.displayName ?? skill.name,
                description: skill.interface?.shortDescription ?? skill.description ?? skill.path,
              }))
          : [];
      return [...builtInItems, ...providerCommandItems, ...skillItems];
    }

    if (composerTrigger.kind === "skill") {
      const query = normalizeProviderDiscoveryText(composerTrigger.query);
      return providerSkills
        .filter((skill) => {
          if (!query) return true;
          return buildSkillSearchBlob(skill).includes(query);
        })
        .map((skill) => ({
          id: `skill:${skill.path}`,
          type: "skill" as const,
          skill,
          label: skill.interface?.displayName ?? skill.name,
          description: skill.interface?.shortDescription ?? skill.description ?? skill.path,
        }));
    }

    return searchableModelOptions
      .filter(({ searchSlug, searchName, searchProvider, searchUpstreamProvider }) => {
        const query = composerTrigger.query.trim().toLowerCase();
        if (!query) return true;
        return (
          searchSlug.includes(query) ||
          searchName.includes(query) ||
          searchProvider.includes(query) ||
          searchUpstreamProvider.includes(query)
        );
      })
      .map(({ provider, providerLabel, slug, name }) => ({
        id: `model:${provider}:${slug}`,
        type: "model" as const,
        provider,
        model: slug,
        label: name,
        description: `${providerLabel} · ${slug}`,
      }));
  }, [
    canOfferForkCommand,
    canOfferCompactCommand,
    canOfferReviewCommand,
    canOfferSideCommand,
    composerTrigger,
    dynamicAgents,
    provider,
    providerPlugins,
    providerNativeCommands,
    providerSkills,
    searchableModelOptions,
    supportsFastSlashCommand,
    workspaceEntries,
    wikiItems,
    wikiLoading,
    astGrepItems,
    astGrepLoading,
    codebaseItems,
    codebaseLoading,
    schedulerItems,
    schedulerLoading,
    officeItems,
    officeLoading,
    browserItems,
    browserLoading,
    lspItems,
    lspLoading,
    indexerItems,
    indexerLoading,
  ]);
}
