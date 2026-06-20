/**
 * @file useComposerCommandMenuItems.ts
 * @description 缂傚倹鐗炵欢顐﹀闯閵娿儲鍤掑ù鐘€涜ぐ宥夊础閺囶潿鈧?Hook - 闁哄秷顫夊畵浣烘喆閿曗偓瑜板倿宕抽妸褑顫﹂柛銊ヮ儑閺佹捇骞嬮幇顒佸殥濞寸姰鍊涜ぐ宥夊础閺囶潿鈧? * @module hooks/useComposerCommandMenuItems
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

/** 闁圭粯甯婂▎銏狀嚈妤︽鍞村銈呮贡鐞氼偊宕?*/
type ComposerPluginSuggestion = {
  plugin: ProviderPluginDescriptor;
  mention: ProviderMentionReference;
};

/** 闁告瑯鍨遍幃宕囨閵忋垺鐣辨俊顖椻偓宕団偓鐑芥焻婢舵劑鈧秶鐚剧拠鑼偓?*/
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
 * 缂傚倹鐗炵欢顐﹀闯閵娿儲鍤掑ù鐘€涜ぐ宥夊础閺囶潿鈧?Hook
 *
 * @description
 * 闁哄秷顫夊畵浣虹磽閺嶎剛甯嗛柛锝冨姀琚濋柛娆愬灥濞呮帞鐚剧拠鑼偓鐑芥晬閸ь晪ntion闁靛棔澶焞ash-command闁靛棔澶焝ill闁靛棔娌無del闁挎稑顦遍弫鎾诲箣閹邦剦鍤犻幖瀛樻⒒濞堟垿宕ㄩ幋鎺撳Б闁兼寧绮屽畷鐔搞亜楠炲簱鍋? * 闁衡偓椤栨稑鐦柟缁樺笂濞嗐垽濡存担宄版暕闁荤偛妫庨埀顑挎祰閻儳顕ラ崟鈹惧亾娴ｇ懓螚闁煎啿顫曢埀顑跨劍鑶╅柛銊ヮ儑閻℃垶寰勫槌栨綒缂侇偉顕ч悗鐑芥儍閸曨偅鍤掑ù鐘€曠紓鎾舵媼椤旇　鍋? *
 * @param input - 閺夊牊鎸搁崣鍡涘矗閸屾稒娈堕悗鐢殿攰閽? * @param input.composerTrigger - 缂傚倹鐗炵欢顐﹀闯閵娿剱鏇㈠矗閹存繃鐝ら柨娑樿嫰閸犲懐鈧淇鸿ぐ宥夊础閺囩姾顫﹂柛? * @param input.provider - 鐟滅増鎸告晶鐘诲箵閹邦亞杩旈柛鐔锋鐞氼偊宕? * @param input.providerPlugins - 闁圭粯鍔掔欢鐢稿疮閸℃ê绲诲ù鐘烘硾閸亞鎮? * @param input.providerNativeCommands - 闁圭粯鍔掔欢鐢稿疮閸℃鏂ч柣銏㈠枎閹斥剝绂掗妶鍛仚閻? * @param input.providerSkills - 闁圭粯鍔掔欢鐢稿疮閸℃ê螚闁煎疇妫勯崹顏嗘偘? * @param input.workspaceEntries - 鐎规悶鍎扮紞鏃堝礌閻戞ɑ钂嬮柣鈺婂枛閸亞鎮? * @param input.searchableModelOptions - 闁告瑯鍨遍幃宕囨閵忋垺鐣辨俊顖椻偓宕団偓鐑芥焻婢舵劑鈧? * @param input.supportsFastSlashCommand - 闁哄嫷鍨伴幆渚€寮ㄩ娑樼槷闊浂鍋婇埀顒傚枑閺嬧晠寮堕悩鍙夊殥濞? * @param input.canOfferCompactCommand - 闁哄嫷鍨伴幆渚€宕ｉ娑樼倒濞撴碍绋戠敮鍥╃磽閳轰焦鍤掑ù? * @param input.canOfferReviewCommand - 闁哄嫷鍨伴幆渚€宕ｉ娑樼倒濞撴碍绋戦鎼佸蓟閵夈儲鍤掑ù? * @param input.canOfferForkCommand - 闁哄嫷鍨伴幆渚€宕ｉ娑樼倒濞撴碍绋戦崹搴ㄥ矗婢跺﹥鍤掑ù? * @param input.canOfferSideCommand - 闁哄嫷鍨伴幆渚€宕ｉ娑樼倒濞撴碍绋愰弲鑸垫綇閻熺増鍤掑ù? * @param input.dynamicAgents - 闁告柣鍔嶉埀顑挎閸烆剟鎮堕崱妤€鐏欓悶? *
 * @returns 閺夆晛娲﹂幎銈夊椽鐏炵偓衼閻忓繐瀚幃妤呮儍閸曨偅鍤掑ù鐘€涜ぐ宥夊础閺囶潿鈧秹寮幍顔剧煁
 *
 * @example
 * ```tsx
 * const items = useComposerCommandMenuItems({
 *   composerTrigger: trigger,
 *   provider: "openai",
 *   providerPlugins: plugins,
 *   // ... 闁稿繑婀圭划顒勫矗閸屾稒娈? * });
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
    // 闁哄啰濮捐闁告瑦鍨靛▍鎺楀籍閹壆绠查柛銉у仧閳规牠寮幍顔剧煁
    if (!composerTrigger) return [];

    // 婢跺嫮鎮?@ 閹绘劕寮风憴锕€褰傞崳顭掔窗閺勫墽銇氶幓鎺嶆閵嗕焦婀伴崷鐗堟瀮娴犺泛銇欓妴浣界熅瀵板嫨鈧椒鍞悶?    if (composerTrigger.kind === "mention") {
      const query = normalizeProviderDiscoveryText(composerTrigger.query);

      // 閺嬪嫬缂撴禒锝囨倞妞ょ櫢绱版导妯哄帥娴ｈ法鏁ら崝銊︹偓浣峰敩閻炲棴绱濋崥锕€鍨担璺ㄦ暏闂堟瑦鈧礁鍩嗛崥?      const agentItems: ComposerCommandItem[] = (() => {
        // 閺堝濮╅幀浣峰敩閻炲棙妞傛担璺ㄦ暏閸斻劍鈧椒鍞悶?        if (dynamicAgents.length > 0) {
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
        // 闂堟瑦鈧礁娲栭柅鈧敍姘▏閻劑顣╃€规矮绠熼惃鍕敩閻炲棗鍩嗛崥?        return getAgentMentionAutocompleteAliases(provider)
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

      // 閺嬪嫬缂撻幓鎺嶆妞ょ櫢绱版禒鍛▔缁€鍝勫嚒鐎瑰顥婇惃鍕絻娴?      const pluginItems = providerPlugins
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
      
      // 闁哄牜鍓欏﹢鎾棘閸ワ附顐藉璺虹秺閵嗗秹鏁嶅顒€鐖遍梺鏉跨Т閹烩晠骞戦柨瀣厵鐎殿喖绻戝鍌炲及閸撗佷粵
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
      
      // 鐠侯垰绶炴い鐧哥窗瀹搞儰缍旈崠鐑樻蒋閻?      const pathItems = workspaceEntries.map((entry) => ({
        id: `path:${entry.kind}:${entry.path}`,
        type: "path" as const,
        path: entry.path,
        pathKind: entry.kind,
        label: basenameOfPath(entry.path),
        description: entry.parentPath ?? "",
      }));
      
      // 闁圭顦€靛瞼鎲版担鐟板闁搞儳鍋撶敮鎾存償韫囥儳绐楅柟缁樺笂濞嗐垺瀵煎Ο鍝勫弗闁挎稑鐬奸崝褔宕ユ惔銏℃嫳闁革箓顣︾粭鍌涚▔鐎ｎ偅鐎柨娑樻湰濞撳爼宕ユ惔銏⌒﹀ù鐙呯悼閹?      return [...pluginItems, ...localRootItems, ...pathItems, ...agentItems];
    }

    // 婢跺嫮鎮婇弬婊勬浆閸涙垝鎶ょ憴锕€褰傞崳顭掔窗閺勫墽銇氶崘鍛枂閸涙垝鎶ら妴浣瑰絹娓氭稑鏅㈤崢鐔烘晸閸涙垝鎶ら妴浣瑰Η閼?    if (composerTrigger.kind === "slash-command") {
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
      
      // 閸愬懐鐤嗛弬婊勬浆閸涙垝鎶ゆい?      const builtInItems = filterComposerSlashCommands(
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
      
      // 闁圭粯鍔掔欢鐢稿疮閸℃鏂ч柣銏㈠枎閹斥剝绂掗妶澶堚偓?      const providerCommandItems = providerNativeCommands
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
      
      // 闁瑰灈鍋撻柤鍏呯矙閵嗗秹鏁嶅顐ょ煂 Claude 闁圭粯鍔掔欢鐢稿疮閸℃洖鈻忛柣顫妽閺嬧晠寮堕悩鎻掝枀缂傚倵鍋?      const skillItems: ComposerCommandItem[] =
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

    // 婢跺嫮鎮婇幎鈧懗鍊熜曢崣鎴濇珤閿涙矮绮庨弰鍓с仛閹垛偓閼?    if (composerTrigger.kind === "skill") {
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

    // 濮掓稒顭堥濠氭晬濮橆厽鈻旂紒鈧悜妯愪線宕圭€ｎ喒鍋撴径鎰┾偓?    return searchableModelOptions
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
        description: `${providerLabel} 鐠?${slug}`,
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
