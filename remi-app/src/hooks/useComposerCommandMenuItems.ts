/**
 * @file useComposerCommandMenuItems.ts
 * @description 缂栬緫鍣ㄥ懡浠よ彍鍗曢」 Hook - 鏍规嵁瑙﹀彂鍣ㄧ被鍨嬬敓鎴愬懡浠よ彍鍗曢」
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

/** 鎻掍欢寤鸿椤圭被鍨?*/
type ComposerPluginSuggestion = {
  plugin: ProviderPluginDescriptor;
  mention: ProviderMentionReference;
};

/** 鍙悳绱㈢殑妯″瀷閫夐」绫诲瀷 */
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
 * 缂栬緫鍣ㄥ懡浠よ彍鍗曢」 Hook
 *
 * @description
 * 鏍规嵁缂栬緫鍣ㄨЕ鍙戝櫒绫诲瀷锛坢ention銆乻lash-command銆乻kill銆乵odel锛夌敓鎴愬搴旂殑鍛戒护鑿滃崟椤广€? * 鏀寔鎻掍欢銆佷唬鐞嗐€佽矾寰勩€佹妧鑳姐€佹ā鍨嬬瓑澶氱绫诲瀷鐨勫懡浠ゅ缓璁€? *
 * @param input - 杈撳叆鍙傛暟瀵硅薄
 * @param input.composerTrigger - 缂栬緫鍣ㄨЕ鍙戝櫒锛屽喅瀹氳彍鍗曠被鍨? * @param input.provider - 褰撳墠鎻愪緵鍟嗙被鍨? * @param input.providerPlugins - 鎻愪緵鍟嗘彃浠跺垪琛? * @param input.providerNativeCommands - 鎻愪緵鍟嗗師鐢熷懡浠ゅ垪琛? * @param input.providerSkills - 鎻愪緵鍟嗘妧鑳藉垪琛? * @param input.workspaceEntries - 宸ヤ綔鍖烘潯鐩垪琛? * @param input.searchableModelOptions - 鍙悳绱㈢殑妯″瀷閫夐」
 * @param input.supportsFastSlashCommand - 鏄惁鏀寔蹇€熸枩鏉犲懡浠? * @param input.canOfferCompactCommand - 鏄惁鍙彁渚涘帇缂╁懡浠? * @param input.canOfferReviewCommand - 鏄惁鍙彁渚涘鏌ュ懡浠? * @param input.canOfferForkCommand - 鏄惁鍙彁渚涘垎鍙夊懡浠? * @param input.canOfferSideCommand - 鏄惁鍙彁渚涗晶杈瑰懡浠? * @param input.dynamicAgents - 鍔ㄦ€佷唬鐞嗗垪琛? *
 * @returns 杩囨护鍜屾槧灏勫悗鐨勫懡浠よ彍鍗曢」鏁扮粍
 *
 * @example
 * ```tsx
 * const items = useComposerCommandMenuItems({
 *   composerTrigger: trigger,
 *   provider: "openai",
 *   providerPlugins: plugins,
 *   // ... 鍏朵粬鍙傛暟
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
    // 鏃犺Е鍙戝櫒鏃惰繑鍥炵┖鏁扮粍
    if (!composerTrigger) return [];

    // 澶勭悊 @ 鎻愬強瑙﹀彂鍣細鏄剧ず鎻掍欢銆佹湰鍦版枃浠跺す銆佽矾寰勩€佷唬鐞?    if (composerTrigger.kind === "mention") {
      const query = normalizeProviderDiscoveryText(composerTrigger.query);

      // 鏋勫缓浠ｇ悊椤癸細浼樺厛浣跨敤鍔ㄦ€佷唬鐞嗭紝鍚﹀垯浣跨敤闈欐€佸埆鍚?      const agentItems: ComposerCommandItem[] = (() => {
        // 鏈夊姩鎬佷唬鐞嗘椂浣跨敤鍔ㄦ€佷唬鐞?        if (dynamicAgents.length > 0) {
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
        // 闈欐€佸洖閫€锛氫娇鐢ㄩ瀹氫箟鐨勪唬鐞嗗埆鍚?        return getAgentMentionAutocompleteAliases(provider)
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

      // 鏋勫缓鎻掍欢椤癸細浠呮樉绀哄凡瀹夎鐨勬彃浠?      const pluginItems = providerPlugins
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
      
      // 鏈湴鏂囦欢澶归」锛氬尮閰嶅揩鎹锋柟寮忔椂鏄剧ず
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
      
      // 璺緞椤癸細宸ヤ綔鍖烘潯鐩?      const pathItems = workspaceEntries.map((entry) => ({
        id: `path:${entry.kind}:${entry.path}`,
        type: "path" as const,
        path: entry.path,
        pathKind: entry.kind,
        label: basenameOfPath(entry.path),
        description: entry.parentPath ?? "",
      }));
      
      // 鎸変富瑕佹剰鍥炬帓搴忥細鎻掍欢浼樺厛锛岀劧鍚庢湰鍦颁笂涓嬫枃锛屾渶鍚庢槸浠ｇ悊
      return [...pluginItems, ...localRootItems, ...pathItems, ...agentItems];
    }

    // 澶勭悊鏂滄潬鍛戒护瑙﹀彂鍣細鏄剧ず鍐呯疆鍛戒护銆佹彁渚涘晢鍘熺敓鍛戒护銆佹妧鑳?    if (composerTrigger.kind === "slash-command") {
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
      
      // 鍐呯疆鏂滄潬鍛戒护椤?      const builtInItems = filterComposerSlashCommands(
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
      
      // 鎻愪緵鍟嗗師鐢熷懡浠ら」
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
      
      // 鎶€鑳介」锛氫粎 Claude 鎻愪緵鍟嗕娇鐢ㄦ枩鏉犲墠缂€
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

    // 澶勭悊鎶€鑳借Е鍙戝櫒锛氫粎鏄剧ず鎶€鑳?    if (composerTrigger.kind === "skill") {
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

    // 榛樿锛氭樉绀烘ā鍨嬮€夐」
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
        description: `${providerLabel} 路 ${slug}`,
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
