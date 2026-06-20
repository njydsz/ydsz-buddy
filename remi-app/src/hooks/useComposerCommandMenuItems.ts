/**
 * @file useComposerCommandMenuItems.ts
 * @description 编辑器命令菜单项 Hook - 根据触发器类型生成命令菜单项
 * @module hooks/useComposerCommandMenuItems
 */

import type {
  ProjectEntry,
  ProviderNativeCommandDescriptor,
  ProviderKind,
  ProviderMentionReference,
  ProviderPluginDescriptor,
  ProviderSkillDescriptor,
} from "~/contracts";
import { getAgentMentionAutocompleteAliases } from "~/contracts";
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

/** 插件建议项类�?*/
type ComposerPluginSuggestion = {
  plugin: ProviderPluginDescriptor;
  mention: ProviderMentionReference;
};

/** 可搜索的模型选项类型 */
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

/**
 * 编辑器命令菜单项 Hook
 *
 * @description
 * 根据编辑器触发器类型（mention、slash-command、skill、model）生成对应的命令菜单项�? * 支持插件、代理、路径、技能、模型等多种类型的命令建议�? *
 * @param input - 输入参数对象
 * @param input.composerTrigger - 编辑器触发器，决定菜单类�? * @param input.provider - 当前提供商类�? * @param input.providerPlugins - 提供商插件列�? * @param input.providerNativeCommands - 提供商原生命令列�? * @param input.providerSkills - 提供商技能列�? * @param input.workspaceEntries - 工作区条目列�? * @param input.searchableModelOptions - 可搜索的模型选项
 * @param input.supportsFastSlashCommand - 是否支持快速斜杠命�? * @param input.canOfferCompactCommand - 是否可提供压缩命�? * @param input.canOfferReviewCommand - 是否可提供审查命�? * @param input.canOfferForkCommand - 是否可提供分叉命�? * @param input.canOfferSideCommand - 是否可提供侧边命�? * @param input.dynamicAgents - 动态代理列�? *
 * @returns 过滤和映射后的命令菜单项数组
 *
 * @example
 * ```tsx
 * const items = useComposerCommandMenuItems({
 *   composerTrigger: trigger,
 *   provider: "openai",
 *   providerPlugins: plugins,
 *   // ... 其他参数
 * });
 * ```
 */
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
  } = input;

  return useMemo<ComposerCommandItem[]>(() => {
    // 无触发器时返回空数组
    if (!composerTrigger) return [];

    // 处理 @ 提及触发器：显示插件、本地文件夹、路径、代�?    if (composerTrigger.kind === "mention") {
      const query = normalizeProviderDiscoveryText(composerTrigger.query);

      // 构建代理项：优先使用动态代理，否则使用静态别�?      const agentItems: ComposerCommandItem[] = (() => {
        // 有动态代理时使用动态代�?        if (dynamicAgents.length > 0) {
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
        // 静态回退：使用预定义的代理别�?        return getAgentMentionAutocompleteAliases(provider)
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

      // 构建插件项：仅显示已安装的插�?      const pluginItems = providerPlugins
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
      
      // 本地文件夹项：匹配快捷方式时显示
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
      
      // 路径项：工作区条�?      const pathItems = workspaceEntries.map((entry) => ({
        id: `path:${entry.kind}:${entry.path}`,
        type: "path" as const,
        path: entry.path,
        pathKind: entry.kind,
        label: basenameOfPath(entry.path),
        description: entry.parentPath ?? "",
      }));
      
      // 按主要意图排序：插件优先，然后本地上下文，最后是代理
      return [...pluginItems, ...localRootItems, ...pathItems, ...agentItems];
    }

    // 处理斜杠命令触发器：显示内置命令、提供商原生命令、技�?    if (composerTrigger.kind === "slash-command") {
      const query = normalizeProviderDiscoveryText(composerTrigger.query);
      const availableCommands = getAvailableComposerSlashCommands({
        provider,
        supportsFastSlashCommand,
        canOfferCompactCommand,
        canOfferReviewCommand,
        canOfferForkCommand,
        canOfferSideCommand,
        providerNativeCommandNames: providerNativeCommands.map((command) => command.name),
      });
      
      // 内置斜杠命令�?      const builtInItems = filterComposerSlashCommands(
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
      
      // 提供商原生命令项
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
      
      // 技能项：仅 Claude 提供商使用斜杠前缀
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

    // 处理技能触发器：仅显示技�?    if (composerTrigger.kind === "skill") {
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

    // 默认：显示模型选项
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
  ]);
}
